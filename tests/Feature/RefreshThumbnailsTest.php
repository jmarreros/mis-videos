<?php

namespace Tests\Feature;

use App\Media\Thumbnailer;
use App\Models\Folder;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RefreshThumbnailsTest extends TestCase
{
    use RefreshDatabase;

    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->dir = sys_get_temp_dir().'/thumbs-'.uniqid();
        File::makeDirectory($this->dir);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->dir);

        parent::tearDown();
    }

    /**
     * A 4 s video that starts with a plain white intro (1 s) and then shows a test pattern.
     */
    private function videoWithWhiteIntro(Folder $folder, string $title): Video
    {
        $file = "{$this->dir}/{$title}.mp4";
        Process::run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=white:size=320x180:rate=10:duration=1',
            '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=10:duration=3',
            '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', $file])->throw();

        $white = "{$this->dir}/{$title}.jpg";
        Process::run(['ffmpeg', '-v', 'error', '-i', $file, '-frames:v', '1', $white])->throw();

        Storage::disk('local')->put("videos/{$title}.mp4", File::get($file));
        Storage::disk('local')->put("thumbnails/{$title}.jpg", File::get($white));

        return Video::create([
            'title' => $title, 'folder_id' => $folder->id, 'path' => "videos/{$title}.mp4",
            'original_name' => "{$title}.mp4", 'mime' => 'video/mp4', 'size' => filesize($file),
            'duration' => 4, 'width' => 320, 'height' => 180, 'thumbnail_path' => "thumbnails/{$title}.jpg",
        ]);
    }

    public function test_replaces_thumbnails_in_folder_and_subfolders_with_a_mid_video_frame(): void
    {
        $root = Folder::create(['name' => 'VDance']);
        $course = Folder::create(['name' => 'curso-130', 'parent_id' => $root->id]);
        $other = Folder::create(['name' => 'Otros']);
        $video = $this->videoWithWhiteIntro($course, 'clase');
        $untouched = $this->videoWithWhiteIntro($other, 'otro');

        $this->assertTrue(Thumbnailer::isBlank(Storage::disk('local')->get($video->thumbnail_path)));

        $this->artisan('videos:refresh-thumbnails', ['folder' => 'VDance'])
            ->expectsOutputToContain('1 miniaturas regeneradas, 0 con error')
            ->assertSuccessful();

        $video->refresh();
        $this->assertNotSame('thumbnails/clase.jpg', $video->thumbnail_path);
        Storage::disk('local')->assertMissing('thumbnails/clase.jpg');
        $this->assertFalse(Thumbnailer::isBlank(Storage::disk('local')->get($video->thumbnail_path)));
        $this->assertSame('thumbnails/otro.jpg', $untouched->refresh()->thumbnail_path);
    }

    public function test_only_blank_skips_good_thumbnails_and_dry_run_changes_nothing(): void
    {
        $folder = Folder::create(['name' => 'VDance']);
        $video = $this->videoWithWhiteIntro($folder, 'clase');

        $this->artisan('videos:refresh-thumbnails', ['folder' => 'VDance', '--dry-run' => true])
            ->expectsOutputToContain('1 miniaturas por regenerar')
            ->assertSuccessful();
        $this->assertSame('thumbnails/clase.jpg', $video->refresh()->thumbnail_path);

        $this->artisan('videos:refresh-thumbnails', ['folder' => 'VDance'])->assertSuccessful();
        $this->artisan('videos:refresh-thumbnails', ['folder' => 'VDance', '--only-blank' => true])
            ->expectsOutputToContain('0 miniaturas por regenerar')
            ->assertSuccessful();
    }

    public function test_unknown_folder_fails(): void
    {
        $this->artisan('videos:refresh-thumbnails', ['folder' => 'No/Existe'])->assertFailed();
    }
}
