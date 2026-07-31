import { DocumentSchema } from './types';

/**
 * Schema definition for Protocolo Topografia Completo (TOP-CMP).
 */
export const protocoloTopoCompletoSchema: DocumentSchema = {
  id: 'protocolo-topo-completo',
  code: 'TOP-CMP',
  name: 'Protocolo Topografia Completo',
  description: 'Registro completo de control topografico con planimetria y altimetria.',
  category: 'Technical',
  version: '1.1.0',
  lastUpdated: '2026-02-10',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'PROTOCOLO TOPOGRAFIA COMPLETO'],
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
        { key: 'proyecto.ubicacion', label: 'UBICACION', type: 'text', span: 12 }
      ]
    },
    {
      id: 'topoInfo',
      type: 'simpleFields',
      title: 'Informacion General',
      gridColumns: 4,
      fields: [
        { key: 'topografia.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        { key: 'topografia.equipo', label: 'EQUIPO', type: 'text', span: 4 },
        { key: 'topografia.operador', label: 'OPERADOR', type: 'text', span: 4 },
        { key: 'topografia.sistemaReferencia', label: 'SISTEMA REF.', type: 'text', span: 5 },
        { key: 'topografia.metodologia', label: 'METODOLOGIA', type: 'text', span: 4 },
        // El "completo" es SUPERSET del simple (TOP-PROT): la precision del equipo
        // aplica a los dos protocolos, no tiene por que faltar aca.
        { key: 'topografia.precision', label: 'PRECISION', type: 'text', span: 2 },
        // Las tolerancias del proyecto: SIN ellas el protocolo no puede
        // dictaminar nada y el "SI" del resumen queda a criterio del que tipea.
        { key: 'topografia.toleranciaPlanimetrica', label: 'TOL. PLANIM. (m)', type: 'number', span: 3 },
        { key: 'topografia.toleranciaAltimetrica', label: 'TOL. ALTIM. (m)', type: 'number', span: 3 }
      ]
    },
    {
      id: 'planimetria',
      type: 'dataTable',
      title: 'Planimetria',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'punto', label: 'PUNTO', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'este', label: 'ESTE (m)', type: 'number', width: 120, align: 'right', editable: true },
        { key: 'norte', label: 'NORTE (m)', type: 'number', width: 110, align: 'right', editable: true },
        { key: 'esteProyecto', label: 'ESTE PROY.', type: 'number', width: 110, align: 'right', editable: true },
        { key: 'norteProyecto', label: 'NORTE PROY.', type: 'number', width: 110, align: 'right', editable: true },
        {
          key: 'error',
          label: 'ERROR (m)',
          type: 'number',
          width: 85,
          align: 'right',
          // Error de replanteo = distancia entre el punto medido y el de
          // proyecto. Se tipeaba a mano, asi que el "SI" que firma el supervisor
          // no se podia auditar. Sin coordenada de proyecto queda VACIO: un cero
          // ahi diria "replanteo perfecto" sobre un punto que nadie comparo.
          computed: true,
          formula: "num(row.esteProyecto) || num(row.norteProyecto) ? round(Math.sqrt(Math.pow(num(row.este) - num(row.esteProyecto), 2) + Math.pow(num(row.norte) - num(row.norteProyecto), 2)), 3) : ''",
          computedHint: 'Se calcula solo: distancia entre el punto medido y el de proyecto. Llena ESTE PROY. y NORTE PROY.',
        },
        {
          key: 'cumple',
          label: 'CUMPLE',
          type: 'select',
          width: 75,
          align: 'center',
          computed: true,
          formula: "num((data.topografia || {}).toleranciaPlanimetrica) > 0 && row.error !== '' ? (num(row.error) <= num((data.topografia || {}).toleranciaPlanimetrica) ? 'SI' : 'NO') : ''",
          computedHint: 'Se calcula solo: compara el ERROR con la TOL. PLANIM. declarada arriba.',
          options: [
            { value: 'SI', label: 'SI' },
            { value: 'NO', label: 'NO' }
          ]
        },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 150, align: 'left', editable: true }
      ]
    },
    {
      id: 'altimetria',
      type: 'dataTable',
      title: 'Altimetria',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'punto', label: 'PUNTO', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'cota', label: 'COTA (m)', type: 'number', width: 110, align: 'right', editable: true },
        { key: 'cotaProyecto', label: 'COTA PROY. (m)', type: 'number', width: 120, align: 'right', editable: true },
        {
          key: 'diferencia',
          label: 'DIFERENCIA (m)',
          type: 'number',
          width: 110,
          align: 'right',
          computed: true,
          formula: "num(row.cotaProyecto) ? round(num(row.cota) - num(row.cotaProyecto), 3) : ''",
          computedHint: 'Se calcula solo: COTA menos COTA PROY.',
        },
        {
          key: 'cumple',
          label: 'CUMPLE',
          type: 'select',
          width: 75,
          align: 'center',
          // Valor ABSOLUTO: quedarse corto rompe la rasante igual que pasarse.
          computed: true,
          formula: "num((data.topografia || {}).toleranciaAltimetrica) > 0 && row.diferencia !== '' ? (Math.abs(num(row.diferencia)) <= num((data.topografia || {}).toleranciaAltimetrica) ? 'SI' : 'NO') : ''",
          computedHint: 'Se calcula solo: compara la DIFERENCIA (en valor absoluto) con la TOL. ALTIM.',
          options: [
            { value: 'SI', label: 'SI' },
            { value: 'NO', label: 'NO' }
          ]
        },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 160, align: 'left', editable: true }
      ]
    },
    {
      id: 'resumenTopografico',
      type: 'summary',
      title: 'Resumen Topografico',
      gridColumns: 3,
      fields: [
        { key: 'resumen.puntos', label: 'PUNTOS DE PLANIMETRIA', type: 'number', span: 1 },
        { key: 'resumen.errorMaximo', label: 'ERROR MAXIMO (m)', type: 'number', span: 1 },
        { key: 'resumen.fueraTolerancia', label: 'FUERA DE TOLERANCIA', type: 'number', span: 1 }
      ]
    },
    {
      id: 'resumenControl',
      type: 'resultsTable',
      title: 'Resumen de Control',
      dynamicRows: true,
      minRows: 1,
      maxRows: 50,
      columns: [
        { key: 'control', label: 'CONTROL', type: 'text', width: 200, align: 'left', editable: true },
        { key: 'resultado', label: 'RESULTADO', type: 'text', width: 120, align: 'center', editable: true },
        { key: 'tolerancia', label: 'TOLERANCIA', type: 'text', width: 120, align: 'center', editable: true },
        {
          key: 'cumple',
          label: 'CUMPLE',
          type: 'select',
          width: 90,
          align: 'center',
          editable: true,
          options: [
            { value: 'SI', label: 'SI' },
            { value: 'NO', label: 'NO' }
          ]
        }
      ]
    },
    {
      id: 'registroFotografico',
      type: 'photoPanel',
      title: 'Panel Fotografico',
      maxImages: 20,
      layout: '2x2',
      showFecha: true
    },
    {
      id: 'observaciones',
      type: 'richText',
      title: 'Observaciones'
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Topografo', required: true, showCIP: true },
        { key: 'aprobadoPor', label: 'APROBADO POR', sublabel: 'Supervisor', required: true, showCIP: true }
      ]
    }
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
      ubicacion: ''
    },
    topografia: {
      fecha: '',
      equipo: '',
      operador: '',
      sistemaReferencia: '',
      metodologia: '',
      precision: '',
      toleranciaPlanimetrica: 0,
      toleranciaAltimetrica: 0
    },
    planimetria: [
      { punto: '', este: 0, norte: 0, esteProyecto: 0, norteProyecto: 0, error: '', cumple: '', observacion: '' }
    ],
    altimetria: [
      { punto: '', cota: 0, cotaProyecto: 0, diferencia: '', cumple: '', observacion: '' }
    ],
    resumen: {
      puntos: 0,
      errorMaximo: 0,
      fueraTolerancia: 0
    },
    resumenControl: [
      { control: '', resultado: '', tolerancia: '', cumple: 'SI' }
    ],
    registroFotografico: { fotos: [] },
    observaciones: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Topografo', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Supervisor', cip: '' }
    }
  },
  // Derivados de los datos CRUDOS (medido vs proyecto), no de las columnas
  // computadas: esas se persisten solo si alguien edita la tabla en el canvas.
  computedFields: [
    {
      key: 'resumen.puntos',
      formula: "(data.planimetria || []).filter((punto) => String(punto.punto || '').trim()).length",
      dependencies: ['planimetria'],
    },
    {
      key: 'resumen.errorMaximo',
      formula: "round((data.planimetria || []).reduce((peor, punto) => Math.max(peor, num(punto.esteProyecto) || num(punto.norteProyecto) ? Math.sqrt(Math.pow(num(punto.este) - num(punto.esteProyecto), 2) + Math.pow(num(punto.norte) - num(punto.norteProyecto), 2)) : 0), 0), 3)",
      dependencies: ['planimetria'],
    },
    {
      key: 'resumen.fueraTolerancia',
      formula: "(data.planimetria || []).filter((punto) => num((data.topografia || {}).toleranciaPlanimetrica) > 0 && (num(punto.esteProyecto) || num(punto.norteProyecto)) && Math.sqrt(Math.pow(num(punto.este) - num(punto.esteProyecto), 2) + Math.pow(num(punto.norte) - num(punto.norteProyecto), 2)) > num((data.topografia || {}).toleranciaPlanimetrica)).length + (data.altimetria || []).filter((punto) => num((data.topografia || {}).toleranciaAltimetrica) > 0 && num(punto.cotaProyecto) && Math.abs(num(punto.cota) - num(punto.cotaProyecto)) > num((data.topografia || {}).toleranciaAltimetrica)).length",
      dependencies: ['planimetria', 'altimetria'],
    },
  ],
  exportOptions: {
    docx: true,
    pdf: true,
    excel: false
  },
  normativeReference: [
    'EG-2013 MTC - Manual de Carreteras: Especificaciones Tecnicas Generales para Construccion'
  ]
};
