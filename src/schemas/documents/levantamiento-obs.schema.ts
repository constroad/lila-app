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
        { key: 'codigo', label: 'CODIGO', type: 'text', width: 80, align: 'center', editable: true },
        { key: 'descripcion', label: 'DESCRIPCION', type: 'text', width: 240, align: 'left', editable: true },
        { key: 'ubicacion', label: 'UBICACION', type: 'text', width: 150, align: 'left', editable: true },
        { key: 'accionCorrectiva', label: 'ACCION CORRECTIVA', type: 'text', width: 220, align: 'left', editable: true },
        {
          key: 'estado',
          label: 'ESTADO',
          type: 'select',
          width: 110,
          align: 'center',
          editable: true,
          options: [
            { value: 'PENDIENTE', label: 'PENDIENTE' },
            { value: 'EN_PROCESO', label: 'EN PROCESO' },
            { value: 'LEVANTADO', label: 'LEVANTADO' }
          ]
        },
        { key: 'fechaLevantamiento', label: 'FECHA LEVANT.', type: 'date', width: 120, align: 'center', editable: true }
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
        accionCorrectiva: '',
        estado: 'PENDIENTE',
        fechaLevantamiento: ''
      }
    ],
    evidencias: { fotos: [] },
    observacionesGenerales: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Supervisor de Calidad', cip: '' },
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
