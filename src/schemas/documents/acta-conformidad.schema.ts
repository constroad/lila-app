import { DocumentSchema } from './types';

/**
 * Schema definition for Acta de Conformidad (ACT-CNF).
 */
export const actaConformidadSchema: DocumentSchema = {
  id: 'acta-conformidad',
  code: 'ACT-CNF',
  name: 'Acta de Conformidad',
  description: 'Acta de conformidad de trabajos ejecutados.',
  category: 'Administrative',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'ACTA DE CONFORMIDAD'],
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
      id: 'actaInfo',
      type: 'simpleFields',
      title: 'Datos del Acta',
      gridColumns: 4,
      fields: [
        { key: 'acta.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        {
          key: 'acta.tipo',
          label: 'TIPO DE ACTA',
          type: 'select',
          span: 3,
          required: true,
          options: [
            { value: 'VENTA', label: 'Venta de asfalto' },
            { value: 'SERVICIO', label: 'Servicio' },
          ],
        },
        { key: 'acta.lugar', label: 'LUGAR', type: 'text', span: 5 },
        { key: 'acta.contrato', label: 'CONTRATO / OS', type: 'text', span: 4 },
        { key: 'acta.representante', label: 'REPRESENTANTE', type: 'text', span: 6 },
        { key: 'acta.cliente', label: 'CLIENTE', type: 'text', span: 6 }
      ]
    },
    {
      id: 'conformidad',
      type: 'checklist',
      title: 'Conformidad de Trabajos',
      items: [
        { key: 'trabajosConformes', label: 'Trabajos conformes a especificaciones', required: true },
        { key: 'entregaDocumentos', label: 'Entrega de documentos completos', required: true },
        { key: 'sinObservaciones', label: 'Sin observaciones pendientes', required: true }
      ]
    },
    {
      id: 'acuerdos',
      type: 'richText',
      title: 'Acuerdos y Observaciones'
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
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        { key: 'representanteContratista', label: 'CONTRATISTA', sublabel: 'Representante', required: true, showCIP: true },
        { key: 'representanteCliente', label: 'CLIENTE', sublabel: 'Representante', required: true, showCIP: true }
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
    acta: {
      fecha: '',
      tipo: 'SERVICIO',
      lugar: '',
      contrato: '',
      representante: '',
      cliente: ''
    },
    conformidad: {
      trabajosConformes: false,
      entregaDocumentos: false,
      sinObservaciones: false
    },
    acuerdos: '',
    registroFotografico: { fotos: [] },
    firmas: {
      representanteContratista: { nombre: '', cargo: 'Representante Contratista', cip: '' },
      representanteCliente: { nombre: '', cargo: 'Representante Cliente', cip: '' }
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
