<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Upload extends Model
{
    use HasUuids;

    protected $primaryKey = 'uuid';

    protected $fillable = ['original_name', 'size', 'mime', 'received_bytes'];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'received_bytes' => 'integer',
        ];
    }

    public function partPath(): string
    {
        return 'uploads/'.$this->uuid.'.part';
    }
}
