<?php

namespace App\Media;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Minimal read-only client for the Vimeo API (config: services.vimeo.token).
 */
class VimeoClient
{
    private const BASE = 'https://api.vimeo.com';

    /**
     * Folder names from the root down to the given folder, e.g. ['Personales', 'Clases parque'].
     *
     * @return array<int, string>
     */
    public function folderPath(string $folderId): array
    {
        $names = [];
        $uri = "/me/projects/{$folderId}";

        while ($uri) {
            $folder = $this->get($uri, ['fields' => 'name,metadata.connections.parent_folder.uri']);
            array_unshift($names, $folder['name']);
            $uri = $folder['metadata']['connections']['parent_folder']['uri'] ?? null;
        }

        return $names;
    }

    /**
     * Every video directly inside the folder.
     *
     * @return array<int, array{id: int, name: string, created_time: string, duration: int|null, width: int|null, height: int|null, thumbnail: string|null}>
     */
    public function folderVideos(string $folderId): array
    {
        $videos = [];
        $uri = "/me/projects/{$folderId}/videos";
        $query = ['per_page' => 100, 'fields' => 'uri,name,created_time,duration,width,height,pictures.sizes'];
        $visited = [];

        while ($uri) {
            // A page pointing back to one already read would loop until memory runs out
            if (isset($visited[$uri])) {
                throw new RuntimeException("Vimeo repitió la página {$uri} al paginar la carpeta {$folderId}.");
            }
            $visited[$uri] = true;

            $page = $this->get($uri, $query);
            $query = [];

            foreach ($page['data'] as $video) {
                $sizes = $video['pictures']['sizes'] ?? [];

                $videos[] = [
                    'id' => (int) basename($video['uri']),
                    'name' => $video['name'],
                    'created_time' => $video['created_time'],
                    'duration' => $video['duration'] ?? null,
                    'width' => $video['width'] ?? null,
                    'height' => $video['height'] ?? null,
                    'thumbnail' => $sizes ? end($sizes)['link'] : null,
                ];
            }

            $uri = $page['paging']['next'] ?? null;
        }

        return $videos;
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    private function get(string $uri, array $query = []): array
    {
        // An empty query would make Guzzle drop the one already in $uri (paging.next)
        $response = $this->http()->get(self::BASE.$uri, $query ?: null);

        if ($response->failed()) {
            throw new RuntimeException("Vimeo respondió {$response->status()} en {$uri}: ".($response->json('error') ?? $response->body()));
        }

        return $response->json();
    }

    private function http(): PendingRequest
    {
        $token = config('services.vimeo.token');

        if (! $token) {
            throw new RuntimeException('Falta VIMEO_ACCESS_TOKEN en el .env.');
        }

        return Http::withToken($token)
            ->accept('application/vnd.vimeo.*+json;version=3.4')
            ->retry(3, 1000, throw: false);
    }
}
