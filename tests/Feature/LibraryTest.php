<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\User;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LibraryTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_login(): void
    {
        $video = Video::factory()->create();

        $this->get('/')->assertRedirect('/login');
        $this->get('/search')->assertRedirect('/login');
        $this->get(route('media.stream', $video))->assertRedirect('/login');
        $this->post('/uploads', [])->assertRedirect('/login');
    }

    public function test_registration_is_disabled(): void
    {
        $this->get('/register')->assertNotFound();
    }

    public function test_library_lists_folder_contents(): void
    {
        $parent = Folder::factory()->create(['name' => 'Viajes']);
        $child = Folder::factory()->create(['name' => 'Japón', 'parent_id' => $parent->id]);
        Video::factory()->create(['folder_id' => $parent->id, 'title' => 'Llegada']);
        Video::factory()->create(['title' => 'En la raíz']);

        $this->actingAs(User::factory()->create())
            ->get(route('folders.show', $parent))
            ->assertInertia(fn (Assert $page) => $page
                ->component('library/index')
                ->where('folder.id', $parent->id)
                ->has('subfolders', 1)
                ->where('subfolders.0.id', $child->id)
                ->has('videos', 1)
                ->where('videos.0.title', 'Llegada')
                ->has('folders', 2)
            );
    }

    public function test_search_filters_by_title_and_folder_including_subfolders(): void
    {
        $parent = Folder::factory()->create();
        $child = Folder::factory()->create(['parent_id' => $parent->id]);
        Video::factory()->create(['title' => 'Playa verano', 'folder_id' => $child->id]);
        Video::factory()->create(['title' => 'Playa invierno']);
        Video::factory()->create(['title' => 'Montaña', 'folder_id' => $parent->id]);

        $user = User::factory()->create();

        $this->actingAs($user)->get(route('search', ['q' => 'playa']))
            ->assertInertia(fn (Assert $page) => $page->has('videos', 2));

        $this->actingAs($user)->get(route('search', ['q' => 'playa', 'folder' => $parent->id]))
            ->assertInertia(fn (Assert $page) => $page->has('videos', 1)->where('videos.0.title', 'Playa verano'));
    }

    public function test_folder_cannot_be_moved_into_its_own_descendant(): void
    {
        $parent = Folder::factory()->create();
        $child = Folder::factory()->create(['parent_id' => $parent->id]);

        $this->actingAs(User::factory()->create())
            ->patch(route('folders.update', $parent), ['parent_id' => $child->id])
            ->assertSessionHasErrors('parent_id');

        $this->assertNull($parent->fresh()->parent_id);
    }

    public function test_folder_names_are_unique_per_parent(): void
    {
        Folder::factory()->create(['name' => 'Familia']);

        $this->actingAs(User::factory()->create())
            ->post(route('folders.store'), ['name' => 'Familia'])
            ->assertSessionHasErrors('name');
    }

    public function test_deleting_a_folder_moves_its_contents_to_the_parent(): void
    {
        $parent = Folder::factory()->create();
        $folder = Folder::factory()->create(['parent_id' => $parent->id]);
        $sub = Folder::factory()->create(['parent_id' => $folder->id]);
        $video = Video::factory()->create(['folder_id' => $folder->id]);

        $this->actingAs(User::factory()->create())
            ->delete(route('folders.destroy', $folder))
            ->assertRedirect(route('library', ['folder' => $parent->id]));

        $this->assertModelMissing($folder);
        $this->assertSame($parent->id, $video->fresh()->folder_id);
        $this->assertSame($parent->id, $sub->fresh()->parent_id);
    }

    public function test_videos_can_be_moved_in_bulk(): void
    {
        $folder = Folder::factory()->create();
        $videos = Video::factory()->count(3)->create();

        $this->actingAs(User::factory()->create())
            ->post(route('videos.move'), ['ids' => $videos->pluck('ulid')->all(), 'folder_id' => $folder->id])
            ->assertSessionHasNoErrors();

        $this->assertSame(3, Video::where('folder_id', $folder->id)->count());
    }

    public function test_stream_supports_range_requests(): void
    {
        Storage::fake('local');
        $video = Video::factory()->create(['path' => 'videos/test.mp4', 'size' => 1000]);
        Storage::put('videos/test.mp4', str_repeat('a', 1000));

        $response = $this->actingAs(User::factory()->create())
            ->get(route('media.stream', $video), ['Range' => 'bytes=100-199']);

        $response->assertStatus(206);
        $response->assertHeader('Content-Range', 'bytes 100-199/1000');
        $response->assertHeader('Content-Type', 'video/mp4');
    }

    public function test_deleting_a_video_removes_its_files(): void
    {
        Storage::fake('local');
        $video = Video::factory()->create(['path' => 'videos/a.mp4', 'thumbnail_path' => 'thumbnails/a.jpg']);
        Storage::put('videos/a.mp4', 'x');
        Storage::put('thumbnails/a.jpg', 'x');

        $this->actingAs(User::factory()->create())->delete(route('videos.destroy', $video));

        $this->assertModelMissing($video);
        Storage::assertMissing(['videos/a.mp4', 'thumbnails/a.jpg']);
    }
}
