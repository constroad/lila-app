import { DocumentSchema } from './types';

const CLAUSULA1_DEFAULT = `EL CLIENTE está dedicada a la Elaboración de Perfiles y Expedientes, Ejecución y Supervisión de Obras Públicas y Privadas.

EL PROVEEDOR, empresa jurídica, que declara tener conocimiento y todo tipo de obras de pavimentación y que cuenta con especialista y maquinaria necesarias para poder desarrollar la presente obra.`;

const CLAUSULA2_TRABAJOS_DEFAULT = `Los trabajos a realizar tendrán las siguientes características básicas, las cuales no son limitativas:

a) Movilización y desmovilización de maquinarias y herramientas
Bajo esta partida el subcontratista deberá ejecutar las acciones necesarias para suministrar y transportar los elementos necesarios de su organización al lugar del servicio, incluyendo, equipos mecánicos, materiales, herramientas y en general todo lo necesario para instalar y empezar los trabajos.

b) Seguridad y salud en el trabajo - Equipos de protección individual
Comprenden los equipos de protección individual (EPP) que deben ser utilizados por el personal del servicio a ejecutar, para estar protegidos asociados a los trabajos que se realicen, de acuerdo a la Norma G.050 Seguridad durante la construcción, del Reglamento Nacional de Edificaciones.

c) Fresado, imprimación, riego de liga y carpeta asfáltica en caliente
Cuando corresponda según las partidas contratadas, EL PROVEEDOR ejecutará fresado de carpeta asfáltica, imprimación asfáltica MC-30, riego de liga, colocación de carpeta asfáltica en caliente y elementos complementarios.

EL PROVEEDOR deberá realizar todos los ensayos de los materiales empleados, de acuerdo a la Norma Técnica de Edificaciones CE 010, Pavimentos Urbanos, y proporcionar los certificados de calidad y garantía de los trabajos efectuados. Las partidas y metrados aplicables constarán en el anexo o cuadro contractual correspondiente.`;

const CLAUSULA4_DEFAULT = `EL CLIENTE se obliga a pagar la contraprestación a EL PROVEEDOR en Soles, de la siguiente manera:

EL PROVEEDOR se obliga a entregar a EL CLIENTE las guías de remisión remitente, por los materiales y/o servicios que realizara día a día, para poder efectuar el pago correspondiente.

Los pagos se realizarán de acuerdo a los avances de obra verificados y aprobados por la supervisión, de acuerdo al siguiente cronograma de pagos:

- Abono 01: Al inicio de trabajos, previo a la movilización de equipos.
- Abono 02: A la mitad de ejecución de la obra, previa valorización aprobada.
- Abono 03: A la finalización y conformidad de todos los trabajos.

EL CLIENTE efectuará los pagos mediante depósito bancario a las cuentas indicadas por EL PROVEEDOR en el presente contrato, dentro de los 15 días calendario contados desde la presentación de la factura correspondiente.`;

const CLAUSULA5_DEFAULT = `El plazo de ejecución de la prestación se extenderá desde el día siguiente de la suscripción del presente contrato, hasta que EL CLIENTE otorgue la conformidad del cumplimiento de la prestación a cargo de EL PROVEEDOR y se efectuará la recepción, debiendo considerarse como ejecutada al término de dicho plazo.

El inicio de los trabajos está condicionado a que EL CLIENTE proporcione el acceso a la obra y las condiciones previas necesarias para la ejecución, incluyendo la base terminada que cumpla con las especificaciones técnicas del expediente.

La conformidad del servicio será otorgada por EL CLIENTE en un plazo no mayor a 10 días calendario contados desde la culminación de los trabajos, previa verificación del cumplimiento de las especificaciones técnicas.

En caso de incumplimiento del plazo por causas imputables a EL PROVEEDOR, se aplicará una penalidad de 0.10% del monto del contrato por cada día de retraso, hasta un máximo del 10% del monto total.

RENDIMIENTO PACTADO. El plazo se calcula sobre los rendimientos acordados en el Anexo 2 (Cronograma de Ejecución). Esos rendimientos son la referencia contractual del avance: el cumplimiento del plazo se evalúa contra ellos y no contra expectativas no pactadas.

El cronograma asume frentes de trabajo continuos y disponibles. Si EL CLIENTE entrega frentes parciales, discontinuos o en menor cantidad que la prevista, o si el rendimiento se ve afectado por causas ajenas a EL PROVEEDOR, el plazo se ampliará en la proporción correspondiente conforme a la cláusula de ampliaciones de plazo.`;

const CLAUSULA6_DEFAULT = `El presente contrato se rige por la voluntad de las partes expresada en este documento y sus anexos, y supletoriamente por el Código Civil peruano, en particular las disposiciones del contrato de obra (artículos 1771 y siguientes) y de prestación de servicios.

Este contrato es celebrado entre partes privadas: el régimen de contrataciones públicas (Ley N° 32069 y su Reglamento) NO le resulta aplicable, salvo pacto expreso y por escrito de las partes cuando el servicio se ejecute como parte de un contrato principal celebrado con una Entidad, y únicamente respecto de las obligaciones técnicas expresamente incorporadas por remisión.

Son también aplicables las normas técnicas y de seguridad vigentes, en particular la Norma G.050 Seguridad durante la construcción del Reglamento Nacional de Edificaciones y la Norma Técnica CE.010 Pavimentos Urbanos.

El presente contrato se celebra bajo el sistema de PRECIOS UNITARIOS: EL CLIENTE pagará el metrado REALMENTE EJECUTADO y verificado, aplicando los precios unitarios pactados en el Anexo de partidas. Los mayores metrados ejecutados por indicación de EL CLIENTE o de la supervisión se pagan al precio unitario pactado, sin necesidad de nueva negociación de precio.`;

const CLAUSULA7_DEFAULT = `EL CLIENTE entrega a EL PROVEEDOR el acabado de la base cumpliendo con las especificaciones técnicas del expediente junto con los certificados y ensayos de compactación previos a la imprimación asfáltica, siendo responsabilidad de EL CLIENTE las fallas de los niveles de terminación del terreno.

Dar las garantías del caso para la buena ejecución de la obra, así mismo todo pago sindical será cubierto por EL CLIENTE.

Para la ejecución de trabajos adicionales, distintos a los especificados en el presente contrato y no contemplados en el mismo, se requiere de común acuerdo de las partes la suscripción de la CLÁUSULA adicional respectiva.

EL PROVEEDOR es responsable por el personal que lleva a obra (Cuadrilla), por lo que debe entregar al inicio del servicio copia de los DNI del personal, así como el SCTR al Residente, para que puedan ingresar a obra.

EL PROVEEDOR garantiza que la mezcla asfáltica en caliente llegará al lugar de ejecución con una temperatura mínima de 135 °C, salvo especificación técnica distinta acordada por escrito.

El espesor de la carpeta asfáltica será el definido en las partidas o especificaciones técnicas contratadas y será controlado durante la colocación.

GARANTÍA Y PLAZO DE RESPONSABILIDAD. EL PROVEEDOR responde por los vicios de construcción imputables a su prestación conforme al artículo 1784 del Código Civil, esto es, dentro del plazo de CINCO (5) AÑOS contados desde la aceptación de la obra. Dicha responsabilidad NO comprende: (i) fallas de la subbase, base, terreno de fundación o niveles de terminación entregados por EL CLIENTE; (ii) defectos derivados de materiales, estudios, planos o especificaciones proporcionados por EL CLIENTE; (iii) daños por uso indebido, sobrecarga, falta de mantenimiento o intervención de terceros; ni (iv) desgaste natural.

Conforme al artículo 1783 del Código Civil, EL CLIENTE deberá comunicar a EL PROVEEDOR las diversidades o los vicios de la obra dentro de los SESENTA (60) DÍAS siguientes a la recepción, bajo sanción de caducidad. La acción correspondiente caduca al AÑO computado desde el día siguiente de dicha comunicación.

LÍMITE DE RESPONSABILIDAD. La responsabilidad total y acumulada de EL PROVEEDOR por cualquier concepto derivado de este contrato no excederá el monto contractual efectivamente pagado. En ningún caso EL PROVEEDOR responderá por daños indirectos, lucro cesante, pérdida de producción, penalidades que EL CLIENTE haya pactado con terceros, ni por daño moral, salvo dolo o culpa inexcusable acreditados.`;

const CLAUSULA8_DEFAULT = `TRATO DIRECTO. Toda controversia derivada de la interpretación, ejecución o resolución de este contrato será resuelta primero en trato directo, en un plazo de DIEZ (10) DÍAS HÁBILES desde que una parte notifique a la otra por escrito. Este plazo NO suspende la obligación de pago de las valorizaciones no controvertidas.

ARBITRAJE. De no llegarse a acuerdo, la controversia se someterá a arbitraje de derecho, institucional y con árbitro ÚNICO, administrado por el Centro de Arbitraje de la Cámara de Comercio de Lima conforme a su Reglamento vigente. La sede del arbitraje es la ciudad de Lima, el idioma es el castellano y la ley aplicable es la peruana. El laudo es definitivo e inapelable, tiene valor de cosa juzgada y se ejecuta como una sentencia.

Los costos del arbitraje serán asumidos inicialmente por partes iguales y en definitiva por la parte vencida, conforme lo determine el laudo.

COBRANZA. Las pretensiones de EL PROVEEDOR referidas exclusivamente al COBRO de valorizaciones o facturas no observadas dentro del plazo contractual podrán tramitarse, a su elección, en la vía judicial ante los jueces de Lima Cercado, sin necesidad de arbitraje previo. Un arbitraje NO es el camino para cobrar una factura que nadie objetó.`;

const CLAUSULA9_DEFAULT = `Las partes contratantes han declarado sus respectivos domicilios en la parte introductoria del presente contrato. Cualquier cambio de domicilio deberá ser comunicado por escrito a la otra parte con una anticipación mínima de 5 días hábiles.`;

const CLAUSULA10_DEFAULT = `ALCANCE EXCLUIDO. Salvo pacto expreso y por escrito, NO forman parte del alcance de EL PROVEEDOR ni de su precio: (i) la ejecución, corrección o saneamiento de la subbase, base y terreno de fundación, ni sus niveles de terminación; (ii) el retiro de desmonte, material excedente o interferencias preexistentes; (iii) desvíos vehiculares, señalización externa y control de tránsito; (iv) licencias, permisos, autorizaciones municipales y servidumbres; (v) suministro de agua y energía en obra; (vi) vigilancia y custodia fuera del horario de trabajo; (vii) pagos sindicales o cupos de cualquier naturaleza; y (viii) toda partida no listada en el Anexo de presupuesto.

CONDICIONES PREVIAS. EL PROVEEDOR iniciará los trabajos únicamente cuando EL CLIENTE haya cumplido las condiciones previas del cuadro siguiente. El plazo contractual empieza a correr desde el cumplimiento de la ÚLTIMA de ellas, y no antes.

Si vencida la fecha prevista de inicio las condiciones previas no están cumplidas por causa no imputable a EL PROVEEDOR, este tendrá derecho a: (a) la ampliación del plazo por el tiempo equivalente; (b) el reconocimiento de los costos de permanencia de equipos y personal conforme al tarifario de la cláusula siguiente; y (c) de superarse los treinta (30) días calendario, a resolver el contrato sin penalidad, con pago de lo ejecutado y de la desmovilización.`;

const CLAUSULA11_DEFAULT = `REAJUSTE DE PRECIOS. Los precios unitarios se pactan a la fecha de suscripción. Si durante la ejecución el precio de los insumos principales del servicio (asfalto, cemento, acero y/o combustible, según corresponda a las partidas contratadas) varía por encima del umbral porcentual indicado en el cuadro de esta cláusula, cualquiera de las partes podrá solicitar el reajuste de los precios unitarios aún no ejecutados.

El reajuste se calculará por fórmula polinómica aplicando el coeficiente K derivado de los Índices Unificados de Precios de la Construcción publicados por el INEI, tomando como mes base el indicado en el cuadro. A falta de acuerdo dentro de los diez (10) días hábiles de solicitado el reajuste, EL PROVEEDOR podrá suspender la ejecución de las partidas afectadas sin penalidad ni responsabilidad, con la consiguiente ampliación de plazo.

TIEMPOS DE ESPERA (STAND-BY). El tiempo en que los equipos, unidades de transporte o cuadrillas de EL PROVEEDOR permanezcan inmovilizados en obra por causa imputable a EL CLIENTE —frente no liberado, demora en la descarga, falta de aprobación, interferencia no retirada, corte de vía u otras— se facturará conforme al tarifario de esta cláusula, computado a partir del tiempo de tolerancia allí indicado.

El registro del tiempo de espera se hará mediante el vale, parte diario o registro digital de EL PROVEEDOR, que se tendrá por conforme si EL CLIENTE no lo observa por escrito dentro de las cuarenta y ocho (48) horas de comunicado.`;

const CLAUSULA12_DEFAULT = `MORA DE EL CLIENTE. Vencido el plazo de pago sin que EL CLIENTE haya cancelado una factura no observada, incurrirá en mora automática, sin necesidad de intimación, devengando el interés mensual indicado en el cuadro de esta cláusula sobre el monto impago.

SUSPENSIÓN POR IMPAGO. Superado el plazo de suspensión indicado en el cuadro desde el vencimiento de una factura no observada, EL PROVEEDOR podrá suspender la ejecución previa comunicación escrita, sin que ello constituya incumplimiento ni genere penalidad alguna a su cargo. La suspensión otorga a EL PROVEEDOR ampliación de plazo por el período de suspensión, más el tiempo razonable de removilización, y el derecho al reconocimiento de los costos de desmovilización y removilización.

OBSERVACIÓN DE FACTURAS. EL CLIENTE deberá observar por escrito y de manera fundamentada cualquier valorización o factura dentro de los cinco (5) días hábiles de recibida. Vencido ese plazo sin observación, la valorización o factura se tendrá por CONFORME y exigible.

RETENCIONES Y FONDO DE GARANTÍA. De pactarse retención, esta no excederá el porcentaje indicado en el cuadro sobre cada valorización y se liberará íntegramente dentro del plazo allí señalado, contado desde la conformidad del servicio. La retención no sustituye ni se acumula a otras garantías.

RÉGIMEN TRIBUTARIO. Los precios no incluyen el IGV, que se facturará conforme a ley. La operación está sujeta al Sistema de Pago de Obligaciones Tributarias (detracción) con la tasa indicada en el cuadro, según la clasificación que corresponda a la prestación. EL CLIENTE efectuará el depósito de la detracción dentro del plazo legal; su omisión no habilita a retener ni a diferir el pago del saldo.

CESIÓN DE DERECHOS DE CRÉDITO. EL PROVEEDOR podrá ceder a terceros, total o parcialmente, sus derechos de crédito derivados de este contrato (incluido el factoring), bastando la comunicación escrita a EL CLIENTE. EL CLIENTE no podrá negar la conformidad de la factura por esta causa. La cesión de la POSICIÓN CONTRACTUAL sí requiere acuerdo escrito de ambas partes.`;

const CLAUSULA14_DEFAULT = `INCORPORACION LIMITADA. EL PROVEEDOR ejecuta su prestación como SUBCONTRATISTA de EL CLIENTE, quien mantiene un contrato principal con la Entidad indicada en la modalidad del contrato. Se incorporan a este subcontrato ÚNICAMENTE las obligaciones TÉCNICAS del contrato principal que sean aplicables al alcance contratado —especificaciones, normas de calidad, protocolos de ensayo y exigencias de seguridad— y siempre que hayan sido entregadas por escrito a EL PROVEEDOR ANTES de la suscripción. Lo que no se entregó no se incorpora.

LO QUE NO SE INCORPORA. No se trasladan a EL PROVEEDOR, ni directa ni indirectamente: (i) las penalidades pactadas entre EL CLIENTE y la Entidad; (ii) el régimen de responsabilidad de la contratación pública, incluido el plazo de siete (7) años —rige el plazo de CINCO (5) AÑOS del artículo 1784 del Código Civil pactado en este contrato—; (iii) la cláusula de solución de controversias del contrato principal; (iv) las garantías, cartas fianza y retenciones exigidas a EL CLIENTE como contratista principal; ni (v) cualquier obligación del contrato principal no comunicada por escrito antes de la firma.

EL PAGO NO DEPENDE DEL PAGO DE LA ENTIDAD. La obligación de EL CLIENTE de pagar las valorizaciones de EL PROVEEDOR es INDEPENDIENTE y AUTÓNOMA respecto de los pagos que la Entidad efectúe a EL CLIENTE. No se pacta cláusula de pago condicionado (pay-when-paid ni pay-if-paid): el atraso o el impago de la Entidad no suspende, difiere ni extingue el derecho de EL PROVEEDOR a cobrar en los plazos de este contrato.

INFORMACION Y COORDINACION. EL CLIENTE entregará a EL PROVEEDOR, dentro de los cinco (5) días hábiles de suscrito el contrato, los anexos técnicos del contrato principal aplicables al alcance, y le comunicará por escrito toda orden, observación o requerimiento de la Entidad o de la supervisión que afecte su prestación. La falta de traslado oportuno de una instrucción no es imputable a EL PROVEEDOR.

CAUSAS ATRIBUIBLES A LA ENTIDAD. Cuando el atraso, la paralización o el mayor costo tengan origen en la Entidad o en la supervisión, EL CLIENTE gestionará ante ella el reconocimiento correspondiente y trasladará a EL PROVEEDOR lo que obtenga, sin perjuicio de las ampliaciones de plazo y del reconocimiento de costos de permanencia previstos en este contrato, que operan de manera independiente.

RESOLUCION DEL CONTRATO PRINCIPAL. Si el contrato principal se resuelve por causa no imputable a EL PROVEEDOR, este tendrá derecho al pago íntegro de lo ejecutado y aprobado, de los materiales acopiados en obra y de los costos de desmovilización, sin penalidad alguna a su cargo.`;

const CLAUSULA13_DEFAULT = `CAUSALES. EL PROVEEDOR tiene derecho a la ampliación del plazo contractual, sin penalidad, cuando el atraso obedezca a: (i) incumplimiento de las condiciones previas o entrega tardía del frente de trabajo; (ii) base, subbase o terreno que no cumplan las especificaciones; (iii) demora de EL CLIENTE o de la supervisión en aprobaciones, absoluciones de consulta o entrega de información; (iv) atraso en los pagos a cargo de EL CLIENTE; (v) trabajos adicionales o mayores metrados ordenados por EL CLIENTE; (vi) condiciones climáticas que impidan la ejecución conforme a las especificaciones técnicas; (vii) paralizaciones dispuestas por autoridad, conflictos sociales o sindicales; y (viii) caso fortuito o fuerza mayor conforme al artículo 1315 del Código Civil.

PROCEDIMIENTO. EL PROVEEDOR comunicará por escrito la causal dentro de los cinco (5) días hábiles de producida o conocida, indicando el plazo estimado. EL CLIENTE se pronunciará dentro de los cinco (5) días hábiles siguientes; su SILENCIO se entenderá como APROBACIÓN de la ampliación solicitada.

EFECTOS. La ampliación de plazo por causa imputable a EL CLIENTE da derecho a EL PROVEEDOR al reconocimiento de los mayores gastos generales y costos de permanencia acreditados, conforme al tarifario de la cláusula de tiempos de espera.`;

export const contratoServicioSchema: DocumentSchema = {
  id: 'contrato-servicio',
  code: 'CONT-SRV',
  name: 'Contrato de Servicio',
  description: 'Contrato de colocación de mezclas asfálticas u otros servicios bajo el sistema de precios unitarios.',
  category: 'Administrative',
  version: '1.7.0',
  lastUpdated: '2026-07-30',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  backgroundImageEnabled: true,
  sections: [
    {
      id: 'titulo',
      type: 'simpleFields',
      title: 'Encabezado del Contrato',
      gridColumns: 1,
      fields: [
        {
          key: 'titulo.texto',
          label: 'TÍTULO DEL CONTRATO',
          type: 'text',
          span: 12,
          placeholder: 'CONTRATO DE COLOCACIÓN DE MEZCLAS ASFÁLTICAS EN CALIENTE...',
        },
      ],
    },
    {
      id: 'partes',
      type: 'simpleFields',
      title: 'Partes Contratantes',
      defaultCollapsed: false,
      gridColumns: 2,
      fields: [
        { key: 'proveedor.razonSocial', label: 'PROVEEDOR - Razón Social', type: 'text', span: 6 },
        { key: 'proveedor.ruc', label: 'RUC', type: 'text', span: 3 },
        { key: 'proveedor.domicilio', label: 'Domicilio', type: 'text', span: 9 },
        { key: 'proveedor.representante', label: 'Representante Legal', type: 'text', span: 6 },
        { key: 'proveedor.dniRepresentante', label: 'DNI Representante', type: 'text', span: 3 },
        { key: 'cliente.razonSocial', label: 'CLIENTE - Razón Social', type: 'text', span: 6 },
        { key: 'cliente.ruc', label: 'RUC', type: 'text', span: 3 },
        { key: 'cliente.domicilio', label: 'Domicilio', type: 'text', span: 9 },
        { key: 'cliente.representante', label: 'Representante Legal', type: 'text', span: 6 },
        { key: 'cliente.dniRepresentante', label: 'DNI Representante', type: 'text', span: 3 },
      ],
    },
    {
      id: 'clausula1',
      type: 'richText',
      title: 'CLAUSULA PRIMERA: ANTECEDENTES',
    },
    {
      id: 'clausula2Obra',
      type: 'simpleFields',
      title: 'CLAUSULA SEGUNDA: OBJETO - Datos de la Obra',
      gridColumns: 4,
      fields: [
        { key: 'obra.nombre', label: 'OBRA', type: 'text', span: 12 },
        { key: 'obra.cui', label: 'CUI', type: 'text', span: 4 },
        { key: 'obra.ubicacion', label: 'UBICACIÓN', type: 'text', span: 8 },
      ],
    },
    {
      id: 'clausula2Trabajos',
      type: 'richText',
      title: 'Descripción de los Trabajos',
    },
    {
      id: 'clausula3Monto',
      type: 'simpleFields',
      title: 'CLAUSULA TERCERA: MONTO CONTRACTUAL',
      defaultCollapsed: false,
      gridColumns: 4,
      fields: [
        { key: 'monto.total', label: 'MONTO TOTAL (S/)', type: 'currency', span: 4 },
        { key: 'monto.totalEnLetras', label: 'MONTO EN LETRAS (auto)', type: 'text', span: 8 },
        { key: 'monto.descripcionMetrado', label: 'DESCRIPCIÓN DEL METRADO', type: 'text', span: 12 },
      ],
    },
    {
      // C4 — Trazabilidad con la cotizacion que origino el contrato. Los numeros
      // salen de las partidas del servicio (`sourceQuoteNro`), no se tipean.
      id: 'cotizacionOrigen',
      type: 'simpleFields',
      title: 'ANEXO 1: Cotizacion de Origen',
      showIf: { field: 'opciones.cotizacion', operator: 'eq', value: true },
      gridColumns: 4,
      fields: [
        { key: 'cotizacion.numeros', label: 'COTIZACION N°', type: 'text', span: 4 },
        { key: 'cotizacion.fecha', label: 'FECHA DE ACEPTACION', type: 'date', span: 4 },
        { key: 'cotizacion.observacion', label: 'OBSERVACION', type: 'text', span: 4 },
      ],
    },
    {
      id: 'preciosUnitarios',
      type: 'dataTable',
      title: 'Precios Unitarios',
      defaultCollapsed: false,
      dynamicRows: true,
      minRows: 1,
      showTotals: false,
      columns: [
        { key: 'detalle', label: 'DETALLE', type: 'text', width: 300, align: 'left', editable: true },
        { key: 'unidad', label: 'UND.', type: 'text', width: 70, align: 'center', editable: true },
        { key: 'costo', label: 'COSTO (S/)', type: 'currency', width: 100, align: 'right', editable: true },
      ],
    },
    {
      id: 'clausula4FormaPago',
      type: 'richText',
      title: 'CLAUSULA CUARTA: FORMA DE PAGO Y GARANTÍA DE CRÉDITO',
    },
    {
      id: 'sectoresPago',
      type: 'dataTable',
      title: 'Partidas y Costos por Sector/Etapa',
      dynamicRows: true,
      minRows: 1,
      showTotals: false,
      columns: [
        { key: 'sector', label: 'SECTOR/ETAPA', type: 'text', width: 110, align: 'left', editable: true },
        { key: 'itemCode', label: 'ITEM', type: 'text', width: 55, align: 'center', editable: true },
        { key: 'descripcion', label: 'DESCRIPCIÓN', type: 'text', width: 190, align: 'left', editable: true },
        { key: 'unidad', label: 'UNID.', type: 'text', width: 55, align: 'center', editable: true },
        { key: 'metrado', label: 'METRADO', type: 'number', width: 70, align: 'right', editable: true },
        { key: 'precioUnit', label: 'PRECIO UNIT.', type: 'currency', width: 90, align: 'right', editable: true },
        { key: 'parcial', label: 'P. PARCIAL', type: 'currency', width: 90, align: 'right', editable: true },
      ],
    },
    {
      // C5 — Anexo 5: cronograma de pagos y adelanto. El "Abono 01/02/03" de la
      // clausula cuarta era prosa; aca es dato: hito, % y condicion de pago.
      id: 'cronogramaPagos',
      type: 'dataTable',
      title: 'ANEXO 5: Cronograma de Pagos',
      showIf: { field: 'opciones.cronogramaPagos', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 30,
      columns: [
        { key: 'hito', label: 'HITO', type: 'text', width: 60, align: 'center', editable: true },
        { key: 'descripcion', label: 'CONDICION DE PAGO', type: 'text', width: 280, align: 'left', editable: true },
        { key: 'porcentaje', label: '% DEL MONTO', type: 'number', width: 90, align: 'right', editable: true },
        {
          key: 'monto',
          label: 'MONTO (S/)',
          type: 'currency',
          width: 110,
          align: 'right',
          // Derivado del monto contractual: si el % y el monto se tipearan por
          // separado, el cuadro terminaria contradiciendo a la clausula tercera.
          computed: true,
          formula: 'round(num(monto.total) * num(row.porcentaje) / 100, 2)',
        },
      ],
    },
    {
      id: 'adelanto',
      type: 'simpleFields',
      title: 'Adelanto y Amortizacion',
      showIf: { field: 'opciones.cronogramaPagos', operator: 'eq', value: true },
      gridColumns: 4,
      fields: [
        { key: 'adelanto.porcentaje', label: 'ADELANTO (% del monto)', type: 'number', span: 2 },
        { key: 'adelanto.amortizacionPct', label: 'AMORTIZACION POR VALORIZACION (%)', type: 'number', span: 2 },
        { key: 'adelanto.garantia', label: 'GARANTIA DEL ADELANTO', type: 'text', span: 4 },
      ],
    },
    {
      id: 'cuentasBancarias',
      type: 'dataTable',
      title: 'Cuentas Bancarias del Proveedor',
      dynamicRows: true,
      minRows: 0,
      columns: [
        { key: 'banco', label: 'BANCO', type: 'text', width: 120, align: 'left', editable: true },
        { key: 'cuenta', label: 'CUENTA', type: 'text', width: 160, align: 'left', editable: true },
        { key: 'cci', label: 'CCI', type: 'text', width: 190, align: 'left', editable: true },
        { key: 'tipo', label: 'TIPO', type: 'text', width: 90, align: 'left', editable: true },
      ],
    },
    {
      id: 'clausula5Plazos',
      type: 'simpleFields',
      title: 'CLAUSULA QUINTA: INICIO Y CULMINACIÓN',
      gridColumns: 4,
      fields: [
        { key: 'plazos.fechaInicio', label: 'FECHA DE INICIO', type: 'date', span: 3 },
        { key: 'plazos.fechaCulminacion', label: 'FECHA DE CULMINACIÓN', type: 'date', span: 3 },
        { key: 'plazos.responsableInicio', label: 'RESPONSABLE DE INICIO', type: 'text', span: 6 },
        { key: 'plazos.descripcion', label: 'DESCRIPCIÓN DEL PLAZO', type: 'text', span: 12 },
      ],
    },
    {
      id: 'clausula5Texto',
      type: 'richText',
      title: 'Condiciones del Plazo',
    },
    // C3 — Anexo 2: cronograma con RENDIMIENTO PACTADO. Sin rendimiento pactado no
    // hay defensa de plazo: cualquier atraso se discute con la percepcion del
    // cliente en vez de contra un numero acordado. Gated como las de C2 para no
    // alterar los contratos ya emitidos.
    {
      id: 'cronograma',
      type: 'dataTable',
      title: 'ANEXO 2: Cronograma de Ejecucion y Rendimiento Pactado',
      showIf: { field: 'opciones.cronograma', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 100,
      columns: [
        { key: 'item', label: 'ITEM', type: 'text', width: 50, align: 'center', editable: true },
        { key: 'partida', label: 'PARTIDA / HITO', type: 'text', width: 220, align: 'left', editable: true },
        { key: 'unidad', label: 'UND.', type: 'text', width: 55, align: 'center', editable: true },
        { key: 'metrado', label: 'METRADO', type: 'number', width: 80, align: 'right', editable: true },
        { key: 'rendimiento', label: 'RENDIM. (und/dia)', type: 'number', width: 95, align: 'right', editable: true },
        {
          key: 'dias',
          label: 'DIAS',
          type: 'number',
          width: 60,
          align: 'right',
          // Derivado: metrado / rendimiento, redondeado hacia arriba. Se recalcula
          // solo al cambiar cualquiera de los dos, asi el plazo no queda mintiendo.
          computed: true,
          formula: 'num(row.rendimiento) > 0 ? Math.ceil(num(row.metrado) / num(row.rendimiento)) : 0',
        },
        { key: 'inicio', label: 'INICIO', type: 'date', width: 95, align: 'center', editable: true },
        { key: 'fin', label: 'FIN', type: 'date', width: 95, align: 'center', editable: true },
      ],
    },
    {
      id: 'clausula6Marco',
      type: 'richText',
      title: 'CLAUSULA SEXTA: MARCO LEGAL DEL CONTRATO',
    },
    {
      id: 'clausula7Responsabilidades',
      type: 'richText',
      title: 'CLAUSULA SEPTIMA: RESPONSABILIDAD DEL CLIENTE Y EL PROVEEDOR',
    },
    {
      id: 'clausula8Arbitraje',
      type: 'richText',
      title: 'CLAUSULA OCTAVA: ARBITRAJE',
    },
    {
      id: 'clausula9Domicilios',
      type: 'richText',
      title: 'CLAUSULA NOVENA: VERACIDAD DE DOMICILIOS',
    },
    // C2 — Clausulas de proteccion (CONTRATO-SERVICIO.spec.md). Van DESPUES de la
    // novena y no renumeran nada: los contratos ya emitidos conservan sus
    // ordinales. Cada una esta gated por `opciones.*`; un contrato viejo no tiene
    // esos flags, `showIf` evalua false y las clausulas NO le aparecen.
    {
      id: 'clausula10Exclusiones',
      type: 'richText',
      title: 'CLAUSULA DECIMA: ALCANCE EXCLUIDO Y CONDICIONES PREVIAS',
      showIf: { field: 'opciones.exclusiones', operator: 'eq', value: true },
    },
    {
      id: 'condicionesPrevias',
      type: 'dataTable',
      title: 'Condiciones Previas a cargo de EL CLIENTE',
      showIf: { field: 'opciones.exclusiones', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 30,
      columns: [
        { key: 'item', label: 'ITEM', type: 'text', width: 55, align: 'center', editable: true },
        { key: 'condicion', label: 'CONDICION PREVIA', type: 'text', width: 300, align: 'left', editable: true },
        { key: 'responsable', label: 'RESPONSABLE', type: 'text', width: 120, align: 'left', editable: true },
        { key: 'fecha', label: 'FECHA LIMITE', type: 'date', width: 110, align: 'center', editable: true },
      ],
    },
    {
      id: 'clausula11Ajustes',
      type: 'richText',
      title: 'CLAUSULA DECIMO PRIMERA: REAJUSTE DE PRECIOS Y TIEMPOS DE ESPERA',
      showIf: { field: 'opciones.ajustes', operator: 'eq', value: true },
    },
    {
      id: 'reajuste',
      type: 'simpleFields',
      title: 'Parametros de Reajuste',
      showIf: { field: 'opciones.ajustes', operator: 'eq', value: true },
      gridColumns: 4,
      fields: [
        { key: 'reajuste.umbralPct', label: 'UMBRAL DE VARIACION (%)', type: 'number', span: 4 },
        { key: 'reajuste.mesBase', label: 'MES BASE', type: 'text', span: 4 },
        { key: 'reajuste.indice', label: 'INDICE APLICABLE', type: 'text', span: 4 },
      ],
    },
    {
      id: 'tarifarioEspera',
      type: 'dataTable',
      title: 'Tarifario de Tiempos de Espera (stand-by)',
      showIf: { field: 'opciones.ajustes', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 30,
      columns: [
        { key: 'concepto', label: 'CONCEPTO', type: 'text', width: 260, align: 'left', editable: true },
        { key: 'unidad', label: 'UNIDAD', type: 'text', width: 80, align: 'center', editable: true },
        { key: 'tolerancia', label: 'TOLERANCIA', type: 'text', width: 100, align: 'center', editable: true },
        { key: 'tarifa', label: 'TARIFA (S/)', type: 'currency', width: 110, align: 'right', editable: true },
      ],
    },
    {
      id: 'clausula12Pagos',
      type: 'richText',
      title: 'CLAUSULA DECIMO SEGUNDA: MORA, GARANTIAS, TRIBUTOS Y CESION DE CREDITOS',
      showIf: { field: 'opciones.pagosGarantias', operator: 'eq', value: true },
    },
    {
      id: 'pagos',
      type: 'simpleFields',
      title: 'Parametros de Pago y Garantia',
      showIf: { field: 'opciones.pagosGarantias', operator: 'eq', value: true },
      gridColumns: 4,
      fields: [
        { key: 'pagos.diasPago', label: 'PLAZO DE PAGO (dias)', type: 'number', span: 2 },
        { key: 'pagos.tasaMoraMensual', label: 'INTERES MORATORIO (% mensual)', type: 'number', span: 2 },
        { key: 'pagos.diasSuspension', label: 'SUSPENSION POR IMPAGO (dias)', type: 'number', span: 2 },
        { key: 'pagos.retencionPct', label: 'RETENCION MAXIMA (%)', type: 'number', span: 2 },
        { key: 'pagos.plazoLiberacionDias', label: 'LIBERACION DE RETENCION (dias)', type: 'number', span: 2 },
        { key: 'pagos.detraccionPct', label: 'DETRACCION (%)', type: 'number', span: 2 },
      ],
    },
    {
      id: 'clausula13Ampliaciones',
      type: 'richText',
      title: 'CLAUSULA DECIMO TERCERA: AMPLIACIONES DE PLAZO',
      showIf: { field: 'opciones.ampliaciones', operator: 'eq', value: true },
    },
    // C6 — Modo SUBCONTRATO (back-to-back asimetrico). El selector se ve siempre
    // (en contratos nuevos); la clausula solo aparece si la modalidad es
    // SUBCONTRATO, con el mismo mecanismo probado de ACT-CNF (VENTA/SERVICIO).
    {
      id: 'modalidadContrato',
      type: 'simpleFields',
      title: 'Modalidad del Contrato',
      showIf: { field: 'opciones.modalidad', operator: 'eq', value: true },
      gridColumns: 4,
      fields: [
        {
          key: 'contrato.modalidad',
          label: 'MODALIDAD',
          type: 'select',
          span: 2,
          options: [
            { value: 'DIRECTO', label: 'Contrato directo con el cliente' },
            { value: 'SUBCONTRATO', label: 'Subcontrato (el cliente tiene un contrato principal)' },
          ],
        },
        {
          key: 'contrato.entidad',
          label: 'ENTIDAD DEL CONTRATO PRINCIPAL',
          type: 'text',
          span: 2,
          showIf: { field: 'contrato.modalidad', operator: 'eq', value: 'SUBCONTRATO' },
        },
        {
          key: 'contrato.numeroPrincipal',
          label: 'CONTRATO PRINCIPAL N°',
          type: 'text',
          span: 2,
          showIf: { field: 'contrato.modalidad', operator: 'eq', value: 'SUBCONTRATO' },
        },
        {
          key: 'contrato.obraPrincipal',
          label: 'OBRA DEL CONTRATO PRINCIPAL',
          type: 'text',
          span: 2,
          showIf: { field: 'contrato.modalidad', operator: 'eq', value: 'SUBCONTRATO' },
        },
      ],
    },
    {
      id: 'clausula14Backtoback',
      type: 'richText',
      title: 'CLAUSULA DECIMO CUARTA: RELACION CON EL CONTRATO PRINCIPAL',
      showIf: { field: 'contrato.modalidad', operator: 'eq', value: 'SUBCONTRATO' },
    },
    {
      id: 'cierre',
      type: 'simpleFields',
      title: 'Cierre y Fecha de Firma',
      gridColumns: 4,
      fields: [
        { key: 'cierre.ciudad', label: 'CIUDAD', type: 'text', span: 4 },
        { key: 'cierre.fechaFirma', label: 'FECHA DE FIRMA', type: 'date', span: 4 },
      ],
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        {
          key: 'firmas.cliente',
          label: 'EL CLIENTE',
          sublabel: 'Representante Legal',
          entity: 'cliente',
        },
        {
          key: 'firmas.proveedor',
          label: 'EL PROVEEDOR',
          sublabel: 'Representante Legal',
          entity: 'proveedor',
        },
      ],
    },
  ],
  defaultData: {
    branding: {
      backgroundImageUrl: '',
    },
    titulo: {
      texto: 'CONTRATO DE COLOCACIÓN DE MEZCLAS ASFÁLTICAS EN CALIENTE (BAJO EL SISTEMA DE PRECIOS UNITARIOS)',
    },
    proveedor: {
      razonSocial: '',
      ruc: '',
      domicilio: '',
      representante: '',
      dniRepresentante: '',
    },
    cliente: {
      razonSocial: '',
      ruc: '',
      domicilio: '',
      representante: '',
      dniRepresentante: '',
    },
    clausula1: CLAUSULA1_DEFAULT,
    obra: {
      nombre: '',
      cui: '',
      ubicacion: '',
    },
    clausula2Trabajos: CLAUSULA2_TRABAJOS_DEFAULT,
    monto: {
      total: 0,
      totalEnLetras: '',
      descripcionMetrado: '',
    },
    preciosUnitarios: [
      { detalle: '', unidad: '', costo: 0 },
    ],
    clausula4FormaPago: CLAUSULA4_DEFAULT,
    sectoresPago: [
      {
        sector: '',
        itemCode: '',
        descripcion: '',
        unidad: '',
        metrado: 0,
        precioUnit: 0,
        parcial: 0,
      },
    ],
    cuentasBancarias: [],
    plazos: {
      fechaInicio: '',
      fechaCulminacion: '',
      responsableInicio: '',
      descripcion: '',
    },
    clausula5Texto: CLAUSULA5_DEFAULT,
    clausula6Marco: CLAUSULA6_DEFAULT,
    clausula7Responsabilidades: CLAUSULA7_DEFAULT,
    clausula8Arbitraje: CLAUSULA8_DEFAULT,
    clausula9Domicilios: CLAUSULA9_DEFAULT,
    // C2: los flags encienden las clausulas de proteccion en los contratos NUEVOS.
    // Un contrato viejo no los tiene, asi que su `showIf` da false y no le cambia
    // ni una linea al documento ya emitido.
    opciones: {
      exclusiones: true,
      ajustes: true,
      pagosGarantias: true,
      ampliaciones: true,
      cronograma: true,
      cotizacion: true,
      cronogramaPagos: true,
      modalidad: true,
    },
    // C6: DIRECTO por defecto. La clausula back-to-back solo aparece si el usuario
    // elige SUBCONTRATO (mismo mecanismo que VENTA/SERVICIO del acta).
    contrato: { modalidad: 'DIRECTO', entidad: '', numeroPrincipal: '', obraPrincipal: '' },
    clausula14Backtoback: CLAUSULA14_DEFAULT,
    // C4 — se llena desde `sourceQuoteNro` de las partidas del servicio.
    cotizacion: { numeros: '', fecha: '', observacion: '' },
    // C5 — Anexo 5. Los porcentajes reflejan el "Abono 01/02/03" de la clausula
    // cuarta, ahora como dato: el monto de cada hito lo deriva la formula.
    cronogramaPagos: [
      { hito: '01', descripcion: 'A la firma del contrato, previo a la movilizacion', porcentaje: 30, monto: 0 },
      { hito: '02', descripcion: 'A la mitad de ejecucion, previa valorizacion aprobada', porcentaje: 40, monto: 0 },
      { hito: '03', descripcion: 'A la conformidad del servicio', porcentaje: 30, monto: 0 },
    ],
    adelanto: { porcentaje: 30, amortizacionPct: 100, garantia: 'No aplica' },
    // C3 — Anexo 2. La fila semilla queda vacia: las filas reales las siembra el
    // agregador desde las partidas del servicio (item/partida/unidad/metrado); el
    // RENDIMIENTO lo pacta la empresa, no lo inventa el sistema.
    cronograma: [
      { item: '01', partida: '', unidad: '', metrado: 0, rendimiento: 0, dias: 0, inicio: '', fin: '' },
    ],
    clausula10Exclusiones: CLAUSULA10_DEFAULT,
    condicionesPrevias: [
      { item: '01', condicion: 'Frente de trabajo liberado y accesible', responsable: 'EL CLIENTE', fecha: '' },
      { item: '02', condicion: 'Base terminada con certificados de compactacion', responsable: 'EL CLIENTE', fecha: '' },
      { item: '03', condicion: 'Area de acopio y estacionamiento de equipos', responsable: 'EL CLIENTE', fecha: '' },
      { item: '04', condicion: 'Permisos, licencias y desvios vigentes', responsable: 'EL CLIENTE', fecha: '' },
    ],
    clausula11Ajustes: CLAUSULA11_DEFAULT,
    reajuste: {
      umbralPct: 5,
      mesBase: '',
      indice: 'Indices Unificados de Precios de la Construccion (INEI)',
    },
    tarifarioEspera: [
      { concepto: 'Camion / volquete en espera', unidad: 'hora', tolerancia: '30 min', tarifa: 0 },
      { concepto: 'Equipo pesado en espera', unidad: 'hora', tolerancia: '30 min', tarifa: 0 },
      { concepto: 'Cuadrilla en espera', unidad: 'hora', tolerancia: '30 min', tarifa: 0 },
      { concepto: 'Desmovilizacion y removilizacion', unidad: 'evento', tolerancia: '-', tarifa: 0 },
    ],
    clausula12Pagos: CLAUSULA12_DEFAULT,
    pagos: {
      diasPago: 15,
      tasaMoraMensual: 1.5,
      diasSuspension: 30,
      retencionPct: 5,
      plazoLiberacionDias: 30,
      // Contratos de construccion = 4% (Anexo 3 del SPOT). Si la prestacion se
      // clasifica como "demas servicios" la tasa es 12%: se cambia acá, no en prosa.
      detraccionPct: 4,
    },
    clausula13Ampliaciones: CLAUSULA13_DEFAULT,
    cierre: {
      ciudad: 'Lima',
      fechaFirma: '',
    },
    firmas: {
      cliente: { nombre: '', cargo: 'Representante Legal' },
      proveedor: { nombre: '', cargo: 'Representante Legal' },
    },
  },
  exportOptions: {
    pdf: true,
    docx: true,
    excel: false,
  },
};
