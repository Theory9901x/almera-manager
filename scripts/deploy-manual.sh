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

echo "==> Empaquetando release ($SHA)"
cp -R dist server package.json package-lock.json ecosystem.config.cjs "$TMP_DIR/"
tar -czf "$TMP_DIR/release.tgz" -C "$TMP_DIR" dist server package.json package-lock.json ecosystem.config.cjs

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

echo "==> Moviendo symlink 'current' y recargando PM2"
ssh -i "$KEY" "$HOST" "
  set -eu
  ln -sfn '$REMOTE_BASE/releases/$RELEASE_NAME' '$REMOTE_BASE/current'
  cd '$REMOTE_BASE/current'
  pm2 startOrReload ecosystem.config.cjs --env production
  pm2 save
"

echo "==> Verificando"
curl --fail --retry 8 --retry-delay 3 -s -o /dev/null -w 'health HTTP:%{http_code}\n' https://sgimr.cloud/api/health

echo "==> Listo: $RELEASE_NAME"
