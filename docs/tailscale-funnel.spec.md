# Tailscale Funnel — Análisis y Solución de Desconexiones

> **Estado actual (2026-05-07):** ✅ Funnel y Node corriendo bajo LaunchAgents.
> URL pública: `https://joses-mac-mini.tail46a1b0.ts.net`

---

## 1. Resumen ejecutivo

`lila-app` corre en una Mac mini detrás de una conexión Starlink + mesh TP-Link "BUNKER", expuesta a internet vía **Tailscale Funnel**. El servicio caía periódicamente: Node seguía vivo localmente pero dejaba de ser accesible desde fuera.

**Causa raíz:** el funnel se lanzaba en foreground desde una terminal (`startup.sh` → `osascript Terminal`), y un LaunchAgent watchdog independiente intentaba mantenerlo con `--bg`. Los dos mecanismos peleaban por el puerto 443 dejando un *foreground listener* fantasma que bloqueaba la recuperación.

**Solución implementada:** dos LaunchAgents headless supervisados por `launchd`, sin dependencia de Terminal.app, con watchdog que se auto-recupera tras micro-cortes de Starlink, roaming de Wi-Fi, sleep o crashes.

---

## 2. Topología

```
┌─────────────┐                                    ┌──────────────────┐
│  Internet   │ ───── Starlink (satelital) ─────►  │   TP-Link mesh   │
│   público   │       2-15s micro-cortes           │     "BUNKER"     │
└─────────────┘       ocasionales por handover     └────────┬─────────┘
       ▲                                                    │
       │                                                    │ Wi-Fi (o Ethernet recomendado)
       │                                                    ▼
       │                                           ┌──────────────────┐
       │ funnel HTTPS                              │    Mac mini      │
       │ joses-mac-mini.tail46a1b0.ts.net          │                  │
       │                                           │  ┌────────────┐  │
       └──── Tailscale DERP relay ─────────────────┼─►│ tailscaled │  │
                                                   │  └─────┬──────┘  │
                                                   │        │ :3001    │
                                                   │        ▼          │
                                                   │  ┌────────────┐  │
                                                   │  │  Node.js   │  │
                                                   │  │  lila-app  │  │
                                                   │  └────────────┘  │
                                                   └──────────────────┘
```

Implicaciones de la topología:
- **Starlink**: no hay IP pública directa (CGNAT), pero Tailscale Funnel funciona vía DERP relay sobre HTTPS, así que CGNAT no es problema. Sí lo son los micro-cortes por handover de satélite (2-15 s) y reorientaciones del plato.
- **TP-Link mesh BUNKER**: el roaming entre nodos del mesh corta TCP del daemon. **Recomendación: Ethernet desde el nodo más cercano a la Mac mini.**
- **Mac mini**: actúa como servidor 24/7. Necesita endurecimiento de power management.

---

## 3. Diagnóstico

### 3.1 Síntoma

```bash
$ tailscale funnel status
No serve config        # ← funnel desaparecido, Node sigue vivo
```

### 3.2 Causa raíz

```
ANTES (problemático):

┌─ ~/projects/startup.sh (al login) ────────────────────────────┐
│  osascript … Terminal "npm run dev"                           │
│  osascript … Terminal "tailscale funnel 3001"   ← FOREGROUND  │
└───────────────────────────────────────────────────────────────┘
                          │ registra serve config sin --bg
                          ▼
┌─ tailscaled ──────────────────────────────────────────────────┐
│  foreground listener :443 → :3001                             │
└───────────────────────────────────────────────────────────────┘
                          ▲
                          │ intenta `funnel --bg 3001`
                          │ ERROR: foreground listener already exists for port 443
┌─ LaunchAgent com.lila.tailscale-funnel ───────────────────────┐
│  tailscale-funnel-watchdog.sh                                 │
└───────────────────────────────────────────────────────────────┘
```

Evidencia en logs antes del fix:

```
2026/05/07 06:43:48 sending serve config: updating config:
  foreground listener already exists for port 443
[2026-05-07 06:43:48] ERROR: Failed to start funnel (exit 1)
```

El listener foreground del `startup.sh` quedaba registrado en el daemon aunque la terminal hubiera muerto. El watchdog no podía sobrescribirlo con `--bg`.

### 3.3 Tabla de causas evaluadas

| Causa | Veredicto | Razonamiento |
|---|---|---|
| Conflicto `startup.sh` (foreground) vs LaunchAgent (`--bg`) | **Principal** | Confirmado en logs |
| Terminal cierra / proceso muere | **Principal** | Funnel foreground sin supervisor |
| macOS sleep / App Nap | **Secundaria fuerte** | Sequoia gestiona red agresivamente |
| Starlink: micro-cortes (handover) | **Secundaria** | 2-15 s, recuperable si funnel es `--bg` |
| TP-Link mesh: roaming Wi-Fi | **Secundaria** | El handoff entre nodos corta TCP |
| Daemon no reasienta tras outage largo | **Secundaria** | `--bg` mitiga; watchdog cubre el resto |
| Cuota Funnel ~1 TB/mes | **Descartar monitoreando** | Ver dashboard Tailscale |
| Rate limit | **Improbable** | Sin límites bajo uso normal |
| Baileys / consumo de memoria | **No rompe Tailscale** | Solo afecta Node |
| Firewall macOS bloqueando | **Posible** | Verificar permisos de Tailscale y node |

---

## 4. Arquitectura de la solución

### 4.1 Diagrama operativo

```
                       macOS login / boot
                              │
                              ▼
                    ┌─────────────────────┐
                    │     launchd         │
                    └─────────┬───────────┘
                              │
        ┌─────────────────────┴──────────────────────┐
        │                                            │
        ▼                                            ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│  com.lila.tailscale-     │              │  com.lila.app            │
│  funnel.plist            │              │  .plist                  │
│                          │              │                          │
│  RunAtLoad   ✓           │              │  RunAtLoad   ✓           │
│  KeepAlive   ✓           │              │  KeepAlive   ✓           │
│  NetworkState ✓          │              │  NetworkState ✓          │
└────────────┬─────────────┘              └────────────┬─────────────┘
             │                                         │
             ▼                                         ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│ tailscale-funnel-        │              │ resilient-dev.cjs        │
│ watchdog.sh              │              │                          │
│                          │              │ spawn → tsx src/index.ts │
│ loop cada 30s:           │              │ on exit:                 │
│   ¿daemon up?            │              │   restart con backoff    │
│   ¿funnel :3001 up?      │              │   3s → 6s → 12s → 20s    │
│   si no: --bg / reset    │              │                          │
└────────────┬─────────────┘              └────────────┬─────────────┘
             │                                         │
             ▼                                         ▼
   tailscale funnel --bg 3001              Node sirviendo en :3001
   (config persistente en daemon)          (HTTP local)
             │                                         ▲
             └─────► tailscaled ─────► proxy HTTPS ────┘
                     :443
```

### 4.2 Por qué `launchd` y no Terminal.app

| Aspecto | Terminal vía `osascript` | LaunchAgent (`launchd`) |
|---|---|---|
| Sobrevive logout / cierre Terminal | ❌ | ✅ |
| Sobrevive sleep + wake | ⚠️ a veces | ✅ |
| Reinicio automático tras crash | ❌ | ✅ (`KeepAlive`) |
| Logs persistentes | ❌ | ✅ |
| Headless / sin GUI | ❌ | ✅ |
| Espera a red lista | ❌ | ✅ (`NetworkState`) |
| Puede arrancar antes de login | ❌ | ✅ (con LaunchDaemon) |

### 4.3 Por qué `--bg` en el funnel

| Modo | Persistencia | Sobrevive a |
|---|---|---|
| `tailscale funnel 3001` (foreground) | Mientras vive el proceso | Nada — muere con la terminal |
| `tailscale funnel --bg 3001` | En el estado del daemon | Reinicio del daemon, terminal cerrada, micro-cortes Starlink, roaming Wi-Fi |

---

## 5. Componentes implementados

```
/Users/jose/projects/
├── startup.sh                           # Limpio: solo comentarios + logs opcionales
└── lila-app/
    ├── resilient-dev.cjs                # Watchdog del proceso Node (existente)
    ├── scripts/
    │   └── tailscale-funnel-watchdog.sh # Watchdog del funnel (mejorado: + reset auto)
    ├── docs/
    │   └── tailscale-funnel.spec.md     # Este documento
    └── logs/
        ├── tailscale-watchdog.log       # Log del watchdog
        ├── tailscale-launchagent.log    # Stdout del LaunchAgent del funnel
        ├── tailscale-launchagent-err.log
        ├── lila-app.log                 # Stdout de Node bajo LaunchAgent
        └── lila-app-err.log

/Users/jose/Library/LaunchAgents/
├── com.lila.tailscale-funnel.plist      # Daemon del funnel (existente)
└── com.lila.app.plist                   # Daemon de Node (creado)

/Users/jose/.zshrc                       # Aliases para control manual (añadidos)
```

### 5.1 Mejora del watchdog (auto-reset ante listener fantasma)

`tailscale-funnel-watchdog.sh::start_funnel()` ahora:
1. Intenta `tailscale funnel --bg 3001`.
2. Si falla → ejecuta `tailscale funnel reset` y reintenta una vez.
3. Loguea el resultado y retorna; el loop principal vuelve a chequear en 30 s.

Eliminado el fallback `tailscale funnel "$PORT" &` que dejaba zombies cada ciclo.

### 5.2 LaunchAgent de Node (`com.lila.app.plist`)

- Corre `node /Users/jose/projects/lila-app/resilient-dev.cjs`.
- `KeepAlive` + `ThrottleInterval=10` → si crashea, `launchd` lo reinicia tras 10 s.
- `resilient-dev.cjs` aporta una segunda capa: backoff exponencial 3-20 s entre crashes consecutivos del proceso `tsx`.
- `NetworkState=true` → arranca solo cuando hay red.

---

## 6. Control manual (cómo seguir teniendo "el botón")

El control no se pierde con LaunchAgents. Solo cambia el comando.

### 6.1 Aliases instalados en `~/.zshrc`

Tras instalación, ejecutar `source ~/.zshrc` (o abrir nueva terminal) para activarlos.

```bash
# === lila-app aliases (tailscale funnel + node) ===

# --- Funnel ---
alias funnel-status='tailscale funnel status && launchctl list | grep com.lila'
alias funnel-logs='tail -f /Users/jose/projects/lila-app/logs/tailscale-watchdog.log'
alias funnel-restart='sudo pkill -f "tailscale funnel"; echo "watchdog reasienta en <30s"'
alias funnel-pause='launchctl unload ~/Library/LaunchAgents/com.lila.tailscale-funnel.plist'
alias funnel-resume='launchctl load   ~/Library/LaunchAgents/com.lila.tailscale-funnel.plist'

# --- Node lila-app ---
alias lila-logs='tail -f /Users/jose/projects/lila-app/logs/lila-app.log'
alias lila-errs='tail -f /Users/jose/projects/lila-app/logs/lila-app-err.log'
alias lila-restart='launchctl kickstart -k gui/$(id -u)/com.lila.app'
alias lila-pause='launchctl unload ~/Library/LaunchAgents/com.lila.app.plist'
alias lila-resume='launchctl load   ~/Library/LaunchAgents/com.lila.app.plist'
```

| Alias | Qué hace |
|---|---|
| `funnel-status` | Estado del funnel + LaunchAgents activos |
| `funnel-logs` | `tail -f` del watchdog en vivo |
| `funnel-restart` | Mata el funnel; watchdog reasienta en <30 s |
| `funnel-pause` | Detener watchdog (control 100% manual) |
| `funnel-resume` | Reactivar watchdog |
| `lila-logs` | `tail -f` del log principal de Node |
| `lila-errs` | `tail -f` de errores de Node |
| `lila-restart` | Reinicio inmediato del LaunchAgent (kickstart -k) |
| `lila-pause` | Detener LaunchAgent de Node |
| `lila-resume` | Reactivar |

### 6.2 Patrones comunes

```bash
# Ver qué pasa en vivo (equivalente a la ventana de Terminal de antes)
funnel-logs       # en una terminal
lila-logs         # en otra

# "Quiero hacer algo a mano sin que el watchdog me pelee"
funnel-pause
tailscale funnel reset
tailscale funnel --bg 3001     # o lo que necesites
funnel-resume

# "Node está raro, reinícialo"
lila-restart

# "Algo está mal con todo, reset total"
funnel-pause && lila-pause
sudo pkill -f "tailscale funnel"; sudo pkill -f "resilient-dev"
tailscale funnel reset
funnel-resume && lila-resume
```

---

## 6.2 ¿Qué pasa con `start-constroad.app` (Login Item)?

`/Applications/start-constroad.app` es una **Automator Application** que se ejecuta al login y corre `~/projects/startup.sh`. Está registrada en **Login Items** del usuario.

```
Login Items (Sistema → General → Items de inicio)
        │
        ▼
 start-constroad.app   (Automator wrapper)
        │
        ▼
 ~/projects/startup.sh   ← ahora limpio (solo comentarios)
```

**Estado actual: inocuo.** `startup.sh` ya no contiene `tailscale funnel 3001` ni `npm run dev` — solo comentarios. La app sigue ejecutándose al login pero no hace nada que choque con los LaunchAgents.

### Opciones disponibles

| Opción | Cómo | Resultado |
|---|---|---|
| **A. Dejarla (recomendado)** | No hacer nada | App corre script vacío al login. No interfiere. |
| **B. Quitar el Login Item** | Sistema → General → Items de inicio → quitar `start-constroad` | App ya no corre al login (la .app sigue en Aplicaciones por si la quieres más tarde) |
| **C. Borrar la app** | `rm -rf /Applications/start-constroad.app` + quitar Login Item | Limpieza total |
| **D. Reutilizarla para mostrar logs** | Descomentar las líneas de `tail -f` en `startup.sh` | Al login se abren ventanas con `funnel-logs` y `lila-logs` |

> **Importante**: ninguna opción afecta a los LaunchAgents. El servicio sigue arrancando solo al login independientemente de `start-constroad`.

### Si eliges la Opción D

Editar `~/projects/startup.sh` y descomentar:

```bash
osascript -e 'tell application "Terminal" to do script "tail -f /Users/jose/projects/lila-app/logs/tailscale-watchdog.log"'
osascript -e 'tell application "Terminal" to do script "tail -f /Users/jose/projects/lila-app/logs/lila-app.log"'
```

---

## 7. Endurecimiento del SO (¿macOS bloquea internet?)

Sí, varios mecanismos del SO pueden interrumpir el servicio. Para una Mac mini servidor 24/7 aplicar:

### 7.1 Power management (lo más importante)

```bash
sudo pmset -a sleep 0          # nunca duerme el sistema
sudo pmset -a disksleep 0      # nunca duerme el disco
sudo pmset -a displaysleep 10  # apagar pantalla está bien
sudo pmset -a powernap 0       # Power Nap puede dejar la red en estados raros
sudo pmset -a autorestart 1    # auto-arranque tras corte de luz
sudo pmset -a panicrestart 15  # reinicio tras kernel panic
sudo pmset -a womp 1           # wake on magic packet

pmset -g                       # verificar
```

### 7.2 App Nap

```bash
defaults write NSGlobalDomain NSAppSleepDisabled -bool YES
```

O por app: Finder → Aplicaciones → Tailscale → Cmd-I → "Prevenir App Nap".

### 7.3 Wi-Fi power save (solo si no usas Ethernet)

```bash
networksetup -listallhardwareports        # identificar interfaz Wi-Fi (típicamente en1)
sudo networksetup -setairportpower en1 on
```

> **Recomendación fuerte**: pasar la Mac mini a **Ethernet** desde el nodo TP-Link más cercano. Elimina roaming Wi-Fi como variable.

### 7.4 Application Firewall

```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps

# Si Tailscale o node aparecen bloqueados:
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /Applications/Tailscale.app
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/local/bin/node
```

### 7.5 DNS robusto

Starlink + TP-Link a veces fallan resolviendo. Setear DNS estables como fallback:

```bash
sudo networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8
# o si está por Ethernet
sudo networksetup -setdnsservers Ethernet 1.1.1.1 8.8.8.8
```

> Tailscale usa MagicDNS para su red interna; lo anterior solo afecta resolución del sistema (necesario para que `tailscaled` llegue a `controlplane.tailscale.com`).

---

## 8. Edge cases cubiertos

| Escenario | Comportamiento | Mecanismo |
|---|---|---|
| Mac mini reinicia | Funnel + Node arrancan solos al login | `RunAtLoad` en ambos plists |
| Mac entra en sleep | Sleep deshabilitado | `pmset` |
| App Nap pausa Node | Deshabilitado globalmente | `NSAppSleepDisabled` |
| Starlink 5 s sin internet | Daemon reconecta, `--bg` persiste | `--bg` + watchdog |
| Starlink cae 30 min | Reasienta cuando vuelve | Watchdog loop cada 30 s |
| TP-Link mesh hace roaming | TCP daemon se rehace, `--bg` persiste | `--bg` + Ethernet recomendado |
| Listener fantasma en :443 | Auto-reset y reintento | `start_funnel()` mejorado |
| Tailscale daemon crashea | macOS reinicia `tailscaled`, watchdog espera | `wait_for_tailscale` |
| Node.js crashea | Restart con backoff 3-20 s | `resilient-dev.cjs` |
| Node entra en loop de crashes | `launchd` lo throttlea cada 10 s | `ThrottleInterval` |
| Watchdog del funnel crashea | `launchd` lo reinicia tras 10 s | `KeepAlive` |
| Usuario hace logout | LaunchAgents siguen activos | LaunchAgent vs Terminal |
| Corte de luz | Mac arranca sola, todo levanta | `pmset autorestart` |
| Cuota Funnel ~1 TB/mes | Sin auto-recuperación | Monitoreo manual |
| Conflicto `startup.sh` ↔ LaunchAgent | Eliminado | `startup.sh` limpiado |

---

## 9. Verificación end-to-end

```bash
# 1. LaunchAgents corriendo
launchctl list | grep com.lila
# debe mostrar:
#   <pid>  0  com.lila.tailscale-funnel
#   <pid>  0  com.lila.app

# 2. Puerto 3001 escuchando
lsof -nP -iTCP:3001 -sTCP:LISTEN

# 3. Funnel activo
tailscale funnel status
# debe listar: https://joses-mac-mini.tail46a1b0.ts.net → :3001

# 4. Health check local
curl -sI http://127.0.0.1:3001/

# 5. Health check público (DESDE FUERA de la red local)
curl -sI https://joses-mac-mini.tail46a1b0.ts.net/

# 6. Power management
pmset -g | grep -E 'sleep|powernap|autorestart|womp'
```

---

## 10. Operación día a día

```bash
# Ver logs en vivo
funnel-logs                                    # alias → tailscale-watchdog.log
lila-logs                                      # alias → lila-app.log
lila-errs                                      # alias → lila-app-err.log

# Logs del sistema de Tailscale (verboso)
log stream --predicate 'subsystem == "io.tailscale"' --info

# Estado completo
funnel-status                                  # alias

# Reiniciar manualmente
funnel-restart                                 # alias
lila-restart                                   # alias

# Mantenimiento (parar + arrancar)
funnel-pause && funnel-resume
lila-pause   && lila-resume
```

---

## 11. Cambios aplicados (changelog)

| Fecha | Cambio | Archivo |
|---|---|---|
| 2026-05-07 | Limpiado `startup.sh`: removido `tailscale funnel 3001` foreground; removido `npm run dev` directo | `~/projects/startup.sh` |
| 2026-05-07 | Watchdog mejorado: auto-`funnel reset` ante listener fantasma; eliminado fallback zombie | `scripts/tailscale-funnel-watchdog.sh` |
| 2026-05-07 | Creado LaunchAgent para Node con `KeepAlive` + `NetworkState` | `~/Library/LaunchAgents/com.lila.app.plist` |
| 2026-05-07 | Aliases de control manual añadidos a zshrc | `~/.zshrc` |
| 2026-05-07 | Doc reescrito con secciones, diagramas y changelog | `docs/tailscale-funnel.spec.md` |
| 2026-05-07 | Doc: aliases completos con bloque `alias x='...'`; sección 6.2 sobre `start-constroad.app` | `docs/tailscale-funnel.spec.md` |

### Pendientes para el usuario

- [ ] `sudo pmset -a sleep 0 disksleep 0 powernap 0 autorestart 1 panicrestart 15 womp 1`
- [ ] Verificar Application Firewall (sección 7.4)
- [ ] Decidir Ethernet vs Wi-Fi al BUNKER (sección 7.3)
- [ ] DNS estable como fallback (sección 7.5)
- [ ] `source ~/.zshrc` (o abrir nueva terminal) para activar aliases
- [ ] Probar reinicio físico de la Mac mini para validar arranque automático

---

## 12. Archivos de referencia

- `scripts/tailscale-funnel-watchdog.sh` — health check cada 30 s, auto-reset
- `~/Library/LaunchAgents/com.lila.tailscale-funnel.plist` — LaunchAgent del funnel
- `~/Library/LaunchAgents/com.lila.app.plist` — LaunchAgent de Node
- `resilient-dev.cjs` — watchdog del proceso Node (backoff 3-20 s)
- `~/projects/startup.sh` — limpio, ya no choca con LaunchAgents
