import { DocumentSchema } from './types';

/**
 * Schema definition for Dossier de Obra Completo (DOS-OBR).
 */
export const dossierObraSchema: DocumentSchema = {
  id: 'dossier-obra',
  code: 'DOS-OBR',
  name: 'Dossier de Obra Completo',
  description: 'Compilacion de documentos clave de la obra.',
  category: 'Compilation',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'DOSSIER DE OBRA COMPLETO'],
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
      id: 'resumen',
      type: 'summary',
      title: 'Resumen del Dossier',
      gridColumns: 4,
      fields: [
        { key: 'resumen.periodo', label: 'PERIODO', type: 'text', span: 4 },
        { key: 'resumen.responsable', label: 'RESPONSABLE', type: 'text', span: 4 },
        { key: 'resumen.descripcion', label: 'DESCRIPCION', type: 'text', span: 4 }
      ]
    },
    {
      id: 'documentosIncluidos',
      type: 'dataTable',
      title: 'Documentos Incluidos',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'codigo', label: 'CODIGO', type: 'text', width: 100, align: 'center', editable: true },
        { key: 'nombre', label: 'NOMBRE', type: 'text', width: 240, align: 'left', editable: true },
        { key: 'fecha', label: 'FECHA', type: 'date', width: 120, align: 'center', editable: true },
        { key: 'version', label: 'VERSION', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 180, align: 'left', editable: true }
      ]
    },
    {
      id: 'checklist',
      type: 'checklist',
      title: 'Checklist de Entrega',
      items: [
        { key: 'planos', label: 'Planos y planos finales', required: true },
        { key: 'protocolos', label: 'Protocolos y ensayos', required: true },
        { key: 'valorizaciones', label: 'Valorizaciones', required: true },
        { key: 'actas', label: 'Actas de conformidad', required: true },
        { key: 'panelFotografico', label: 'Panel fotografico', required: true }
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
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Responsable del Dossier', required: true, showCIP: true },
        { key: 'aprobadoPor', label: 'APROBADO POR', sublabel: 'Gerencia', required: true, showCIP: true }
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
    resumen: {
      periodo: '',
      responsable: '',
      descripcion: ''
    },
    documentosIncluidos: [
      { codigo: '', nombre: '', fecha: '', version: '', observacion: '' }
    ],
    checklist: {
      planos: false,
      protocolos: false,
      valorizaciones: false,
      actas: false,
      panelFotografico: false
    },
    registroFotografico: { fotos: [] },
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Responsable del Dossier', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Gerencia', cip: '' }
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
