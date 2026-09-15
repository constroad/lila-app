# Diseños de Dali (Stitch)

Proyecto Stitch `10416531549338173240`, design system `assets/15899208091892470814`.
Los IDs de cada pantalla por dispositivo están en `specs/DALI-pantallas.md`.

- `html/<pantalla>.<DEVICE>.html` — el HTML generado por Stitch (Tailwind por CDN,
  Material Symbols y Google Fonts: **no se copia tal cual**, se traduce a los
  componentes y tokens de `src/`). Sirve para tokens, medidas y estructura.
- Las **capturas a resolución completa** (780×2076 móvil, 2560×2048 tablet y
  escritorio; 39 MB en total) viven fuera del repo, en
  `~/.cache/lila-app/dali-design/shots/<pantalla>.<DEVICE>.png`. Se bajan con la
  URL `screenshot.downloadUrl` de cada pantalla más el sufijo `=d` (sin sufijo
  Google devuelve una miniatura de 192 px). El CLI para hablar con Stitch está en
  `~/.cache/lila-app/dali-design/stitch.mjs` (`get_screen projects/<p>/screens/<id>`).

Regla de trabajo (`constroad-premium-ui` §0): antes de escribir una pantalla se
abre SU captura (las tres, móvil/tablet/escritorio) en ese mismo mensaje; al
cerrarla se lista el diff por composición contra la captura.
