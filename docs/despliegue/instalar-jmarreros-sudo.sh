#!/usr/bin/env bash
# Pasos de la instalacion de jmarreros.com (landing + /mis-videos) que necesitan sudo.
# Correr con: sudo bash ~/instalar-jmarreros-sudo.sh
# Antes, sin sudo, se dejo todo listo en ~/despliegue/jmarreros.com/{landing,mis-videos}
# (clonado, composer install, npm run build, .env y la base sqlite).
set -euo pipefail
U=jmarreros
SRC=/home/$U/despliegue/jmarreros.com
W=/var/www/jmarreros.com
P=$W/mis-videos

echo "== 1. Carpetas en /var/www/jmarreros.com (del usuario $U) =="
mkdir -p $W
for d in landing mis-videos; do
  if [ -d "$SRC/$d" ]; then
    [ -e "$W/$d" ] && { echo "Ya existe $W/$d: no se pisa"; exit 1; }
    mv "$SRC/$d" "$W/$d"
  fi
done
[ -f "$SRC/LEEME.md" ] && mv "$SRC/LEEME.md" $W/
[ -f "$SRC/actualizar-mis-videos.sh" ] && mv "$SRC/actualizar-mis-videos.sh" $W/
chown -R $U:$U $W
chmod 755 $W

echo "== 2. Permisos: php-fpm (www-data) escribe en storage, cache y la base =="
chgrp -R www-data $P/storage $P/bootstrap/cache $P/database
chmod -R g+rwX $P/storage $P/bootstrap/cache $P/database
find $P/storage $P/bootstrap/cache $P/database -type d -exec chmod g+s {} +
chgrp www-data $P/.env && chmod 640 $P/.env
usermod -aG www-data $U

echo "== 3. Laravel: migraciones y caches (como $U) =="
sudo -u $U bash -c "umask 002; cd $P && php artisan migrate --force && php artisan config:cache && php artisan view:cache && php artisan event:cache"

echo "== 4. nginx: sitio jmarreros.com + bloques de apps en /etc/nginx/jmarreros.com/apps/ =="
mkdir -p /etc/nginx/jmarreros.com/apps
cp $SRC/nginx/apps/*.conf /etc/nginx/jmarreros.com/apps/
cp $SRC/nginx/jmarreros.com.conf /etc/nginx/sites-available/jmarreros.com
ln -sf /etc/nginx/sites-available/jmarreros.com /etc/nginx/sites-enabled/jmarreros.com
if nginx -t; then systemctl reload nginx; else
  rm -f /etc/nginx/sites-enabled/jmarreros.com; echo "nginx -t fallo: sitio deshabilitado"; exit 1; fi

echo "== 5. HTTPS con Let's Encrypt (certbot agrega el 443 y la redireccion desde http) =="
certbot --nginx -d jmarreros.com -d www.jmarreros.com --redirect --non-interactive --agree-tos
# www.jmarreros.com -> jmarreros.com (un solo origen: cookies y CORS del bucket S3)
grep -q 'return 301 https://jmarreros.com' /etc/nginx/sites-available/jmarreros.com || \
  sed -i '0,/server_name jmarreros.com www.jmarreros.com;/s//&\n    if ($host = www.jmarreros.com) { return 301 https:\/\/jmarreros.com$request_uri; }/' \
  /etc/nginx/sites-available/jmarreros.com
nginx -t && systemctl reload nginx

echo "== 6. Limpieza =="
rm -rf $SRC

echo "== Listo: https://jmarreros.com y https://jmarreros.com/mis-videos/ =="
