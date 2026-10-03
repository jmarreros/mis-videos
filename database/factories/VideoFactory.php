<?php

namespace Database\Factories;

use App\Models\Video;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Video>
 */
class VideoFactory extends Factory
{
    public function definition(): array
    {
        return [
            'title' => fake()->sentence(3),
            'folder_id' => null,
            'path' => 'videos/'.Str::ulid().'.mp4',
            'original_name' => 'clip.mp4',
            'mime' => 'video/mp4',
            'size' => 1024,
            'duration' => 12.5,
            'width' => 1920,
            'height' => 1080,
        ];
    }
}
