<?php

namespace App\Console\Commands;

use App\Models\Upload;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class PruneUploads extends Command
{
    protected $signature = 'uploads:prune {--hours=24}';

    protected $description = 'Elimina las subidas incompletas abandonadas';

    public function handle(): int
    {
        $uploads = Upload::where('updated_at', '<', now()->subHours((int) $this->option('hours')))->get();

        foreach ($uploads as $upload) {
            Storage::delete($upload->partPath());
            $upload->delete();
        }

        $this->info("{$uploads->count()} subidas eliminadas.");

        return self::SUCCESS;
    }
}
