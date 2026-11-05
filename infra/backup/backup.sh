#!/bin/sh
# Backup diário cifrado (D20): dump do banco (formato custom, restaurável com pg_restore) e
# tar do diretório de mídia do Acompanhamento, os dois cifrados com age para a chave PÚBLICA
# BACKUP_AGE_RECIPIENT. A chave privada fica fora da VM: o backup não decifra aqui.
# Nada sai em claro no disco. Retenção local de BACKUP_KEEP_DAYS dias.
set -eu
: "${BACKUP_AGE_RECIPIENT:?defina BACKUP_AGE_RECIPIENT (chave pública age1...)}"
command -v age >/dev/null || { echo "age não instalado"; exit 1; }
dir=${BACKUP_DIR_IN:-/backups}
media=${MEDIA_DIR_IN:-/media}
stamp=$(date -u +%Y%m%dT%H%M%SZ)

# Cifra a saída de um comando; falha se o comando falhar (sh não tem pipefail).
cifrar() {
  out=$1
  shift
  status=$({ { "$@"; echo $? >&3; } | age -r "$BACKUP_AGE_RECIPIENT" -o "$out.partial"; } 3>&1)
  if [ "$status" != 0 ]; then
    rm -f "$out.partial"
    echo "backup falhou: $(basename "$out")"
    exit 1
  fi
  mv "$out.partial" "$out"
}

dump="$dir/npac-$stamp.dump.enc"
cifrar "$dump" pg_dump --format=custom --no-owner
msg="$(basename "$dump") ($(du -h "$dump" | cut -f1))"

if [ -d "$media" ]; then
  tarball="$dir/npac-$stamp.media.tar.enc"
  cifrar "$tarball" tar -C "$media" -cf - .
  msg="$msg, $(basename "$tarball") ($(du -h "$tarball" | cut -f1))"
fi

find "$dir" \( -name 'npac-*.dump.enc' -o -name 'npac-*.media.tar.enc' \) \
  -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "backup ok: $msg"
