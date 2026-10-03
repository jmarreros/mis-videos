<?php

namespace App\Http\Controllers;

use App\Models\Video;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class MediaController extends Controller
{
    /**
     * BinaryFileResponse honours the Range header, so the browser can seek.
     */
    public function stream(Video $video): BinaryFileResponse
    {
        abort_unless(Storage::exists($video->path), 404);

        return response()->file(Storage::path($video->path), [
            'Content-Type' => $video->mime,
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    public function thumbnail(Video $video): BinaryFileResponse
    {
        abort_unless($video->thumbnail_path && Storage::exists($video->thumbnail_path), 404);

        return response()->file(Storage::path($video->thumbnail_path), [
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }
}
