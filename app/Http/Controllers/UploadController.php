<?php

namespace App\Http\Controllers;

use App\Media\LocalMultipartUploader;
use App\Media\MediaStorage;
use App\Media\MultipartUploader;
use App\Models\Upload;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Multipart upload: init → sign each part (the browser PUTs it straight to
 * the returned URL) → complete. With S3 the video never passes through PHP.
 */
class UploadController extends Controller
{
    public const EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'ogv', 'mpeg', 'mpg', '3gp'];

    public function __construct(private MultipartUploader $uploader) {}

    public function init(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'size' => ['required', 'integer', 'min:1'],
            'mime' => ['nullable', 'string', 'max:100'],
        ]);

        $extension = strtolower(pathinfo($data['name'], PATHINFO_EXTENSION));
        $mime = $data['mime'] ?? '';

        if (! str_starts_with($mime, 'video/') && ! in_array($extension, self::EXTENSIONS, true)) {
            return response()->json(['message' => 'El archivo no parece ser un video.'], 422);
        }

        $ulid = (string) Str::ulid();

        $upload = new Upload([
            'ulid' => $ulid,
            'original_name' => $data['name'],
            'size' => $data['size'],
            'mime' => str_starts_with($mime, 'video/') ? $mime : 'video/'.($extension === 'mov' ? 'quicktime' : $extension),
            'path' => "videos/{$ulid}.".($extension ?: 'mp4'),
            'part_size' => Upload::partSizeFor($data['size']),
        ]);

        $this->uploader->start($upload);
        $upload->save();

        return response()->json($this->state($upload, []), 201);
    }

    public function show(Upload $upload): JsonResponse
    {
        return response()->json($this->state($upload, $this->uploader->uploadedParts($upload)));
    }

    public function sign(Upload $upload, int $number): JsonResponse
    {
        abort_unless($number >= 1 && $number <= $upload->partCount(), 422, 'Número de parte no válido');

        $upload->touch();

        return response()->json($this->uploader->partTarget($upload, $number));
    }

    /**
     * Receives a part when the media disk is local (on S3 the browser PUTs to the bucket).
     */
    public function storePart(Request $request, Upload $upload, int $number): JsonResponse
    {
        abort_unless($this->uploader instanceof LocalMultipartUploader, 404);
        abort_unless($number >= 1 && $number <= $upload->partCount(), 422, 'Número de parte no válido');

        $size = $this->uploader->storePart($upload, $number, $request->getContent(true));

        if ($size !== $upload->expectedPartSize($number)) {
            return response()->json(['message' => 'La parte llegó incompleta'], 422);
        }

        return response()->json(['number' => $number, 'size' => $size]);
    }

    public function complete(Request $request, Upload $upload): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
            'duration' => ['nullable', 'numeric', 'min:0'],
            'width' => ['nullable', 'integer', 'min:0'],
            'height' => ['nullable', 'integer', 'min:0'],
            'thumbnail' => ['nullable', 'image', 'mimes:jpeg,png,webp', 'max:8192'],
        ]);

        $parts = $this->uploader->uploadedParts($upload);

        if (count($parts) !== $upload->partCount() || array_sum($parts) !== $upload->size) {
            return response()->json(['message' => 'La subida aún no está completa', ...$this->state($upload, $parts)], 409);
        }

        $this->uploader->complete($upload);

        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->storeAs('thumbnails', $upload->ulid.'.'.$request->file('thumbnail')->extension(), MediaStorage::name())
            : null;

        $video = DB::transaction(function () use ($upload, $data, $thumbnailPath) {
            $video = new Video([
                'title' => $data['title'],
                'folder_id' => $data['folder_id'] ?? null,
                'path' => $upload->path,
                'original_name' => $upload->original_name,
                'mime' => $upload->mime,
                'size' => $upload->size,
                'duration' => $data['duration'] ?? null,
                'width' => $data['width'] ?? null,
                'height' => $data['height'] ?? null,
                'thumbnail_path' => $thumbnailPath,
            ]);
            $video->ulid = $upload->ulid;
            $video->save();

            $upload->delete();

            return $video;
        });

        return response()->json([
            'video' => $video,
            'url' => route('videos.show', $video),
        ], 201);
    }

    public function destroy(Upload $upload): JsonResponse
    {
        $this->uploader->abort($upload);
        $upload->delete();

        return response()->json(status: 204);
    }

    /**
     * @param  array<int, int>  $parts
     * @return array<string, mixed>
     */
    private function state(Upload $upload, array $parts): array
    {
        return [
            'uuid' => $upload->uuid,
            'size' => $upload->size,
            'part_size' => $upload->part_size,
            'part_count' => $upload->partCount(),
            'parts' => collect($parts)->map(fn (int $size, int $number) => ['number' => $number, 'size' => $size])->values(),
        ];
    }
}
