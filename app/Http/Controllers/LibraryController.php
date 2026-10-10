<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Models\Video;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LibraryController extends Controller
{
    public function index(?Folder $folder = null): Response
    {
        $subfolders = Folder::query()
            ->where('parent_id', $folder?->id)
            ->withCount(['videos', 'children'])
            ->orderBy('name')
            ->get();

        $videos = Video::query()
            ->where('folder_id', $folder?->id)
            ->latest()
            ->get();

        return Inertia::render('library/index', [
            'folder' => $folder?->only('id', 'name', 'parent_id'),
            'ancestors' => $folder?->ancestors()->map->only('id', 'name')->values() ?? [],
            'subfolders' => $subfolders,
            'videos' => $videos,
        ]);
    }

    public function favorites(): Response
    {
        return Inertia::render('library/favorites', [
            'videos' => Video::query()
                ->with('folder:id,name')
                ->whereNotNull('favorited_at')
                ->orderByDesc('favorited_at')
                ->get(),
        ]);
    }

    public function search(Request $request): Response
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'folder' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        $query = trim($filters['q'] ?? '');
        $folder = isset($filters['folder']) ? Folder::find($filters['folder']) : null;

        $videos = Video::query()
            ->with('folder:id,name')
            ->when($query !== '', function ($builder) use ($query) {
                foreach (preg_split('/\s+/', $query) as $term) {
                    $builder->where('title', 'like', '%'.$term.'%');
                }
            })
            ->when($folder, fn ($builder) => $builder->whereIn('folder_id', $folder->descendantAndSelfIds()))
            ->latest()
            ->limit(200)
            ->get();

        return Inertia::render('library/search', [
            'filters' => ['q' => $query, 'folder' => $folder?->id],
            'videos' => $videos,
        ]);
    }
}
