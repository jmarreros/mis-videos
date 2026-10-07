<?php

namespace App\Console\Commands;

use App\Media\MediaStorage;
use App\Media\Thumbnailer;
use App\Models\Folder;
use App\Models\Video;
use Illuminate\Console\Command;
use Throwable;

/**
 * Regenerates the thumbnails of every video in a folder (and its subfolders)
 * from a frame in the middle of the video, where the teachers are on screen
 * instead of an intro or logo card. Videos are read in place: on S3 ffmpeg
 * seeks into a signed URL, so only the bytes around each frame are fetched.
 */
class RefreshThumbnails extends Command
{
    protected $signature = 'videos:refresh-thumbnails
        {folder : Carpeta de la app, con / para subcarpetas (p. ej. "VDance" o "VDance/curso-130")}
        {--only-blank : Solo cambia las miniaturas que son casi un color plano (intro, logo)}
        {--dry-run : Solo muestra qué miniaturas cambiaría}';

    protected $description = 'Regenera las miniaturas de una carpeta con un fotograma de la mitad del video';

    public function handle(Thumbnailer $thumbnailer): int
    {
        $folder = $this->findFolder($this->argument('folder'));

        if (! $folder) {
            $this->error('No existe la carpeta '.$this->argument('folder').'.');

            return self::FAILURE;
        }

        $disk = MediaStorage::disk();
        $videos = Video::whereIn('folder_id', $folder->descendantAndSelfIds())->orderBy('folder_id')->get();

        if ($this->option('only-blank')) {
            $videos = $videos->filter(fn (Video $video) => ! $video->thumbnail_path
                || ! $disk->exists($video->thumbnail_path)
                || Thumbnailer::isBlank($disk->get($video->thumbnail_path)));
        }

        $this->info("{$videos->count()} miniaturas por regenerar.");

        if ($this->option('dry-run')) {
            $this->table(['Carpeta', 'Título'], $videos->map(fn (Video $video) => [$video->folder?->name, $video->title])->all());

            return self::SUCCESS;
        }

        $done = 0;
        $failed = 0;
        $bar = $this->output->createProgressBar($videos->count());

        foreach ($videos as $video) {
            try {
                $source = MediaStorage::isS3() ? $disk->temporaryUrl($video->path, now()->addHour()) : $disk->path($video->path);
                $jpeg = $thumbnailer->grab($source, $video->duration);

                if ($jpeg === null) {
                    throw new \RuntimeException('ffmpeg no pudo extraer ningún fotograma');
                }

                // A new file name changes thumbnail_url, so browsers drop the cached image.
                $path = "thumbnails/{$video->ulid}-".now()->timestamp.'.jpg';
                $disk->put($path, $jpeg, ['mimetype' => 'image/jpeg']);

                $old = $video->thumbnail_path;
                $video->update(['thumbnail_path' => $path]);

                if ($old && $old !== $path) {
                    $disk->delete($old);
                }

                $done++;
            } catch (Throwable $e) {
                $failed++;
                $this->newLine();
                $this->error("Error con {$video->title}: {$e->getMessage()}");
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info("{$done} miniaturas regeneradas, {$failed} con error.");

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function findFolder(string $path): ?Folder
    {
        $folder = null;

        foreach (array_filter(array_map('trim', explode('/', $path))) as $name) {
            $folder = Folder::where('parent_id', $folder?->id)->where('name', $name)->first();

            if (! $folder) {
                return null;
            }
        }

        return $folder;
    }
}
