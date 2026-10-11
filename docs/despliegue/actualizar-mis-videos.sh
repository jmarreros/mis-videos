#!/usr/bin/env bash
# Actualiza jmarreros.com/mis-videos con lo ultimo de GitHub (main). No necesita sudo.
# Uso: bash /var/www/jmarreros.com/actualizar-mis-videos.sh
set -euo pipefail
umask 002   # que www-data (grupo) pueda escribir lo que se cree en storage/ y database/
cd /var/www/jmarreros.com/mis-videos
source ~/.nvm/nvm.sh

php artisan down --retry=15 || true
trap 'php artisan up' EXIT

git pull --ff-only
composer install --no-dev --optimize-autoloader --no-interaction
npm ci --no-audit --no-fund
npm run build
php artisan migrate --force
php artisan route:clear
# Sin route:cache: con la app en subcarpeta hace que /mis-videos/ responda 405 (bug de Laravel)
php artisan config:cache && php artisan view:cache && php artisan event:cache

echo "Actualizado: $(git log -1 --oneline)"
