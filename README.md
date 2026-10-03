# Mis Videos

Biblioteca personal de videos: subida directa a Amazon S3 (multiparte y reanudable), carpetas anidadas, miniaturas generadas en el navegador, búsqueda y reproducción con *streaming* (HTTP Range).

**Stack:** Laravel 12 · Inertia 2 · React 19 · TypeScript · Tailwind 4 · SQLite · Amazon S3 (o compatible).

## Desarrollo local

```bash
composer install
npm install
cp .env.example .env && php artisan key:generate   # si aún no existe .env
touch database/database.sqlite
php artisan migrate
php artisan app:create-user        # pide nombre, email y contraseña
composer run dev                   # servidor + Vite en http://127.0.0.1:8000
```

Tests: `php artisan test`

## Dónde se guarda todo

La base de datos está en `database/database.sqlite`. Los videos y las miniaturas van al **disco de medios**, que eliges con `MEDIA_DISK` en `.env`:

| `MEDIA_DISK` | Videos | Miniaturas | Cómo se suben |
|---|---|---|---|
| `s3` (producción) | `videos/{ulid}.{ext}` en el bucket | `thumbnails/` en el bucket | El navegador sube cada parte **directamente al bucket** con URLs firmadas; el video no pasa por tu servidor |
| `local` (desarrollo) | `storage/app/private/videos/` | `storage/app/private/thumbnails/` | Las partes se envían a este servidor (`storage/app/private/uploads/` hasta unirse) |

En ambos casos los archivos son privados. Con S3, la app redirige a URLs firmadas que caducan (6 h para video, 12 h para miniaturas).

## Configurar Amazon S3

1. **Crea un bucket** privado (bloquea todo el acceso público) en la región que prefieras.

2. **Crea un usuario IAM** con una clave de acceso y esta política, cambiando `TU-BUCKET`:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListMultipartUploadParts", "s3:AbortMultipartUpload"],
       "Resource": "arn:aws:s3:::TU-BUCKET/*"
     }, {
       "Effect": "Allow",
       "Action": ["s3:ListBucket", "s3:ListBucketMultipartUploads"],
       "Resource": "arn:aws:s3:::TU-BUCKET"
     }]
   }
   ```

3. **Configura CORS en el bucket** (Permisos → CORS). Sin esto el navegador no puede subir ni capturar fotogramas:
   ```json
   [{
     "AllowedOrigins": ["https://tu-dominio"],
     "AllowedMethods": ["GET", "PUT", "HEAD"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["ETag"],
     "MaxAgeSeconds": 3600
   }]
   ```
   Si también vas a probar en local contra el bucket, añade `"http://127.0.0.1:8000"` a `AllowedOrigins`.

4. **(Recomendado) Regla de ciclo de vida** (Administración → Reglas de ciclo de vida): «Eliminar cargas multiparte incompletas» tras 1 día. Así S3 libera el espacio de subidas abandonadas aunque no tengas cron.

5. **Rellena el `.env`:**
   ```
   MEDIA_DISK=s3
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_DEFAULT_REGION=eu-west-1
   AWS_BUCKET=tu-bucket
   ```
   Después ejecuta `php artisan config:clear` (o `php artisan optimize` en producción).

**Proveedores compatibles con S3** (Cloudflare R2, Backblaze B2, Wasabi): funcionan igual. Añade `AWS_ENDPOINT` con la URL del proveedor y, si este lo pide, `AWS_USE_PATH_STYLE_ENDPOINT=true`. Por ejemplo, en R2: `AWS_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com` y `AWS_DEFAULT_REGION=auto`. Revisa en cada proveedor cómo se configura CORS.

**Pasar a S3 videos que ya tienes en local:**
```bash
php artisan media:push              # copia videos y miniaturas de storage/app/private al bucket
php artisan media:push --delete     # igual, pero borra la copia local al terminar
```

## Despliegue en hosting compartido

1. **Compila en local:** `npm run build` (genera `public/build`). En el servidor no hace falta Node.
2. **Instala las dependencias de PHP sin las de desarrollo:** `composer install --no-dev --optimize-autoloader` (en local o en el servidor si tiene Composer).
3. **Sube el proyecto** sin `node_modules/` ni `tests/`.
4. **Document root:** apunta el dominio o subdominio a la carpeta `public/`. Si el panel no lo permite, renombra `.htaccess.root-example` a `.htaccess` en la raíz del proyecto.
5. **Crea el `.env`** del servidor a partir de `.env.example`:
   ```
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://tu-dominio
   DB_CONNECTION=sqlite
   SESSION_SECURE_COOKIE=true
   ```
   Después ejecuta `php artisan key:generate`.
6. **Permisos de escritura** para `storage/`, `bootstrap/cache/` y `database/`. SQLite necesita poder escribir en el fichero y en su carpeta.
7. **Inicializa la aplicación:**
   ```bash
   php artisan migrate --force
   php artisan app:create-user
   php artisan optimize
   ```
8. **Límites de PHP:** con S3 no afectan a los videos, porque estos van directos al bucket. `public/.user.ini` sube los límites para las miniaturas y para el modo `local`.
9. **(Opcional) Cron** para cancelar las subidas abandonadas (con S3, la regla de ciclo de vida ya lo cubre):
   `* * * * * cd /ruta/al/proyecto && php artisan schedule:run >> /dev/null 2>&1`

Sin acceso SSH puedes ejecutar los comandos `artisan` desde la terminal del panel (cPanel → Terminal) o pedírselo al soporte del hosting.

## Notas

- **Miniaturas:** se generan en el navegador (canvas), así que el servidor no necesita FFmpeg. Al subir un video eliges el fotograma con un deslizador o subes una imagen. Después puedes cambiarla desde el reproductor («Miniatura» → «Fotograma actual»).
- **Formatos:** el navegador reproduce MP4 (H.264/AAC) y WebM. Los MOV de iPhone en H.264 también suelen funcionar. MKV y AVI se pueden guardar y descargar, pero quizá no se reproduzcan en el navegador.
- **Reanudar subidas:** si se interrumpe una subida, vuelve a elegir el mismo archivo y continuará desde donde se quedó.
- **Usuarios:** no hay registro público. Para cambiar la contraseña, entra en *Ajustes* o vuelve a ejecutar `php artisan app:create-user` con el mismo email.
