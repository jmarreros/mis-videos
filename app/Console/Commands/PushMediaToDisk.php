<?php

namespace App\Console\Commands;

use App\Media\MediaStorage;
use App\Models\Video;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class PushMediaToDisk extends Command
{
    protected $signature = 'media:push {--from=local : Disco donde están ahora los archivos} {--delete : Borra el original tras copiarlo}';

    protected $description = 'Copia los videos y miniaturas existentes al disco de medios configurado (p. ej. S3)';

    public function handle(): int
    {
        $from = Storage::disk($this->option('from'));
        $to = MediaStorage::disk();

        if ($this->option('from') === MediaStorage::name()) {
            $this->error('El origen y el destino son el mismo disco. Revisa MEDIA_DISK.');

            return self::FAILURE;
        }

        $videos = Video::all();
        $bar = $this->output->createProgressBar($videos->count());
        $copied = 0;

        foreach ($videos as $video) {
            foreach (array_filter([$video->path, $video->thumbnail_path]) as $path) {
                if (! $from->exists($path) || $to->exists($path)) {
                    continue;
                }

                $stream = $from->readStream($path);
                $to->writeStream($path, $stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }

                if ($this->option('delete')) {
                    $from->delete($path);
                }

                $copied++;
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info("{$copied} archivos copiados a «".MediaStorage::name().'».');

        return self::SUCCESS;
    }
}
