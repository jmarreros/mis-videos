<?php

namespace App\Models;

use App\Media\MediaStorage;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Video extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = [
        'title', 'folder_id', 'vimeo_id', 'path', 'original_name', 'mime',
        'size', 'duration', 'width', 'height', 'thumbnail_path', 'completed_at', 'favorited_at',
    ];

    protected $hidden = ['path', 'thumbnail_path'];

    protected $appends = ['stream_url', 'thumbnail_url'];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'duration' => 'float',
            'width' => 'integer',
            'height' => 'integer',
            'completed_at' => 'datetime',
            'favorited_at' => 'datetime',
        ];
    }

    public function uniqueIds(): array
    {
        return ['ulid'];
    }

    public function getRouteKeyName(): string
    {
        return 'ulid';
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }

    protected function streamUrl(): Attribute
    {
        return Attribute::get(fn () => route('media.stream', $this));
    }

    protected function thumbnailUrl(): Attribute
    {
        return Attribute::get(fn () => $this->thumbnail_path
            ? route('media.thumbnail', ['video' => $this, 'v' => $this->updated_at?->timestamp])
            : null);
    }

    public function deleteFiles(): void
    {
        MediaStorage::disk()->delete(array_filter([$this->path, $this->thumbnail_path]));
    }
}
