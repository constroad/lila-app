# Runbook de Backups y Recuperación

Documento **operativo**: se lee cuando algo ya se rompió, o cuando se migra de máquina.
El diseño y el porqué de cada decisión están en `specs/architecture-as-is.md` §Backups.

> **Lo único imprescindible:** la clave del repositorio.
> Vive en `~/.config/constroad-backup/restic-media.pass` **y** debe existir una copia
> fuera de esta máquina (gestor de contraseñas). Sin ella los backups son
> matemáticamente irrecuperables — ni Backblaze ni nadie puede abrirlos. Si al leer
> esto no tenés esa copia externa, hacela ahora antes de seguir.

---

## 1. Emergencia: necesito recuperar algo YA

Todos los comandos asumen estas dos variables. En la Mac mini original:

```bash
export RESTIC_PASSWORD_FILE=~/.config/constroad-backup/restic-media.pass
export RESTIC_REPOSITORY=/Volumes/CONSTROAD-BACKUP/restic-media   # medios
# para la base:  /Volumes/CONSTROAD-BACKUP/restic-db
```

Si el disco no está disponible, usar la copia offsite (necesita `B2_ACCOUNT_ID` y
`B2_ACCOUNT_KEY` exportadas):

```bash
export RESTIC_REPOSITORY=b2:constroad-backups:medios
```

### Recuperar UN archivo que alguien borró

```bash
restic find "*nombre-del-archivo*"
restic restore <snapshot-id> --target /tmp/recuperado --include "<ruta completa>"
```

### Recuperar la carpeta de UNA empresa

```bash
restic restore latest --target /tmp/recuperado --include "*globofas-s8k*"
```

### Recuperar TODOS los medios

```bash
restic restore latest --target /tmp/recuperado
# verificar antes de mover nada a producción:
du -sh /tmp/recuperado
```

### Recuperar la base de datos

```bash
export RESTIC_REPOSITORY=/Volumes/CONSTROAD-BACKUP/restic-db
restic restore latest --target /tmp/db-recuperada
```

El dump queda en `/tmp/db-recuperada/tmp/constroad-db-dump.XXXX/`. Para volcarlo:

```bash
mongorestore --uri="<PORTAL_MONGO_URI>" --drop --dir=<ruta-del-dump>
```

> ⚠️ **`--drop` BORRA las colecciones antes de restaurar.** Sobre la base de producción
> se pierde todo lo posterior al backup. Restaurar primero a una base de prueba y
> comparar. La restauración de la base **nunca** debería ser el primer intento: mirar
> antes si el problema se resuelve sin volcar todo.

### Ver qué hay disponible

```bash
restic snapshots                     # lista de puntos de restauración
restic ls latest | head -50          # contenido del último
restic stats latest                  # tamaño
```

---

## 2. Qué corre, cuándo y quién lo vigila

| Agente launchd | Cuándo | Qué hace |
|---|---|---|
| `com.constroad.backup-media` | diario 00:30 | medios → SSD |
| `com.constroad.backup-db` | cada hora :15 | MongoDB → SSD |
| `com.constroad.backup-offsite` | diario 02:00 | SSD → Backblaze B2 |
| `com.constroad.verify-backups` | domingos 03:00 | integridad + simulacro de restauración |

Y `backup-watchdog.service.ts`, dentro de lila-app, vigila que todo eso **siga
ocurriendo**: alerta si medios >25 h, base >2 h, offsite >25 h o verificación >8 días.
Es deliberado que el vigilante NO comparta mecanismo con lo vigilado.

```bash
launchctl list | grep constroad.backup     # estado de los agentes
tail -f logs/backup-media.log              # log de la última corrida
./scripts/verify-backups.sh                # forzar verificación completa
```

---

## 3. Migración a otra máquina (Fase 5)

**El agendado NO viaja con el repo git.** Los plists viven en `~/Library/LaunchAgents`.
Si se clona el repo en la máquina nueva y nadie corre el instalador, todo se ve bien y
**no hay backups**. El watchdog lo detecta al día siguiente, pero es mejor no llegar ahí.

Los scripts derivan sus rutas (`scripts/backup-common.sh`): la raíz sale de la ubicación
del propio script, el origen de los medios de `FILE_STORAGE_ROOT` en `.env`, y los
binarios se descubren con `command -v` probando Homebrew de Apple Silicon **e** Intel.
No hay rutas a `/Users/<alguien>` que arreglar.

### Pasos

1. **Instalar dependencias**
   ```bash
   brew install restic
   brew tap mongodb/brew && brew trust mongodb/brew && brew install mongodb-database-tools
   ```
   Si `brew install mongodb-database-tools` pide Xcode CLT, bajar el binario directo de
   `https://fastdl.mongodb.org/tools/db/` (verificar el sha256 de la fórmula) y copiar
   `mongodump`/`mongorestore` a `/opt/homebrew/bin`.

2. **Clonar el repo y configurar `.env`** — mínimo `FILE_STORAGE_ROOT`,
   `PORTAL_MONGO_URI`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ERRORS_CHAT_ID`, y
   `B2_ACCOUNT_ID`/`B2_ACCOUNT_KEY`/`B2_BUCKET` si se quiere la réplica offsite.

3. **Restaurar la clave del repositorio** desde el gestor de contraseñas:
   ```bash
   mkdir -p ~/.config/constroad-backup
   pbpaste > ~/.config/constroad-backup/restic-media.pass   # o pegarla con un editor
   chmod 600 ~/.config/constroad-backup/restic-media.pass
   ```

4. **Conectar el SSD.** Debe montar como `/Volumes/CONSTROAD-BACKUP`. Si monta con otro
   nombre (macOS agrega ` 1` si ya existe uno igual), renombrarlo o exportar
   `BACKUP_VOLUME`.

5. **Dar Acceso total al disco a `/bin/bash`**
   Ajustes → Privacidad y Seguridad → Acceso total al disco → `+` → `Cmd+Shift+G` →
   `/bin/bash`. **Sin esto los agentes fallan**: launchd no hereda los permisos del
   usuario.

6. **Instalar los agentes**
   ```bash
   ./scripts/install-backup-agent.sh
   ```
   Es idempotente. Omite el agente offsite si faltan las credenciales de B2, avisando.

7. **Verificar de verdad, no asumir**
   ```bash
   ./scripts/backup-media.sh          # debe terminar OK
   ./scripts/verify-backups.sh        # debe restaurar y comparar hashes
   launchctl list | grep constroad.backup
   ```

8. **Confirmar que el watchdog quedó activo**: en el log de arranque de lila debe
   aparecer `🛡️ Backup watchdog activo`.

### La Mac mini vieja: no jubilarla

Con RTO objetivo de 4 h, el cuello no es restaurar (7 GB son minutos) sino **conseguir
una máquina y dejarla operativa**, que son días. Dejar la Mac mini como standby con el
repo clonado y las dependencias instaladas es lo único que convierte esas 4 horas en un
número real. Basta con que pueda levantar lila y montar el SSD.

---

## 4. Escenarios de falla

### El SSD murió o se perdió
Los backups locales no existen más; la copia de B2 sí. Conseguir otro disco, formatearlo
**APFS / GUID**, nombrarlo `CONSTROAD-BACKUP`, y repoblarlo desde B2:

```bash
export RESTIC_PASSWORD_FILE=~/.config/constroad-backup/restic-media.pass
restic -r /Volumes/CONSTROAD-BACKUP/restic-media init \
  --from-repo b2:constroad-backups:medios --copy-chunker-params
restic -r /Volumes/CONSTROAD-BACKUP/restic-media copy --from-repo b2:constroad-backups:medios
```

Mientras tanto los backups diarios fallan y alertan: es correcto, no lo silencies.

### La Mac mini murió
Ver §3 (migración). Los datos están a salvo si tenés la clave. **El tiempo lo domina
conseguir el hardware.**

### Ransomware / borrado malicioso
La application key de B2 **no tiene permiso `deleteFiles`**: un atacante con acceso a la
máquina y a la clave puede escribir, pero no vaciar el bucket. Lo que restic "borra" son
marcadores de ocultamiento, y las lifecycle rules retienen las versiones previas.

Recuperación: identificar el último snapshot bueno (`restic snapshots`, mirar fechas
anteriores al incidente) y restaurar **ese**, no `latest`.

Primero: desconectar el SSD para que no se propague.

### Alguien borró archivos por error
Están en los snapshots anteriores mientras viva la retención (medios: 7 diarios, 4
semanales, 6 mensuales). Ver §1.

### El watchdog alertó "BACKUP DETENIDO"
Significa que el backup **dejó de ejecutarse**, no que falló. En orden:

```bash
ls /Volumes/CONSTROAD-BACKUP                 # ¿el disco está conectado?
launchctl list | grep constroad.backup       # ¿los agentes existen?
tail -30 logs/backup-media.log               # ¿qué dijo la última corrida?
./scripts/install-backup-agent.sh            # reinstalar el agendado
```

Causa más común tras una migración: el paso 6 de §3 nunca se corrió.

---

## 5. Mantenimiento

- **Rotar la clave del repositorio**: `restic key add` (agrega una nueva sin invalidar la
  vieja), y `restic key remove <id>` para la anterior. Actualizar la copia externa.
- **Cambiar la retención**: variables `BACKUP_KEEP_*` y `DB_KEEP_*` en los scripts.
- **Espacio**: `df -h /Volumes/CONSTROAD-BACKUP`. A 1,3–4 GB/mes de crecimiento y 954 GB
  libres hay ~20–60 años de margen. Cuando apriete, la salida es tiering a object
  storage, no un disco más grande.
- **Simulacro manual**: `./scripts/verify-backups.sh` — tarda ~15 s y es la única forma
  de saber que esto sirve.

## 6. Limitaciones conocidas

Están explicadas en la cabecera de cada script y en `specs/architecture-as-is.md`:

- **Sin snapshot APFS**: `mount_apfs` exige root. Los medios son write-once (medido: el
  100% deja de cambiar ≤47 s tras crearse), y el script instrumenta el riesgo — si restic
  reporta archivos modificados durante la lectura, alerta y ahí se escala.
- **`mongodump` sin `--oplog`**: Atlas M0 no expone el oplog, así que no hay consistencia
  punto-en-el-tiempo entre colecciones. Con 77 MB el skew es de segundos. Al pasar a un
  tier pago, agregar `--oplog` y `--oplogReplay`.
- **RTO real**: 4 h **solo si hay una máquina donde restaurar**. Sin standby, el tiempo
  lo domina el hardware.
