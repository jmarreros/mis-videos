<?php

namespace Tests\Feature;

use App\Console\Commands\ImportVideoDir;
use App\Models\Folder;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ImportVideoDirTest extends TestCase
{
    use RefreshDatabase;

    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->dir = sys_get_temp_dir().'/video-import-'.uniqid();
        File::makeDirectory($this->dir);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->dir);

        parent::tearDown();
    }

    private function video(string $name): void
    {
        Process::run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=10:duration=2',
            '-pix_fmt', 'yuv420p', "{$this->dir}/{$name}"])->throw();
    }

    public function test_imports_videos_into_nested_folder_with_metadata_and_thumbnails(): void
    {
        $parent = Folder::create(['name' => 'VDance']);
        $this->video('clase_02_turn_it [628].mp4');
        $this->video('clase_01_turn_front_turn_back [627].mp4');
        File::put("{$this->dir}/clase_03_x [629].part.mp4", 'incompleto');
        File::put("{$this->dir}/notas.txt", 'texto');

        $this->artisan('videos:import-dir', ['dir' => $this->dir, 'folder' => 'VDance/curso-54'])
            ->expectsOutputToContain('2 importados, 0 ya estaban, 0 con error')
            ->assertSuccessful();

        $folder = Folder::where('name', 'curso-54')->where('parent_id', $parent->id)->sole();
        $this->assertSame(2, Folder::count());

        $videos = Video::where('folder_id', $folder->id)->latest()->get();
        $this->assertSame(['Clase 01 turn front turn back', 'Clase 02 turn it'], $videos->pluck('title')->all());

        $video = $videos->first();
        $this->assertSame('clase_01_turn_front_turn_back [627].mp4', $video->original_name);
        $this->assertSame('video/mp4', $video->mime);
        $this->assertSame(320, $video->width);
        $this->assertSame(180, $video->height);
        $this->assertEqualsWithDelta(2.0, $video->duration, 0.2);
        $this->assertSame(filesize("{$this->dir}/{$video->original_name}"), $video->size);
        Storage::disk('local')->assertExists($video->path);
        $this->assertStringStartsWith("\xFF\xD8", Storage::disk('local')->get($video->thumbnail_path));
    }

    public function test_uses_titles_file_and_skips_videos_already_imported(): void
    {
        $this->video('clase_01_turn_front_turn_back [627].mp4');
        $titles = "{$this->dir}/titles.json";
        File::put($titles, json_encode(['clase_01_turn_front_turn_back [627].mp4' => 'Clase 01 – Turn front turn back']));

        $this->artisan('videos:import-dir', ['dir' => $this->dir, 'folder' => 'VDance/curso-54', '--titles' => $titles])->assertSuccessful();
        $this->artisan('videos:import-dir', ['dir' => $this->dir, 'folder' => 'VDance/curso-54', '--titles' => $titles])
            ->expectsOutputToContain('0 importados, 1 ya estaban')
            ->assertSuccessful();

        $this->assertSame(['Clase 01 – Turn front turn back'], Video::pluck('title')->all());
    }

    public function test_dry_run_uploads_nothing(): void
    {
        $this->video('clase_01_turn_front_turn_back [627].mp4');

        $this->artisan('videos:import-dir', ['dir' => $this->dir, 'folder' => 'VDance/curso-54', '--dry-run' => true])->assertSuccessful();

        $this->assertSame(0, Video::count());
        $this->assertSame(0, Folder::count());
        $this->assertEmpty(Storage::disk('local')->allFiles());
    }

    public function test_title_from_file_name(): void
    {
        $this->assertSame('Clase 01 turn front turn back', ImportVideoDir::titleFromName('clase_01_turn_front_turn_back [627] (720p).mp4'));
        $this->assertSame('Mi video', ImportVideoDir::titleFromName('mi video.mov'));
    }
}
