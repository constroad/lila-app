import { DocumentSchema } from './types';

/**
 * Schema definition for Protocolo de Control Topografico (TOP-PROT).
 */
export const protocoloTopoSchema: DocumentSchema = {
  id: 'protocolo-topo',
  code: 'TOP-PROT',
  name: 'Protocolo de Control Topografico',
  description: 'Control topografico de obra y verificaciones de alineamiento y niveles.',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'PROTOCOLO DE CONTROL TOPOGRAFICO'],
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
      title: 'Informacion Topografica',
      gridColumns: 4,
      fields: [
        { key: 'topografia.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        { key: 'topografia.equipo', label: 'EQUIPO', type: 'text', span: 4 },
        { key: 'topografia.operador', label: 'OPERADOR', type: 'text', span: 4 },
        { key: 'topografia.sistemaReferencia', label: 'SISTEMA REF.', type: 'text', span: 5 },
        { key: 'topografia.precision', label: 'PRECISION', type: 'text', span: 2 }
      ]
    },
    {
      id: 'puntosControl',
      type: 'dataTable',
      title: 'Control de Puntos',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'punto', label: 'PUNTO', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'este', label: 'ESTE (m)', type: 'number', width: 110, align: 'right', editable: true },
        { key: 'norte', label: 'NORTE (m)', type: 'number', width: 110, align: 'right', editable: true },
        { key: 'cota', label: 'COTA (m)', type: 'number', width: 100, align: 'right', editable: true },
        { key: 'error', label: 'ERROR', type: 'number', width: 80, align: 'right', editable: true },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 180, align: 'left', editable: true }
      ]
    },
    {
      id: 'registroFotografico',
      type: 'photoPanel',
      title: 'Registro Fotografico',
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
      precision: ''
    },
    puntosControl: [
      { punto: '', este: 0, norte: 0, cota: 0, error: 0, observacion: '' }
    ],
    registroFotografico: { fotos: [] },
    observaciones: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Topografo', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Supervisor', cip: '' }
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
