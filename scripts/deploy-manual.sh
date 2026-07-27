#!/usr/bin/env bash
# Manual deploy de SGIMR al VPS, sin pasar por GitHub Actions.
#
# Requiere:
#   - Build local limpio (el script corre check + build).
#   - Llave SSH en ~/.ssh/sgimr_github_actions con acceso a root@sgimr.cloud
#     (aprobada para uso manual, ver memoria del agente).
#
# Uso: ./scripts/deploy-manual.sh
#
# Orden critico (no cambiar): subir el release, instalar deps, RECIEN
# entonces mover el symlink `current`, y solo despues recargar PM2. La
# migracion de esquema corre automaticamente al arrancar el proceso
# Node (server/db.mjs -> migrate()), y ese arranque lee schema.sql desde
# donde apunte `current` en ese momento. Si se recarga PM2 antes de mover
# el symlink, se re-aplica el schema.sql de la release VIEJA en silencio
# (exit 0, sin error visible) y el deploy queda a medias.

set -euo pipefail

HOST="root@sgimr.cloud"
KEY="$HOME/.ssh/sgimr_github_actions"
REMOTE_BASE="/opt/sgimr"

cd "$(dirname "$0")/.."

echo "==> Typecheck + build"
npm run check
npm run build

SHA="$(git rev-parse --short HEAD)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Lo que viaja al VPS. UNA sola lista para que empaquetar y comprimir no se desincronicen.
#
# `shared/` esta aqui porque el servidor importa de ahi el motor de adherencia que comparte con
# el cliente. Olvidarlo dejo el arranque en ERR_MODULE_NOT_FOUND y la app en 502: el build local
# no lo detecta porque Vite mete ese import dentro de dist/. Si se añade otra carpeta que el
# servidor importe EN RUNTIME, hay que sumarla aqui.
#
# Ojo con el nombre: este `shared/` del repo se extrae dentro del release y no tiene nada que ver
# con `/opt/sgimr/shared/` del VPS, que es la carpeta persistente (.env y uploads).
PAYLOAD="dist server shared package.json package-lock.json ecosystem.config.cjs"

echo "==> Empaquetando release ($SHA)"
cp -R $PAYLOAD "$TMP_DIR/"
tar -czf "$TMP_DIR/release.tgz" -C "$TMP_DIR" $PAYLOAD

echo "==> Subiendo al VPS"
scp -i "$KEY" "$TMP_DIR/release.tgz" "$HOST:/tmp/sgimr-release.tgz"

RELEASE_NAME="manual-$(date +%Y%m%d%H%M%S)-$SHA"

echo "==> Extrayendo e instalando dependencias (sin tocar 'current' todavia)"
ssh -i "$KEY" "$HOST" "
  set -eu
  release='$REMOTE_BASE/releases/$RELEASE_NAME'
  mkdir -p \"\$release\"
  tar -xzf /tmp/sgimr-release.tgz -C \"\$release\"
  ln -sfn '$REMOTE_BASE/shared/.env' \"\$release/.env\"
  cd \"\$release\"
  npm ci --omit=dev
  rm -f /tmp/sgimr-release.tgz
"

# El release anterior, ANTES de mover el symlink: es a donde se vuelve si el nuevo no arranca.
PREVIOUS="$(ssh -i "$KEY" "$HOST" "readlink '$REMOTE_BASE/current' || true")"

echo "==> Moviendo symlink 'current' y recargando PM2"
ssh -i "$KEY" "$HOST" "
  set -eu
  ln -sfn '$REMOTE_BASE/releases/$RELEASE_NAME' '$REMOTE_BASE/current'
  cd '$REMOTE_BASE/current'
  pm2 startOrReload ecosystem.config.cjs --env production
  pm2 save
"

echo "==> Verificando"
# Si el release nuevo no responde, se VUELVE al anterior en el acto. Antes el script abortaba
# aqui y dejaba produccion caida hasta que alguien lo notara: el fallo se descubre justo despues
# de mover el symlink, que es el momento en que ya esta sirviendo.
if ! curl --fail --retry 8 --retry-delay 3 -s -o /dev/null -w 'health HTTP:%{http_code}\n' https://sgimr.cloud/api/health; then
  echo "!!! El release $RELEASE_NAME no responde."
  if [ -n "$PREVIOUS" ]; then
    echo "==> Revirtiendo a $PREVIOUS"
    ssh -i "$KEY" "$HOST" "
      ln -sfn '$PREVIOUS' '$REMOTE_BASE/current'
      cd '$REMOTE_BASE/current'
      pm2 reload sgimr --update-env
    "
    sleep 4
    curl --fail --retry 5 --retry-delay 2 -s -o /dev/null -w 'health tras revertir HTTP:%{http_code}\n' https://sgimr.cloud/api/health \
      || echo "!!! Tampoco responde el anterior: revisa 'pm2 logs sgimr --err' en el VPS."
  else
    echo "!!! No hay release anterior al que volver."
  fi
  echo "Mira el error con: ssh root@sgimr.cloud 'pm2 logs sgimr --nostream --err --lines 30'"
  exit 1
fi

echo "==> Listo: $RELEASE_NAME"
