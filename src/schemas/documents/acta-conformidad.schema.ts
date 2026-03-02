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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD'],
        centerLinesKeys: ['acta.titulo'],
        rightFields: [
          { label: 'CODIGO', key: 'header.codigo' },
          { label: 'VERSION', key: 'header.version' },
          { label: 'FECHA', key: 'header.fecha' },
          { label: 'FOLIO', key: 'header.pagina' },
        ],
      },
    },
    // Se eliminan "Datos del Proyecto" y "Datos del Acta" por requerimiento.
    {
      id: 'datosProveedor',
      type: 'simpleFields',
      title: 'Datos del Proveedor',
      gridColumns: 4,
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'VENTA' },
      fields: [
        { key: 'proveedor.razonSocial', label: 'RAZON SOCIAL', type: 'text', span: 8 },
        { key: 'proveedor.ruc', label: 'RUC', type: 'text', span: 4 },
        { key: 'proveedor.representanteLegal', label: 'REPRESENTANTE LEGAL', type: 'text', span: 12 },
      ],
    },
    {
      id: 'datosCliente',
      type: 'simpleFields',
      title: 'Datos del Cliente',
      gridColumns: 4,
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'VENTA' },
      fields: [
        { key: 'cliente.razonSocial', label: 'RAZON SOCIAL', type: 'text', span: 8 },
        { key: 'cliente.ruc', label: 'RUC', type: 'text', span: 4 },
        { key: 'cliente.representanteLegal', label: 'REPRESENTANTE LEGAL', type: 'text', span: 12 },
      ],
    },
    {
      id: 'descripcionBien',
      type: 'simpleFields',
      title: 'Descripcion del Bien',
      gridColumns: 4,
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'VENTA' },
      fields: [
        { key: 'bien.concepto', label: 'CONCEPTO', type: 'text', span: 12 },
        { key: 'bien.obra', label: 'OBRA', type: 'text', span: 12 },
        { key: 'bien.ordenCompra', label: 'N° O/C', type: 'text', span: 4 },
        { key: 'bien.fechaCompra', label: 'FECHA DE COMPRA', type: 'date', span: 4 },
        { key: 'bien.descripcion', label: 'DESCRIPCION', type: 'text', span: 12 },
      ],
    },
    {
      id: 'textoAdquisicion',
      type: 'richText',
      title: 'Texto de Adquisicion',
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'VENTA' },
    },
    {
      id: 'itemsVenta',
      type: 'dataTable',
      title: 'Detalle de Bienes',
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'VENTA' },
      dynamicRows: true,
      minRows: 1,
      maxRows: 100,
      columns: [
        { key: 'item', label: 'ITEM', type: 'number', width: 60, align: 'center', editable: true },
        { key: 'descripcion', label: 'DESCRIPCION', type: 'text', width: 260, align: 'left', editable: true },
        { key: 'unidadCompra', label: 'UNID. COMPRA', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'cantidadCompra', label: 'CANT. COMPRA', type: 'number', width: 90, align: 'right', editable: true },
        { key: 'cantidadRecibida', label: 'CANT. RECIBIDA', type: 'number', width: 90, align: 'right', editable: true },
      ],
    },
    {
      id: 'datosContratista',
      type: 'simpleFields',
      title: 'Datos del Contratista',
      gridColumns: 4,
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'SERVICIO' },
      fields: [
        { key: 'contratista.razonSocial', label: 'RAZON SOCIAL', type: 'text', span: 8 },
        { key: 'contratista.ruc', label: 'RUC', type: 'text', span: 4 },
        { key: 'contratista.representante', label: 'REPRESENTANTE', type: 'text', span: 12 },
      ],
    },
    {
      id: 'datosSubcontratista',
      type: 'simpleFields',
      title: 'Datos de la Subcontratista',
      gridColumns: 4,
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'SERVICIO' },
      fields: [
        { key: 'subcontratista.razonSocial', label: 'RAZON SOCIAL', type: 'text', span: 8 },
        { key: 'subcontratista.ruc', label: 'RUC', type: 'text', span: 4 },
        { key: 'subcontratista.representanteLegal', label: 'REPRESENTANTE LEGAL', type: 'text', span: 12 },
      ],
    },
    {
      id: 'descripcionObra',
      type: 'simpleFields',
      title: 'Descripcion de la Obra',
      gridColumns: 4,
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'SERVICIO' },
      fields: [
        { key: 'obra.descripcion', label: 'OBRA', type: 'text', span: 12 },
        { key: 'obra.servicio', label: 'SERVICIO', type: 'text', span: 12 },
        { key: 'obra.fechaInicio', label: 'FECHA DE INICIO', type: 'date', span: 4 },
        { key: 'obra.fechaEntrega', label: 'FECHA DE ENTREGA', type: 'date', span: 4 },
        { key: 'obra.ordenCompra', label: 'ORDEN DE COMPRA', type: 'text', span: 4 },
        { key: 'obra.metraje', label: 'METRAJE DE LA OBRA', type: 'text', span: 4 },
      ],
    },
    {
      id: 'valorizacion',
      type: 'simpleFields',
      title: 'Valorizacion del Servicio',
      gridColumns: 4,
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'SERVICIO' },
      fields: [
        { key: 'valorizacion.presupuestoMatriz', label: 'PRESUPUESTO MATRIZ N°', type: 'text', span: 6 },
        { key: 'valorizacion.monto', label: 'MONTO', type: 'currency', span: 6 },
      ],
    },
    {
      id: 'ubicacion',
      type: 'simpleFields',
      title: 'Ubicacion de la Obra',
      gridColumns: 4,
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'SERVICIO' },
      fields: [
        { key: 'ubicacion.direccion', label: 'DIRECCION', type: 'text', span: 12 },
      ],
    },
    {
      id: 'textoConformidad',
      type: 'richText',
      title: 'Texto de Conformidad',
      showIf: { field: 'acta.tipo', operator: 'eq', value: 'SERVICIO' },
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
      titulo: 'ACTA DE CONFORMIDAD POR SERVICIO',
      lugar: '',
      contrato: '',
      representante: '',
      cliente: ''
    },
    proveedor: {
      razonSocial: '',
      ruc: '',
      representanteLegal: '',
    },
    cliente: {
      razonSocial: '',
      ruc: '',
      representanteLegal: '',
    },
    bien: {
      concepto: '',
      obra: '',
      ordenCompra: '',
      fechaCompra: '',
      descripcion: '',
    },
    itemsVenta: [],
    contratista: {
      razonSocial: '',
      ruc: '',
      representante: '',
    },
    subcontratista: {
      razonSocial: '',
      ruc: '',
      representanteLegal: '',
    },
    obra: {
      descripcion: '',
      servicio: '',
      fechaInicio: '',
      fechaEntrega: '',
      ordenCompra: '',
      metraje: '',
    },
    valorizacion: {
      presupuestoMatriz: '',
      monto: 0,
    },
    ubicacion: {
      direccion: '',
    },
    textoConformidad: 'A los ___ dias del mes de __________ del ano ______, mediante el presente documento LA EMPRESA procede a firmar en senal de TOTAL CONFORMIDAD la recepcion de la obra ejecutada al 100% por LA SUBCONTRATISTA, cumpliendo con los aspectos tecnicos de calidad acordados.',
    textoAdquisicion: '',
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
