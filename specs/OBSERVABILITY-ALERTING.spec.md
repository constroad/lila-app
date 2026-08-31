# Observabilidad y Alertas — lecciones aprendidas (lila-app)

> **Para qué sirve este documento:** todas las lecciones de acá salieron de fallos
> REALES en producción entre el 2026-07-28 y el 2026-08-09, la mayoría descubiertos
> al construir el sistema de backups y su monitoreo. Varias son errores propios que
> el sistema detectó, o que se detectaron auditando. Se documentan para no repetirlos.
>
> Complementa a `SCALABILITY-MULTI-SESSION.spec.md` §Lecciones (que cubre
> WhatsApp/sesiones) y a `architecture-as-is.md` §Backups / §Monitoreo.

---

## 1. El remedio no debe hacer más daño que el síntoma

**Incidente (2026-08-08).** El Funnel de Tailscale tuvo microcortes. El probe
acumuló 3 fallos y escaló a `tailscale down && tailscale up`. Sobre una sesión ya
perdida, ese `up` **no reconecta: exige login interactivo**. Resultado: 35 minutos
de acceso público caído —páginas sin imágenes ni logo— hasta que una persona
autenticó a mano. La automatización convirtió un microcorte de 1 minuto en una
caída que necesitó intervención.

**Regla.** Toda acción de auto-recuperación debe verificar, ANTES y DESPUÉS, que
el sistema sigue en un estado del que pueda recuperarse sola. Si detecta un estado
que ninguna acción automática arregla (sesión perdida, credencial expirada), debe
**detener la escalación y alertar con el procedimiento manual**, no seguir
intentando con acciones más agresivas.

**Aplicado en.** `scripts/tailscale-external-probe.sh` → `abortar_si_deslogueado()`
en las escalaciones 1, 2 y 3.

---

## 2. "No pude ejecutar el chequeo" ≠ "el chequeo falló"

**Incidente (2026-08-09).** La verificación semanal reportó *"el BSON de
constroad_db/orders no se pudo parsear"*. Verificado a mano: parseaba perfecto,
479 documentos. La causa era que `node` se invocaba pelado y **launchd corre con
un PATH mínimo que no incluye Homebrew**. El chequeo no pudo EJECUTARSE, y eso se
reportó como corrupción de datos.

**Por qué importa más de lo que parece.** Una falsa alarma de *corrupción* es de
las peores: si el sistema grita "tus backups están corruptos" y no lo están, la
próxima vez que grite —cuando sea cierto— nadie le va a creer.

**Regla.** Un chequeo tiene tres resultados, no dos: **OK / FALLÓ / NO SE PUDO
EJECUTAR**. El tercero se reporta como *verificación incompleta*, nunca como
hallazgo. Y todo binario externo se descubre (`command -v` + rutas conocidas),
nunca se asume en el PATH.

**Aplicado en.** `scripts/backup-common.sh` → `descubrir_binario()`;
`scripts/verify-backups.sh` distingue "INCOMPLETA" de "posible CORRUPCIÓN".

---

## 3. La frecuencia del job es la frecuencia de la alerta

**Incidente (2026-08-08).** El backup de la base corre CADA HORA. Al faltar un
permiso, alertó una vez por hora: 24 mensajes diarios idénticos.

**Regla.** Antes de agregar una alerta, multiplicá por la frecuencia del job. Si
el resultado no lo leerías, la alerta necesita dedupe. El dedupe debe ser **por
firma del fallo**, no global: así un problema NUEVO nunca queda enmascarado detrás
de uno viejo. Y al recuperarse hay que avisar — si no, quedás sin saber si sigue
roto o se arregló solo.

**Aplicado en.** `scripts/backup-common.sh` → `backup_notify_failure()` (repite
cada 6h el mismo fallo, siempre alerta uno distinto) y `backup_notify_recovery()`.

---

## 4. No alertar por lo que nunca se configuró

**Incidente (2026-08-09).** El watchdog alertó *"🚨 RÉPLICA OFFSITE DETENIDO —
NUNCA se registró un backup exitoso"* sobre una tarea deliberadamente NO instalada
(el instalador la omite mientras falten credenciales de B2).

**Regla.** Un vigilante tiene que distinguir **"dejó de funcionar"** de **"todavía
no se configuró"**. Lo segundo se omite; el día que se configure, se vigila solo.

**Aplicado en.** `src/services/backup-watchdog.service.ts` → campo `configurado`
en `VIGILADOS`.

---

## 5. Dos mecanismos no pueden contradecirse sobre el mismo hecho

**Incidente (2026-08-09).** El reporte diario decía correctamente *"Offsite: sin
configurar"* mientras el watchdog gritaba *"DETENIDO"*. Dos componentes del mismo
sistema, versiones opuestas del mismo hecho.

**Regla.** Si dos componentes evalúan lo mismo, **comparten los umbrales y la
fuente de verdad**. Cuando se agrega un vigilado nuevo, hay que actualizar a
todos los que lo reportan.

---

## 6. Alertar al EMPEZAR a escalar, no al agotarse

**Incidente (2026-08-08).** La única alerta del probe estaba en el nivel 4 de
escalación: tras ~12 minutos de fallos Y después de tres acciones destructivas. La
caída se resolvió a mano en el nivel 2, así que **nunca llegó ninguna alerta**
pese a 35 minutos de acceso público caído.

**Regla.** La alerta va al principio de la escalada, no al final. Enterarse último
—después de que la automatización flageló el sistema— es al revés de lo que sirve.
Y las alertas ACCIONABLES (las que traen un procedimiento, como una URL de login)
deben poder saltarse el dedupe: una alerta útil suprimida por una genérica es peor
que no tener dedupe.

---

## 7. Verificar CONTENIDO, no cantidad

**Incidente (2026-08-08).** Durante el desarrollo del simulacro de restauración,
una comparación mal escrita reportó diferencias inexistentes. Escrita al revés
habría dado ✅ sobre un backup roto.

**Regla.** Un test de restauración compara **hashes archivo por archivo** contra el
origen, no cuenta archivos. Contar da falsos OK, que es el peor resultado posible
en un sistema de backup. Y la muestra debe excluir lo creado DESPUÉS del snapshot:
esos archivos legítimamente no están, y su falso positivo enmascara uno real.

**Aplicado en.** `scripts/verify-backups.sh` → SHA-256 por archivo + corte por
fecha del snapshot.

---

## 8. Correlación temporal, no aritmética de agregados

**Incidente (2026-08-04).** Se diagnosticó que los reinicios de la app causaban
las 92 caídas de sesión de WhatsApp, apoyándose en que 33 reinicios × 3 sesiones ≈
99 ≈ 92. Al medir la correlación **en el tiempo**, solo el 39% coincidía con un
reinicio; el 46% eran caídas aisladas de una sola sesión (churn normal de WhatsApp
Web, que el backoff ya absorbe).

**Regla.** Dos totales que dan parecido no son una causa. Antes de tratar un
patrón como incidente, verificar que los eventos ocurren **en el mismo momento**.
Es la versión moderna de la lección #1 de `SCALABILITY-MULTI-SESSION.spec`
("'WhatsApp bloqueó la cuenta' es la conclusión perezosa").

---

## 9. El silencio necesita un dead man's switch

**Regla.** Un job que falla alerta; un job que **deja de ejecutarse** no produce
ningún error: simplemente no pasa. Sin un vigilante externo, un agendado perdido
—p.ej. al migrar de máquina, porque el plist NO viaja con el repo git— no se
detecta hasta que hace falta restaurar.

El vigilante debe usar un **mecanismo distinto** al de lo vigilado: launchd
ejecuta los backups, lila los vigila. Si compartieran mecanismo, una sola falla
apagaría los dos sin avisar.

**Aplicado en.** `src/services/backup-watchdog.service.ts` (umbral = frecuencia +
1h de gracia, para que el jitter normal no genere ruido).

---

## 10. La confirmación positiva no es opcional

**Regla.** "El silencio es la señal de éxito" es correcto para evitar ruido, pero
deja sin responder *"¿esto está funcionando?"*. Confiar en un backup que nunca
dice nada exige un acto de fe, y la fe no es una estrategia de respaldo.

La solución no es notificar cada corrida —la base corre cada hora: 24 mensajes
diarios sepultarían la alerta que importa— sino un **resumen periódico**. Y debe
correr aunque todo haya fallado, diciéndolo; si dependiera de un éxito, el día que
todo se rompa no habría reporte.

**Aplicado en.** `scripts/backup-report.sh` (diario 08:00).

---

## 11. Toda ruta nueva se expone CON guard, o no se expone

**Incidente (2026-08-09).** Auditando por riesgo de compromiso se encontró que
`/api/jobs` estaba en internet **sin ninguna autenticación**, con las siete rutas
abiertas: listar (fuga cross-tenant de todas las empresas), `DELETE` de cualquier
cronjob, y `POST /:id/run` — que en jobs de `type: 'message'` **manda WhatsApp a
grupos**, o sea spam masivo desde los números de la empresa con riesgo de ban.

**Dos trampas concretas:**
- Un middleware llamado `validateX` **no es autenticación**. `validateCompany`
  resolvía el `companyId` leyéndolo del **body/query del cliente**, justo lo que
  la frontera de confianza prohíbe. Parecía protección y no lo era.
- El guard va **en el router** (`router.use(...)`), no ruta por ruta: así una
  ruta nueva nace protegida en vez de depender de que alguien se acuerde.

**Cómo verificarlo.** No alcanza con leer el código: hay que hacer `curl` sin
credenciales **desde la URL pública** y confirmar 401. lila está detrás de un
Funnel sin WAF; lo que responde a internet es lo único que cuenta.

---

## 12. Un arreglo se aplica a TODOS los caminos equivalentes, no al que falló

**Incidente (2026-08-10).** El 09-ago se agregó reintento al chequeo HTTPS del probe,
porque los microcortes aislados alimentaban la escalación. Al día siguiente llegaron
alertas de *"lila-app no alcanzable"* con el funnel perfectamente arriba: el reintento
se había puesto **solo en el camino HTTPS**, y el camino DNS —que corre ANTES y
devuelve fallo de inmediato— quedó sin él. Un hipo aislado de `dig` volvía a contar
como caída.

**Regla.** Cuando un arreglo nace de un síntoma, buscar los **demás caminos con la
misma forma** antes de darlo por cerrado. En un chequeo con varias etapas
(resolver → conectar → validar), la robustez de la más débil es la del conjunto.
Preguntarse: *"¿qué otras ramas de esta función pueden fallar por lo mismo?"*.

Vale también hacia atrás: el descubrimiento de binarios se arregló para `restic` y
`mongodump`, y `node` quedó afuera (lección #2). Mismo patrón, dos veces.

---

## 13. Una herramienta puede escribir su error en STDOUT: validá la FORMA, no que haya salida

**Incidente (2026-08-10).** Con el resolver inalcanzable, `dig +short` escribe
`;; connection timed out; no servers could be reached` en **stdout**, no en stderr.
El probe hacía `ips=$(dig ...)` y comprobaba `[ -n "$ips" ]`, así que tomaba esa
línea como una lista de IPs válida. Después intentaba
`curl --resolve host:443:;; connection timed out…`, fallaba con 000, y lo reportaba
como **`funnel_https=FAIL`**. Resultado: un problema de DNS diagnosticado como
"funnel caído" — durante semanas, porque el bug era preexistente.

**Regla.** No alcanza con que un comando devuelva ALGO: hay que validar que lo que
devolvió tiene la **forma esperada**. Filtrar por patrón (acá, IPv4 con regex) en vez
de confiar en "no vacío". Si no, el diagnóstico apunta al componente equivocado y se
persigue el problema donde no está.

**Aplicado en.** `scripts/tailscale-external-probe.sh` → `resolve_derp_ips()` filtra
con `grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'`.


---

## 14. Un hallazgo sospechoso no es una causa hasta verificarlo

**Incidente (2026-08-10).** Diagnosticando por qué no funcionaba Remote Control de
Claude Code, apareció que `ANTHROPIC_BASE_URL` estaba seteada. La documentación
oficial dice, textual, que esa variable **deshabilita** Remote Control y que hay que
quitarla. Encaje perfecto: variable presente + doc que la señala = causa encontrada.

Era falso. Al mirar el **valor** —no solo si existía— apuntaba a
`https://api.anthropic.com`, que es exactamente el host permitido. No bloqueaba nada.
De haber parado en el hallazgo, la recomendación habría sido borrar una variable
inofensiva y el problema habría seguido igual, con la confianza extra de "ya lo
arreglamos".

**Regla.** Encontrar algo que *encaja* con el síntoma no es lo mismo que confirmarlo.
Antes de declarar una causa: leer el valor, no la presencia; y preguntarse *"¿qué
observaría si esta NO fuera la causa?"*. Es la misma disciplina de la lección #8
(correlación temporal, no aritmética de agregados) y de la #13 (validar la forma, no
que haya salida): las tres son formas de parar antes de la primera explicación
plausible.

**Cómo se resolvió.** Descartadas todas las variables por valor, el diagnóstico
oficial (`claude doctor`) confirmó que no había bloqueo — el problema era operativo,
no de configuración.

---

## 15. Distinguir "esto existe" de "esto se podría construir"

**Incidente (2026-08-10).** Al proponer un dashboard de salud se escribió *"una ruta
en lila (`/admin/health`)"* como ejemplo de lo que **se podría** construir. Se leyó
como algo que ya existía: se navegó a esa URL y devolvió 404.

**Regla.** Al proponer trabajo futuro, nombrar rutas, comandos o archivos concretos
hace que la propuesta se lea como descripción de algo existente. Si se mencionan, hay
que marcar explícitamente que **todavía no existen**. Vale para specs, propuestas y
respuestas: el lector no tiene forma de distinguir un ejemplo de un hecho.

Aplica también al revés — al documentar algo como hecho, tiene que estar verificado
corriendo, no solo escrito.


---

## 16. Una recuperación a medias es peor que ninguna

**Incidente (2026-08-10).** Las sesiones de WhatsApp quedaron caídas y no volvían.
Causa: la decisión de restaurar sesiones se tomaba **una sola vez, al arrancar**,
según si el proceso tenía el lease de sockets en ese instante. Tras un reinicio el
proceso nuevo arrancó PASIVO —`kickstart -k` mata con SIGKILL y el anterior no
alcanza a liberar el lease— y dos minutos después lo ganó al vencer el TTL. El
heartbeat detectaba esa adquisición tardía, pero **solo la logueaba**.

Resultado: el proceso quedó **reteniendo el lease sin abrir un solo socket**. Y ahí
está lo peor: el lease existe para que solo una instancia abra sockets, así que al
retenerlo sin usarlo también **bloqueaba a cualquier otra instancia** que sí
hubiera podido levantarlas. Un mecanismo de exclusión mutua que se queda a mitad
de camino no deja el sistema como estaba: lo deja peor.

**Regla.** Si un mecanismo puede adquirir un recurso *más tarde* (failover, retry,
reconexión), el camino tardío tiene que ejecutar **las mismas acciones** que el
camino inicial. Preguntarse siempre: *"si esto se consigue en el segundo intento
en vez del primero, ¿el sistema queda igual de funcional?"*. Si la respuesta es
no, falta código en el camino tardío.

Es pariente de la lección #12 (un arreglo se aplica a todos los caminos
equivalentes): acá los dos caminos son "conseguir el lease al arrancar" y
"conseguirlo después", y solo uno estaba completo.

**Aplicado en.** `instance-lease.ts` → `setOnLeaseAcquiredLate()`, con
`index.ts` registrando `restoreAllSessions`. +2 tests que fallan sin el fix.


## 17. Un código de salida 0 no prueba que el trabajo se hizo: verificá el ARTEFACTO

**Tres incidentes el mismo día (2026-08-14), todos del mismo molde.**

1. Un build de Portal se leyó como exitoso porque el script miraba el exit code de
   `tail`, no el de `npm` — la tubería devuelve el código del ÚLTIMO comando.
2. `next build` **crasheó por falta de memoria**, dejó un stack trace de V8 en el
   log y **salió con 0**. Next se comió el crash de un worker de generación
   estática. El deploy lo dio por bueno y **activó una release sin `.next`**.
3. `npm ci` "instaló bien" pero omitió las devDependencies, así que el build
   siguiente falló por un paquete ausente (ver #19).

**Regla.** Un proceso que termina no es un proceso que funcionó. Todo paso que
produce algo tiene que verificarse por **su producto**, no por su código de
salida: ¿existe el archivo que debía generar? ¿tiene tamaño razonable? ¿tiene el
marcador de completitud?

El artefacto se elige con cuidado: para Next se comprueba `.next/BUILD_ID` y NO
`.next` a secas, porque ese directorio se crea al EMPEZAR y queda a medias si el
build muere en el medio. El artefacto correcto es el que **solo puede existir si
el trabajo llegó al final**.

**Aplicado en.** `deploy.sh` → variable `ARTEFACTO` por app (`dist/index.js`,
`.next/BUILD_ID`) y un chequeo que distingue "falló" de "mintió".


## 18. Contar por IP es contar por oficina: el NAT rompe todo límite por IP

**Incidente (2026-08-14). Costó usuarios reales bloqueados, dos veces.**

Primero en `scannerShield` de Portal: baneaba 30 minutos a cualquier IP tras 40
peticiones en 5 minutos. En los logs quedaron IPs bloqueadas cuyo último path era
`/api/pwa/manifest` y `/api/public/provision` — tráfico normal de la app.

Horas después, la MISMA falla en una regla de rate limiting de Cloudflare sobre
`/api/auth/*`, 10 peticiones cada 10 segundos. Resultado: **55 bloqueos** y
usuarios reportando cierres de sesión, porque NextAuth consulta
`/api/auth/session` de forma continua y sin eso la sesión se cae.

**Por qué duele acá en particular:** en una obra o una oficina TODOS los
dispositivos salen por una sola IP pública. Con el gate público-interno polleando
cada 60 s en dos efectos —~2 req/min por dispositivo— bastan tres o cuatro
personas para cruzar cualquier umbral pensado "por usuario".

**Regla.** Antes de fijar un límite por IP, calcular cuántos DISPOSITIVOS pueden
compartir esa IP y multiplicar. Y separar qué se cuenta:

- **Sondas** (`.env`, `.git`, `wp-config.php`) — un cliente legítimo NUNCA las
  pide. Tres bastan para banear y no hay falso positivo posible.
- **Tráfico normal** — solo puede ganarse un 429 temporal, con un umbral
  calculado sobre el NAT (en Portal: 1200/5min ≈ 120 dispositivos simultáneos).

Un contador único para ambos convierte a un usuario intenso en un atacante.

**Regla derivada, y la más cara:** un límite en el EDGE no distingue nada — cuenta
peticiones a un prefijo. Si el prefijo incluye una ruta que la app consulta sola
(sesión, health, manifest), el límite ya no protege el login: corta la app.

**Aplicado en.** `scannerShield.ts` → contadores separados (`sondas` vs
`requests`) + lista blanca por prefijo de IP. La regla de Cloudflare se
**desactivó**: Portal ya tiene `rateLimiter.ts` propio y el escudo cubre el
escaneo.


## 19. El entorno heredado cambia el comportamiento: probá como lo va a invocar la máquina

**Incidente (2026-08-14).** El deploy de lila funcionaba corriéndolo a mano y
fallaba disparado por el webhook, con `Cannot find package 'esbuild'`.

Causa: `npm ci` **omite las devDependencies cuando encuentra `NODE_ENV=production`
en el entorno**. Torre corre como LaunchDaemon con `NODE_ENV=production` en su
plist, y esa variable se hereda al proceso del deploy que lanza. Desde una
terminal esa variable no existe.

Habría fallado el **100% de los deploys automáticos y el 0% de las pruebas
manuales** — el peor tipo de bug, porque el resultado depende de QUIÉN invoca y no
de lo que hace el comando.

**Regla.** Probar en las mismas condiciones en que va a correr: mismo usuario,
mismo entorno, mismo invocador. Y hacer explícito lo que no debe depender del
ambiente (`--include=dev` gana sobre `NODE_ENV`).

**Corolario de shell:** `VAR=x cmd1 && cmd2` **solo** le pasa `VAR` a `cmd1`. El
techo de memoria que se puso como prefijo llegaba al `npm ci` y no al
`npm run build`, que era el que lo necesitaba. Para toda una cadena, `export`.


## 20. Un timeout de salud mal calibrado revierte deploys buenos

**Incidente (2026-08-14).** Un deploy sano de lila se marcó como fallido, disparó
un auto-rollback innecesario, y el rollback "también falló" — dejando el log
gritando que ni la release anterior servía, cuando lila estaba perfecta.

Causa: el health check esperaba 60 s fijos. **Medido: lila tarda 85 s en frío y
138 s tras un deploy**, porque abre el puerto AL FINAL — primero conecta Mongo y
restaura las sesiones de WhatsApp.

**Regla.** El timeout de salud se **mide**, no se estima, y va **por app**: lo que
tarda cada una en estar lista varía en un orden de magnitud. Un valor único obliga
a elegir entre rollbacks falsos (si es corto) o tardar una eternidad en detectar
una caída real (si es largo).

Y lo más importante: **un auto-rollback que se dispara por un arranque lento es
peor que no tener auto-rollback.** Revierte deploys buenos y enseña a desconfiar
del pipeline, que es cuando la gente empieza a deployar a mano.

**Aplicado en.** `deploy.sh` → `SALUD_TIMEOUT` por app (lila 240 s, Portal 90 s) y
el log registra cuánto tardó en responder, para poder recalibrar con datos.


---

### 21. Un health check contra un puerto no prueba que la release nueva sea la que responde

**Qué pasó (14/08/2026, primer deploy de torre).** El deploy compiló la release,
apuntó `current` a ella, reinició el servicio y reportó `✓ Deploy OK — torre
responde`. Todo cierto y todo irrelevante: el plist de torre todavía apuntaba al
árbol de git, así que lo que contestó en el 4000 fue el proceso viejo. La release
nueva no se ejecutó ni un segundo, y el pipeline la dio por buena.

**Por qué es la lección #17 otra vez, disfrazada.** Aquella decía "verificá el
artefacto, no el código de salida". Esta es el escalón siguiente: verificar el
artefacto tampoco alcanza si después no se comprueba que *ese* artefacto es el
que está sirviendo. Un chequeo por puerto responde una pregunta más débil de la
que uno cree: no dice "la versión nueva anda", dice "alguien atiende ahí".

**Por qué muerde justo en el 0-1.** Es imposible en régimen —el plist ya apunta a
`current`— y casi seguro la primera vez, cuando el servicio todavía arranca desde
el repo. Es decir: aparece exactamente cuando nadie tiene aún la costumbre de
desconfiar del resultado.

**Qué hacer.**
- Antes de dar por buena la primera release de una app, levantarla en un puerto
  libre y pegarle ahí. Es la única prueba que no puede confundirse de proceso.
- Chequear también lo que el ejercicio de auth revela: en Next, `middleware.ts`
  corre en runtime Edge y las env vars se **inlinean al compilar**. Si los shared
  files se enlazaran después del build, las credenciales quedarían `undefined` y
  el fail-closed devolvería 503 a todo. Un 401 sin credenciales y un 200 con
  ellas prueban que el orden fue el correcto.
- Cambiar `ProgramArguments` o `WorkingDirectory` exige `bootout` + `bootstrap`:
  `kickstart` reinicia el proceso pero relee la definición cacheada, así que
  revive en la ruta vieja y el plist nuevo parece no haber hecho nada.

**Checklist de primer deploy de una app**
- [ ] La release responde en un puerto aislado, no solo "el puerto responde".
- [ ] El proceso que sirve tiene su ruta dentro de `deploys/<app>/current`.
- [ ] Auth: 401 sin credenciales, 200 con ellas (prueba el inlineado de Edge).
- [ ] Tras cambiar el plist: `bootout` + `bootstrap`, no `kickstart`.

## Checklist al agregar una alerta o un chequeo

- [ ] ¿Cuántas veces por día puede dispararse? ¿Necesita dedupe por firma?
- [ ] ¿Avisa también cuando se recupera?
- [ ] ¿Distingue "no pude chequear" de "encontré un problema"?
- [ ] ¿Usa binarios descubiertos, o asume el PATH? (launchd no hereda el tuyo)
- [ ] ¿Alerta al empezar a escalar, o recién al agotarse?
- [ ] ¿La acción de recuperación puede dejar el sistema peor?
- [ ] ¿Se contradice con otro componente que reporta lo mismo?
- [ ] ¿Se calla cuando la tarea no está configurada?
- [ ] Si vigila un job: ¿hay dead man's switch por un mecanismo distinto?
- [ ] Si verifica datos: ¿compara contenido, o solo cuenta?
- [ ] ¿Validás la FORMA de lo que devuelve cada comando, o solo que devuelva algo?
- [ ] Al arreglar un camino: ¿revisaste los otros caminos de la misma función?
- [ ] ¿Verificaste el VALOR de lo que encontraste, o solo que estuviera presente?
- [ ] Si nombrás una ruta/comando en una propuesta: ¿aclaraste que aún no existe?
- [ ] Si un recurso puede conseguirse TARDE (failover/retry): ¿ese camino hace lo
      mismo que el inicial, o se queda a medias reteniéndolo sin usarlo?

### Al agregar un paso de build o deploy

- [ ] ¿Verificás el ARTEFACTO que produce, o confiás en el código de salida?
- [ ] ¿El artefacto elegido solo puede existir si el trabajo llegó al final?
- [ ] ¿Hay una tubería que pueda enmascarar el código de salida real?
- [ ] ¿Lo probaste como lo va a invocar la MÁQUINA (mismo usuario, mismo entorno)?
- [ ] Si usás `VAR=x` como prefijo: ¿aplica a toda la cadena, o solo al primero?
- [ ] ¿El timeout de salud está MEDIDO para esa app, o copiado de otra?

### Al fijar cualquier límite por IP

- [ ] ¿Cuántos dispositivos pueden compartir esa IP pública? (obra, oficina, NAT)
- [ ] ¿Separás sondas de tráfico normal, o un usuario intenso cuenta como atacante?
- [ ] Si el límite está en el EDGE: ¿el prefijo incluye alguna ruta que la app
      consulta sola (sesión, health, manifest)? Ahí el límite corta la app, no al
      atacante.

### 22. Un deploy rompe todas las pestañas que ya estaban abiertas, y el servidor responde 200 mientras tanto

**Qué pasó (14/08/2026).** Tras activar la primera release de torre, el panel
mostró *"Application error: a client-side exception has occurred"* en el
navegador. Todas las páginas devolvían 200 por curl, el SSR entregaba el HTML
completo, y un navegador limpio las abría sin un solo error. Solo fallaba la
pestaña que ya estaba abierta desde antes.

**La causa.** Los chunks de Next llevan hash de contenido en el nombre, y los del
runtime —`webpack-*`, `main-app-*`, `layout-*`— cambian en cualquier build que
toque algo. La pestaña vieja sigue pidiendo los nombres con los que se cargó;
después del swap esos archivos ya no existen en la release nueva y dan 404. React
no llega a arrancar. La página no está rota: le falta el JavaScript con el que
nació.

**Por qué es peligroso más allá de la molestia.** No lo sufre quien deploya: lo
sufre todo el que tuviera la app abierta en ese momento. En Portal son decenas de
personas, y llega como "se cayó la página" sin absolutamente nada en los logs del
servidor que lo respalde —responde 200 a todo—. Es el reporte de usuario más
difícil de creer que existe: el que no deja rastro del lado del servidor.

**Cómo NO diagnosticarlo.** Probar con curl, con un navegador nuevo o en incógnito
da todo verde y lleva a concluir "no puedo reproducirlo, debe ser su máquina". La
prueba que sirve es al revés: pedirle al servidor de hoy un chunk del build
anterior y ver el 404.

**Qué se hizo.** `deploy.sh` une los estáticos de la release anterior a los de la
nueva antes de activar (`cp -Rn` sobre `.next/static`). Los nombres llevan hash de
contenido, así que la unión no puede pisar nada con contenido distinto. Cuesta
unos pocos MB por release y es la misma idea que la "skew protection" de Vercel.

**Corrección posterior, el mismo día.** La primera versión copiaba `.next/static`
de la release anterior, que ya traía dentro la suya y la de antes. La cadena no se
cortaba nunca: medido, cada deploy sumaba ~9 archivos —33 → 43 → 52 → 61 → 70— y
ninguna release volvía a quedar limpia. O sea que cubría MÁS generaciones de las
que yo había documentado, pero crecía sin techo, porque podar releases viejas no
alcanza a lo que ya se copió hacia adelante. Ahora cada release guarda aparte un
snapshot de sus estáticos recién compilados y la unión se arma con los snapshots
de las releases retenidas: la cobertura es explícita y el tamaño deja de depender
de cuántos deploys se hicieron en total.

**La lección dentro de la lección.** Una mitigación que se alimenta de su propia
salida anterior acumula sin que nadie lo note, porque cada paso agrega poco. Se ve
contando —no midiendo el tamaño, que tardaba en moverse— y conviene contar apenas
se implementa, no cuando el disco avisa.

**Límite honesto.** Cubre las últimas 5 releases. No es un sustituto de recargar;
es lo que evita que un deploy rutinario se convierta en un incidente reportado.

**Checklist**
- [ ] ¿El deploy conserva los estáticos de la release anterior?
- [ ] Ante un "se rompió la página" sin nada en los logs: pedir un chunk del build
      viejo antes de sospechar del usuario.
- [ ] Un navegador limpio NO reproduce esta falla — no alcanza como descarte.

### 23. Un requisito manual escondido convierte un 0-1 en un 1-1

**Qué pasó (14/08/2026).** El asistente de alta de apps documentaba como primer
paso "clonar el repo en `/Users/jose/projects/<app>`". Sonaba razonable hasta que
alguien planteó el caso real: la app la crea un desarrollador en su laptop y la
pushea a GitHub por primera vez; la Mac mini no sabe nada de ese repositorio. El
pipeline entero —registro, secreto, workflow, plist— estaba listo y el primer
deploy moría con `No existe /Users/jose/projects/<app>`.

**La trampa de fondo.** Todas las apps existentes ya estaban clonadas, porque la
mini también era la máquina donde se programaba. El paso faltante era invisible
para cualquier prueba hecha con ellas: el 0-1 solo se rompe la primera vez, y
nunca más. Un flujo de alta hay que probarlo con algo que la máquina realmente no
conozca, no con lo que ya está.

**Qué se hizo.** `deploy.sh` clona si el repo no está. Decisiones que valen:

- **Mirror, no copia de trabajo.** No tiene working tree que pueda quedar sucio ni
  en otra rama, y el directorio de deploy deja de ser donde alguien programa.
- **Mirror y no clone-por-deploy**, que es lo que hacen Dokploy y Coolify: ellos
  terminan metiendo todo en una imagen, así que el clon es efímero de todos modos.
  Sin Docker, mantener el mirror y traer deltas es mucho más barato en una máquina
  que además sirve tráfico.
- **La credencial es la clave SSH de la máquina**, que ya lee los repos privados de
  la organización: no hace falta una por app. Contrapartida conocida: es una clave
  de cuenta, no una deploy key por repo, así que da más acceso del mínimo.

**Dos bugs que el cambio destapó, y ninguno se veía con las apps existentes:**

1. **`origin/main` no existe en un mirror.** Los refs se copian 1:1, sin el
   namespace `refs/remotes/`. Y falla de la peor manera: `git rev-parse` escribe el
   argumento sin resolver en **stdout** además del error en stderr, así que un
   `$(...)` descuidado captura la cadena `"origin/main"` creyendo que es un SHA y
   el fallo aparece mucho después, disfrazado. Se resuelve probando ambos con
   `--verify -q`, que no imprime nada si no resuelve.
2. **El respaldo del archivo compartido no funciona sin working tree.** Copiaba el
   `.env` desde la copia de trabajo; con un mirror no hay de dónde. El bucle
   simplemente no hacía nada —sin una línea en el log— y el build seguía sin
   variables. En Next es peor: las env vars del middleware se inlinean al compilar,
   así que la release queda rota de forma permanente y no alcanza con poner el
   archivo y reiniciar. Ahora falla y dice qué crear.

**Checklist de un flujo de alta**
- [ ] Probarlo contra algo que la máquina NO conozca, nunca contra lo ya instalado.
- [ ] Listar los prerrequisitos manuales y preguntarse cuál puede hacer el pipeline.
- [ ] Config declarada y ausente → fallar diciéndolo, jamás seguir en silencio.
- [ ] El primer deploy no puede terminar en 🚨 cuando en realidad salió bien: si el
      servicio todavía no existe, decirlo y dar los pasos, no disparar un rollback
      contra una release anterior que no existe.

### 24. Un build sin memoria no parece un error: parece que está trabajando

**Qué pasó (14/08/2026).** El build de Portal, que por la mañana tardaba 3m15s,
se quedó **38 minutos** al 92% de CPU sin escribir un solo archivo nuevo en
`.next` —congelado en 1.303 MB y 2.039 archivos, verificado con dos mediciones
separadas por 45 s—. Proceso vivo, CPU alta, log sin errores.

**La causa.** V8 llegó al techo de heap (3.072 MB) y entró en espiral de GC:
recolectar, liberar unos MB, volver a llenarse, recolectar. El log lo dice al
final, cuando se rinde: `Scavenge 2971.4 → 2969.0 MB`. Dos megas recuperados por
ciclo. Nunca iba a terminar.

**Por qué engaña tanto.** Todos los indicadores de "está funcionando" dan
positivo: el proceso responde, consume CPU, no hay excepción. El único indicador
que dice la verdad es el que nadie mira: **si el trabajo AVANZA**. Mirar el
tamaño de la salida dos veces separadas por 30 s desmiente en un minuto lo que
horas de leer logs no aclara.

**Me mandó a investigar lo que no era.** Con el síntoma "el build se cuelga" y
dos cambios recientes en el script —`nice` y clonar `node_modules`— la conclusión
natural fue que uno de los dos tenía la culpa. Ninguno la tenía. El código
simplemente había crecido ese día y ya no entraba en el techo.

**Qué se hizo.**
- Techo de heap de Portal a 4.096 (medido: pico real 2.746 MB, build en 164 s).
- **TECHO DE TIEMPO para el build**, que es el arreglo importante: subir el heap
  se volverá a quedar corto con el próximo crecimiento del código. Si el build se
  pasa de 12 min —4x el más lento medido— se mata. Y si el log contiene `heap out
  of memory`, el mensaje lo dice explícitamente.

**Checklist**
- [ ] Ante un proceso "colgado" con CPU alta: medir si la SALIDA crece, no si el
      proceso vive.
- [ ] Todo build automatizado con techo de tiempo. Sin él, la única forma de
      enterarse es que un humano mire.
- [ ] El techo de heap no es "cuánta memoria usa": es dónde V8 deja de intentar.
      Ponerlo apenas por encima del pico garantiza que el próximo commit lo rompa.

### 25. Medir un costo en aislamiento es medir otra cosa

**Qué pasó (14/08/2026).** Se movió el portón de tests de GitHub a la Mac mini
con un argumento que parecía sólido: *"los 630 tests de lila tardan 21 s acá,
contra los 9 minutos que GitHub tardaba sólo en `npm ci`"*. Los 21 s eran reales
—medidos, no estimados—.

**Por qué el argumento era falso.** Esos 21 s se midieron con la máquina ociosa.
En un deploy real la máquina está además compilando y **sirviendo a los usuarios**.
Medidos ahí: **366 s**, y Portal quedó tan lento que la gente lo reportó. El
número correcto nunca fue "cuánto tarda" sino "a quién se lo saca".

**La forma general.** En una máquina compartida con producción, el costo de una
tarea no es su duración: es su duración multiplicada por lo que degrada mientras
corre. Una medición en reposo no puede ver ese factor, y por eso siempre da la
respuesta cómoda.

**Qué se hizo.** Los tests volvieron al Action, en un job **paralelo que no
bloquea** el deploy —bloquear ya había dejado a producción sin poder desplegar por
un exit code espurio de jest—. En la mini quedó sólo lo que no se puede hacer en
otro lado: el build, que cuesta 2 s en lila.

**Y en el camino, lo que sí valía la pena mirar.** El desglose del deploy de 31
minutos: 840 s esperando el candado, 432 s de `npm ci` **con el lockfile idéntico
al de la release anterior**, 366 s de tests, y 2 s de build. Reusar
`node_modules` con `cp -Rc` (clonefile de APFS, copy-on-write) bajó los 432 s a
7 s en lila. El desperdicio grande estaba en el paso que nadie sospechaba, no en
el que se estaba discutiendo.

**Checklist**
- [ ] Medir el costo de una tarea CON el sistema en su estado normal, no en reposo.
- [ ] Antes de optimizar el paso sospechoso, medir TODOS los pasos. El caro suele
      ser otro.
- [ ] Reinstalar dependencias idénticas es desperdicio puro: comparar el lockfile.

### 26. Un guard de "¿soy el punto de entrada?" compara rutas, y bajo un symlink nunca coinciden

**Qué pasó (14/08/2026).** Se cambió el plist de lila para que corriera `tsx`
directamente contra `deploys/lila/current/src/index.ts`. El proceso arrancó,
`launchctl` lo reportó vivo, no hubo excepción, no hubo crash, no hubo una línea
de error en ningún log. **Y el servidor HTTP nunca escuchó.** 30 minutos de
producción caída.

**La causa.** El final de `src/index.ts` decía:

```ts
if (import.meta.url === `file://${process.argv[1]}`) startServer();
```

Los dos lados nombran el mismo archivo y **nunca son iguales**:

| | valor |
|---|---|
| `import.meta.url` | ruta **física**, con los symlinks ya resueltos → `…/releases/20260814-…/src/index.ts` |
| `process.argv[1]` | el argumento **literal** que recibió el proceso → `…/current/src/index.ts` |

Corriendo desde el árbol de git funcionaba —no hay symlink de por medio— y por eso
sobrevivió meses. Debajo de `current` la comparación da `false` siempre, y el
`if` hace lo peor que puede hacer un guard: **nada, en silencio**.

**La forma general.** Toda pregunta del tipo "¿me están ejecutando a mí?" es una
comparación de rutas, y una ruta tiene dos formas. Hay que comparar las
**reales** (`fs.realpathSync` de los dos lados). Y un guard cuyo modo de falla es
*no ejecutar* no deja rastro: no aparece en los logs porque el código que loguea
es justamente el que no corrió.

**El error de verificación, que fue mío.** Miré 6 segundos de salida, vi el
arranque y lo di por bueno. La salida terminaba exactamente donde después se
colgaba. **Ver que algo arranca no es ver que termina de arrancar**: lo que había
que verificar era el puerto escuchando, no el proceso vivo.

**Qué se hizo.** Comparación por `realpath` con fallback, y la verificación pasó
a ser `curl` al health check, no `ps`.

**Checklist**
- [ ] Comparar rutas con `realpath` en los dos lados, nunca las cadenas crudas.
- [ ] Probar el arranque **como lo va a invocar la máquina** (bajo el symlink, con
      el entorno del daemon), no desde el árbol de trabajo (ver #19).
- [ ] Verificar el puerto escuchando o el health check. "El proceso está vivo" no
      es una verificación.
- [ ] Desconfiar de todo `if` cuyo camino falso sea el silencio.

### 27. Dos jobs no son independientes si comparten el candado

**Qué pasó (15/08/2026, 03:07 AM).** Llegó un aviso de deploy de lila a las tres
de la mañana. Nadie lo lanzó: era el push de las **22:39**, con 4 h 28 min de
retraso.

| hora | qué |
|---|---|
| 21:07:31 | push → deploy a las 21:07:41 ✓ |
| 21:27 · 21:29 · 21:48 | tres pushes → **ningún deploy, jamás** |
| 22:39:36 | push → nada |
| **03:07:41** | se cumplen **6 h exactas** del run de las 21:07 |
| 03:07:55 | Torre recibe el hook · 03:07:58 arranca el deploy |

**La causa.** El `concurrency` estaba declarado a nivel de **workflow**, y ahí el
candado lo toma el run entero — los dos jobs, `tests` incluido. Un run trabado en
`tests` hasta el techo por defecto de GitHub (360 min) mantuvo el grupo tomado
seis horas. Peor: GitHub **cancela todos los runs pendientes menos el más
reciente**, así que los tres commits del medio no se desplegaron nunca y nadie se
enteró.

**Lo que lo vuelve una lección y no un bug.** El encabezado de ese mismo archivo
decía, textual, que los tests no bloquean el deploy, y era verdad en lo explícito:
`desplegar` no llevaba `needs`. Bloqueó igual, por la puerta de atrás. **Una
independencia declarada en el diseño no sobrevive a un recurso compartido que no
se nombró.**

**Qué se hizo.** El `concurrency` bajó adentro del job `desplegar` —que es lo
único que hay que serializar, porque dos deploys de la misma app se pisan el
symlink— y cada job tiene techo propio: 15 min en `tests`, 5 en `desplegar`.
Además la CI ahora avisa a Telegram si los tests fallan **o se cancelan**, que
hace falta justamente porque no bloquean: el commit ya está en producción y la
pestaña de Actions no la mira nadie.

**Checklist**
- [ ] `concurrency` al nivel de lo que de verdad hay que serializar. A nivel de
      workflow serializa TODO el run.
- [ ] `timeout-minutes` explícito en todo job. El default de 360 min convierte un
      cuelgue en un incidente de seis horas.
- [ ] Si un pipeline descarta trabajo pendiente (cancelación, coalescencia,
      "solo el último"), tiene que **decirlo**. Un commit que nunca se desplegó y
      no avisó es indistinguible de uno desplegado.
- [ ] Cuando dos cosas "son independientes", enumerar qué comparten: candados,
      cuotas, runners, el disco.

### 28. Un build que casi entra en RAM no falla: se arrastra, y no deja rastro

**Qué pasó (15/08/2026).** El build de Portal tardó **11 m 56 s**. Las tres noches
anteriores, con el mismo lockfile y el mismo árbol de dependencias, tardaba entre
140 y 158 s. Exit code 0, artefacto correcto, deploy exitoso.

**La medición.** Se corrió el mismo SHA en un directorio aparte, sin tocar
producción, muestreando memoria cada 15 s:

```
06:42:16  swap 1001 MB   libre 2204 MB   ← arranca
06:42:31  swap 1001 MB   libre  339 MB
06:44:16  swap 1365 MB   libre   74 MB
06:44:31  swap 1571 MB   libre   57 MB   ← termina, 146 s
```

**146 s**: no había ninguna regresión. Pero el muestreo mostró lo otro: el build
pica en ~2.746 MB y arranca con 2.204 MB libres. **No entra en RAM ni con la
máquina en reposo** — la diferencia se paga en swap, +570 MB medidos. Con la
máquina tranquila eso cuesta segundos; con otro deploy corriendo en paralelo, el
mismo déficit estiró el build a 716 s. Cinco veces.

**Por qué es invisible.** No es la #24. Ahí el heap no alcanzaba y V8 mataba el
proceso dejando su rastro en el log (`Reached heap limit`). Acá el sistema
operativo **tapa el faltante con swap** y nadie escribe nada en ningún lado: no
hay error, no hay warning, no hay métrica. El único síntoma es un número más
grande en un log que nadie mira.

**El agravante que no era del deploy.** Las apps de escritorio de la mini —Chrome
y Claude— sostenían **1.915 MB**. Los tres servicios juntos, 316 MB. En un
servidor de 8 GB, dos apps de escritorio abiertas son el 24 % de la máquina, y no
aparecen en ningún panel de deploys.

**La forma general.** El techo de memoria no es lo que consume el proceso: es lo
que hay **libre en el instante del pico**. Y a diferencia de la CPU —que reparte y
todos van más lentos— la memoria que falta se cobra en I/O, que es dos órdenes de
magnitud más caro. Un candado que serializa builds protege contra dos builds a la
vez; no protege contra **uno solo que no entra**.

**Qué se hizo.** El aviso de Telegram lleva desglose por fase, así un
`build 11m 56s` al lado de un `build 2m 26s` se ve de un vistazo en el celular en
vez de quedar enterrado en el log.

**Checklist**
- [ ] Ante un paso lento: medirlo **en aislamiento** antes de tocar nada. Separa
      "regresión" de "contención", que se arreglan al revés.
- [ ] Muestrear memoria libre y swap durante el pico, no solo la duración.
- [ ] Comparar el pico del build contra la memoria **libre**, no contra la total.
- [ ] Nada de apps de escritorio en una máquina que sirve producción.
- [ ] Si un paso puede degradarse 5× sin fallar, su duración tiene que llegar a
      donde alguien la lea.


---

### 29. Un monitor que vive DENTRO de lo que vigila es ciego en el fallo que más importa

**Qué pasó (31/08/2026).** La mini perdió la ruta de red durante ~3 minutos
(11:14:31 → 11:16:37 UTC). Se cayó **todo lo que sale por el túnel** —
constroad.com, lila, chat, lilastore, auth — y las apps además perdieron Mongo
Atlas, así que tampoco podían trabajar hacia afuera:

```
11:14:31 ERR Failed to dial a quic connection error="... sendmsg: network is unreachable"
06:14:55 ERROR [cron] tick de recordatorios falló: connection to ...:27017 timed out
11:16:37 INF Registered tunnel connection ... location=scl04
```

Un usuario lo reportó por WhatsApp. **Nadie más se enteró.**

**Lo desconcertante es que el monitoreo funcionó perfecto.** El watchdog de
Cloudflare escribió, a las 06:16:20, exactamente lo que debía:

```
NO EVALUABLE: esta máquina no tiene internet; el túnel no es juzgable
```

Se negó a culpar al túnel —correcto, la lección #16 y los tres estados en
acción— y por eso mismo **no mandó nada**. Pero aunque hubiera querido alertar,
no habría podido: **Telegram también necesita internet**. El watchdog corre en
la mini.

**La regla.** Un monitor hospedado en la misma máquina que vigila puede detectar
que la aplicación se cayó, pero **nunca** que la máquina quedó incomunicada — el
único fallo en el que el aviso es la diferencia entre tres minutos y una mañana.
Todo servicio expuesto necesita **un chequeo desde afuera de su propia máquina**.

El nuestro es un workflow de GitHub Actions (`torre/.github/workflows/probe-publico.yml`),
en compute ajeno, cada 5 minutos. Cuatro decisiones que valen para cualquier probe:

- **El control es el canal de alerta.** Se prueba `api.telegram.org` para
  distinguir «el sitio está roto» de «el runner no tiene internet». Que sea el
  mismo canal por el que habría que avisar no es casualidad: si no responde, la
  alerta no sale igual, así que callarse es lo honesto.
- **Se avisa en la TRANSICIÓN, no en cada ciclo.** Sin eso, una caída de una hora
  manda doce mensajes idénticos y la gente aprende a ignorar el canal — que es
  cómo muere un sistema de alertas.
- **Y se avisa al RECUPERARSE.** Es la mitad que casi siempre falta: sin ese
  mensaje, el que recibió la alerta se queda mirando el teléfono.
- **No reinicia nada.** launchd y el watchdog local ya tienen la recuperación; un
  monitor que además actúa duplica esa lógica y se pelea con quien la tiene.

**Limitación declarada:** el cron de GitHub es best-effort y se atrasa 5–15 min.
Detecta caídas de minutos, no blips de segundos. Se acepta a conciencia — el
agujero que había era una caída de tres minutos que no vio nadie.

### 29-bis. El errno dice de qué clase es el fallo, y ahorra el diagnóstico equivocado

`sendmsg: network is unreachable` (ENETUNREACH) es **el sistema operativo
diciendo que no hay ruta**: la interfaz perdió su dirección. No es un timeout, no
es Cloudflare, no es la app. Si hubiera sido un corte del ISP con el enlace
arriba, el error habría sido un timeout (ETIMEDOUT), y eso apunta a otro lado.

Leer el errno antes de abrir el código ahorra la hora que se pierde buscando en
la aplicación un fallo que estaba tres capas más abajo.

**Y el dato estructural que destapó el incidente:** producción corría sobre
**Wi-Fi** (`en0` Ethernet inactivo, ruta por defecto en `en1`). Una
desasociación de Wi-Fi produce ENETUNREACH exactamente así. La degradación venía
de antes y sobrevivió a un reinicio completo de la máquina — 0 fallas de conexión
del túnel el 29, **1262 el 30**, 638 en las primeras 11 h del 31 — o sea que no
era la mini: era el camino de red.

### 30. Un log sin hora es inútil justo en el único momento en que se lee

Al reconstruir la caída, `lila` y `chat` se pudieron leer minuto a minuto —tienen
logger propio— y `portal-err.log` **no tenía una sola marca de tiempo**. No hubo
forma de saber qué hizo Portal durante el corte. Lo mismo torre, lilastore y
auth, que solo repetía `constroad-auth escuchando en 127.0.0.1:4002` sin decir
cuándo.

Un log se escribe todos los días y se lee **una vez, durante una caída**,
comparándolo contra otros logs y contra un reporte de WhatsApp con hora. Sin
marca de tiempo, ese día no sirve para nada.

- **La hora es la de la OBRA** (`America/Lima`), no UTC. Obligar a restar cinco
  horas en medio de una caída es cómo se diagnostica mal.
- **El formato tiene que ser el MISMO en todos los servicios** (`YYYY-MM-DD
  HH:MM:SS`): así los logs se pegan y se ordenan como texto.
- **Se envuelven TODOS los métodos de consola**, no solo `log`: `info`, `warn`,
  `error` y `debug` son propiedades independientes y reasignar `log` no las toca.
  Es la misma trampa que dejó pasar 1396 volcados con claves en claro en
  lila-app.
- **La marca va como argumento aparte, no concatenada al primero**: concatenarla
  convierte un objeto en `[object Object]` y borra el detalle que se logueaba.
- **Se instala como efecto del IMPORT.** En ESM los `import` se hoistean: un
  `import { instalar }` seguido de `instalar()` corre **después** de que
  cargaron los demás módulos, y todo lo que ellos loguean al cargarse sale sin
  hora. Ver la #31.

Se descartó hacerlo en el plist —pasar la salida por un `ts` en
`ProgramArguments` cubriría hasta el banner del framework— porque mete un wrapper
entre launchd y el proceso, exige `bootout`+`bootstrap` de los seis servicios, y
cambia de quién es el exit code. **Un arreglo de observabilidad no puede
arriesgar la supervisión de producción.**

### 31. En ESM, «importalo primero» no alcanza: los imports se hoistean

Se escribió el arreglo de la #30 en `constroad-auth` así:

```ts
import { instalarTimestampDeLogs } from './log-timestamp.ts';
instalarTimestampDeLogs();          // ← corre TARDE

import express from 'express';
import { base } from './db.ts';
```

Parece «primero de todo» y no lo es. ESM **evalúa todos los `import` antes que
cualquier línea del cuerpo del módulo**, así que `express`, `config` y `db` ya
cargaron —y ya loguearon— cuando se ejecuta esa llamada.

El arreglo es que la instalación sea un **efecto del import**, y que el import
vaya primero y a secas:

```ts
import './log-timestamp.ts';   // se instala al cargarse
import express from 'express';
```

Vale para cualquier cosa que tenga que correr antes que todo: hijacks de consola,
instrumentación, guards de entorno. **Si el orden es el arreglo, el orden tiene
que estar en el sistema de módulos, no en el orden de las sentencias.**

### Checklist de observabilidad de un servicio expuesto

- [ ] ¿Hay un chequeo **desde fuera de su máquina**? (si no, un corte de red del
      host es indetectable)
- [ ] ¿El chequeo distingue «roto» de «no pude evaluar», y calla en el segundo?
- [ ] ¿Alerta solo en la transición, y también al recuperarse?
- [ ] ¿Los logs llevan hora, en la zona de la obra y en el mismo formato que los
      demás servicios?
- [ ] ¿Lo que tiene que correr primero se instala por import, no por llamada?
