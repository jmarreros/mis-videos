<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class CreateUser extends Command
{
    protected $signature = 'app:create-user {--name=} {--email=} {--password=}';

    protected $description = 'Crea (o actualiza) el usuario que puede acceder a la aplicación';

    public function handle(): int
    {
        $name = $this->option('name') ?? $this->ask('Nombre');
        $email = $this->option('email') ?? $this->ask('Email');
        $password = $this->option('password') ?? $this->secret('Contraseña (mínimo 8 caracteres)');

        $validator = Validator::make(compact('name', 'email', 'password'), [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::updateOrCreate(
            ['email' => $email],
            ['name' => $name, 'password' => Hash::make($password), 'email_verified_at' => now()],
        );

        $this->info($user->wasRecentlyCreated ? "Usuario {$email} creado." : "Usuario {$email} actualizado.");

        return self::SUCCESS;
    }
}
