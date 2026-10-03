<?php

namespace Tests\Feature;

use App\Models\Upload;
use App\Models\User;
use App\Models\Video;
use Aws\CommandInterface;
use Aws\MockHandler;
use Aws\Result;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Runs the S3 driver against a mocked AWS client: no network involved.
 */
class S3MediaTest extends TestCase
{
    use RefreshDatabase;

    private MockHandler $aws;

    /** @var array<int, array{name: string, params: array<string, mixed>}> */
    private array $calls = [];

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'filesystems.media_disk' => 's3',
            'filesystems.disks.s3' => [
                'driver' => 's3',
                'key' => 'test-key',
                'secret' => 'test-secret',
                'region' => 'us-east-1',
                'bucket' => 'mis-videos',
                'throw' => true,
            ],
        ]);

        $this->aws = new MockHandler;
        Storage::disk('s3')->getClient()->getHandlerList()->setHandler(function (CommandInterface $command, $request) {
            $this->calls[] = ['name' => $command->getName(), 'params' => $command->toArray()];

            return ($this->aws)($command, $request);
        });

        $this->actingAs(User::factory()->create());
    }

    private function calledWith(string $name): array
    {
        $call = collect($this->calls)->firstWhere('name', $name);
        $this->assertNotNull($call, "{$name} was not called");

        return $call['params'];
    }

    public function test_init_starts_a_multipart_upload_in_the_bucket(): void
    {
        $this->aws->append(new Result(['UploadId' => 'up-123']));

        $uuid = $this->postJson(route('uploads.init'), ['name' => 'clip.mp4', 'size' => 25 * 1024 * 1024, 'mime' => 'video/mp4'])
            ->assertCreated()
            ->assertJsonPath('part_count', 3)
            ->json('uuid');

        $params = $this->calledWith('CreateMultipartUpload');
        $this->assertSame('mis-videos', $params['Bucket']);
        $this->assertSame('video/mp4', $params['ContentType']);
        $this->assertSame('up-123', Upload::find($uuid)->upload_id);
    }

    public function test_parts_are_signed_for_direct_upload_to_s3(): void
    {
        $this->aws->append(new Result(['UploadId' => 'up-123']));
        $uuid = $this->postJson(route('uploads.init'), ['name' => 'clip.mp4', 'size' => 100, 'mime' => 'video/mp4'])->json('uuid');

        $url = $this->postJson(route('uploads.parts.sign', ['upload' => $uuid, 'number' => 1]))->assertOk()->json('url');

        $this->assertStringContainsString('mis-videos', $url);
        $this->assertStringContainsString('partNumber=1', $url);
        $this->assertStringContainsString('uploadId=up-123', $url);
        $this->assertStringContainsString('X-Amz-Signature=', $url);
    }

    public function test_complete_joins_the_parts_and_creates_the_video(): void
    {
        $this->aws->append(new Result(['UploadId' => 'up-123']));
        $uuid = $this->postJson(route('uploads.init'), ['name' => 'clip.mp4', 'size' => 100, 'mime' => 'video/mp4'])->json('uuid');

        $parts = new Result(['Parts' => [['PartNumber' => 1, 'ETag' => '"etag-1"', 'Size' => 100]], 'IsTruncated' => false]);
        // ListParts runs twice: to verify the upload and to assemble it.
        $this->aws->append($parts, $parts, new Result([]));

        $this->postJson(route('uploads.complete', $uuid), ['title' => 'Desde S3'])->assertCreated();

        $params = $this->calledWith('CompleteMultipartUpload');
        $this->assertSame([['PartNumber' => 1, 'ETag' => '"etag-1"']], $params['MultipartUpload']['Parts']);
        $this->assertSame('Desde S3', Video::firstOrFail()->title);
    }

    public function test_playback_redirects_to_a_signed_url(): void
    {
        $video = Video::factory()->create(['path' => 'videos/abc.mp4', 'original_name' => 'Boda.mp4']);

        $location = $this->get(route('media.stream', $video))->assertRedirect()->headers->get('Location');
        $this->assertStringContainsString('videos/abc.mp4', $location);
        $this->assertStringContainsString('X-Amz-Signature=', $location);

        $download = $this->get(route('media.stream', ['video' => $video, 'download' => 1]))->headers->get('Location');
        $this->assertStringContainsString('response-content-disposition=attachment', $download);
    }

    public function test_cancelling_aborts_the_multipart_upload(): void
    {
        $this->aws->append(new Result(['UploadId' => 'up-123']));
        $uuid = $this->postJson(route('uploads.init'), ['name' => 'clip.mp4', 'size' => 100, 'mime' => 'video/mp4'])->json('uuid');

        $this->aws->append(new Result([]));
        $this->deleteJson(route('uploads.destroy', $uuid))->assertNoContent();

        $this->assertSame('up-123', $this->calledWith('AbortMultipartUpload')['UploadId']);
    }
}
