<?php

namespace App\Media;

use App\Models\Upload;
use Illuminate\Contracts\Filesystem\Filesystem;
use RuntimeException;

/**
 * Same protocol as S3, but parts are PUT to this server and stored in
 * uploads/{uuid}/ until they are joined.
 */
class LocalMultipartUploader implements MultipartUploader
{
    public function __construct(private Filesystem $disk) {}

    public function start(Upload $upload): void
    {
        $this->disk->makeDirectory($this->directory($upload));
    }

    public function partTarget(Upload $upload, int $number): array
    {
        return [
            'url' => route('uploads.parts.store', ['upload' => $upload, 'number' => $number]),
            'headers' => [],
        ];
    }

    /**
     * @param  resource  $stream
     */
    public function storePart(Upload $upload, int $number, $stream): int
    {
        $path = $this->partPath($upload, $number);
        $this->disk->writeStream($path, $stream);

        return $this->disk->size($path);
    }

    public function uploadedParts(Upload $upload): array
    {
        $parts = [];

        foreach ($this->disk->files($this->directory($upload)) as $file) {
            if (preg_match('/(\d+)\.part$/', $file, $match)) {
                $parts[(int) $match[1]] = $this->disk->size($file);
            }
        }

        ksort($parts);

        return $parts;
    }

    public function complete(Upload $upload): void
    {
        $this->disk->makeDirectory(dirname($upload->path));
        $target = fopen($this->disk->path($upload->path), 'wb');

        if ($target === false) {
            throw new RuntimeException('No se pudo crear el archivo de destino.');
        }

        for ($number = 1; $number <= $upload->partCount(); $number++) {
            $source = $this->disk->readStream($this->partPath($upload, $number));
            stream_copy_to_stream($source, $target);
            fclose($source);
        }

        fclose($target);
        $this->disk->deleteDirectory($this->directory($upload));
    }

    public function abort(Upload $upload): void
    {
        $this->disk->deleteDirectory($this->directory($upload));
    }

    private function directory(Upload $upload): string
    {
        return 'uploads/'.$upload->uuid;
    }

    private function partPath(Upload $upload, int $number): string
    {
        return $this->directory($upload).'/'.$number.'.part';
    }
}
