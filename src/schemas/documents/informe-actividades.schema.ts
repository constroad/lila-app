import { DocumentSchema } from './types';

/**
 * Schema definition for Informe de Actividades Realizadas (INF-ACT).
 */
export const informeActividadesSchema: DocumentSchema = {
  id: 'informe-actividades',
  code: 'INF-ACT',
  name: 'Informe de Actividades Realizadas',
  description: 'Registro de actividades ejecutadas durante el periodo del servicio.',
  category: 'Operations',
  version: '1.0.0',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'INFORME DE ACTIVIDADES REALIZADAS'],
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
      id: 'periodo',
      type: 'simpleFields',
      title: 'Periodo de Informe',
      gridColumns: 4,
      fields: [
        { key: 'periodo.inicio', label: 'INICIO', type: 'date', span: 3, required: true },
        { key: 'periodo.fin', label: 'FIN', type: 'date', span: 3, required: true },
        { key: 'periodo.turno', label: 'TURNO', type: 'text', span: 2 },
        { key: 'periodo.responsable', label: 'RESPONSABLE', type: 'text', span: 4 }
      ]
    },
    {
      id: 'actividades',
      type: 'dataTable',
      title: 'Detalle de Actividades',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'fecha', label: 'FECHA', type: 'date', width: 110, align: 'center', editable: true },
        { key: 'actividad', label: 'ACTIVIDAD', type: 'text', width: 180, align: 'left', editable: true },
        { key: 'descripcion', label: 'DESCRIPCION', type: 'text', width: 240, align: 'left', editable: true },
        { key: 'cantidad', label: 'CANTIDAD', type: 'number', width: 90, align: 'right', editable: true },
        { key: 'unidad', label: 'UNIDAD', type: 'text', width: 80, align: 'center', editable: true },
        { key: 'ubicacion', label: 'UBICACION', type: 'text', width: 160, align: 'left', editable: true }
      ]
    },
    {
      id: 'resumen',
      type: 'summary',
      title: 'Resumen Ejecutivo',
      gridColumns: 4,
      fields: [
        { key: 'resumen.avance', label: 'AVANCE GENERAL', type: 'percentage', span: 2 },
        { key: 'resumen.personal', label: 'PERSONAL PROMEDIO', type: 'number', span: 2 },
        { key: 'resumen.equipos', label: 'EQUIPOS PRINCIPALES', type: 'text', span: 4 },
        { key: 'resumen.horas', label: 'HORAS TRABAJADAS', type: 'number', span: 2 }
      ]
    },
    {
      id: 'registroFotografico',
      type: 'photoSection',
      title: 'Panel Fotografico',
      maxImages: 20,
      layout: '2x3',
      showFecha: true,
      showProgresiva: true,
      categories: [
        { key: 'PRODUCCION', label: 'Produccion', maxPhotos: 6 },
        { key: 'IMPRIMACION', label: 'Imprimacion', maxPhotos: 6 },
        { key: 'COLOCACION', label: 'Colocacion', maxPhotos: 6 },
        { key: 'COMPACTACION', label: 'Compactacion', maxPhotos: 6 },
        { key: 'CONTROL_CALIDAD', label: 'Control de Calidad', maxPhotos: 6 }
      ]
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
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Supervisor de Produccion', required: true, showCIP: true },
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
    periodo: {
      inicio: '',
      fin: '',
      turno: '',
      responsable: ''
    },
    actividades: [
      { fecha: '', actividad: '', descripcion: '', cantidad: 0, unidad: '', ubicacion: '' }
    ],
    resumen: {
      avance: 0,
      personal: 0,
      equipos: '',
      horas: 0
    },
    registroFotografico: { fotos: [] },
    observaciones: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Supervisor de Produccion', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Jefe de Proyecto', cip: '' }
    }
  },
  exportOptions: {
    docx: true,
    pdf: true,
    excel: false
  },
  normativeReference: [
    'EG-2013 MTC - Manual de Carreteras: Especificaciones Tecnicas Generales para Construccion'
  ]
};
