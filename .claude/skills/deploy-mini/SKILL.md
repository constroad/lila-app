---
name: deploy-mini
description: Invariantes de DESPLIEGUE y OPERACIÓN en la Mac mini (web Next, API Express, o cualquier app con build). Usar SIEMPRE al tocar `scripts/deploy.sh`, plists de launchd, workflows de GitHub Actions, el arranque de un servicio, o al dar de alta una app nueva. También al DIAGNOSTICAR: "el deploy tarda una eternidad", "el build se cuelga", "el servicio no levanta", "arranca a mano pero no como daemon", "el sitio quedó lento después de deployar", "la CI bloquea el deploy", "la página se rompió tras un deploy". Nace de un día completo de incidentes reales (14/08/2026) con 30 min de caída de producción. Ref: lecciones #17-#28 de `specs/OBSERVABILITY-ALERTING.spec.md`.
---

# Despliegue en la Mac mini — invariantes

Ocho horas de incidentes destilados. Cada regla costó una caída, media hora de
diagnóstico equivocado, o usuarios reportando lentitud. **Ninguna es teórica.**

## 0. La regla que las contiene a todas

**Verificá lo que importa, no lo que es cómodo de medir.** Casi todos los errores
de abajo son casos particulares de esto: dar por bueno un código de salida en vez
del artefacto, medir tests con la máquina ociosa, confirmar que un proceso arranca
sin confirmar que *termina* de arrancar.

## 1. Verificación: el eslabón que se rompe

- **Verificá el ARTEFACTO, no el código de salida.** `next build` puede salir 0 sin
  dejar `.next`. Comprobá que el archivo exista (#17).
- **Verificá que ese artefacto sea EL QUE CORRE.** Un health check contra un puerto
  responde "alguien atiende ahí", no "la versión nueva anda". Si el plist todavía
  apunta al árbol viejo, el proceso anterior contesta y el deploy miente (#21).
  Comprobalo levantando la release en un puerto libre.
- **Un proceso que arranca no es un proceso que arrancó.** Mirar 6 s de salida y
  concluir "funciona" es cómo se rompe producción: el cuelgue puede estar en el
  segundo 7. Verificá la línea que prueba el arranque COMPLETO.

## 2. Lo que hace un deploy y lo que NO

**Debe correr en la mini:** el build. Nada más. (Medido: 2 s en lila.)

**No debe correr en la mini:** los tests. Se midieron en "21 s" con la máquina
ociosa; en un deploy real —compilando y sirviendo a la vez— fueron 366 s y los
usuarios reportaron lentitud. En una máquina compartida con producción el costo de
una tarea no es su duración: **es su duración por lo que degrada mientras corre**
(#25). Van al CI, en compute ajeno.

**El CI no debe bloquear el deploy.** Un exit code espurio de jest, con 6.580 tests
en verde, dejó producción sin poder desplegar. Lo que protege de verdad está en la
mini: build fallido no mueve `current`, y hay auto-rollback. Un test rojo se ve y
se arregla; una CI trabada te deja sin hotfix.

**Y "no bloquea" hay que verificarlo en los candados, no en el diseño.** Con
`concurrency` a nivel de workflow el candado lo toma el run ENTERO, tests
incluidos: un job colgado hasta el techo de 6 h de GitHub retrasó un deploy 4 h 28
min y **descartó tres commits del medio sin avisar** —GitHub cancela todo lo
pendiente menos lo último—. Va dentro del job que hay que serializar, y todo job
lleva `timeout-minutes` (#27).

**Nunca reinstales dependencias idénticas.** Comparar el hash del **lockfile** (no
del `package.json`: el lockfile determina el árbol exacto). Medido: 432 s de `npm
ci` para llegar bit por bit a lo mismo.

## 3. Un build que "se cuelga" casi siempre es memoria

V8 al llegar al techo de heap entra en espiral de GC: **92% de CPU, proceso vivo,
log sin errores, y cero avance**. Duró 38 minutos y mandó a investigar dos cambios
que no tenían nada que ver.

- **El único indicador honesto es si la SALIDA crece.** Medí el tamaño del
  directorio de build dos veces separadas por 30 s. Desmiente en un minuto lo que
  horas de logs no aclaran.
- **Todo build automatizado lleva techo de tiempo.** Sin él, la única forma de
  enterarse es que un humano mire.
- **El techo de heap no es "cuánta memoria usa"**: es dónde V8 deja de intentar.
  Ponerlo apenas por encima del pico garantiza que el próximo commit lo rompa.

**Y el caso hermano, que es peor porque no deja rastro:** cuando el build *casi*
entra, el sistema operativo tapa el faltante con swap y no falla — sale con 0, con
el artefacto correcto, tardando 5×. Medido: el build de Portal pica en 2.746 MB y
arranca con 2.204 MB libres; 146 s en aislamiento, **716 s** con otro deploy en
paralelo. Ante un paso lento, **medilo en aislamiento antes de tocar nada**: separa
"regresión" de "contención", que se arreglan al revés. Y compará el pico contra la
memoria **libre**, no contra la total (#28).

## 4. Symlinks: donde Node te traiciona

- **`import.meta.url` da la ruta FÍSICA; `process.argv[1]` da la escrita.** Con
  releases bajo un symlink (`current`), comparar esas dos cadenas para decidir "¿me
  ejecutaron directamente?" **siempre da falso**. El proceso carga todo, monta
  rutas, no imprime un error, y nunca llama a `startServer()`. Comparalas con
  `fs.realpathSync` (#26, 30 min de caída).
- **Un almacén de dependencias compartido debe llamarse `node_modules`.** Node
  resuelve el symlink a la ruta real y busca los paquetes hermanos subiendo por
  directorios con ese nombre exacto. Con otro nombre falla con "Cannot find
  module", que no se parece a "el symlink está mal".

## 5. launchd

- **`KeepAlive` ya reinicia lo que se cae.** Un wrapper que respawnea por su cuenta
  no agrega nada y **anula** la supervisión: launchd nunca ve la caída.
- **LaunchDaemon, no LaunchAgent**, y **FileVault apagado**: es lo que hace que todo
  arranque tras un corte sin que nadie inicie sesión.
- **Cambiar `ProgramArguments` exige `bootout` + `bootstrap`.** `kickstart` relee
  la definición cacheada y revive en la ruta vieja.
- **`bootout` no es instantáneo.** Encadenarlo con `bootstrap` sin esperar hace que
  launchd rechace el segundo — y si tragás el error, el servicio queda descargado.
  **Nunca `2>/dev/null` en un comando cuyo resultado no verificás.**
- **Matá el GRUPO de procesos, no el padre.** El trabajo pesado está en los hijos;
  matar solo al padre deja un build huérfano comiéndose la máquina. Y `SIGTERM`
  antes que `SIGKILL`: los `trap` liberan candados.

## 6. Config ausente: fallar, nunca callar

- Si un archivo declarado no está, **abortá diciéndolo**. El bucle que "no hace
  nada" cuando falta el `.env` deja compilar sin variables y sin una línea de log.
  En Next es peor: el middleware las inlinea al compilar, así que la release queda
  rota de forma permanente.
- **Los tests corren con `NODE_ENV=test`.** Heredar `production` hace que los guards
  fail-closed lancen excepción: 1.258 tests "fallando" con el código sano.
- **`npm ci` omite devDependencies si `NODE_ENV=production` está en el entorno.**
  Usá `--include=dev` explícito. El bug depende de quién invoca, no de qué hace.
- **En bash 3.2 (macOS), un array vacío con `set -u` aborta.** Usá
  `${ARR[@]+"${ARR[@]}"}`.

## 7. Un deploy no debe notarse

- **Conservá los estáticos de releases anteriores.** Los chunks llevan hash de
  contenido; los del runtime cambian en cualquier build. La pestaña abierta pide
  los viejos, recibe 404, y el usuario ve "Application error" mientras el servidor
  responde 200 a todo. Probar con curl o en incógnito da todo verde (#22).
- **Una mitigación que se alimenta de su propia salida acumula sin techo.** Se ve
  contando, no midiendo el tamaño.
- **Avisá el resultado por un canal externo.** Un deploy exitoso se nota porque el
  cambio aparece; **uno fallido no se nota**, porque el auto-rollback deja
  producción sana y silenciosa sirviendo lo viejo.

## 8. Diagnóstico: no confundir "no pude ver" con "no pasó"

- Un contador que empieza hoy **no puede hablar de ayer**. Reportar "nunca pasó"
  cuando la medición es nueva manda a arreglar lo que estaba bien.
- **Un navegador limpio no reproduce los fallos de sesión/caché.** No sirve como
  descarte.
- **Antes de optimizar el paso sospechoso, medí TODOS los pasos.** El desglose del
  deploy de 31 min: 840 s de candado, 432 s de instalación innecesaria, 366 s de
  tests… y 2 s de build. El desperdicio estaba donde nadie miraba.
- **Y medí el entorno, no solo el proceso.** Un servidor con apps de escritorio
  abiertas —Chrome y Claude sostenían 1.915 MB contra los 316 MB de los tres
  servicios juntos— tiene el 24 % de la máquina comprometido en algo que no
  aparece en ningún panel de deploys.

## 9. Apps que NO corren en la mini (React Native, APKs)

No tienen puerto, servicio, health check ni hostname. **Declaralas con un tipo
explícito y rechazá esos campos**: inventarlos para pasar una validación es como se
corrompen los registros, y deja el diagnóstico en rojo permanente reportando que un
servicio inexistente no responde — ruido que entrena a la gente a ignorar el panel.

## Checklist antes de tocar un pipeline

- [ ] ¿Verifico el artefacto, y que sea el que corre?
- [ ] ¿El build tiene techo de tiempo y de memoria, medidos y con margen?
- [ ] ¿Los tests corren fuera de la máquina de producción, con `NODE_ENV=test`?
- [ ] ¿La CI puede bloquear un hotfix? (no debería — mirá los candados, no el diseño)
- [ ] ¿Todo job del CI tiene `timeout-minutes`? (el default son 6 horas)
- [ ] ¿El pico del build entra en la memoria LIBRE, no en la total?
- [ ] ¿Se reinstalan dependencias idénticas?
- [ ] ¿Config declarada y ausente falla diciéndolo?
- [ ] ¿El deploy avisa su resultado, sobre todo cuando falla?
- [ ] ¿Probé el flujo con algo que la máquina NO conozca? (el 0-1 solo se rompe la
      primera vez)
