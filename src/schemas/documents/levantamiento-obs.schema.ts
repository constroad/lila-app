import { DocumentSchema } from './types';

/**
 * Schema definition for Informe Levantamiento Observaciones (LEV-OBS).
 */
export const levantamientoObsSchema: DocumentSchema = {
  id: 'levantamiento-obs',
  code: 'LEV-OBS',
  name: 'Informe Levantamiento Observaciones',
  description: 'Registro de observaciones y acciones correctivas ejecutadas.',
  category: 'Quality',
  version: '1.1.0',
  lastUpdated: '2026-07-30',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'LEVANTAMIENTO DE OBSERVACIONES'],
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
      id: 'controlInfo',
      type: 'simpleFields',
      title: 'Informacion de Control',
      gridColumns: 4,
      fields: [
        { key: 'control.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        { key: 'control.responsable', label: 'RESPONSABLE', type: 'text', span: 5 },
        { key: 'control.area', label: 'AREA / TRAMO', type: 'text', span: 4 }
      ]
    },
    {
      id: 'observaciones',
      type: 'dataTable',
      title: 'Detalle de Observaciones',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        {
          key: 'codigo',
          label: 'CODIGO',
          type: 'text',
          width: 70,
          align: 'center',
          // Correlativo del documento, no del que tipea: borrar una fila del
          // medio dejaba huecos (OBS-01, OBS-03) y dos filas con el mismo codigo
          // rompen la trazabilidad de la observacion.
          computed: true,
          formula: "'OBS-' + String(rows.length + 1).padStart(2, '0')",
          computedHint: 'Correlativo automatico: numera segun el orden de las filas.',
        },
        { key: 'descripcion', label: 'DESCRIPCION', type: 'text', width: 200, align: 'left', editable: true },
        { key: 'ubicacion', label: 'UBICACION', type: 'text', width: 110, align: 'left', editable: true },
        { key: 'responsable', label: 'RESPONSABLE', type: 'text', width: 110, align: 'left', editable: true },
        { key: 'accionCorrectiva', label: 'ACCION CORRECTIVA', type: 'text', width: 180, align: 'left', editable: true },
        { key: 'plazo', label: 'PLAZO', type: 'date', width: 90, align: 'center', editable: true },
        { key: 'fechaLevantamiento', label: 'FECHA LEVANT.', type: 'date', width: 95, align: 'center', editable: true },
        {
          key: 'estado',
          label: 'ESTADO',
          type: 'select',
          width: 95,
          align: 'center',
          // El estado se DERIVA de la evidencia, no de la voluntad: se tipeaba
          // aparte y el papel podia decir LEVANTADO con la fecha en blanco, o
          // PENDIENTE con la observacion ya cerrada. Ahora manda el dato.
          computed: true,
          formula: "row.fechaLevantamiento ? 'LEVANTADO' : (String(row.accionCorrectiva || '').trim() ? 'EN_PROCESO' : 'PENDIENTE')",
          computedHint: 'Se calcula solo: pon la FECHA LEVANT. para que pase a LEVANTADO (con solo la accion correctiva queda EN PROCESO).',
          options: [
            { value: 'PENDIENTE', label: 'PENDIENTE' },
            { value: 'EN_PROCESO', label: 'EN PROCESO' },
            { value: 'LEVANTADO', label: 'LEVANTADO' }
          ]
        },
        {
          key: 'diasAtraso',
          label: 'DIAS ATRASO',
          type: 'number',
          width: 70,
          align: 'right',
          // Contra la fecha DEL INFORME cuando sigue abierta, nunca contra "hoy":
          // un documento firmado no puede cambiar de numeros al reimprimirse.
          computed: true,
          formula: "row.plazo ? Math.round((Date.parse(String(row.fechaLevantamiento || (data.control || {}).fecha || row.plazo)) - Date.parse(String(row.plazo))) / 86400000) : ''",
          computedHint: 'Se calcula solo: PLAZO contra la fecha de levantamiento (o la del informe si sigue abierta).',
        }
      ]
    },
    {
      id: 'resumenLevantamiento',
      type: 'summary',
      title: 'Resumen del Levantamiento',
      gridColumns: 4,
      fields: [
        { key: 'resumen.total', label: 'OBSERVACIONES', type: 'number', span: 1 },
        { key: 'resumen.levantadas', label: 'LEVANTADAS', type: 'number', span: 1 },
        { key: 'resumen.pendientes', label: 'PENDIENTES', type: 'number', span: 1 },
        { key: 'resumen.porcentaje', label: '% LEVANTAMIENTO', type: 'number', span: 1 }
      ]
    },
    {
      id: 'evidencias',
      type: 'photoSection',
      title: 'Evidencias Fotograficas',
      maxImages: 20,
      layout: '2x3',
      showFecha: true,
      showProgresiva: true,
      categories: [
        { key: 'ANTES', label: 'Antes', maxPhotos: 9 },
        { key: 'DESPUES', label: 'Despues', maxPhotos: 9 }
      ]
    },
    {
      id: 'observacionesGenerales',
      type: 'richText',
      title: 'Observaciones Generales'
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Supervisor de Calidad', required: true, showCIP: true },
        { key: 'aprobadoPor', label: 'APROBADO POR', sublabel: 'Jefe de Proyecto', required: true, showCIP: true }
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
    control: {
      fecha: '',
      responsable: '',
      area: ''
    },
    observaciones: [
      {
        codigo: 'OBS-01',
        descripcion: '',
        ubicacion: '',
        responsable: '',
        accionCorrectiva: '',
        plazo: '',
        fechaLevantamiento: '',
        estado: 'PENDIENTE',
        diasAtraso: ''
      }
    ],
    resumen: {
      total: 0,
      levantadas: 0,
      pendientes: 0,
      porcentaje: 0
    },
    evidencias: { fotos: [] },
    observacionesGenerales: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Supervisor de Calidad', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Jefe de Proyecto', cip: '' }
    }
  },
  // Las filas EN BLANCO no son observaciones: la tabla arranca con una y casi
  // nadie la borra. Contarlas bajaria el % de levantamiento sin motivo.
  computedFields: [
    {
      key: 'resumen.total',
      formula: "(data.observaciones || []).filter((obs) => String(obs.descripcion || '').trim()).length",
      dependencies: ['observaciones'],
    },
    {
      key: 'resumen.levantadas',
      formula: "(data.observaciones || []).filter((obs) => String(obs.descripcion || '').trim() && obs.fechaLevantamiento).length",
      dependencies: ['observaciones'],
    },
    {
      key: 'resumen.pendientes',
      formula: 'num(data.resumen.total) - num(data.resumen.levantadas)',
      dependencies: ['resumen.total', 'resumen.levantadas'],
    },
    {
      key: 'resumen.porcentaje',
      formula: 'round((num(data.resumen.levantadas) / Math.max(1, num(data.resumen.total))) * 100, 0)',
      dependencies: ['resumen.total', 'resumen.levantadas'],
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
