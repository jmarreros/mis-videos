<?php

namespace App\Http\Controllers;

use App\Models\Upload;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class UploadController extends Controller
{
    public const EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'ogv', 'mpeg', 'mpg', '3gp'];

    private const MAX_CHUNK = 5 * 1024 * 1024;

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

        $upload = Upload::create([
            'original_name' => $data['name'],
            'received_bytes' => 0,
            'size' => $data['size'],
            'mime' => str_starts_with($mime, 'video/') ? $mime : 'video/'.($extension === 'mov' ? 'quicktime' : $extension),
        ]);

        Storage::put($upload->partPath(), '');

        return response()->json($this->state($upload), 201);
    }

    public function show(Upload $upload): JsonResponse
    {
        return response()->json($this->state($upload));
    }

    public function chunk(Request $request, Upload $upload): JsonResponse
    {
        $request->validate([
            'offset' => ['required', 'integer', 'min:0'],
            'chunk' => ['required', 'file'],
        ]);

        if ((int) $request->input('offset') !== $upload->received_bytes) {
            return response()->json(['message' => 'Offset incorrecto', ...$this->state($upload)], 409);
        }

        $chunk = $request->file('chunk');

        if ($upload->received_bytes + $chunk->getSize() > $upload->size) {
            return response()->json(['message' => 'El fragmento excede el tamaño del archivo'], 422);
        }

        $path = Storage::path($upload->partPath());
        $target = fopen($path, 'ab');
        $source = fopen($chunk->getRealPath(), 'rb');
        stream_copy_to_stream($source, $target);
        fclose($source);
        fclose($target);

        clearstatcache(true, $path);
        $upload->update(['received_bytes' => filesize($path)]);

        return response()->json($this->state($upload));
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

        if ($upload->received_bytes !== $upload->size) {
            return response()->json(['message' => 'La subida aún no está completa', ...$this->state($upload)], 409);
        }

        $ulid = (string) Str::ulid();
        $extension = strtolower(pathinfo($upload->original_name, PATHINFO_EXTENSION)) ?: 'mp4';
        $videoPath = "videos/{$ulid}.{$extension}";

        Storage::move($upload->partPath(), $videoPath);

        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->storeAs('thumbnails', $ulid.'.'.$request->file('thumbnail')->extension())
            : null;

        $video = DB::transaction(function () use ($upload, $data, $ulid, $videoPath, $thumbnailPath) {
            $video = new Video([
                'title' => $data['title'],
                'folder_id' => $data['folder_id'] ?? null,
                'path' => $videoPath,
                'original_name' => $upload->original_name,
                'mime' => $upload->mime,
                'size' => $upload->size,
                'duration' => $data['duration'] ?? null,
                'width' => $data['width'] ?? null,
                'height' => $data['height'] ?? null,
                'thumbnail_path' => $thumbnailPath,
            ]);
            $video->ulid = $ulid;
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
        Storage::delete($upload->partPath());
        $upload->delete();

        return response()->json(status: 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function state(Upload $upload): array
    {
        return [
            'uuid' => $upload->uuid,
            'size' => $upload->size,
            'received_bytes' => $upload->received_bytes,
            'chunk_size' => self::chunkSize(),
        ];
    }

    /**
     * Largest chunk the PHP configuration accepts, capped at 5 MB.
     */
    public static function chunkSize(): int
    {
        $limit = min(
            self::iniBytes(ini_get('upload_max_filesize')) ?: PHP_INT_MAX,
            self::iniBytes(ini_get('post_max_size')) ?: PHP_INT_MAX,
        );

        // Leave room for the multipart envelope and the other fields.
        return max(256 * 1024, min(self::MAX_CHUNK, $limit - 64 * 1024));
    }

    private static function iniBytes(string|false $value): int
    {
        $value = trim((string) $value);
        $number = (int) $value;

        return match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 ** 3,
            'm' => $number * 1024 ** 2,
            'k' => $number * 1024,
            default => $number,
        };
    }
}
