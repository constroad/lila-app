import { DocumentSchema } from './types';

/**
 * Schema definition for Informe Tecnico Reclamo Excedente (REC-EXC).
 */
export const informeReclamoSchema: DocumentSchema = {
  id: 'informe-reclamo',
  code: 'REC-EXC',
  name: 'Informe Tecnico Reclamo Excedente',
  description: 'Sustento tecnico de reclamos por metrados excedentes.',
  category: 'Claims',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'INFORME TECNICO - RECLAMO EXCEDENTE'],
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
      id: 'reclamoInfo',
      type: 'simpleFields',
      title: 'Informacion del Reclamo',
      gridColumns: 4,
      fields: [
        { key: 'reclamo.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        { key: 'reclamo.solicitante', label: 'SOLICITANTE', type: 'text', span: 5 },
        { key: 'reclamo.contrato', label: 'CONTRATO / OS', type: 'text', span: 4 },
        { key: 'reclamo.motivo', label: 'MOTIVO', type: 'text', span: 6 }
      ]
    },
    {
      id: 'metradoReclamo',
      type: 'dataTable',
      title: 'Detalle de Metrado Excedente',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'item', label: 'ITEM', type: 'text', width: 70, align: 'center', editable: true },
        { key: 'descripcion', label: 'DESCRIPCION', type: 'text', width: 240, align: 'left', editable: true },
        { key: 'unidad', label: 'UNIDAD', type: 'text', width: 80, align: 'center', editable: true },
        { key: 'metradoContrato', label: 'METRADO CONTRATO', type: 'number', width: 120, align: 'right', editable: true },
        { key: 'metradoEjecutado', label: 'METRADO EJECUTADO', type: 'number', width: 130, align: 'right', editable: true },
        { key: 'excedente', label: 'EXCEDENTE', type: 'number', width: 100, align: 'right', editable: true },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 180, align: 'left', editable: true }
      ]
    },
    {
      id: 'sustento',
      type: 'richText',
      title: 'Sustento Tecnico'
    },
    {
      id: 'conclusiones',
      type: 'richText',
      title: 'Conclusiones'
    },
    {
      id: 'registroFotografico',
      type: 'photoSection',
      title: 'Evidencias Fotografias',
      maxImages: 20,
      layout: '2x2',
      showFecha: true,
      showProgresiva: true,
      categories: [
        { key: 'CAMPO', label: 'Campo', maxPhotos: 6 },
        { key: 'LABORATORIO', label: 'Laboratorio', maxPhotos: 6 }
      ]
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Responsable Tecnico', required: true, showCIP: true },
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
    reclamo: {
      fecha: '',
      solicitante: '',
      contrato: '',
      motivo: ''
    },
    metradoReclamo: [
      {
        item: '01',
        descripcion: '',
        unidad: '',
        metradoContrato: 0,
        metradoEjecutado: 0,
        excedente: 0,
        observacion: ''
      }
    ],
    sustento: '',
    conclusiones: '',
    registroFotografico: { fotos: [] },
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Responsable Tecnico', cip: '' },
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
