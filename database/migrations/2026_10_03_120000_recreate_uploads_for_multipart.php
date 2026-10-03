<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Uploads are now multipart (browser → storage, part by part) instead of an
 * offset-appended file, so the in-progress table gets a new shape. Rows are
 * transient, so it is simply rebuilt.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('uploads');

        Schema::create('uploads', function (Blueprint $table) {
            $table->uuid('uuid')->primary();
            $table->ulid('ulid');
            $table->string('original_name');
            $table->unsignedBigInteger('size');
            $table->string('mime');
            $table->string('path');
            $table->unsignedBigInteger('part_size');
            $table->string('upload_id')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('uploads');

        Schema::create('uploads', function (Blueprint $table) {
            $table->uuid('uuid')->primary();
            $table->string('original_name');
            $table->unsignedBigInteger('size');
            $table->string('mime');
            $table->unsignedBigInteger('received_bytes')->default(0);
            $table->timestamps();
        });
    }
};
