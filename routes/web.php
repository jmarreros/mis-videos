<?php

use App\Http\Controllers\FolderController;
use App\Http\Controllers\LibraryController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\VideoController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth'])->group(function () {
    Route::get('/', [LibraryController::class, 'index'])->name('library');
    Route::get('folders/{folder}', [LibraryController::class, 'index'])->name('folders.show');
    Route::get('search', [LibraryController::class, 'search'])->name('search');

    Route::post('folders', [FolderController::class, 'store'])->name('folders.store');
    Route::patch('folders/{folder}', [FolderController::class, 'update'])->name('folders.update');
    Route::delete('folders/{folder}', [FolderController::class, 'destroy'])->name('folders.destroy');

    Route::get('upload', fn (Request $request) => Inertia::render('upload', ['folderId' => $request->integer('folder') ?: null]))->name('upload');
    Route::post('uploads', [UploadController::class, 'init'])->name('uploads.init');
    Route::get('uploads/{upload}', [UploadController::class, 'show'])->name('uploads.show');
    Route::post('uploads/{upload}/parts/{number}/sign', [UploadController::class, 'sign'])->whereNumber('number')->name('uploads.parts.sign');
    Route::put('uploads/{upload}/parts/{number}', [UploadController::class, 'storePart'])->whereNumber('number')->name('uploads.parts.store');
    Route::post('uploads/{upload}/complete', [UploadController::class, 'complete'])->name('uploads.complete');
    Route::delete('uploads/{upload}', [UploadController::class, 'destroy'])->name('uploads.destroy');

    Route::post('videos/move', [VideoController::class, 'move'])->name('videos.move');
    Route::get('videos/{video}', [VideoController::class, 'show'])->name('videos.show');
    Route::patch('videos/{video}', [VideoController::class, 'update'])->name('videos.update');
    Route::post('videos/{video}/thumbnail', [VideoController::class, 'thumbnail'])->name('videos.thumbnail');
    Route::delete('videos/{video}', [VideoController::class, 'destroy'])->name('videos.destroy');

    Route::get('media/{video}/stream', [MediaController::class, 'stream'])->name('media.stream');
    Route::get('media/{video}/thumbnail', [MediaController::class, 'thumbnail'])->name('media.thumbnail');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
