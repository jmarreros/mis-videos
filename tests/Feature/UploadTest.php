<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\Upload;
use App\Models\User;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->actingAs(User::factory()->create());
    }

    private function chunk(string $contents): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('chunk', $contents);
    }

    public function test_a_video_is_uploaded_in_chunks_and_saved(): void
    {
        $folder = Folder::factory()->create();
        $parts = ['aaaa', 'bbbb', 'cc'];

        $uuid = $this->postJson(route('uploads.init'), ['name' => 'Vacaciones.MP4', 'size' => 10, 'mime' => 'video/mp4'])
            ->assertCreated()
            ->assertJsonPath('received_bytes', 0)
            ->json('uuid');

        $offset = 0;
        foreach ($parts as $part) {
            $this->post(route('uploads.chunk', $uuid), ['offset' => $offset, 'chunk' => $this->chunk($part)], ['Accept' => 'application/json'])
                ->assertOk()
                ->assertJsonPath('received_bytes', $offset + strlen($part));
            $offset += strlen($part);
        }

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
        $this->assertSame(10, $video->size);
        $this->assertStringEndsWith('.mp4', $video->path);
        $this->assertSame('aaaabbbbcc', Storage::get($video->path));
        Storage::assertExists($video->thumbnail_path);
        $this->assertSame(0, Upload::count());
        $response->assertJsonPath('url', route('videos.show', $video));
    }

    public function test_a_chunk_with_the_wrong_offset_is_rejected(): void
    {
        $uuid = $this->postJson(route('uploads.init'), ['name' => 'a.mp4', 'size' => 8, 'mime' => 'video/mp4'])->json('uuid');
        $this->post(route('uploads.chunk', $uuid), ['offset' => 0, 'chunk' => $this->chunk('aaaa')], ['Accept' => 'application/json']);

        $this->post(route('uploads.chunk', $uuid), ['offset' => 0, 'chunk' => $this->chunk('aaaa')], ['Accept' => 'application/json'])
            ->assertStatus(409)
            ->assertJsonPath('received_bytes', 4);

        $this->getJson(route('uploads.show', $uuid))->assertJsonPath('received_bytes', 4);
    }

    public function test_an_incomplete_upload_cannot_be_completed(): void
    {
        $uuid = $this->postJson(route('uploads.init'), ['name' => 'a.mp4', 'size' => 8, 'mime' => 'video/mp4'])->json('uuid');

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

    public function test_stale_uploads_are_pruned(): void
    {
        $upload = Upload::create(['original_name' => 'a.mp4', 'size' => 10, 'mime' => 'video/mp4']);
        Storage::put($upload->partPath(), 'abc');
        Upload::whereKey($upload->uuid)->update(['updated_at' => now()->subDays(2)]);

        $this->artisan('uploads:prune')->assertSuccessful();

        $this->assertSame(0, Upload::count());
        Storage::assertMissing($upload->partPath());
    }
}
