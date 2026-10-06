<?php

namespace App\Console\Commands;

use App\Media\MediaStorage;
use App\Models\Folder;
use App\Models\Video;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * Imports every video of a local folder into an app folder (e.g. "VDance/curso-54"),
 * reading duration and size with ffprobe and grabbing the thumbnail with ffmpeg.
 * Files keep their alphabetical order in the library, which lists newest first,
 * so the first file gets the most recent date. Files already imported into that
 * folder (by original name) are skipped, so the command can be re-run safely.
 */
class ImportVideoDir extends Command
{
    protected $signature = 'videos:import-dir
        {dir : Carpeta local con los videos}
        {folder : Carpeta de destino en la app, con / para subcarpetas (p. ej. "VDance/curso-54")}
        {--titles= : JSON {"archivo.mp4": "Título"} con los títulos; si falta, se sacan del nombre del archivo}
        {--dry-run : Solo muestra qué se importaría, sin subir nada}';

    protected $description = 'Sube a la app los videos de una carpeta local, con miniatura y metadatos sacados con ffmpeg';

    private const EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];

    public function handle(): int
    {
        $dir = rtrim($this->argument('dir'), '/');
        $path = array_values(array_filter(array_map('trim', explode('/', $this->argument('folder')))));

        if (! is_dir($dir)) {
            $this->error("No existe la carpeta {$dir}.");

            return self::FAILURE;
        }

        if (! $path) {
            $this->error('Indica la carpeta de destino.');

            return self::FAILURE;
        }

        $titles = [];

        if ($this->option('titles')) {
            $titles = json_decode((string) @file_get_contents($this->option('titles')), true);

            if (! is_array($titles)) {
                $this->error('El archivo de títulos no es un JSON válido.');

                return self::FAILURE;
            }
        }

        $files = array_values(array_filter(scandir($dir), fn (string $file) => is_file("{$dir}/{$file}")
            && ! str_starts_with($file, '.')
            && ! str_contains($file, '.part.')
            && in_array(strtolower(pathinfo($file, PATHINFO_EXTENSION)), self::EXTENSIONS, true)));
        sort($files, SORT_NATURAL);

        $existing = $this->findFolder($path);
        $imported = $existing ? Video::where('folder_id', $existing->id)->pluck('original_name')->all() : [];
        $pending = array_values(array_diff($files, $imported));

        $this->info(implode(' / ', $path).': '.count($files).' archivos, '.count($pending).' por subir.');

        if ($this->option('dry-run')) {
            $this->table(['Archivo', 'Título', 'Estado'], array_map(fn (string $file) => [
                $file,
                $titles[$file] ?? self::titleFromName($file),
                in_array($file, $pending, true) ? 'por subir' : 'ya importado',
            ], $files));

            return self::SUCCESS;
        }

        $folder = $existing ?? $this->ensureFolders($path);
        $now = CarbonImmutable::now();
        $done = 0;
        $failed = 0;

        $bar = $this->output->createProgressBar(count($pending));

        foreach ($pending as $file) {
            try {
                $position = array_search($file, $files, true);
                $this->import("{$dir}/{$file}", $titles[$file] ?? self::titleFromName($file), $folder, $now->subSeconds($position));
                $done++;
            } catch (Throwable $e) {
                $failed++;
                $this->newLine();
                $this->error("Error con {$file}: {$e->getMessage()}");
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info("{$done} importados, ".(count($files) - count($pending))." ya estaban, {$failed} con error.");

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /**
     * "clase_01_turn_front_turn_back [627] (720p).mp4" → "Clase 01 turn front turn back".
     */
    public static function titleFromName(string $file): string
    {
        $name = pathinfo($file, PATHINFO_FILENAME);
        $name = preg_replace('/ \(\d+p\)$/', '', $name);
        $name = preg_replace('/ \[[^\]]+\]$/', '', $name);

        return Str::ucfirst(trim(preg_replace('/[_\s]+/', ' ', $name)));
    }

    /**
     * @param  array<int, string>  $names
     */
    private function findFolder(array $names): ?Folder
    {
        $folder = null;

        foreach ($names as $name) {
            $folder = Folder::where('parent_id', $folder?->id)->where('name', $name)->first();

            if (! $folder) {
                return null;
            }
        }

        return $folder;
    }

    /**
     * @param  array<int, string>  $names
     */
    private function ensureFolders(array $names): Folder
    {
        $parent = null;

        foreach ($names as $name) {
            $parent = Folder::firstOrCreate(['parent_id' => $parent?->id, 'name' => $name]);
        }

        return $parent;
    }

    private function import(string $file, string $title, Folder $folder, CarbonImmutable $createdAt): void
    {
        $meta = $this->probe($file);
        $disk = MediaStorage::disk();
        $ulid = (string) Str::ulid();
        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $mime = $extension === 'mov' ? 'video/quicktime' : "video/{$extension}";
        $videoPath = "videos/{$ulid}.{$extension}";
        $thumbnailPath = null;

        try {
            $stream = fopen($file, 'r');
            $disk->writeStream($videoPath, $stream, ['mimetype' => $mime]);
            if (is_resource($stream)) {
                fclose($stream);
            }

            $thumbnail = $this->thumbnail($file, $meta['duration']);

            if ($thumbnail !== null) {
                $thumbnailPath = "thumbnails/{$ulid}.jpg";
                $disk->put($thumbnailPath, $thumbnail, ['mimetype' => 'image/jpeg']);
            }

            DB::transaction(function () use ($title, $folder, $file, $mime, $videoPath, $thumbnailPath, $ulid, $meta, $createdAt) {
                $video = new Video([
                    'title' => $title,
                    'folder_id' => $folder->id,
                    'path' => $videoPath,
                    'original_name' => basename($file),
                    'mime' => $mime,
                    'size' => filesize($file),
                    'duration' => $meta['duration'],
                    'width' => $meta['width'],
                    'height' => $meta['height'],
                    'thumbnail_path' => $thumbnailPath,
                ]);
                $video->ulid = $ulid;
                $video->created_at = $createdAt;
                $video->save();
            });
        } catch (Throwable $e) {
            $disk->delete(array_filter([$videoPath, $thumbnailPath]));

            throw $e;
        }
    }

    /**
     * @return array{duration: float|null, width: int|null, height: int|null}
     */
    private function probe(string $file): array
    {
        $result = Process::run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height:format=duration', '-of', 'json', $file]);

        if ($result->failed()) {
            throw new RuntimeException('ffprobe no pudo leer el video: '.trim($result->errorOutput()));
        }

        $data = json_decode($result->output(), true);
        $stream = $data['streams'][0] ?? [];

        return [
            'duration' => isset($data['format']['duration']) ? (float) $data['format']['duration'] : null,
            'width' => $stream['width'] ?? null,
            'height' => $stream['height'] ?? null,
        ];
    }

    /**
     * JPEG frame at the same point the upload page picks by default: 10% in, between 1 s and 30 s.
     */
    private function thumbnail(string $file, ?float $duration): ?string
    {
        $at = $duration ? min(max($duration * 0.1, min(1, $duration / 2)), 30) : 0;
        $base = tempnam(sys_get_temp_dir(), 'thumb');
        $target = "{$base}.jpg";

        $result = Process::run(['ffmpeg', '-v', 'error', '-y', '-ss', (string) $at, '-i', $file,
            '-frames:v', '1', '-vf', 'scale=min(1280\,iw):-2', '-q:v', '3', $target]);

        $jpeg = $result->successful() && is_file($target) ? file_get_contents($target) : null;
        @unlink($target);
        @unlink($base);

        return $jpeg ?: null;
    }
}
