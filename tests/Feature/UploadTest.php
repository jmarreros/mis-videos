<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\Upload;
use App\Models\User;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class UploadTest extends TestCase
{
    use RefreshDatabase;

    private const MIB = 1024 * 1024;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->actingAs(User::factory()->create());
    }

    private function putPart(string $uuid, int $number, string $contents): TestResponse
    {
        $url = $this->postJson(route('uploads.parts.sign', ['upload' => $uuid, 'number' => $number]))->assertOk()->json('url');

        return $this->call('PUT', $url, server: ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/octet-stream'], content: $contents);
    }

    private function init(int $size, string $name = 'clip.mp4'): string
    {
        return $this->postJson(route('uploads.init'), ['name' => $name, 'size' => $size, 'mime' => 'video/mp4'])->assertCreated()->json('uuid');
    }

    public function test_part_size_respects_s3_limits(): void
    {
        $this->assertSame(10 * self::MIB, Upload::partSizeFor(5 * self::MIB));
        // 200 GB must fit in 10,000 parts.
        $this->assertLessThanOrEqual(Upload::MAX_PARTS, ceil(200e9 / Upload::partSizeFor(200_000_000_000)));
    }

    public function test_a_video_is_uploaded_in_parts_and_saved(): void
    {
        $folder = Folder::factory()->create();
        $size = 10 * self::MIB + 6;
        $first = str_repeat('a', 10 * self::MIB);

        $uuid = $this->init($size, 'Vacaciones.MP4');
        $this->getJson(route('uploads.show', $uuid))
            ->assertJsonPath('part_size', 10 * self::MIB)
            ->assertJsonPath('part_count', 2)
            ->assertJsonPath('parts', []);

        // Parts may arrive in any order.
        $this->putPart($uuid, 2, 'bbbbbb')->assertOk();
        $this->putPart($uuid, 1, $first)->assertOk();
        $this->getJson(route('uploads.show', $uuid))->assertJsonCount(2, 'parts');

        $response = $this->post(route('uploads.complete', $uuid), [
            'title' => 'Mis vacaciones',
            'folder_id' => $folder->id,
            'duration' => 61.2,
            'width' => 1920,
            'height' => 1080,
            'thumbnail' => UploadedFile::fake()->image('thumbnail.jpg', 640, 360),
        ], ['Accept' => 'application/json'])->assertCreated();

        $video = Video::firstOrFail();
        $this->assertSame('Mis vacaciones', $video->title);
        $this->assertSame($folder->id, $video->folder_id);
        $this->assertSame($size, $video->size);
        $this->assertStringEndsWith('.mp4', $video->path);
        $this->assertSame($first.'bbbbbb', Storage::disk('local')->get($video->path));
        Storage::disk('local')->assertExists($video->thumbnail_path);
        Storage::disk('local')->assertMissing('uploads/'.$uuid);
        $this->assertSame(0, Upload::count());
        $response->assertJsonPath('url', route('videos.show', $video));
    }

    public function test_a_truncated_part_is_rejected(): void
    {
        $uuid = $this->init(10 * self::MIB + 6);

        $this->putPart($uuid, 2, 'bbb')->assertStatus(422);
    }

    public function test_part_numbers_out_of_range_are_rejected(): void
    {
        $uuid = $this->init(100);

        $this->postJson(route('uploads.parts.sign', ['upload' => $uuid, 'number' => 2]))->assertStatus(422);
    }

    public function test_an_incomplete_upload_cannot_be_completed(): void
    {
        $uuid = $this->init(10 * self::MIB + 6);
        $this->putPart($uuid, 2, 'bbbbbb');

        $this->postJson(route('uploads.complete', $uuid), ['title' => 'x'])->assertStatus(409);
        $this->assertSame(0, Video::count());
    }

    public function test_non_video_files_are_rejected(): void
    {
        $this->postJson(route('uploads.init'), ['name' => 'notes.txt', 'size' => 8, 'mime' => 'text/plain'])->assertStatus(422);
    }

    public function test_video_extension_is_enough_when_the_browser_reports_no_mime(): void
    {
        $this->postJson(route('uploads.init'), ['name' => 'clip.mkv', 'size' => 8, 'mime' => ''])->assertCreated();
    }

    public function test_cancelling_an_upload_removes_its_parts(): void
    {
        $uuid = $this->init(100);
        $this->putPart($uuid, 1, str_repeat('x', 100));

        $this->deleteJson(route('uploads.destroy', $uuid))->assertNoContent();

        Storage::disk('local')->assertMissing('uploads/'.$uuid);
        $this->assertSame(0, Upload::count());
    }

    public function test_stale_uploads_are_pruned(): void
    {
        $uuid = $this->init(100);
        $this->putPart($uuid, 1, 'abc');
        Upload::whereKey($uuid)->update(['updated_at' => now()->subDays(2)]);

        $this->artisan('uploads:prune')->assertSuccessful();

        $this->assertSame(0, Upload::count());
        Storage::disk('local')->assertMissing('uploads/'.$uuid);
    }
}
