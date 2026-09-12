import { DocumentSchema } from './types';

/**
 * SOL-IMP — Solicitud de imprimacion con emulsion asfaltica sobre base.
 *
 * **Lo firma el CLIENTE, y eso es lo unico que no existe en ningun otro papel.**
 * `CTL-IMP` prueba a que tasa se rego y lo firma la empresa; `REC-EXC` sustenta
 * el excedente y tambien lo firma la empresa. Ninguno registra la DECISION de
 * cambiar el material — y esa decision no es nuestra: el proyecto especifica
 * MC-30 para imprimar base, y aca se pide emulsion.
 *
 * Por eso el documento NO trae ni un calculo de control: bandejas, peso
 * especifico y veredicto de la tasa son de `CTL-IMP`, que se llena DESPUES y
 * contra el material que este papel autorizo. Repetirlos daria dos documentos
 * en desacuerdo sobre el mismo riego.
 *
 * La `tasaSolicitada` va en **lt/m2** y queda EDITABLE, sin rango: los rangos
 * que conoce el sistema (MC-30 0.7-1.5, riego de liga con emulsion 0.2-0.7) son
 * criterios de CONTROL, y aca todavia no se rego nada. Juzgar una solicitud
 * contra el rango del riego de liga la marcaria fuera de rango por un criterio
 * que no es el suyo.
 */
export const solicitudImprimacionSchema: DocumentSchema = {
  id: 'solicitud-imprimacion',
  code: 'SOL-IMP',
  name: 'Solicitud de Imprimacion con Emulsion',
  description:
    'Solicitud firmada por el cliente para imprimar con emulsion asfaltica las zonas con base expuesta.',
  category: 'Administrative',
  version: '1.0.0',
  lastUpdated: '2026-09-10',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  sections: [
    {
      id: 'header',
      type: 'header',
      headerConfig: {
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.companyName',
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'SOLICITUD DE IMPRIMACION CON EMULSION'],
        rightFields: [
          { label: 'CODIGO', key: 'header.codigo' },
          { label: 'VERSION', key: 'header.version' },
          { label: 'FECHA', key: 'header.fecha' },
          { label: 'FOLIO', key: 'header.pagina' },
        ],
      },
    },
    {
      id: 'projectData',
      type: 'projectData',
      title: 'Datos del Proyecto',
      gridColumns: 4,
      fields: [
        { key: 'proyecto.obra', label: 'OBRA', type: 'text', span: 12, required: true },
        { key: 'proyecto.contratista', label: 'CONTRATISTA', type: 'text', span: 6 },
        { key: 'proyecto.subcontratista', label: 'SUBCONTRATISTA', type: 'text', span: 6 },
        { key: 'proyecto.ubicacion', label: 'UBICACION', type: 'text', span: 12 },
      ],
    },
    {
      id: 'solicitud',
      type: 'simpleFields',
      title: 'Datos de la Solicitud',
      gridColumns: 4,
      fields: [
        { key: 'solicitud.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        { key: 'solicitud.contrato', label: 'CONTRATO / OS', type: 'text', span: 4 },
        { key: 'solicitud.entidad', label: 'ENTIDAD SOLICITANTE', type: 'text', span: 5, required: true },
        {
          key: 'solicitud.material',
          label: 'MATERIAL SOLICITADO',
          type: 'text',
          span: 5,
          defaultValue: 'Emulsion asfaltica de rotura lenta',
        },
        {
          key: 'solicitud.reemplaza',
          label: 'EN REEMPLAZO DE',
          type: 'text',
          span: 4,
          defaultValue: 'MC-30',
          tooltip: 'Material que especifica el proyecto y que esta solicitud sustituye.',
        },
        {
          key: 'solicitud.tasaSolicitada',
          label: 'TASA SOLICITADA (lt/m2)',
          type: 'number',
          span: 3,
          tooltip: 'Tasa de referencia acordada. La tasa REAL se mide luego en el control (CTL-IMP).',
        },
      ],
    },
    {
      id: 'zonas',
      type: 'dataTable',
      title: 'Zonas con Base Expuesta',
      dynamicRows: true,
      minRows: 1,
      maxRows: 100,
      columns: [
        { key: 'item', label: 'Nro', type: 'text', width: 60, align: 'center', editable: true, required: true },
        { key: 'zona', label: 'Zona / Calle', type: 'text', width: 180, align: 'left', editable: true, required: true },
        { key: 'progresiva', label: 'Progresiva', type: 'text', width: 120, align: 'center', editable: true },
        { key: 'largo', label: 'Largo (m)', type: 'number', width: 90, align: 'right', editable: true, decimals: 2 },
        { key: 'ancho', label: 'Ancho (m)', type: 'number', width: 90, align: 'right', editable: true, decimals: 2 },
        {
          key: 'area',
          label: 'Area (m2)',
          type: 'number',
          width: 100,
          align: 'right',
          decimals: 2,
          // Derivada de largo x ancho. `computed: true` es OBLIGATORIO: sin el,
          // la formula es inerte EN SILENCIO. Con la fila recien sembrada queda
          // VACIA en vez de imprimir un 0 que se leeria como zona sin area.
          computed: true,
          formula: "num(row.largo) && num(row.ancho) ? round(num(row.largo) * num(row.ancho), 2) : ''",
          computedHint: 'Se calcula sola: Largo por Ancho.',
        },
        {
          key: 'superficie',
          label: 'Tipo de superficie',
          type: 'text',
          width: 150,
          align: 'left',
          editable: true,
          placeholder: 'Base granular / base estabilizada',
        },
        { key: 'observacion', label: 'Observacion', type: 'text', width: 170, align: 'left', editable: true },
      ],
    },
    {
      id: 'resumen',
      type: 'summary',
      title: 'Resumen de lo Solicitado',
      gridColumns: 4,
      fields: [
        { key: 'resumen.zonas', label: 'ZONAS SOLICITADAS', type: 'number', span: 4 },
        { key: 'resumen.areaTotal', label: 'AREA TOTAL (m2)', type: 'number', span: 4 },
        { key: 'resumen.emulsionEstimada', label: 'EMULSION ESTIMADA (lt)', type: 'number', span: 4 },
      ],
    },
    {
      id: 'declaracion',
      type: 'checklist',
      title: 'Declaracion del Solicitante',
      items: [
        {
          key: 'verificadoEnCampo',
          label: 'Las zonas indicadas fueron verificadas en campo y presentan base sin imprimar',
          required: true,
        },
        {
          key: 'sustituyeEspecificado',
          label: 'Se solicita emulsion asfaltica en reemplazo del material especificado en el proyecto',
          required: true,
        },
        {
          key: 'conoceCurado',
          label: 'Se conoce que el curado y el tiempo de apertura al transito cambian con el material',
        },
        {
          key: 'valorizaSegunContrato',
          label: 'El material solicitado se valoriza segun contrato o adicional aprobado',
        },
      ],
    },
    {
      id: 'motivo',
      type: 'richText',
      title: 'Motivo de la Solicitud',
    },
    {
      // `panelFotografico` y no `registroFotografico`: el workspace publico
      // ENUMERA los ids de seccion de foto, y un id fuera de esa lista abre una
      // pantalla vacia sin error. Es el mismo id que usa IAA.
      id: 'panelFotografico',
      type: 'photoSection',
      title: 'Panel Fotografico',
      maxImages: 20,
      layout: '2x2',
      showFecha: true,
      showProgresiva: true,
      categories: [{ key: 'ZONA', label: 'Zona solicitada', maxPhotos: 12 }],
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        {
          key: 'solicitadoPor',
          label: 'SOLICITADO POR',
          sublabel: 'Representante del cliente',
          required: true,
          showCIP: true,
        },
        {
          key: 'recibidoPor',
          label: 'RECIBIDO POR',
          sublabel: 'Responsable de obra',
          required: true,
          showCIP: true,
        },
      ],
    },
  ],
  defaultData: {
    header: {
      logoUrl: '',
      companyName: '',
      codigo: '',
      version: '',
      fecha: '',
      pagina: '1-1',
      correlativo: '',
    },
    proyecto: {
      obra: '',
      contratista: '',
      subcontratista: '',
      ubicacion: '',
    },
    solicitud: {
      fecha: '',
      contrato: '',
      entidad: '',
      material: 'Emulsion asfaltica de rotura lenta',
      reemplaza: 'MC-30',
      tasaSolicitada: 0,
    },
    zonas: [
      {
        item: '01',
        id: 'zona-1',
        zona: '',
        progresiva: '',
        largo: 0,
        ancho: 0,
        area: 0,
        superficie: '',
        observacion: '',
      },
    ],
    resumen: {
      zonas: 0,
      areaTotal: 0,
      emulsionEstimada: 0,
    },
    declaracion: {
      verificadoEnCampo: false,
      sustituyeEspecificado: false,
      conoceCurado: false,
      valorizaSegunContrato: false,
    },
    motivo: '',
    panelFotografico: { fotos: [] },
    firmas: {
      solicitadoPor: { nombre: '', cargo: 'Representante del cliente', cip: '' },
      recibidoPor: { nombre: '', cargo: 'Responsable de obra', cip: '' },
    },
  },
  // El area se recalcula desde largo x ancho, NO se suma la columna `area`: esa
  // solo se persiste cuando alguien edita el cuadro en el canvas, asi que un
  // `sum(zonas, 'area')` daria cero sobre un cuadro cargado por la API. La fila
  // que ya trae `area` medida (viene de una foto) se respeta como esta.
  computedFields: [
    {
      key: 'resumen.zonas',
      formula:
        '(data.zonas || []).filter((fila) => (num(fila.largo) && num(fila.ancho)) || num(fila.area) > 0).length',
      dependencies: ['zonas'],
    },
    {
      key: 'resumen.areaTotal',
      formula:
        "round((data.zonas || []).reduce((total, fila) => total + (num(fila.largo) && num(fila.ancho) ? num(fila.largo) * num(fila.ancho) : num(fila.area)), 0), 2)",
      dependencies: ['zonas'],
    },
    {
      // Sin tasa NO estima: un "0 lt" al lado de 400 m2 se lee como que no hace
      // falta material. Depende de `resumen.areaTotal`, que se calcula antes.
      key: 'resumen.emulsionEstimada',
      formula:
        "num(data.solicitud && data.solicitud.tasaSolicitada) ? round(num(data.resumen && data.resumen.areaTotal) * num(data.solicitud.tasaSolicitada), 2) : ''",
      dependencies: ['zonas', 'solicitud'],
    },
  ],
  exportOptions: {
    docx: true,
    pdf: true,
    excel: false,
  },
  normativeReference: [
    'EG-2013 MTC - Manual de Carreteras: Especificaciones Tecnicas Generales para Construccion',
  ],
};
