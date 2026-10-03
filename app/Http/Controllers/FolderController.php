<?php

namespace App\Http\Controllers;

use App\Models\Folder;
use App\Models\Video;
use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FolderController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'parent_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        $request->validate(['name' => [$this->uniqueNameRule($data['parent_id'] ?? null)]]);

        Folder::create($data);

        return back()->with('success', 'Carpeta creada');
    }

    public function update(Request $request, Folder $folder): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'parent_id' => [
                'sometimes', 'nullable', 'integer', 'exists:folders,id',
                function (string $attribute, mixed $value, Closure $fail) use ($folder) {
                    if ($value && in_array((int) $value, $folder->descendantAndSelfIds(), true)) {
                        $fail('No puedes mover una carpeta dentro de sí misma.');
                    }
                },
            ],
        ]);

        $parentId = array_key_exists('parent_id', $data) ? $data['parent_id'] : $folder->parent_id;
        $name = $data['name'] ?? $folder->name;

        $request->merge(['name' => $name])->validate([
            'name' => [$this->uniqueNameRule($parentId, $folder->id)],
        ]);

        $folder->update(['name' => $name, 'parent_id' => $parentId]);

        return back()->with('success', 'Carpeta actualizada');
    }

    public function destroy(Folder $folder): RedirectResponse
    {
        $parentId = $folder->parent_id;

        DB::transaction(function () use ($folder, $parentId) {
            Video::where('folder_id', $folder->id)->update(['folder_id' => $parentId]);

            foreach ($folder->children as $child) {
                $child->update([
                    'parent_id' => $parentId,
                    'name' => $this->availableName($child->name, $parentId, $child->id),
                ]);
            }

            $folder->delete();
        });

        return redirect()
            ->route('library', $parentId ? ['folder' => $parentId] : [])
            ->with('success', 'Carpeta eliminada; su contenido se movió a la carpeta superior');
    }

    private function uniqueNameRule(?int $parentId, ?int $ignoreId = null): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($parentId, $ignoreId) {
            if ($this->nameTaken((string) $value, $parentId, $ignoreId)) {
                $fail('Ya existe una carpeta con ese nombre aquí.');
            }
        };
    }

    private function nameTaken(string $name, ?int $parentId, ?int $ignoreId): bool
    {
        return Folder::query()
            ->where('parent_id', $parentId)
            ->where('name', $name)
            ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))
            ->exists();
    }

    private function availableName(string $name, ?int $parentId, int $ignoreId): string
    {
        $candidate = $name;

        for ($i = 2; $this->nameTaken($candidate, $parentId, $ignoreId); $i++) {
            $candidate = "{$name} ({$i})";
        }

        return $candidate;
    }
}
