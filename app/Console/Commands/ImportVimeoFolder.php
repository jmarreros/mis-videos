<?php

namespace App\Console\Commands;

use App\Media\MediaStorage;
use App\Media\VimeoClient;
use App\Models\Folder;
use App\Models\Video;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

/**
 * Imports videos downloaded from a Vimeo folder: each local file is matched to
 * its Vimeo video by name, uploaded to the media disk and registered with the
 * original title, thumbnail, date and folder path. Already imported videos
 * (by vimeo_id) are skipped, so the command can be re-run safely.
 */
class ImportVimeoFolder extends Command
{
    protected $signature = 'vimeo:import
        {folder : ID de la carpeta en Vimeo (el número de vimeo.com/.../folder/ID)}
        {dir : Carpeta local con los archivos descargados de Vimeo}
        {--dry-run : Solo muestra qué se importaría, sin subir nada}';

    protected $description = 'Sube a la app los videos descargados de una carpeta de Vimeo, con sus títulos y carpetas originales';

    public function handle(VimeoClient $vimeo): int
    {
        $dir = rtrim($this->argument('dir'), '/');

        if (! is_dir($dir)) {
            $this->error("No existe la carpeta {$dir}.");

            return self::FAILURE;
        }

        $path = $vimeo->folderPath($this->argument('folder'));
        $remote = $vimeo->folderVideos($this->argument('folder'));
        [$matched, $unmatched, $missing] = $this->match($dir, $remote);

        $this->info('Carpeta: '.implode(' / ', $path).' — '.count($remote).' videos en Vimeo, '.count($matched).' archivos emparejados.');

        foreach ($unmatched as $file => $reason) {
            $this->warn("Sin emparejar: {$file} ({$reason})");
        }

        foreach ($missing as $video) {
            $this->warn("Falta el archivo de: {$video['name']} (vimeo {$video['id']})");
        }

        $pending = array_filter($matched, fn (array $item) => ! Video::where('vimeo_id', $item['video']['id'])->exists());
        $skipped = count($matched) - count($pending);

        if ($this->option('dry-run')) {
            $this->table(['Archivo', 'Título', 'Estado'], array_map(fn (array $item) => [
                $item['file'],
                $item['video']['name'],
                isset($pending[$item['file']]) ? 'por subir' : 'ya importado',
            ], $matched));

            return self::SUCCESS;
        }

        $folder = $this->ensureFolders($path);
        $imported = 0;
        $failed = 0;

        $bar = $this->output->createProgressBar(count($pending));

        foreach ($pending as $item) {
            try {
                $this->import("{$dir}/{$item['file']}", $item['video'], $folder);
                $imported++;
            } catch (Throwable $e) {
                $failed++;
                $this->newLine();
                $this->error("Error con {$item['file']}: {$e->getMessage()}");
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info("{$imported} importados, {$skipped} ya estaban, {$failed} con error, ".(count($unmatched) + count($missing)).' sin emparejar.');

        return $failed || $unmatched || $missing ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Vimeo names its downloads "<name in lowercase, spaces as _>[_v1] (1080p).mp4".
     *
     * @param  array<int, array<string, mixed>>  $remote
     * @return array{0: array<string, array{file: string, video: array<string, mixed>}>, 1: array<string, string>, 2: array<int, array<string, mixed>>}
     */
    private function match(string $dir, array $remote): array
    {
        $bySlug = collect($remote)->groupBy(fn (array $video) => self::slug($video['name']));
        $matched = [];
        $unmatched = [];
        $used = [];

        $files = array_filter(scandir($dir), fn (string $file) => is_file("{$dir}/{$file}") && ! str_starts_with($file, '.'));

        foreach ($files as $file) {
            $base = preg_replace('/ \(\d+p\)$/', '', pathinfo($file, PATHINFO_FILENAME));
            $candidates = array_unique([$base, preg_replace('/_v\d+$/', '', $base)]);
            $found = collect($candidates)->map(fn (string $slug) => $bySlug->get($slug))->filter()->first();

            if (! $found) {
                $unmatched[$file] = 'ningún video de Vimeo tiene ese nombre';
            } elseif ($found->count() > 1) {
                $unmatched[$file] = 'varios videos de Vimeo tienen ese nombre';
            } elseif (isset($used[$found->first()['id']])) {
                $unmatched[$file] = 'ese video ya está emparejado con '.$used[$found->first()['id']];
            } else {
                $used[$found->first()['id']] = $file;
                $matched[$file] = ['file' => $file, 'video' => $found->first()];
            }
        }

        $missing = array_values(array_filter($remote, fn (array $video) => ! isset($used[$video['id']])));

        return [$matched, $unmatched, $missing];
    }

    private static function slug(string $name): string
    {
        return mb_strtolower(str_replace(' ', '_', trim($name)));
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

    /**
     * @param  array<string, mixed>  $remote
     */
    private function import(string $file, array $remote, Folder $folder): void
    {
        $disk = MediaStorage::disk();
        $ulid = (string) Str::ulid();
        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION)) ?: 'mp4';
        $mime = $extension === 'mov' ? 'video/quicktime' : "video/{$extension}";
        $videoPath = "videos/{$ulid}.{$extension}";
        $thumbnailPath = null;

        try {
            $stream = fopen($file, 'r');
            $disk->writeStream($videoPath, $stream, ['mimetype' => $mime]);
            if (is_resource($stream)) {
                fclose($stream);
            }

            if ($remote['thumbnail']) {
                $response = Http::retry(2, 500, throw: false)->get($remote['thumbnail']);

                if ($response->successful()) {
                    $thumbnailPath = "thumbnails/{$ulid}.jpg";
                    $disk->put($thumbnailPath, $response->body(), ['mimetype' => 'image/jpeg']);
                }
            }

            DB::transaction(function () use ($remote, $folder, $file, $mime, $videoPath, $thumbnailPath, $ulid) {
                $video = new Video([
                    'title' => $remote['name'],
                    'folder_id' => $folder->id,
                    'vimeo_id' => $remote['id'],
                    'path' => $videoPath,
                    'original_name' => basename($file),
                    'mime' => $mime,
                    'size' => filesize($file),
                    'duration' => $remote['duration'],
                    'width' => $remote['width'],
                    'height' => $remote['height'],
                    'thumbnail_path' => $thumbnailPath,
                ]);
                $video->ulid = $ulid;
                $video->created_at = CarbonImmutable::parse($remote['created_time']);
                $video->save();
            });
        } catch (Throwable $e) {
            $disk->delete(array_filter([$videoPath, $thumbnailPath]));

            throw $e;
        }
    }
}
