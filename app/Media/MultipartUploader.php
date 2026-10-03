<?php

namespace App\Media;

use App\Models\Upload;

/**
 * The browser uploads each part with a plain PUT to the URL returned by
 * partTarget(): a presigned S3 URL, or a route on this server for local disks.
 */
interface MultipartUploader
{
    public function start(Upload $upload): void;

    /**
     * @return array{url: string, headers: array<string, string>}
     */
    public function partTarget(Upload $upload, int $number): array;

    /**
     * Parts already stored, as part number => size in bytes.
     *
     * @return array<int, int>
     */
    public function uploadedParts(Upload $upload): array;

    /** Joins every part into the final file at $upload->path. */
    public function complete(Upload $upload): void;

    public function abort(Upload $upload): void;
}
