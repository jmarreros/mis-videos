<?php

namespace App\Providers;

use App\Media\LocalMultipartUploader;
use App\Media\MediaStorage;
use App\Media\MultipartUploader;
use App\Media\S3MultipartUploader;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(MultipartUploader::class, fn () => MediaStorage::isS3()
            ? new S3MultipartUploader(MediaStorage::disk())
            : new LocalMultipartUploader(MediaStorage::disk()));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
