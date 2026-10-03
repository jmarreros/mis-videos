<?php

namespace App\Media;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;

/**
 * The disk holding videos and thumbnails (config: filesystems.media_disk).
 */
class MediaStorage
{
    public static function name(): string
    {
        return config('filesystems.media_disk');
    }

    public static function disk(): Filesystem
    {
        return Storage::disk(self::name());
    }

    public static function isS3(): bool
    {
        return config('filesystems.disks.'.self::name().'.driver') === 's3';
    }
}
