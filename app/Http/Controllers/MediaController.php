<?php

namespace App\Http\Controllers;

use App\Media\MediaStorage;
use App\Models\Video;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\HeaderUtils;

/**
 * On S3 these redirect to short-lived signed URLs, so the bucket serves the
 * bytes (with Range support for seeking). On a local disk the file is sent
 * by PHP; BinaryFileResponse also honours the Range header.
 */
class MediaController extends Controller
{
    public function stream(Request $request, Video $video): BinaryFileResponse|RedirectResponse
    {
        $disposition = $request->boolean('download')
            ? HeaderUtils::makeDisposition('attachment', $video->original_name, 'video')
            : null;

        if (MediaStorage::isS3()) {
            return $this->redirectTo($video->path, now()->addHours(6), array_filter([
                'ResponseContentType' => $video->mime,
                'ResponseContentDisposition' => $disposition,
            ]));
        }

        abort_unless(MediaStorage::disk()->exists($video->path), 404);

        return response()->file(MediaStorage::disk()->path($video->path), array_filter([
            'Content-Type' => $video->mime,
            'Content-Disposition' => $disposition,
            'Cache-Control' => 'private, max-age=86400',
        ]));
    }

    public function thumbnail(Video $video): BinaryFileResponse|RedirectResponse
    {
        abort_unless($video->thumbnail_path, 404);

        if (MediaStorage::isS3()) {
            return $this->redirectTo($video->thumbnail_path, now()->addHours(12))
                // The thumbnail URL changes whenever the image does, so the redirect can be cached.
                ->header('Cache-Control', 'private, max-age=36000');
        }

        abort_unless(MediaStorage::disk()->exists($video->thumbnail_path), 404);

        return response()->file(MediaStorage::disk()->path($video->thumbnail_path), [
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }

    /**
     * @param  array<string, string>  $options
     */
    private function redirectTo(string $path, \DateTimeInterface $expires, array $options = []): RedirectResponse
    {
        return redirect()->away(MediaStorage::disk()->temporaryUrl($path, $expires, $options));
    }
}
