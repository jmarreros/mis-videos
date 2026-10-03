<?php

namespace App\Console\Commands;

use App\Media\MultipartUploader;
use App\Models\Upload;
use Illuminate\Console\Command;

class PruneUploads extends Command
{
    protected $signature = 'uploads:prune {--hours=24}';

    protected $description = 'Cancela las subidas incompletas abandonadas y libera su espacio';

    public function handle(MultipartUploader $uploader): int
    {
        $uploads = Upload::where('updated_at', '<', now()->subHours((int) $this->option('hours')))->get();

        foreach ($uploads as $upload) {
            $uploader->abort($upload);
            $upload->delete();
        }

        $this->info("{$uploads->count()} subidas eliminadas.");

        return self::SUCCESS;
    }
}
