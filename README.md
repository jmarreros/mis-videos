# Mis Videos

Biblioteca personal de videos: subida por fragmentos, carpetas anidadas, miniaturas generadas en el navegador, búsqueda y reproducción con *streaming* (HTTP Range).

**Stack:** Laravel 12 · Inertia 2 · React 19 · TypeScript · Tailwind 4 · SQLite.

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

| Qué | Dónde |
|---|---|
| Base de datos | `database/database.sqlite` |
| Videos | `storage/app/private/videos/{ulid}.{ext}` |
| Miniaturas | `storage/app/private/thumbnails/` |
| Subidas a medias | `storage/app/private/uploads/*.part` (se borran tras 24 h) |

Nada de esto es público: los archivos se sirven a través de rutas que exigen sesión iniciada.

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
8. **Límites de PHP:** `public/.user.ini` ya sube `upload_max_filesize` a 16 MB y `post_max_size` a 20 MB. Si tu hosting usa otro mecanismo (php.ini o el panel), configura esos valores ahí. Aunque tengas límites más bajos, la app sigue funcionando: ajusta sola el tamaño de cada fragmento.
9. **(Opcional) Cron** para limpiar las subidas abandonadas:
   `* * * * * cd /ruta/al/proyecto && php artisan schedule:run >> /dev/null 2>&1`

Sin acceso SSH puedes ejecutar los comandos `artisan` desde la terminal del panel (cPanel → Terminal) o pedírselo al soporte del hosting.

## Notas

- **Miniaturas:** se generan en el navegador (canvas), así que el servidor no necesita FFmpeg. Al subir un video eliges el fotograma con un deslizador o subes una imagen. Después puedes cambiarla desde el reproductor («Miniatura» → «Fotograma actual»).
- **Formatos:** el navegador reproduce MP4 (H.264/AAC) y WebM. Los MOV de iPhone en H.264 también suelen funcionar. MKV y AVI se pueden guardar y descargar, pero quizá no se reproduzcan en el navegador.
- **Reanudar subidas:** si se interrumpe una subida, vuelve a elegir el mismo archivo y continuará desde donde se quedó.
- **Usuarios:** no hay registro público. Para cambiar la contraseña, entra en *Ajustes* o vuelve a ejecutar `php artisan app:create-user` con el mismo email.
