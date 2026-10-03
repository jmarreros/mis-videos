<?php

namespace App\Media;

use App\Models\Upload;
use Aws\S3\Exception\S3Exception;
use Aws\S3\S3Client;
use Illuminate\Filesystem\AwsS3V3Adapter;

class S3MultipartUploader implements MultipartUploader
{
    public function __construct(private AwsS3V3Adapter $disk) {}

    public function start(Upload $upload): void
    {
        $result = $this->client()->createMultipartUpload([
            ...$this->target($upload),
            'ContentType' => $upload->mime,
        ]);

        $upload->upload_id = $result['UploadId'];
    }

    public function partTarget(Upload $upload, int $number): array
    {
        $command = $this->client()->getCommand('UploadPart', [
            ...$this->target($upload),
            'UploadId' => $upload->upload_id,
            'PartNumber' => $number,
        ]);

        return [
            'url' => (string) $this->client()->createPresignedRequest($command, '+6 hours')->getUri(),
            'headers' => [],
        ];
    }

    public function uploadedParts(Upload $upload): array
    {
        return array_map(fn (array $part) => (int) $part['Size'], $this->listParts($upload));
    }

    public function complete(Upload $upload): void
    {
        $parts = array_map(
            fn (array $part) => ['PartNumber' => (int) $part['PartNumber'], 'ETag' => $part['ETag']],
            array_values($this->listParts($upload)),
        );

        $this->client()->completeMultipartUpload([
            ...$this->target($upload),
            'UploadId' => $upload->upload_id,
            'MultipartUpload' => ['Parts' => $parts],
        ]);
    }

    public function abort(Upload $upload): void
    {
        if (! $upload->upload_id) {
            return;
        }

        try {
            $this->client()->abortMultipartUpload([...$this->target($upload), 'UploadId' => $upload->upload_id]);
        } catch (S3Exception $e) {
            if ($e->getAwsErrorCode() !== 'NoSuchUpload') {
                throw $e;
            }
        }
    }

    /**
     * @return array<int, array<string, mixed>> keyed by part number
     */
    private function listParts(Upload $upload): array
    {
        $parts = [];
        $pages = $this->client()->getPaginator('ListParts', [...$this->target($upload), 'UploadId' => $upload->upload_id]);

        foreach ($pages as $page) {
            foreach ($page['Parts'] ?? [] as $part) {
                $parts[(int) $part['PartNumber']] = $part;
            }
        }

        ksort($parts);

        return $parts;
    }

    /**
     * @return array{Bucket: string, Key: string}
     */
    private function target(Upload $upload): array
    {
        return [
            'Bucket' => $this->disk->getConfig()['bucket'],
            'Key' => $this->disk->path($upload->path),
        ];
    }

    private function client(): S3Client
    {
        return $this->disk->getClient();
    }
}
