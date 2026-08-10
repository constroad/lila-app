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
