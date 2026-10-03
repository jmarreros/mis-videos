<?php

namespace App\Http\Controllers;

use App\Models\Video;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class VideoController extends Controller
{
    public function show(Video $video): Response
    {
        $video->load('folder:id,name,parent_id');

        $related = Video::query()
            ->where('folder_id', $video->folder_id)
            ->whereKeyNot($video->id)
            ->latest()
            ->limit(12)
            ->get();

        return Inertia::render('videos/show', [
            'video' => $video,
            'ancestors' => $video->folder
                ? $video->folder->ancestors()->push($video->folder)->map->only('id', 'name')->values()
                : [],
            'related' => $related,
        ]);
    }

    public function update(Request $request, Video $video): RedirectResponse
    {
        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'folder_id' => ['sometimes', 'nullable', 'integer', 'exists:folders,id'],
        ]);

        $video->update($data);

        return back()->with('success', 'Video actualizado');
    }

    public function move(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['string', 'exists:videos,ulid'],
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        $count = Video::whereIn('ulid', $data['ids'])->update(['folder_id' => $data['folder_id'] ?? null]);

        return back()->with('success', $count === 1 ? 'Video movido' : "{$count} videos movidos");
    }

    public function thumbnail(Request $request, Video $video): RedirectResponse
    {
        $request->validate([
            'thumbnail' => ['required', 'image', 'mimes:jpeg,png,webp', 'max:8192'],
        ]);

        if ($video->thumbnail_path) {
            Storage::delete($video->thumbnail_path);
        }

        $file = $request->file('thumbnail');
        $path = $file->storeAs('thumbnails', $video->ulid.'-'.time().'.'.$file->extension());

        $video->update(['thumbnail_path' => $path]);

        return back()->with('success', 'Miniatura actualizada');
    }

    public function destroy(Video $video): RedirectResponse
    {
        $folderId = $video->folder_id;
        $fromPlayer = url()->previous() === route('videos.show', $video);

        $video->deleteFiles();
        $video->delete();

        if (! $fromPlayer) {
            return back()->with('success', 'Video eliminado');
        }

        return redirect()
            ->route('library', $folderId ? ['folder' => $folderId] : [])
            ->with('success', 'Video eliminado');
    }
}
