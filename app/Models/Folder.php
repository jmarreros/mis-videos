<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Folder extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'parent_id'];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Folder::class, 'parent_id')->orderBy('name');
    }

    public function videos(): HasMany
    {
        return $this->hasMany(Video::class);
    }

    /**
     * Ancestors ordered from the root down to the direct parent.
     *
     * @return Collection<int, Folder>
     */
    public function ancestors(): Collection
    {
        $ancestors = new Collection;
        $current = $this->parent;

        while ($current) {
            $ancestors->prepend($current);
            $current = $current->parent;
        }

        return $ancestors;
    }

    /**
     * IDs of this folder and every folder nested below it.
     *
     * @return array<int, int>
     */
    public function descendantAndSelfIds(): array
    {
        $parents = Folder::query()->pluck('parent_id', 'id');
        $ids = [$this->id];

        for ($i = 0; $i < count($ids); $i++) {
            foreach ($parents as $id => $parentId) {
                if ($parentId === $ids[$i]) {
                    $ids[] = $id;
                }
            }
        }

        return $ids;
    }

    public function isDescendantOf(Folder $folder): bool
    {
        return in_array($this->id, $folder->descendantAndSelfIds(), true) && $this->id !== $folder->id;
    }
}
