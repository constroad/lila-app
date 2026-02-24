import { DocumentSchema } from './types';

/**
 * Schema definition for Cuadro Resumen de Metrado (MET-RES).
 */
export const metradoResumenSchema: DocumentSchema = {
  id: 'metrado-resumen',
  code: 'MET-RES',
  name: 'Cuadro Resumen de Metrado',
  description: 'Resumen de metrados ejecutados por partidas y periodos.',
  category: 'Technical',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'CUADRO RESUMEN DE METRADO'],
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
      title: 'Periodo de Metrado',
      gridColumns: 4,
      fields: [
        { key: 'periodo.inicio', label: 'INICIO', type: 'date', span: 3, required: true },
        { key: 'periodo.fin', label: 'FIN', type: 'date', span: 3, required: true },
        { key: 'periodo.responsable', label: 'RESPONSABLE', type: 'text', span: 4 }
      ]
    },
    {
      id: 'metrado',
      type: 'dataTable',
      title: 'Detalle de Metrados',
      dynamicRows: true,
      minRows: 1,
      maxRows: 300,
      columns: [
        { key: 'item', label: 'ITEM', type: 'text', width: 70, align: 'center', editable: true },
        { key: 'descripcion', label: 'DESCRIPCION', type: 'text', width: 260, align: 'left', editable: true },
        { key: 'unidad', label: 'UNIDAD', type: 'text', width: 80, align: 'center', editable: true },
        { key: 'metrado', label: 'METRADO', type: 'number', width: 90, align: 'right', editable: true },
        { key: 'precioUnitario', label: 'P.U.', type: 'currency', width: 90, align: 'right', editable: true },
        { key: 'parcial', label: 'PARCIAL', type: 'currency', width: 100, align: 'right', editable: true }
      ]
    },
    {
      id: 'resumen',
      type: 'summary',
      title: 'Resumen',
      gridColumns: 4,
      fields: [
        { key: 'resumen.totalMetrado', label: 'TOTAL METRADO', type: 'number', span: 2 },
        { key: 'resumen.totalParcial', label: 'TOTAL PARCIAL', type: 'currency', span: 2 },
        { key: 'resumen.observaciones', label: 'OBSERVACIONES', type: 'text', span: 4 }
      ]
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Responsable de Metrados', required: true, showCIP: true },
        { key: 'revisadoPor', label: 'REVISADO POR', sublabel: 'Supervisor', required: true, showCIP: true }
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
      responsable: ''
    },
    metrado: [
      { item: '01', descripcion: '', unidad: '', metrado: 0, precioUnitario: 0, parcial: 0 }
    ],
    resumen: {
      totalMetrado: 0,
      totalParcial: 0,
      observaciones: ''
    },
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Responsable de Metrados', cip: '' },
      revisadoPor: { nombre: '', cargo: 'Supervisor', cip: '' }
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
