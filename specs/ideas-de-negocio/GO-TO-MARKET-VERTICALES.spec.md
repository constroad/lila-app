# Go-to-market — bots de WhatsApp por verticales (estudio de mercado y venta)

> **Qué es esto:** el "a quién le vendemos y cómo", separado del "qué
> construimos" (ese es `../WHATSAPP-AGENT-VERTICALS.spec.md`). Nace del análisis
> del 30/07/2026, con datos de mercado verificados en esa fecha.
> **Contexto:** ConstRoad sin ventas suficientes; el objetivo es ingreso
> recurrente propio en semanas, no en trimestres. Todo lo de acá se juzga contra
> eso.
> **Documentos relacionados:**
> - `../WHATSAPP-AGENT-VERTICALS.spec.md` (producto, fases F1–F8, runbook piloto)
> - `../../../Portal/specs/modules/FLOTA-TRANSPORTE.spec.md` (vertical transporte completo)
> - `IDEAS-DESCARTADAS.md` (qué se evaluó y por qué NO)

## 1. Los tres números que mandan

| Dato | Valor | Qué implica para nosotros |
|---|---|---|
| Mypes formales en Perú | 2.4 millones (20.6% del PBI) | Mercado enorme y sin atender |
| Cómo venden | 67.5% por redes/WhatsApp; 12.8% tienda online; **0.4% app móvil** | **No vender "una app": vender algo que vive dentro del WhatsApp que YA usan** |
| Comercio conversacional LATAM | $18.2B, +35% anual, **72% por WhatsApp**; Perú entre los de mayor crecimiento junto a Colombia | El canal está validado; no hay que evangelizar |

Complementos: micro-negocios pasaron de 12% a 28% de adopción de WhatsApp
Business entre 2023 y 2025; los negocios con agentes IA reportan ~67% más
ventas y ~340% más capacidad de atención. El sector gastronómico peruano fue
pionero en integrar pedidos por WhatsApp — por eso es el vertical de entrada.

**Precio de la competencia (Perú, 2026):** agencias cobran **S/550–1,500/mes**
(plataforma + API + mantenimiento); las plataformas self-service arrancan en
**S/89–150/mes** pero el dueño tiene que configurarlas solo.

**Nuestro hueco: hecho-para-ti a precio de plataforma.** Setup S/300 +
**S/149/mes**, con onboarding done-for-you. Contra el ancla de S/550–1,500 somos
la opción obvia; contra el self-service, el dueño no toca nada.

## 2. Verticales, en orden de ataque

| # | Vertical | Por qué | Precio |
|---|---|---|---|
| 1 | **Restaurantes / pollerías / menús** | Densidad brutal (una avenida = 20 prospectos), dolor diario, el rubro ya pide por WhatsApp | S/300 + S/149/mes |
| 2 | **Citas** (barberías, dentistas, spas, gimnasios, lavaderos) | Mismo motor, otra plantilla. Dolor #1 = no-shows; el bot recuerda y reactiva inactivos | S/300 + S/149/mes |
| 3 | **Ferreterías, proveedores de construcción, transportistas** | ES el dominio de José: nadie le gana en credibilidad. Cotizador PDF y evidencia de despacho = Portal recortado | S/250–400/mes |
| 4 | **Landings + ficha de Google** | One-off de caja inmediata mientras el recurrente crece; siempre con el bot como upsell | S/300–500 one-off |

**Regla de foco:** un vertical hasta tener 10 clientes pagando. Cinco verticales
a medias = cero ingresos.

## 3. El diferenciador (por qué no es "una app más")

El bot que solo responde lo cancelan al mes 3. Lo que retiene es que **el dueño
reciba valor sin abrir ningún panel**: cada lunes, un WhatsApp generado por IA
con "vendiste S/2,340 (+12%), tu plato estrella fue X, los jueves 8pm pierdes
pedidos por demora — activa respuesta de espera". Eso es un empleado virtual, no
un software. Es la F6 del spec de producto y es la palanca anti-churn.

Por vertical: upsell automático en pedidos (restaurantes), reducción de no-shows
y reactivación (citas), cotización desde una foto de la lista de materiales
(ferreterías).

## 4. Cómo se vende (esto decide todo)

1. **Demo con SUS datos, nunca genérica.** Antes de entrar al local, se carga su
   carta (foto de la carta física → el LLM la estructura, F5). Se entra y se le
   dice: *"escríbale a este número y pídale un cuarto de pollo"*. Cuando el dueño
   ve SU menú respondiendo solo, la venta está hecha. Cuesta 15 minutos de
   preparación.
2. **Puerta fría por clusters**: una galería, un mercado, una cuadra gastronómica
   por día. Meta 5 demos/día.
3. **Primera victoria en 24 horas**: el negocio recibe su primer pedido real por
   el bot el mismo día de instalación. El onboarding lo hace José completo (el
   dueño no configura nada) — un buen onboarding sube la retención ~69%.
4. **Enganche (modelo Hook)**: el resumen semanal es el *gatillo* que lo trae de
   vuelta; su catálogo, historial y clientes viven en nuestro sistema
   (*inversión* = costo de cambio). Cobro mensual por Yape/Plin, sin contrato:
   fricción mínima para entrar, razones para no salir.
5. **Referidos**: 1 mes gratis por cada negocio referido que pague. Las mypes se
   copian entre vecinas — el bot de la pollería lo ve la cevichería de al lado.
6. **TikTok/Reels**: videos de 30s del bot tomando pedidos reales.

## 5. Plan 90 días

| Ventana | Trabajo | Meta |
|---|---|---|
| Días 1–14 | Empaquetar demo de restaurantes (F1–F3 del producto) + landing propia + 3 videos. 10 demos presenciales | **3 clientes pagando** |
| Días 15–45 | Llegar a 10 clientes; onboarding a <2 h; resumen semanal IA vivo. Landings en paralelo por caja | 10 clientes |
| Días 45–90 | Segundo vertical (citas) + programa de referidos | **25–30 clientes ≈ S/4,500/mes** recurrente + setups |

Proyección: 100 clientes (12–18 meses) ≈ S/15,000/mes con costo marginal bajo.

**Verdad incómoda de caja:** los **setups y landings son el ingreso de ESTE
mes**; el recurrente es el de dentro de tres. Se necesitan ambos frentes.

## 6. Puente rápido para transporte (antes del módulo Flota completo)

El módulo Flota (`FLOTA-TRANSPORTE.spec.md`) es un ERP: F0 + F1–F5, 2–4 meses.
Demasiado lento para la urgencia de caja. Existe una versión mínima vendible
mucho antes: **liquidación por viaje vía WhatsApp**. El transportista (o su
chofer) manda al bot la foto del vale de combustible, peajes y el flete; el
agente estructura los datos (misma técnica que la foto de la carta) y responde
*"este viaje te dejó S/312 de margen"*, más un resumen semanal por unidad.

Es el §3.7 de Flota sin GPS, sin llantas y sin compliance — solo `trip` y
`trip-settlement` simplificados — montado sobre el runtime del bot. Permite
cobrarle al rubro transporte en semanas; el módulo Flota completo pasa a ser el
upsell natural de quien muerda.

## 7. Riesgos comerciales (no técnicos)

| Riesgo | Mitigación |
|---|---|
| Churn alto de mypes | Resumen semanal IA + done-for-you; sin eso cancelan al mes 3 |
| Dispersión entre verticales | Un vertical hasta 10 clientes pagando |
| Vender antes de tener handoff humano | NO firmar clientes reales antes de F3 (el bot pisando al dueño = cancelación) |
| Prometer inmunidad de baneo | Vender el canal sin promesas absolutas; Cloud API (F8) es la contingencia |
| Un bot caído en hora pico | Antes del cliente #5: watchdog por horario del negocio (F7) |
| Un solo operador (José) | Onboarding <30 min, comandos `!` para autoservicio, alertas centralizadas |

## 8. Fuentes (verificadas 30/07/2026)

- KAME — digitalización de mypes en Perú: https://www.kame.pe/noticias/2025/05/la-digitalizacion-impulsa-el-crecimiento-de-las-mypes-en-peru/
- AiBi (UDES) — plataformas digitales en MYPEs de Lima: https://revistas.udes.edu.co/aibi/article/view/3530
- PRODUCE — madurez digital de empresas peruanas: https://ogeiee.produce.gob.pe/index.php/en/oee-documentos-publicaciones/publicaciones-anuales/item/1151-madurez-digital-en-las-empresas-peruanas
- Aurora Inbox — adopción WhatsApp Business LATAM: https://www.aurorainbox.com/en/2026/03/05/whatsapp-business-latam-adoption/
- Aurora Inbox — ecommerce por WhatsApp LATAM: https://www.aurorainbox.com/en/2026/03/04/ecommerce-statistics-whatsapp-latam/
- PIBOT — cuánto cuesta un chatbot IA en Perú: https://pibot.pe/blog/cuanto-cuesta-chatbot-ia-whatsapp-peru
- AdraTech — precios de chatbots WhatsApp Perú: https://adratechsystems.com/recursos/chatbot-whatsapp-negocios-peru
- SalesGroup — retención en SaaS (onboarding y churn): https://salesgroup.ai/customer-retention-strategies-for-saas-companies/
