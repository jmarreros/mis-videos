<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ImportVimeoFolderTest extends TestCase
{
    use RefreshDatabase;

    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.vimeo.token' => 'test-token']);
        Storage::fake('local');

        $this->dir = sys_get_temp_dir().'/vimeo-import-'.uniqid();
        File::makeDirectory($this->dir);

        Http::fake([
            // Two pages: the second one is requested through paging.next
            'api.vimeo.com/me/projects/200/videos*' => fn ($request) => str_contains($request->url(), 'page=2')
                ? Http::response([
                    'data' => [$this->remote(13, 'B_IMG_5468', '2025-10-07T14:23:00+00:00')],
                    'paging' => ['next' => null],
                ])
                : Http::response([
                    'data' => [
                        $this->remote(11, 'parque Samir', '2025-10-28T14:40:00+00:00'),
                        $this->remote(12, 'WhatsApp Video 2022-08-07 at 9.20.03 AM', '2022-08-07T14:20:03+00:00'),
                    ],
                    'paging' => ['next' => '/me/projects/200/videos?page=2'],
                ]),
            'api.vimeo.com/me/projects/200*' => Http::response([
                'name' => 'Clases parque',
                'metadata' => ['connections' => ['parent_folder' => ['uri' => '/users/1/projects/100']]],
            ]),
            'api.vimeo.com/users/1/projects/100*' => Http::response([
                'name' => 'Personales',
                'metadata' => ['connections' => ['parent_folder' => null]],
            ]),
            'i.vimeocdn.com/*' => Http::response('jpeg-bytes'),
        ]);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->dir);

        parent::tearDown();
    }

    private function remote(int $id, string $name, string $created): array
    {
        return [
            'uri' => "/videos/{$id}",
            'name' => $name,
            'created_time' => $created,
            'duration' => 60,
            'width' => 1080,
            'height' => 1920,
            'pictures' => ['sizes' => [
                ['link' => "https://i.vimeocdn.com/video/{$id}_100x75.jpg"],
                ['link' => "https://i.vimeocdn.com/video/{$id}_1920x1080.jpg"],
            ]],
        ];
    }

    private function download(string $name, string $contents = 'video-bytes'): void
    {
        File::put("{$this->dir}/{$name}", $contents);
    }

    public function test_imports_downloads_with_original_titles_folders_and_thumbnails(): void
    {
        $this->download('parque_samir_v1 (1080p).mp4', 'samir');
        $this->download('whatsapp_video_2022-08-07_at_9.20.03_am_v1 (360p).mp4');
        $this->download('b_img_5468 (1080p).mp4');

        $this->artisan('vimeo:import', ['folder' => '200', 'dir' => $this->dir])->assertSuccessful();

        $parent = Folder::where('name', 'Personales')->whereNull('parent_id')->sole();
        $folder = Folder::where('name', 'Clases parque')->where('parent_id', $parent->id)->sole();

        $this->assertSame(3, Video::where('folder_id', $folder->id)->count());

        $video = Video::where('vimeo_id', 11)->sole();
        $this->assertSame('parque Samir', $video->title);
        $this->assertSame('parque_samir_v1 (1080p).mp4', $video->original_name);
        $this->assertSame(5, $video->size);
        $this->assertSame('video/mp4', $video->mime);
        $this->assertSame('2025-10-28 14:40:00', $video->created_at->utc()->toDateTimeString());
        Storage::disk('local')->assertExists($video->path);
        $this->assertSame('samir', Storage::disk('local')->get($video->path));
        $this->assertSame('jpeg-bytes', Storage::disk('local')->get($video->thumbnail_path));

        Http::assertSent(fn ($request) => str_contains($request->url(), 'api.vimeo.com') && $request->hasHeader('Authorization', 'Bearer test-token'));
        Http::assertSent(fn ($request) => str_contains($request->url(), '11_1920x1080.jpg'));
    }

    public function test_running_again_skips_videos_already_imported(): void
    {
        $this->download('parque_samir_v1 (1080p).mp4');
        $this->download('whatsapp_video_2022-08-07_at_9.20.03_am_v1 (360p).mp4');
        $this->download('b_img_5468 (1080p).mp4');

        $this->artisan('vimeo:import', ['folder' => '200', 'dir' => $this->dir])->assertSuccessful();
        $this->artisan('vimeo:import', ['folder' => '200', 'dir' => $this->dir])
            ->expectsOutputToContain('0 importados, 3 ya estaban')
            ->assertSuccessful();

        $this->assertSame(3, Video::count());
        $this->assertSame(2, Folder::count());
    }

    public function test_reuses_existing_folders(): void
    {
        $parent = Folder::create(['name' => 'Personales']);
        Folder::create(['name' => 'Clases parque', 'parent_id' => $parent->id]);
        $this->download('b_img_5468 (1080p).mp4');

        $this->artisan('vimeo:import', ['folder' => '200', 'dir' => $this->dir]);

        $this->assertSame(2, Folder::count());
    }

    public function test_reports_files_without_a_vimeo_match_and_missing_downloads(): void
    {
        $this->download('parque_samir_v1 (1080p).mp4');
        $this->download('otro-video (720p).mp4');

        $this->artisan('vimeo:import', ['folder' => '200', 'dir' => $this->dir])
            ->expectsOutputToContain('Sin emparejar: otro-video (720p).mp4')
            ->expectsOutputToContain('Falta el archivo de: B_IMG_5468')
            ->assertFailed();

        $this->assertSame(['parque Samir'], Video::pluck('title')->all());
    }

    public function test_matches_files_by_vimeo_id_when_names_repeat(): void
    {
        Http::fake([
            'api.vimeo.com/me/projects/300/videos*' => Http::response([
                'data' => [
                    $this->remote(21, 'Junio 2023', '2023-06-01T10:00:00+00:00'),
                    $this->remote(22, 'Junio 2023', '2023-06-08T10:00:00+00:00'),
                ],
                'paging' => ['next' => null],
            ]),
            'api.vimeo.com/me/projects/300*' => Http::response([
                'name' => 'Clases Salsa',
                'metadata' => ['connections' => ['parent_folder' => null]],
            ]),
        ]);
        $this->download('junio_2023 [21] (1080p).mp4', 'primero');
        $this->download('junio_2023 [22] (720p).mp4', 'segundo');
        $this->download('otro [99] (1080p).mp4');

        $this->artisan('vimeo:import', ['folder' => '300', 'dir' => $this->dir])
            ->expectsOutputToContain('Sin emparejar: otro [99] (1080p).mp4 (ningún video de la carpeta tiene ese id)')
            ->assertFailed();

        $this->assertSame('primero', Storage::disk('local')->get(Video::where('vimeo_id', 21)->sole()->path));
        $this->assertSame('segundo', Storage::disk('local')->get(Video::where('vimeo_id', 22)->sole()->path));
    }

    public function test_dry_run_uploads_nothing(): void
    {
        $this->download('parque_samir_v1 (1080p).mp4');

        $this->artisan('vimeo:import', ['folder' => '200', 'dir' => $this->dir, '--dry-run' => true])->assertSuccessful();

        $this->assertSame(0, Video::count());
        $this->assertSame(0, Folder::count());
        $this->assertEmpty(Storage::disk('local')->allFiles());
    }
}
