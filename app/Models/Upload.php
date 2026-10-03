<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Upload extends Model
{
    use HasUuids;

    /** S3 only accepts parts of at least 5 MiB (except the last one) and at most 10,000 parts. */
    public const MIN_PART_SIZE = 10 * 1024 * 1024;

    public const MAX_PARTS = 10000;

    protected $primaryKey = 'uuid';

    protected $fillable = ['ulid', 'original_name', 'size', 'mime', 'path', 'part_size', 'upload_id'];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'part_size' => 'integer',
        ];
    }

    public static function partSizeFor(int $size): int
    {
        $mib = 1024 * 1024;

        return max(self::MIN_PART_SIZE, (int) ceil($size / self::MAX_PARTS / $mib) * $mib);
    }

    public function partCount(): int
    {
        return max(1, (int) ceil($this->size / $this->part_size));
    }

    public function expectedPartSize(int $number): int
    {
        return $number < $this->partCount()
            ? $this->part_size
            : $this->size - ($this->partCount() - 1) * $this->part_size;
    }
}
