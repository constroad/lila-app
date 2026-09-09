import { DocumentSchema } from './types';

/**
 * Schema del Informe de Fresado de Pavimento Asfaltico (FRE-PAV).
 *
 * El fresado corta y retira en frio una capa del pavimento existente con
 * fresadora de tambor: saca la carpeta deteriorada, recupera la rasante -que
 * sube con cada recapeo hasta tapar sardineles y buzones- y deja la caja donde
 * entra el espesor de diseno.
 *
 * Es el PARTE DIARIO de la jornada de fresado: una obra puede fresar varias
 * calles en el mismo dia y el informe las lleva todas, una fila por TRAMO
 * (progresivas), nunca por calle -la misma calle puede fresarse en dos tramos
 * separados el mismo dia-.
 *
 * TODO lo normativo sale del MTC, Manual de Carreteras EG-2013, Seccion 435
 * "Fresado de pavimento asfaltico". Lo que esta especificacion fija y este
 * schema respeta:
 *
 *   - 435.08 b.1 Espesor: la tolerancia es de las COTAS de la superficie
 *     resultante respecto del Proyecto, hasta 5 mm. Lo que exceda se corrige
 *     por cuenta del Contratista. Por eso la conformidad se calcula contra
 *     `TOLERANCIA_COTA_MM` y no contra un porcentaje inventado.
 *   - 435.08 b.2 Rugosidad: solo EXIGIBLE cuando sobre la superficie fresada se
 *     va a construir tratamiento superficial, mortero asfaltico o carpeta. Se
 *     mide IRI en m/km cada 100 m; los maximos admisibles son los de la Tabla
 *     435-01 (40% de hectometros 1,9 / 80% 2,5 / 100% 3,0).
 *   - 435.09 Medicion: metro cuadrado (m2), APROXIMANDO AL ENTERO, calculado
 *     como longitud fresada por ancho tratado del Proyecto. No se mide area
 *     fuera de esos limites.
 *   - 435.05 Material fresado: es PROPIEDAD DE LA ENTIDAD CONTRATANTE y se
 *     acopia donde indique el Proyecto o el Supervisor (salvo el que provenga
 *     de deficiencias del propio Contratista, que va a DME - Seccion 209). Por
 *     eso el destino del RAP es una columna del informe, no un comentario.
 *
 * El m3 NO es unidad de pago: se calcula como control del volumen retirado, que
 * es lo que se transporta y lo que se acopia.
 */

/** EG-2013 435.08 b.1: tolerancia de las cotas de la superficie resultante. */
export const FRESADO_TOLERANCIA_COTA_MM = 5;

/** EG-2013 Tabla 435-01: maximos admisibles de IRI (m/km) por porcentaje de hectometros. */
export const FRESADO_IRI_MAXIMOS = [
  { porcentajeHectometros: 40, iri: 1.9 },
  { porcentajeHectometros: 80, iri: 2.5 },
  { porcentajeHectometros: 100, iri: 3.0 },
];

export const fresadoPavimentoSchema: DocumentSchema = {
  id: 'fresado-pavimento',
  code: 'FRE-PAV',
  name: 'Informe de Fresado de Pavimento',
  description:
    'Parte diario de fresado: tramos fresados con su area y espesor, control de cotas, material retirado y evidencia.',
  category: 'Operations',
  version: '1.0.0',
  lastUpdated: '2026-09-08',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  sections: [
    {
      id: 'header',
      type: 'header',
      headerConfig: {
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.companyName',
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'INFORME DE FRESADO DE PAVIMENTO'],
        rightFields: [
          { label: 'CODIGO', key: 'header.codigo' },
          { label: 'VERSION', key: 'header.version' },
          { label: 'FECHA', key: 'header.fecha' },
          { label: 'FOLIO', key: 'header.pagina' },
        ],
      },
    },
    {
      id: 'datosProyecto',
      type: 'projectData',
      title: 'Datos del Proyecto',
      gridColumns: 12,
      fields: [
        { key: 'proyecto.obra', label: 'OBRA', type: 'text', span: 12, required: true },
        { key: 'proyecto.contratista', label: 'CONTRATISTA', type: 'text', span: 6 },
        { key: 'proyecto.subcontratista', label: 'SUBCONTRATISTA', type: 'text', span: 6 },
        { key: 'proyecto.ubicacion', label: 'UBICACION', type: 'text', span: 12 },
      ],
    },
    {
      id: 'control',
      type: 'simpleFields',
      title: 'Informacion de la Jornada',
      gridColumns: 12,
      fields: [
        { key: 'control.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        {
          key: 'control.turno',
          label: 'TURNO',
          type: 'select',
          span: 3,
          options: [
            // 435.06: el fresado se ejecuta con luz natural; el turno nocturno
            // lo autoriza el Supervisor y exige iluminacion artificial.
            { value: 'DIURNO', label: 'DIURNO' },
            { value: 'NOCTURNO', label: 'NOCTURNO (autorizado)' },
          ],
        },
        { key: 'control.responsable', label: 'RESPONSABLE', type: 'text', span: 6 },
        { key: 'control.frente', label: 'FRENTE / SECTOR', type: 'text', span: 6 },
        { key: 'control.clima', label: 'CLIMA', type: 'text', span: 3 },
        {
          key: 'control.superficieLimpia',
          label: 'SUPERFICIE BARRIDA ANTES (435.04)',
          type: 'checkbox',
          span: 3,
        },
      ],
    },
    {
      id: 'equipo',
      type: 'simpleFields',
      title: 'Equipo de Fresado',
      gridColumns: 12,
      fields: [
        { key: 'equipo.fresadora', label: 'FRESADORA', type: 'text', span: 5 },
        { key: 'equipo.anchoTambor', label: 'ANCHO DE TAMBOR (m)', type: 'number', span: 3 },
        { key: 'equipo.operador', label: 'OPERADOR', type: 'text', span: 4 },
        // SIN horometro (Jose, 08/09/2026): la jornada se mide en m2 y el dato
        // no se usaba para nada mas. Un campo que nadie llena ensucia el parte.
        {
          key: 'equipo.controlProfundidad',
          label: 'CONTROL AUTOMATICO DE PROFUNDIDAD (435.03)',
          type: 'checkbox',
          span: 3,
        },
      ],
    },
    {
      id: 'tramos',
      type: 'dataTable',
      title: 'Tramos Fresados',
      // La fila es el TRAMO: la misma calle puede fresarse en dos tramos
      // separados en la misma jornada, y colapsarlos por nombre perderia una.
      dynamicRows: true,
      minRows: 1,
      maxRows: 100,
      showTotals: true,
      totalColumns: ['areaM2', 'volumenM3'],
      columns: [
        {
          key: 'item',
          label: 'ITEM',
          type: 'text',
          width: 45,
          align: 'center',
          computed: true,
          formula: "'T-' + String(rows.length + 1).padStart(2, '0')",
          computedHint: 'Correlativo automatico del tramo.',
        },
        { key: 'calle', label: 'CALLE / TRAMO', type: 'text', width: 150, align: 'left', editable: true },
        { key: 'progInicial', label: 'PROG. INICIAL', type: 'number', width: 80, align: 'right', editable: true },
        { key: 'progFinal', label: 'PROG. FINAL', type: 'number', width: 80, align: 'right', editable: true },
        {
          key: 'largoM',
          label: 'LARGO (m)',
          type: 'number',
          width: 75,
          align: 'right',
          computed: true,
          formula: 'Math.max(0, round(num(row.progFinal) - num(row.progInicial), 2))',
          computedHint: 'Progresiva final menos inicial.',
        },
        { key: 'anchoM', label: 'ANCHO (m)', type: 'number', width: 75, align: 'right', editable: true },
        {
          key: 'areaM2',
          label: 'AREA (m2)',
          type: 'number',
          width: 85,
          align: 'right',
          // 435.09: la unidad de medida es el m2 APROXIMANDO AL ENTERO, y el
          // area es longitud fresada por ancho tratado. Redondear a dos
          // decimales seria mas "preciso" y no seria lo que se paga.
          computed: true,
          formula: 'Math.round(Math.max(0, num(row.progFinal) - num(row.progInicial)) * num(row.anchoM))',
          computedHint: 'Largo por ancho, al entero (EG-2013 435.09).',
        },
        {
          key: 'espesorProyectoCm',
          label: 'ESP. PROYECTO (cm)',
          type: 'number',
          width: 85,
          align: 'right',
          editable: true,
        },
        {
          key: 'espesorMedidoCm',
          label: 'ESP. MEDIDO (cm)',
          type: 'number',
          width: 85,
          align: 'right',
          editable: true,
        },
        {
          key: 'volumenM3',
          label: 'VOLUMEN (m3)',
          type: 'number',
          width: 85,
          align: 'right',
          // El m3 NO se paga (435.10 paga el m2): es el volumen retirado, que es
          // lo que se transporta y se acopia.
          computed: true,
          formula:
            'round(Math.round(Math.max(0, num(row.progFinal) - num(row.progInicial)) * num(row.anchoM)) * num(row.espesorMedidoCm) / 100, 2)',
          computedHint: 'Area por espesor medido. Control del material retirado, no unidad de pago.',
        },
      ],
    },
    {
      id: 'controlCotas',
      type: 'dataTable',
      // El limite va en el TITULO y no en `subtitle`: ningun renderer pinta el
      // subtitulo, asi que la tolerancia contra la que se firma quedaba
      // invisible en el papel (visto al montar el canvas, 08/09/2026).
      title: 'Control de Cotas de la Superficie Resultante — tolerancia hasta 5 mm (EG-2013 435.08)',
      subtitle:
        'Solo cuando el fresado corrige nivel y la Supervision pide cotas. Si no aplica, no se llena y no se imprime.',
      dynamicRows: true,
      // Opcional: la mayoria de las jornadas fresa a espesor, no a cota. Un
      // cuadro vacio en el papel hace dudar de si faltaba llenarlo.
      minRows: 0,
      hideWhenEmpty: true,
      maxRows: 200,
      columns: [
        { key: 'tramo', label: 'TRAMO', type: 'text', width: 110, align: 'left', editable: true },
        { key: 'progresiva', label: 'PROGRESIVA', type: 'number', width: 80, align: 'right', editable: true },
        { key: 'cotaProyecto', label: 'COTA PROYECTO (m)', type: 'number', width: 95, align: 'right', editable: true },
        { key: 'cotaResultante', label: 'COTA RESULTANTE (m)', type: 'number', width: 100, align: 'right', editable: true },
        {
          key: 'desviacionMm',
          label: 'DESVIACION (mm)',
          type: 'number',
          width: 90,
          align: 'right',
          computed: true,
          formula: 'round((num(row.cotaResultante) - num(row.cotaProyecto)) * 1000, 1)',
          computedHint: 'Diferencia contra la cota del Proyecto, en milimetros.',
        },
        {
          key: 'conforme',
          label: 'CONFORME',
          type: 'text',
          width: 85,
          align: 'center',
          // La conformidad se DERIVA de la medicion, nunca se tipea: un papel
          // que diga CONFORME con 12 mm de desviacion es el defecto que esto
          // evita. El limite es el de 435.08 b.1.
          computed: true,
          formula:
            "(row.cotaProyecto === '' || row.cotaProyecto === undefined || row.cotaResultante === '' || row.cotaResultante === undefined) ? '' : (Math.abs((num(row.cotaResultante) - num(row.cotaProyecto)) * 1000) <= 5 ? 'CONFORME' : 'NO CONFORME')",
          computedHint: 'Se calcula sola: |desviacion| hasta 5 mm es conforme (EG-2013 435.08 b.1).',
        },
      ],
    },
    {
      id: 'rugosidad',
      type: 'dataTable',
      title:
        'Rugosidad IRI — solo si encima va carpeta o tratamiento; maximos 1,9 / 2,5 / 3,0 m/km (Tabla 435-01)',
      subtitle:
        'Solo si sobre la superficie fresada se construira tratamiento superficial, mortero asfaltico o carpeta. Maximos Tabla 435-01: 40% de hectometros 1,9 - 80% 2,5 - 100% 3,0 m/km',
      dynamicRows: true,
      minRows: 0,
      maxRows: 100,
      hideWhenEmpty: true,
      columns: [
        { key: 'tramo', label: 'TRAMO', type: 'text', width: 110, align: 'left', editable: true },
        { key: 'carril', label: 'CARRIL', type: 'text', width: 70, align: 'center', editable: true },
        { key: 'hectometro', label: 'HECTOMETRO', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'iri', label: 'IRI (m/km)', type: 'number', width: 85, align: 'right', editable: true },
        {
          key: 'dentroDe',
          label: 'UMBRAL',
          type: 'text',
          width: 95,
          align: 'center',
          computed: true,
          formula:
            "(row.iri === '' || row.iri === undefined) ? '' : (num(row.iri) <= 1.9 ? '<= 1,9' : (num(row.iri) <= 2.5 ? '<= 2,5' : (num(row.iri) <= 3.0 ? '<= 3,0' : 'EXCEDE')))",
          computedHint: 'Ubica la medicion en la Tabla 435-01.',
        },
      ],
    },
    {
      id: 'resumen',
      type: 'summary',
      title: 'Resumen de la Jornada',
      gridColumns: 4,
      boxed: true,
      fields: [
        { key: 'resumen.tramos', label: 'TRAMOS', type: 'number', span: 1 },
        { key: 'resumen.areaM2', label: 'AREA FRESADA (m2)', type: 'number', span: 1 },
        { key: 'resumen.volumenM3', label: 'VOLUMEN RETIRADO (m3)', type: 'number', span: 1 },
        { key: 'resumen.espesorPromedioCm', label: 'ESPESOR PROMEDIO (cm)', type: 'number', span: 1 },
      ],
    },
    {
      id: 'materialRetirado',
      type: 'dataTable',
      title: 'Material Fresado Retirado (RAP) — propiedad de la entidad contratante (435.05)',
      subtitle:
        'El material extraido es propiedad de la entidad contratante y se acopia donde indique el Proyecto o el Supervisor (435.05)',
      dynamicRows: true,
      minRows: 0,
      maxRows: 100,
      showTotals: true,
      totalColumns: ['volumenM3'],
      hideWhenEmpty: true,
      columns: [
        { key: 'volquete', label: 'VOLQUETE', type: 'text', width: 110, align: 'left', editable: true },
        { key: 'placa', label: 'PLACA', type: 'text', width: 80, align: 'center', editable: true },
        { key: 'viajes', label: 'VIAJES', type: 'number', width: 70, align: 'right', editable: true },
        { key: 'volumenM3', label: 'VOLUMEN (m3)', type: 'number', width: 90, align: 'right', editable: true },
        { key: 'destino', label: 'DESTINO / ACOPIO', type: 'text', width: 160, align: 'left', editable: true },
      ],
    },
    {
      id: 'mapaArea',
      type: 'photoSection',
      title: 'Mapa del Area Fresada',
      maxImages: 2,
      layout: '2x2',
      showFecha: false,
      showProgresiva: false,
      // Una sola categoria: el mapa no es "una foto mas" de la obra, y con
      // categoria propia el canvas y el PDF lo ubican solos. Es el mismo
      // mecanismo del LEV-OBS, que ya corre en produccion.
      categories: [{ key: 'MAPA', label: 'Area fresada', maxPhotos: 2 }],
    },
    {
      id: 'superficieResultante',
      type: 'checklist',
      title: 'Superficie Resultante y Cierre de Jornada',
      items: [
        { key: 'texturaUniforme', label: 'Textura / estriado uniforme, sin fracturas', required: true },
        { key: 'sinEscalones', label: 'Sin escalones entre pasadas ni desniveles', required: true },
        { key: 'bordesTratados', label: 'Bordes longitudinales y transversales sin peligro para el transito (435.05)', required: true },
        { key: 'limpieza', label: 'Barrido y limpieza del material suelto', required: true },
        { key: 'estructurasProtegidas', label: 'Buzones, sumideros y tapas protegidos y sin dano', required: true },
        { key: 'senalizacion', label: 'Senalizacion preventiva y ordenamiento del transito (435.10)', required: true },
        { key: 'sinDanoTerceros', label: 'Sin dano a estructuras, plantas u objetos vecinos', required: false },
      ],
    },
    {
      id: 'evidencias',
      type: 'photoSection',
      title: 'Panel Fotografico',
      maxImages: 30,
      layout: '2x3',
      showFecha: true,
      showProgresiva: true,
      pageBreakBefore: true,
      includeHeader: true,
      // Antes / durante / despues por TRAMO: el grupo lo arma Portal como
      // `<idTramo>::<FASE>`, igual que LEV-OBS con sus observaciones.
      categories: [
        { key: 'ANTES', label: 'Antes', maxPhotos: 10 },
        { key: 'DURANTE', label: 'Durante', maxPhotos: 10 },
        { key: 'DESPUES', label: 'Despues', maxPhotos: 10 },
      ],
    },
    {
      id: 'observaciones',
      type: 'richText',
      title: 'Observaciones',
      placeholder: 'Interferencias, tramos observados por el Supervisor, trabajos pendientes...',
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        /**
         * TRES firmas, como el parte diario de cualquier obra vial: lo elabora
         * quien ejecuta, lo conforma quien supervisa, y la entidad da el V.B.
         * El cliente final NO firma cada parte -firma la valorizacion, que es
         * donde se acumulan-, por eso la tercera es opcional.
         */
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Residente / Jefe de Calidad', required: true, showCIP: true },
        { key: 'conformidad', label: 'CONFORMIDAD', sublabel: 'Supervision de Obra', required: true, showCIP: true },
        { key: 'vistoBueno', label: 'V.B.', sublabel: 'Entidad / Cliente', required: false, showCIP: true },
      ],
    },
  ],
  defaultData: {
    header: { codigo: 'FRE-PAV-01', version: '01', pagina: '1 de 1' },
    proyecto: { obra: '', contratista: '', subcontratista: '', ubicacion: '' },
    control: { fecha: '', turno: 'DIURNO', responsable: '', frente: '', clima: '', superficieLimpia: false },
    equipo: { fresadora: '', anchoTambor: '', operador: '', controlProfundidad: false },
    tramos: [],
    // Cada seccion de fotos lee de `data[<id de la seccion>].fotos`: el mapa
    // vive en `mapaArea`, no en `evidencias` (Portal, `resolvePhotoPath`).
    mapaArea: { fotos: [] },
    controlCotas: [],
    rugosidad: [],
    materialRetirado: [],
    resumen: { tramos: 0, areaM2: 0, volumenM3: 0, espesorPromedioCm: 0 },
    evidencias: { fotos: [] },
    observaciones: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Residente de Obra', cip: '' },
      conformidad: { nombre: '', cargo: 'Supervision de Obra', cip: '' },
      vistoBueno: { nombre: '', cargo: 'Entidad / Cliente', cip: '' },
    },
  },
  // Las filas EN BLANCO no son tramos: la tabla arranca con una y casi nadie la
  // borra. Contarlas inflaria el area de la jornada.
  computedFields: [
    {
      key: 'resumen.tramos',
      formula: "(data.tramos || []).filter((tramo) => String(tramo.calle || '').trim()).length",
      dependencies: ['tramos'],
    },
    {
      key: 'resumen.areaM2',
      formula:
        "(data.tramos || []).filter((tramo) => String(tramo.calle || '').trim()).reduce((total, tramo) => total + Math.round(Math.max(0, num(tramo.progFinal) - num(tramo.progInicial)) * num(tramo.anchoM)), 0)",
      dependencies: ['tramos'],
    },
    {
      key: 'resumen.volumenM3',
      formula:
        "round((data.tramos || []).filter((tramo) => String(tramo.calle || '').trim()).reduce((total, tramo) => total + Math.round(Math.max(0, num(tramo.progFinal) - num(tramo.progInicial)) * num(tramo.anchoM)) * num(tramo.espesorMedidoCm) / 100, 0), 2)",
      dependencies: ['tramos'],
    },
    {
      key: 'resumen.espesorPromedioCm',
      /**
       * PONDERADO POR AREA, no promedio de los espesores.
       *
       * Un tramo de 20 m2 a 10 cm y otro de 400 m2 a 5 cm no dan 7,5 cm de
       * promedio: dan 5,2. El promedio simple regala espesor en la
       * valorizacion. El rendimiento por hora salio del resumen: la jornada se
       * mide en m2 (Jose, 08/09/2026) y el horometro queda como registro del
       * equipo.
       *
       * Y se pondera SOLO sobre el area MEDIDA: con la cinta se mide un tramo
       * y no los cinco. Dividiendo por el area de la jornada completa, la
       * unica medicion de 5 cm salia impresa como 0,7 cm.
       */
      formula:
        `(data.tramos || []).filter((tramo) => String(tramo.calle || "").trim() && num(tramo.espesorMedidoCm) > 0).reduce((total, tramo) => total + Math.round(Math.max(0, num(tramo.progFinal) - num(tramo.progInicial)) * num(tramo.anchoM)), 0) > 0 ? round(num(data.resumen.volumenM3) * 100 / ((data.tramos || []).filter((tramo) => String(tramo.calle || "").trim() && num(tramo.espesorMedidoCm) > 0).reduce((total, tramo) => total + Math.round(Math.max(0, num(tramo.progFinal) - num(tramo.progInicial)) * num(tramo.anchoM)), 0)), 1) : 0`,
      dependencies: ['tramos', 'resumen.volumenM3'],
    },
  ],
  exportOptions: {
    docx: true,
    pdf: true,
    excel: false,
  },
  normativeReference: [
    'EG-2013 MTC - Manual de Carreteras: Especificaciones Tecnicas Generales para Construccion, Seccion 435 (Fresado de pavimento asfaltico)',
  ],
};
