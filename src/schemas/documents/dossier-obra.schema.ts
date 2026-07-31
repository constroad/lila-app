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
  version: '1.2.0',
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
    // D4 — Vigencias. El dolor #2 de la industria: rastrear a mano el vencimiento
    // de cientos de certificados. Gated para no alterar los dossiers ya emitidos.
    {
      id: 'certificados',
      type: 'dataTable',
      title: 'Certificados y Vigencias',
      showIf: { field: 'opciones.certificados', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 100,
      columns: [
        { key: 'documento', label: 'DOCUMENTO', type: 'text', width: 200, align: 'left', editable: true },
        { key: 'emisor', label: 'EMISOR', type: 'text', width: 140, align: 'left', editable: true },
        { key: 'numero', label: 'NUMERO', type: 'text', width: 100, align: 'center', editable: true },
        { key: 'emision', label: 'EMISION', type: 'date', width: 100, align: 'center', editable: true },
        { key: 'vencimiento', label: 'VENCIMIENTO', type: 'date', width: 110, align: 'center', editable: true },
      ],
    },
    // D5 — Los bloques que la industria exige y el dossier no tenia. Todos gated:
    // un dossier ya emitido no tiene los flags y `showIf` da false.
    {
      id: 'planosAsBuilt',
      type: 'dataTable',
      title: 'Planos As-Built',
      showIf: { field: 'opciones.planos', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'item', label: 'ITEM', type: 'text', width: 50, align: 'center', editable: true },
        { key: 'plano', label: 'PLANO', type: 'text', width: 220, align: 'left', editable: true },
        { key: 'codigo', label: 'CODIGO', type: 'text', width: 100, align: 'center', editable: true },
        { key: 'version', label: 'VERSION', type: 'text', width: 80, align: 'center', editable: true },
        { key: 'fecha', label: 'FECHA', type: 'date', width: 100, align: 'center', editable: true },
        { key: 'formato', label: 'FORMATO', type: 'text', width: 90, align: 'center', editable: true },
      ],
    },
    {
      id: 'garantias',
      type: 'dataTable',
      title: 'Garantias',
      showIf: { field: 'opciones.garantias', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 60,
      columns: [
        { key: 'documento', label: 'CONCEPTO', type: 'text', width: 200, align: 'left', editable: true },
        { key: 'emisor', label: 'OTORGADA POR', type: 'text', width: 140, align: 'left', editable: true },
        { key: 'alcance', label: 'ALCANCE', type: 'text', width: 180, align: 'left', editable: true },
        { key: 'emision', label: 'INICIO', type: 'date', width: 100, align: 'center', editable: true },
        { key: 'vencimiento', label: 'VENCE', type: 'date', width: 100, align: 'center', editable: true },
      ],
    },
    {
      id: 'subcontratistas',
      type: 'dataTable',
      title: 'Relacion de Subcontratistas',
      showIf: { field: 'opciones.subcontratistas', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 60,
      columns: [
        { key: 'razonSocial', label: 'RAZON SOCIAL', type: 'text', width: 200, align: 'left', editable: true },
        { key: 'ruc', label: 'RUC', type: 'text', width: 100, align: 'center', editable: true },
        { key: 'alcance', label: 'ALCANCE DEL TRABAJO', type: 'text', width: 200, align: 'left', editable: true },
        { key: 'contacto', label: 'CONTACTO', type: 'text', width: 130, align: 'left', editable: true },
        { key: 'sctrVence', label: 'SCTR VENCE', type: 'date', width: 100, align: 'center', editable: true },
      ],
    },
    {
      id: 'cierreSsoma',
      type: 'dataTable',
      title: 'Cierre de SSOMA',
      showIf: { field: 'opciones.ssoma', operator: 'eq', value: true },
      dynamicRows: true,
      minRows: 1,
      maxRows: 100,
      columns: [
        { key: 'item', label: 'ITEM', type: 'text', width: 50, align: 'center', editable: true },
        { key: 'descripcion', label: 'INCIDENCIA / REQUISITO', type: 'text', width: 260, align: 'left', editable: true },
        { key: 'estado', label: 'ESTADO', type: 'select', width: 110, align: 'center', editable: true,
          options: [
            { value: 'CERRADO', label: 'Cerrado' },
            { value: 'PENDIENTE', label: 'Pendiente' },
            { value: 'NO_APLICA', label: 'No aplica' },
          ] },
        { key: 'fecha', label: 'FECHA CIERRE', type: 'date', width: 105, align: 'center', editable: true },
        { key: 'responsable', label: 'RESPONSABLE', type: 'text', width: 140, align: 'left', editable: true },
      ],
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
    // D4: el flag enciende la seccion en los dossiers NUEVOS; los viejos no lo
    // tienen y `showIf` da false, asi que su documento no cambia.
    opciones: {
      certificados: true,
      planos: true,
      garantias: true,
      subcontratistas: true,
      ssoma: true,
    },
    planosAsBuilt: [{ item: '', plano: '', codigo: '', version: '', fecha: '', formato: '' }],
    garantias: [{ documento: '', emisor: '', alcance: '', emision: '', vencimiento: '' }],
    subcontratistas: [{ razonSocial: '', ruc: '', alcance: '', contacto: '', sctrVence: '' }],
    cierreSsoma: [{ item: '', descripcion: '', estado: '', fecha: '', responsable: '' }],
    certificados: [
      { documento: '', emisor: '', numero: '', emision: '', vencimiento: '' },
    ],
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
