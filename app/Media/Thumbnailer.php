<?php

namespace App\Media;

use Illuminate\Support\Facades\Process;

/**
 * Grabs a JPEG thumbnail from a video with ffmpeg. Frames are taken from the
 * middle of the video rather than the start, where courses usually show an
 * intro or a logo on a plain background; a near-blank frame is skipped in
 * favour of the next candidate. The source can be a local path or a URL
 * (e.g. a signed S3 URL: ffmpeg seeks with Range requests).
 */
class Thumbnailer
{
    /** Positions tried in order, as a fraction of the duration. */
    private const POSITIONS = [0.5, 0.4, 0.6, 0.3, 0.7];

    /**
     * Share of the frame that may sit within ±10 luma levels of its most common tone.
     * Intro and logo cards (white or dark) reach 85-100%; a studio shot with the
     * teachers stays below 50%.
     */
    private const MAX_DOMINANT_SHARE = 0.7;

    public function grab(string $source, ?float $duration): ?string
    {
        $fallback = null;

        foreach ($duration ? self::POSITIONS : [0] as $position) {
            $jpeg = $this->frame($source, $duration ? $duration * $position : 0);

            if ($jpeg === null) {
                continue;
            }

            if (! self::isBlank($jpeg)) {
                return $jpeg;
            }

            $fallback ??= $jpeg;
        }

        return $fallback;
    }

    /**
     * True for frames that are mostly one flat colour, such as an intro card with a logo.
     */
    public static function isBlank(string $jpeg): bool
    {
        $image = @imagecreatefromstring($jpeg);

        if (! $image) {
            return false;
        }

        $sample = imagescale($image, 64, 36);
        $histogram = array_fill(0, 256, 0);

        for ($y = 0; $y < 36; $y++) {
            for ($x = 0; $x < 64; $x++) {
                $rgb = imagecolorat($sample, $x, $y);
                $histogram[(int) (0.299 * (($rgb >> 16) & 0xFF) + 0.587 * (($rgb >> 8) & 0xFF) + 0.114 * ($rgb & 0xFF))]++;
            }
        }

        $dominant = 0;

        for ($level = 0; $level < 256; $level++) {
            $dominant = max($dominant, array_sum(array_slice($histogram, max(0, $level - 10), 21)));
        }

        return $dominant / (64 * 36) > self::MAX_DOMINANT_SHARE;
    }

    private function frame(string $source, float $at): ?string
    {
        $base = tempnam(sys_get_temp_dir(), 'thumb');
        $target = "{$base}.jpg";

        $result = Process::timeout(120)->run(['ffmpeg', '-v', 'error', '-y', '-ss', (string) $at, '-i', $source,
            '-frames:v', '1', '-vf', 'scale=min(1280\,iw):-2', '-q:v', '3', $target]);

        $jpeg = $result->successful() && is_file($target) ? file_get_contents($target) : null;
        @unlink($target);
        @unlink($base);

        return $jpeg ?: null;
    }
}
