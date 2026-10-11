# jmarreros.com — servidor (Hostinger, `ssh hostinger`)

Un solo dominio con una **landing en la raíz** y **cada proyecto en una subcarpeta**:

| URL | Carpeta | Qué es |
|---|---|---|
| https://jmarreros.com/ | `/var/www/jmarreros.com/landing/` | Landing (hoy un `index.html` provisional) |
| https://jmarreros.com/mis-videos/ | `/var/www/jmarreros.com/mis-videos/` (Laravel; nginx sirve sólo su `public/`) | Mis Videos — repo `github.com/jmarreros/mis-videos` |

`www.jmarreros.com` redirige a `jmarreros.com` (un solo origen para cookies y CORS).

## nginx

- `/etc/nginx/sites-available/jmarreros.com` — el `server` del dominio: sirve la landing e incluye
  `/etc/nginx/jmarreros.com/apps/*.conf`. HTTPS lo agregó **certbot** (Let's Encrypt, renovación automática).
- `/etc/nginx/jmarreros.com/apps/<app>.conf` — **un archivo por app** con sus `location /<app>/`.

Cómo funciona una app Laravel en subcarpeta (`apps/mis-videos.conf`):
- `alias .../public/` + `try_files $uri @app`: los archivos reales de `public/` se sirven directo; todo
  lo demás (y cualquier `.php`) va a `public/index.php` por php-fpm 8.4.
- `fastcgi_param SCRIPT_NAME /mis-videos/index.php`: con eso Laravel detecta solo que su base es
  `/mis-videos` y genera bien `route()`, `url()`, redirecciones y Ziggy.

## Requisitos de la app para vivir en una subcarpeta

En el `.env` del servidor:

```ini
APP_URL=https://jmarreros.com/mis-videos
ASSET_URL=https://jmarreros.com/mis-videos   # Vite compila con base .../mis-videos/build/ (¡antes de npm run build!)
SESSION_PATH=/mis-videos                     # que las cookies no choquen con otras apps del dominio
SESSION_COOKIE=mis_videos_session            # nombre propio por app
SESSION_SECURE_COOKIE=true
DB_DATABASE=/var/www/jmarreros.com/mis-videos/database/database.sqlite   # ruta absoluta
```

En el código: **nunca rutas fijas tipo `'/settings/profile'`** en el frontend; usar `route('nombre')`
(Ziggy) o `url()`, que ya incluyen `/mis-videos`.

Mis Videos sube los videos directo del navegador a S3: el CORS del bucket `mis-videos-jmarreros`
incluye `https://jmarreros.com` en `AllowedOrigins`.

## Actualizar Mis Videos

```bash
ssh hostinger
bash /var/www/jmarreros.com/actualizar-mis-videos.sh   # git pull, composer, npm build, migrate, caches (sin sudo)
```

Los comandos de consola que usan `ffmpeg` (`videos:import-dir`, `videos:refresh-thumbnails`) no están
pensados para el servidor (ffmpeg no está instalado); se corren desde el Mac.

El scheduler (`uploads:prune` diario) corre por el `crontab` del usuario `jmarreros`.

## Agregar otro proyecto Laravel en jmarreros.com/<app>

1. `git clone <repo> /var/www/jmarreros.com/<app>` y `.env` con las variables de arriba adaptadas a `<app>`.
2. `composer install --no-dev -o`, `npm ci && npm run build` (con `ASSET_URL` ya puesto), `php artisan key:generate`,
   `php artisan migrate --force`, `php artisan config:cache && php artisan view:cache && php artisan event:cache`.
   **No usar `php artisan optimize` ni `route:cache`**: la caché de rutas rompe la raíz de una app en subcarpeta
   (`/mis-videos/` responde 405). Si se corrió por error: `php artisan route:clear`.
3. Permisos (sudo): `chgrp -R www-data storage bootstrap/cache database .env && chmod -R g+rwX storage bootstrap/cache database && chmod 640 .env`
   y `find storage bootstrap/cache database -type d -exec chmod g+s {} +`.
4. `sudo cp /etc/nginx/jmarreros.com/apps/mis-videos.conf /etc/nginx/jmarreros.com/apps/<app>.conf`,
   reemplazar `mis-videos` por `<app>`, y `sudo nginx -t && sudo systemctl reload nginx`. No hace falta tocar el certificado.

Un proyecto **no Laravel** (estático): basta con `location ^~ /<app>/ { alias /var/www/jmarreros.com/<app>/; try_files $uri $uri/ =404; }`.

## Landing

Es lo que haya en `landing/`. Si pasa a ser una app PHP/Laravel, cambiar en el sitio el `root` a su `public/` y
el `location /` por `try_files $uri $uri/ /index.php?$query_string;` + el bloque de php-fpm (como viveroberaca.com).
Ojo: sus rutas no pueden empezar por el nombre de una app (`/mis-videos/...`), porque esas las atiende la app.
