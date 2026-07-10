# Publicacion en VPS sin Docker

SGIMR se publica como una aplicacion Node.js normal, administrada por PM2 y
escuchando solo en `127.0.0.1:3100`. El proxy web existente del VPS debe enrutar
`sgimr.cloud` hacia ese puerto interno.

## Preparacion unica del VPS

1. Confirmar que el VPS acepta SSH con una llave autorizada.
2. Revisar que servicio usa los puertos 80 y 443:

```bash
sudo ss -tulpn | grep -E ':80|:443'
systemctl status nginx --no-pager
systemctl status apache2 --no-pager
systemctl status caddy --no-pager
```

3. Instalar Node.js 24, PostgreSQL, Git y PM2 si faltan.
4. Crear la base de datos `sgimr` y un usuario PostgreSQL propio.
5. Crear `/opt/sgimr/shared/.env` con permisos restringidos.

## Variables de produccion

El archivo `/opt/sgimr/shared/.env` debe contener como minimo:

```env
NODE_ENV=production
PORT=3100
PUBLIC_ORIGIN=https://sgimr.cloud
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=sgimr
PGUSER=sgimr
PGPASSWORD=una-clave-larga-y-unica
SESSION_DAYS=7
BOOTSTRAP_ORG_NAME=SGIMR
BOOTSTRAP_ORG_SLUG=sgimr
BOOTSTRAP_ADMIN_NAME=Administrador SGIMR
BOOTSTRAP_ADMIN_EMAIL=admin@sgimr.cloud
BOOTSTRAP_ADMIN_PASSWORD=otra-clave-larga-y-unica
```

## GitHub Actions

El workflow `Publicar SGIMR` compila la aplicacion, genera un paquete y lo copia al
VPS por SSH. En el VPS crea una release en `/opt/sgimr/releases/<commit>`, apunta
`/opt/sgimr/current` a esa release y recarga PM2.

En `Settings > Secrets and variables > Actions` crear:

- secreto `VPS_HOST`: IP publica o hostname del VPS.
- secreto `VPS_USER`: usuario Linux de despliegue.
- secreto `VPS_SSH_KEY`: llave privada dedicada para despliegue.
- secreto `VPS_KNOWN_HOSTS`: huella SSH verificada del VPS.
- variable `DEPLOY_ENABLED`: establecer en `true` solo despues de preparar SSH,
  PostgreSQL, `.env`, proxy y DNS.

## DNS

Crear o ajustar en Hostinger:

- registro `A` para `@` apuntando a la IPv4 del VPS.
- registro `A` para `www` apuntando a la misma IPv4, o `CNAME` hacia `sgimr.cloud`.

## Proxy del VPS

Si el VPS usa Nginx, crear un sitio equivalente a:

```nginx
server {
  server_name sgimr.cloud www.sgimr.cloud;

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Antes de recargar:

```bash
sudo nginx -t
```

El certificado HTTPS debe gestionarlo el proxy existente del VPS, por ejemplo con
Certbot si usa Nginx o Apache.
