#!/bin/bash
# Simulacro REAL de restauración del mongod propio (bóveda): saca el dump de
# restic, lo levanta en un mongod DESECHABLE y compara documento por documento.
#
# POR QUÉ EXISTE, y por qué no alcanzaba con verify-backups.sh:
#   verify-backups.sh prueba que el dump se puede SACAR del repositorio y que su
#   BSON se parsea. Eso no prueba que Mongo lo acepte: un dump puede bajar
#   entero, parsear bien y aun así no restaurar (metadata de índices inválida,
#   una colección con opciones que el servidor rechaza, un oplog que no aplica).
#   Hasta el 30/09/2026 NADIE había restaurado nunca el dump de bóveda — o sea
#   que el respaldo de las nueve bases que sostienen cuatro productos era una
#   suposición. Este script lo convierte en un hecho, con números.
#
# LO QUE NUNCA HACE, y es lo que hace que se pueda correr sin miedo:
#   · No toca Atlas.
#   · No escribe NADA en el mongod de producción (27017). Solo lo LEE, y solo
#     `countDocuments`. El guard de puerto de abajo aborta si alguien apunta
#     esto al 27017: un mongorestore mal apuntado sobre el servidor que sostiene
#     cuatro productos es exactamente el accidente que se está evitando.
#   · Levanta un mongod propio, sin auth, en loopback, con su dbpath en un
#     directorio temporal, y lo mata y lo borra al terminar PASE LO QUE PASE
#     (trap EXIT) — y después COMPRUEBA que lo mató y lo borró.
#
# POR QUÉ MIDE LA MEMORIA ANTES DE ARRANCAR:
#   Esta Mac atiende usuarios finales y ya se cayó una vez por swap agotado. Un
#   segundo mongod con su propia cache no es gratis. Si hay menos del 15% libre,
#   el simulacro NO corre: prefiere no saber hoy antes que tirar producción.
#
# CÓMO SE LEE EL RESULTADO: el código de salida es el veredicto. 0 significa
#   "la restauración se verificó de verdad": cada colección del dump volvió a
#   Mongo con la misma cantidad de documentos que trae el BSON. Cualquier otra
#   cosa —incluido "no pude chequear"— es distinto de 0. Un ✅ sin respaldo es
#   peor que un "no pude".
#
# USO:  scripts/verify-db-restore.sh [ID-de-snapshot]     (por omisión: latest)

set -uo pipefail

# Config y utilidades compartidas: deriva rutas y descubre binarios, para que
# esto siga funcionando al migrar de máquina (ver backup-common.sh).
source "$(dirname "${BASH_SOURCE[0]}")/backup-common.sh"

# ---- configuración ---------------------------------------------------------

SNAPSHOT="${1:-latest}"
PASSWORD_FILE="$BACKUP_PASSWORD_FILE"
LOG_FILE="${VERIFY_RESTORE_LOG_FILE:-${BACKUP_LOG_DIR}/verify-db-restore.log}"

# Puerto del mongod DESECHABLE. Cualquiera menos el 27017 (ver el guard en el
# preflight). Se puede cambiar por si dos corridas se pisan.
PORT="${VERIFY_RESTORE_PORT:-27117}"
PROD_PORT="${BOVEDA_MONGO_PORT:-27017}"

# Dónde vive el dump dentro del snapshot: `mongodump --oplog` del servidor
# entero se guarda en el subdirectorio boveda/ (ver backup-db.sh).
DUMP_SUBDIR="${VERIFY_RESTORE_SUBDIR:-boveda}"

# Ruta derivada de $HOME, no absoluta a /Users: la regla de backup-common.sh es
# que ningún script de backup traiga /Users ni /opt escritos a mano. Si un
# segundo script llega a necesitar estas dos, se mudan allá.
BOVEDA_ENV_FILE="${BOVEDA_ENV_FILE:-${HOME}/deploys/boveda/shared/.env}"
# mongod NO está en el PATH ni en Homebrew: bóveda usa el tarball oficial.
MONGOD="${MONGOD_BIN:-$(descubrir_binario mongod || echo "${HOME}/constroad-mongo/mongodb/bin/mongod")}"
MONGORESTORE="${MONGORESTORE_BIN:-$(descubrir_binario mongorestore || echo '')}"

# Cache mínima: con ~5 MB de datos alcanza de sobra, y lo que sobra es memoria
# que producción necesita.
CACHE_GB="${VERIFY_RESTORE_CACHE_GB:-0.25}"
MIN_FREE_PCT="${VERIFY_RESTORE_MIN_FREE_PCT:-15}"

WORK_DIR=""
MONGOD_PID=""
# Se pone en 1 justo antes de lanzar el mongod desechable. La limpieza lo mira
# para saber si tiene algo que apagar: sin esta bandera, un aborto del preflight
# (por ejemplo el guard que rechaza el puerto de producción) hacía que la
# limpieza mirara el 27017, encontrara el mongod de PRODUCCIÓN y avisara
# «limpieza incompleta» — una alarma inventada sobre un proceso que no es suyo.
MONGOD_STARTED=0
PROBLEMS=()

# ---- utilidades ------------------------------------------------------------

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"; }

problem() { PROBLEMS+=("$1"); log "❌ $1"; }

# Se ejecuta SIEMPRE (trap EXIT). Y después de limpiar, COMPRUEBA que limpió:
# "creo que lo apagué" no sirve cuando lo que quedaría colgado es un mongod con
# una copia de los datos de cuatro productos.
cleanup() {
  local status_puerto="no se arrancó nada" status_dir="no se creó nada"

  if [ -n "$MONGOD_PID" ] && kill -0 "$MONGOD_PID" 2>/dev/null; then
    log "Apagando el mongod desechable (PID $MONGOD_PID)..."
    kill "$MONGOD_PID" 2>/dev/null
    local i
    for i in $(seq 1 30); do
      kill -0 "$MONGOD_PID" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$MONGOD_PID" 2>/dev/null; then
      log "AVISO: no se apagó con SIGTERM en 30s — SIGKILL"
      kill -9 "$MONGOD_PID" 2>/dev/null
      sleep 2
    fi
  fi

  [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ] && rm -rf "$WORK_DIR"

  # La comprobación, que es el punto de todo esto: "creo que lo apagué" no vale.
  if [ "$MONGOD_STARTED" = 1 ]; then
    if [ -n "$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null)" ]; then
      status_puerto="OCUPADO TODAVÍA"
      log "🔴 LIMPIEZA INCOMPLETA: sigue habiendo algo escuchando en el puerto ${PORT}"
    else
      status_puerto="libre"
    fi
  fi
  if [ -n "$WORK_DIR" ]; then
    if [ -d "$WORK_DIR" ]; then
      status_dir="SIGUE EXISTIENDO"
      log "🔴 LIMPIEZA INCOMPLETA: el directorio ${WORK_DIR} no se pudo borrar"
    else
      status_dir="borrado"
    fi
  fi
  log "Limpieza: puerto ${PORT} ${status_puerto} · dbpath ${status_dir}"
}

# ---- preflight -------------------------------------------------------------

preflight() {
  # El guard que importa: nunca, por ninguna vía, restaurar sobre producción.
  if [ "$PORT" = "$PROD_PORT" ]; then
    log "🔴 ABORTA: el puerto del mongod desechable (${PORT}) es el de PRODUCCIÓN."
    exit 2
  fi

  [ -n "$RESTIC" ] && [ -x "$RESTIC" ] || { log "🔴 ABORTA: falta restic"; exit 2; }
  [ -n "$MONGORESTORE" ] && [ -x "$MONGORESTORE" ] || { log "🔴 ABORTA: falta mongorestore"; exit 2; }
  [ -x "$MONGOD" ] || { log "🔴 ABORTA: falta mongod (buscado en $MONGOD)"; exit 2; }
  # node + el driver: sin ellos NO se puede contar, y no poder contar no es
  # haber verificado (la lección de la falsa alarma de "BSON corrupto" del
  # 2026-08-09: el PATH de launchd no trae Homebrew).
  [ -n "$NODE" ] && [ -x "$NODE" ] || { log "🔴 ABORTA: falta node — sin contar documentos no hay verificación"; exit 2; }
  [ -d "${BACKUP_REPO_DIR}/node_modules/mongodb" ] || { log "🔴 ABORTA: falta el driver mongodb en ${BACKUP_REPO_DIR}/node_modules"; exit 2; }
  [ -d "${BACKUP_REPO_DIR}/node_modules/bson" ] || { log "🔴 ABORTA: falta la librería bson en ${BACKUP_REPO_DIR}/node_modules"; exit 2; }

  [ -r "$PASSWORD_FILE" ] || { log "🔴 ABORTA: no se puede leer la clave del repositorio ($PASSWORD_FILE)"; exit 2; }
  [ -d "$BACKUP_VOLUME" ] || { log "🔴 ABORTA: el disco de backup no está montado ($BACKUP_VOLUME)"; exit 2; }

  # El puerto tiene que estar LIBRE. Si hay algo ahí, no se reutiliza: podría
  # ser otra corrida de esto, o cualquier otra cosa, y restaurar encima sería
  # escribir en una base que no es la nuestra.
  if [ -n "$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null)" ]; then
    log "🔴 ABORTA: ya hay algo escuchando en el puerto ${PORT}"
    exit 2
  fi

  # Memoria: ver el encabezado. Se aborta ANTES de arrancar nada.
  local free_pct
  free_pct=$(memory_pressure -Q 2>/dev/null | tail -1 | grep -oE '[0-9]+' | tail -1)
  if [ -z "$free_pct" ]; then
    log "🔴 ABORTA: no se pudo medir la memoria libre (memory_pressure no contestó)"
    exit 2
  fi
  if [ "$free_pct" -lt "$MIN_FREE_PCT" ]; then
    log "🔴 ABORTA: solo ${free_pct}% de memoria libre (mínimo ${MIN_FREE_PCT}%). Esta máquina atiende usuarios."
    exit 2
  fi
  log "Memoria libre: ${free_pct}% (mínimo exigido ${MIN_FREE_PCT}%)"

  # La URI de producción, para poder comparar. NUNCA se imprime ni viaja por la
  # línea de comandos: se pasa a node por el entorno.
  PROD_URI=$(grep -E '^BOVEDA_MONGO_URI_RESPALDO=' "$BOVEDA_ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [ -z "$PROD_URI" ]; then
    log "🔴 ABORTA: sin BOVEDA_MONGO_URI_RESPALDO en $BOVEDA_ENV_FILE — no se puede comparar contra producción"
    exit 2
  fi
}

# ---- pasos -----------------------------------------------------------------

# Del snapshot se saca SOLO el subdirectorio de bóveda. Dos razones: es 4,6 MiB
# en vez de 147, y —más importante— el snapshot también contiene los .yaml de
# configuración de mongodump, que llevan las URIs CON CONTRASEÑA en claro.
# Restaurar el snapshot entero las escribiría sin cifrar en este disco.
restore_from_restic() {
  export RESTIC_REPOSITORY="$DB_REPO"
  export RESTIC_PASSWORD_FILE="$PASSWORD_FILE"

  local info
  info=$("$RESTIC" snapshots "$SNAPSHOT" 2>&1)
  if ! echo "$info" | grep -qE '^[0-9a-f]{8} '; then
    problem "el snapshot '$SNAPSHOT' no existe o la clave no abre el repositorio"
    return 1
  fi
  SNAPSHOT_LINE=$(echo "$info" | grep -E '^[0-9a-f]{8} ' | tail -1)
  log "Snapshot a probar: ${SNAPSHOT_LINE}"

  local inicio
  inicio=$(date +%s)
  if ! "$RESTIC" restore "$SNAPSHOT" --target "$WORK_DIR/dump" \
        --include "**/${DUMP_SUBDIR}/**" >>"$LOG_FILE" 2>&1; then
    problem "restic restore falló para el snapshot $SNAPSHOT"
    return 1
  fi
  RESTIC_SECS=$(( $(date +%s) - inicio ))

  DUMP_DIR=$(find "$WORK_DIR/dump" -type d -name "$DUMP_SUBDIR" -maxdepth 5 2>/dev/null | head -1)
  if [ -z "$DUMP_DIR" ]; then
    problem "el snapshot no contiene el subdirectorio '${DUMP_SUBDIR}/' — ¿ese snapshot es anterior al respaldo del mongod propio?"
    return 1
  fi
  log "Dump del mongod propio extraído en ${RESTIC_SECS}s ($(du -sh "$DUMP_DIR" | cut -f1)): ${DUMP_DIR}"

  # El oplog es lo que da consistencia punto-en-el-tiempo. Si no está, se dice:
  # el dump sirve igual, pero la garantía es menor y hay que saberlo.
  if [ -s "${DUMP_DIR}/oplog.bson" ]; then
    HAS_OPLOG=1
    log "oplog.bson presente ($(stat -f%z "${DUMP_DIR}/oplog.bson") bytes)"
  else
    HAS_OPLOG=0
    log "AVISO: el dump NO trae oplog.bson — se restaura sin consistencia punto-en-el-tiempo"
  fi
  return 0
}

start_disposable_mongod() {
  mkdir -p "$WORK_DIR/dbpath" "$WORK_DIR/log"
  log "Arrancando mongod desechable en 127.0.0.1:${PORT} (cache ${CACHE_GB} GB)..."
  # Sin auth, sin replSet y SOLO en loopback: es una base de usar y tirar que no
  # debe ser alcanzable desde la red ni parecerse a producción.
  #
  # `ttlMonitorEnabled=false` NO es cosmético: varias colecciones traen índices
  # TTL (boveda.idempotencia, constroad_auth.codigos). Con el monitor prendido,
  # Mongo borra los documentos ya vencidos ~60s después de restaurarlos, y
  # entonces "restaurado" da MENOS que el dump: una corrida lenta reportaría un
  # respaldo roto que está perfecto. Pasó en la primera prueba de este script
  # (29 en el dump, 25 al contar dos minutos después). Apagado, la comparación
  # es determinista: mide lo que se restauró, no lo que el TTL alcanzó a borrar.
  MONGOD_STARTED=1
  if ! "$MONGOD" --dbpath "$WORK_DIR/dbpath" --port "$PORT" --bind_ip 127.0.0.1 \
        --wiredTigerCacheSizeGB "$CACHE_GB" --setParameter ttlMonitorEnabled=false \
        --logpath "$WORK_DIR/log/mongod.log" \
        --fork >>"$LOG_FILE" 2>&1; then
    problem "el mongod desechable no arrancó (ver $WORK_DIR/log/mongod.log)"
    return 1
  fi
  MONGOD_PID=$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1)
  if [ -z "$MONGOD_PID" ]; then
    problem "el mongod desechable dice que arrancó pero nada escucha en el puerto ${PORT}"
    return 1
  fi
  log "mongod desechable escuchando (PID ${MONGOD_PID})"
  return 0
}

# `--oplogReplay` NO se puede combinar con `--nsExclude` (mongorestore lo
# rechaza), así que se restaura TODO, incluida admin: es una base desechable, y
# preferimos ejercitar el camino completo antes que un subconjunto cómodo.
run_mongorestore() {
  local inicio salida rc
  inicio=$(date +%s)
  local args=(--host 127.0.0.1 --port "$PORT" --numParallelCollections=2 "$DUMP_DIR")
  [ "$HAS_OPLOG" = 1 ] && args=(--oplogReplay "${args[@]}")

  salida=$("$MONGORESTORE" "${args[@]}" 2>&1)
  rc=$?
  echo "$salida" >> "$LOG_FILE"
  RESTORE_SECS=$(( $(date +%s) - inicio ))

  if [ $rc -ne 0 ]; then
    problem "mongorestore falló (código $rc): $(echo "$salida" | tail -3 | tr '\n' ' ')"
    return 1
  fi

  RESTORED_DOCS=$(echo "$salida" | grep -oE '[0-9]+ document\(s\) restored successfully' | tail -1 | grep -oE '^[0-9]+')
  FAILED_DOCS=$(echo "$salida" | grep -oE '[0-9]+ document\(s\) failed to restore' | tail -1 | grep -oE '^[0-9]+')
  OPLOG_NOTE=$(echo "$salida" | grep -iE 'oplog' | tail -1 | sed 's/^[0-9T:.+-]* *//')

  log "mongorestore OK en ${RESTORE_SECS}s — ${RESTORED_DOCS:-?} documentos restaurados, ${FAILED_DOCS:-?} fallidos"
  [ -n "$OPLOG_NOTE" ] && log "oplog: ${OPLOG_NOTE}"

  if [ "${FAILED_DOCS:-1}" != "0" ]; then
    problem "mongorestore reportó ${FAILED_DOCS:-?} documentos que NO se pudieron restaurar"
    return 1
  fi
  if [ "${RESTORED_DOCS:-0}" -lt 1 ] 2>/dev/null; then
    problem "mongorestore no restauró ningún documento"
    return 1
  fi
  return 0
}

# La comparación que convierte esto en una prueba:
#   dump (documentos DENTRO del .bson) vs restaurado (en el mongod desechable)
#   vs producción (solo lectura).
# El veredicto se decide con dump-vs-restaurado, que es una igualdad exacta.
# Producción se informa porque puede haber CRECIDO o haber perdido documentos por
# TTL desde el snapshot: eso es esperable y se dice con números, no se esconde.
compare_counts() {
  cat > "$WORK_DIR/compare.cjs" <<'JS'
const fs = require('fs'), path = require('path');
const { MongoClient } = require(process.env.DRIVER_PATH);
const { BSON } = require(process.env.BSON_PATH);
const dump = process.env.DUMP_DIR;

// Cuenta los documentos DENTRO del .bson, y de paso los deserializa: un .bson
// que existe pero no se parsea es un respaldo inútil que se ve sano.
function countInBson(file) {
  const b = fs.readFileSync(file);
  let off = 0, n = 0;
  while (off < b.length) {
    const size = b.readInt32LE(off);
    if (size <= 0 || off + size > b.length) throw new Error('BSON truncado en offset ' + off);
    BSON.deserialize(b.subarray(off, off + size));
    n++; off += size;
  }
  return n;
}

(async () => {
  const restored = new MongoClient(process.env.RESTORED_URI, { serverSelectionTimeoutMS: 15000 });
  const prod = new MongoClient(process.env.PROD_URI, { serverSelectionTimeoutMS: 15000 });
  await restored.connect();
  await prod.connect();

  const rows = [];
  const dbs = fs.readdirSync(dump).filter(d => fs.statSync(path.join(dump, d)).isDirectory()).sort();
  for (const db of dbs) {
    const files = fs.readdirSync(path.join(dump, db)).filter(f => f.endsWith('.bson')).sort();
    for (const f of files) {
      const coll = f.slice(0, -5);
      const row = { db, coll, dumped: null, restored: null, prod: null, err: '', idxDump: null, idxRestored: null, idxProd: null };
      try { row.dumped = countInBson(path.join(dump, db, f)); } catch (e) { row.err += 'dump: ' + e.message + ' '; }
      try { row.restored = await restored.db(db).collection(coll).countDocuments(); } catch (e) { row.err += 'restaurado: ' + e.message + ' '; }
      try { row.prod = await prod.db(db).collection(coll).countDocuments(); } catch (e) { row.err += 'produccion: ' + e.message + ' '; }
      // Los ÍNDICES también son el respaldo: una base restaurada sin sus índices
      // arranca y contesta mal (consultas a full scan, unicidad perdida). El
      // dump los guarda en el .metadata.json de cada colección.
      const meta = path.join(dump, db, coll + '.metadata.json');
      try {
        const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
        row.idxDump = (m.indexes || []).map(i => i.name).sort().join(',');
      } catch (e) { row.err += 'metadata: ' + e.message + ' '; }
      try {
        row.idxRestored = (await restored.db(db).collection(coll).indexes()).map(i => i.name).sort().join(',');
      } catch (e) { row.idxRestored = null; }
      try {
        row.idxProd = (await prod.db(db).collection(coll).indexes()).map(i => i.name).sort().join(',');
      } catch (e) { row.idxProd = null; }
      rows.push(row);
    }
  }
  await restored.close();
  await prod.close();

  let mismatch = 0, grew = 0, shrank = 0, td = 0, tr = 0, tp = 0;
  const w = Math.max(...rows.map(r => (r.db + '.' + r.coll).length), 20);
  console.log('BASE.COLECCIÓN'.padEnd(w) + '  ' + 'dump'.padStart(8) + 'restaurado'.padStart(12) + 'producción'.padStart(12) + '  delta prod');
  for (const r of rows) {
    const bad = r.err || r.dumped === null || r.restored === null || r.dumped !== r.restored;
    if (bad) mismatch++;
    const delta = (r.prod !== null && r.restored !== null) ? r.prod - r.restored : null;
    if (delta !== null && delta > 0) grew++;
    if (delta !== null && delta < 0) shrank++;
    td += r.dumped || 0; tr += r.restored || 0; tp += r.prod || 0;
    console.log(
      (r.db + '.' + r.coll).padEnd(w) + '  ' +
      String(r.dumped ?? '?').padStart(8) + String(r.restored ?? '?').padStart(12) +
      String(r.prod ?? '?').padStart(12) + '  ' +
      (delta === null ? '?' : (delta > 0 ? '+' + delta : String(delta))) +
      (bad ? '   <<< DIFERENCIA dump/restaurado ' + r.err : '')
    );
  }
  // Índices: dump vs restaurado es una igualdad exacta (y por eso cuenta para el
  // veredicto). Contra producción es solo informativo: producción pudo agregar
  // un índice después del snapshot, y eso no es un respaldo roto.
  let idxBad = 0, idxProdDiff = 0;
  for (const r of rows) {
    if (r.idxDump === null || r.idxRestored === null) { idxBad++; console.log('ÍNDICES ' + r.db + '.' + r.coll + ': no se pudieron leer (dump=' + r.idxDump + ' restaurado=' + r.idxRestored + ')'); continue; }
    if (r.idxDump !== r.idxRestored) { idxBad++; console.log('ÍNDICES ' + r.db + '.' + r.coll + ' NO coinciden — dump=[' + r.idxDump + '] restaurado=[' + r.idxRestored + ']'); }
    if (r.idxProd !== null && r.idxProd !== r.idxRestored) { idxProdDiff++; console.log('ÍNDICES (informativo) ' + r.db + '.' + r.coll + ' — restaurado=[' + r.idxRestored + '] producción=[' + r.idxProd + ']'); }
  }
  console.log('SUMMARY colecciones=' + rows.length + ' dump=' + td + ' restaurado=' + tr +
              ' produccion=' + tp + ' mismatches=' + mismatch + ' crecieron=' + grew + ' bajaron=' + shrank +
              ' indices_distintos_del_dump=' + idxBad + ' indices_distintos_de_produccion=' + idxProdDiff);
  process.exit(mismatch === 0 && idxBad === 0 ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(2); });
JS

  local salida rc
  salida=$(DRIVER_PATH="${BACKUP_REPO_DIR}/node_modules/mongodb" \
           BSON_PATH="${BACKUP_REPO_DIR}/node_modules/bson/lib/bson.cjs" \
           DUMP_DIR="$DUMP_DIR" \
           RESTORED_URI="mongodb://127.0.0.1:${PORT}" \
           PROD_URI="$PROD_URI" \
           "$NODE" "$WORK_DIR/compare.cjs" 2>&1)
  rc=$?
  # La tabla va al log Y a la pantalla: es la evidencia de la corrida.
  printf '%s\n' "$salida" | tee -a "$LOG_FILE"
  SUMMARY=$(printf '%s' "$salida" | grep '^SUMMARY' | tail -1)

  case $rc in
    0) return 0 ;;
    1) problem "hay colecciones donde lo restaurado NO coincide con el dump, en documentos o en índices (ver la tabla)"; return 1 ;;
    *) problem "la comparación no pudo completarse: $(printf '%s' "$salida" | tail -1)"; return 1 ;;
  esac
}

# ---- main ------------------------------------------------------------------

main() {
  mkdir -p "$(dirname "$LOG_FILE")"
  trap cleanup EXIT

  log "=== Simulacro de restauración del mongod propio: inicio (snapshot ${SNAPSHOT}) ==="
  local inicio_total
  inicio_total=$(date +%s)

  preflight

  WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/constroad-restore-drill.XXXXXX") || { log "🔴 ABORTA: no se pudo crear el directorio temporal"; exit 2; }
  chmod 700 "$WORK_DIR"
  log "Directorio de trabajo: $WORK_DIR"

  HAS_OPLOG=0; RESTIC_SECS=0; RESTORE_SECS=0; SUMMARY=""
  restore_from_restic     && start_disposable_mongod && run_mongorestore && compare_counts

  local total=$(( $(date +%s) - inicio_total ))

  if [ ${#PROBLEMS[@]} -eq 0 ]; then
    log "=== RESTAURACIÓN VERIFICADA (${total}s) ==="
    log "${SUMMARY}"
    log "Snapshot: ${SNAPSHOT_LINE}"
    log "El respaldo del mongod propio restaura. Verificado, no supuesto."
    # Se imprime SIEMPRE, junto al ✅: un verde sin su letra chica se lee como
    # más garantía de la que da, y así es como una prueba parcial se convierte
    # con el tiempo en "los respaldos están probados".
    log "LO QUE ESTA PRUEBA NO CUBRE:
  · oplogReplay: mongorestore corrió con --oplogReplay y reportó «${OPLOG_NOTE:-sin dato}».
    Con 0 entradas aplicadas el mecanismo se EJERCITÓ pero quedó VACÍO: el dump
    tarda segundos y el oplog.bson casi siempre viene sin escrituras concurrentes.
    No está probado que un oplog con carga real se aplique bien.
  · Usuarios y roles: admin.system.users y admin.system.version se restauran y se
    cuentan, pero NO se probó autenticarse con ellos (el mongod desechable corre
    SIN auth). Que las credenciales de las apps funcionen tras un desastre no
    está verificado.
  · Índices: se compara la LISTA DE NOMBRES del dump contra la restaurada. No se
    comparan claves, opciones ni el orden de los campos de cada índice.
  · TTL apagado: el mongod desechable corre con ttlMonitorEnabled=false, así que
    la prueba no dice nada sobre el vencimiento de documentos tras restaurar.
  · Las bases de Atlas del MISMO snapshot (constroad_db, constroad, shared_db,
    test_db) NO se restauran acá: este simulacro es solo del mongod propio.
  · No se prueba el tiempo real de un desastre completo (levantar un mongod de
    producción, auth, replica set, Cloudflare, apps reconectando): solo el tramo
    respaldo → datos legibles en un Mongo."
    exit 0
  fi

  log "=== SIMULACRO CON PROBLEMAS (${total}s) ==="
  printf '• %s\n' "${PROBLEMS[@]}" | tee -a "$LOG_FILE"
  log "El respaldo del mongod propio NO quedó verificado. Detalle: $LOG_FILE"
  exit 1
}

main "$@"
