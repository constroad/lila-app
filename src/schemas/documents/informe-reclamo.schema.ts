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
        {
          key: 'excedente',
          label: 'EXCEDENTE',
          type: 'number',
          width: 100,
          align: 'right',
          // Derivado: ejecutado - contrato. Tipearlo aparte deja al reclamo
          // contradiciendo a sus dos columnas vecinas. `computed: true` es
          // OBLIGATORIO: sin el la formula es inerte EN SILENCIO.
          // Con el ejecutado en cero (cuadro recien sembrado) la celda queda
          // VACIA: mostrar "-16850" en cada fila pareceria una deuda.
          computed: true,
          formula: "num(row.metradoEjecutado) ? round(num(row.metradoEjecutado) - num(row.metradoContrato), 2) : ''",
          computedHint: 'Se calcula solo: METRADO EJECUTADO menos METRADO CONTRATO.',
        },
        { key: 'precioUnitario', label: 'P. UNITARIO', type: 'currency', width: 110, align: 'right', editable: true },
        {
          key: 'importe',
          label: 'IMPORTE EXCEDENTE',
          type: 'currency',
          width: 130,
          align: 'right',
          // Un reclamo sin monto no se puede cobrar. Solo el excedente POSITIVO
          // genera importe: por un deficit no se factura nada.
          computed: true,
          formula: "num(row.excedente) > 0 ? round(num(row.excedente) * num(row.precioUnitario), 2) : ''",
          computedHint: 'Se calcula solo: EXCEDENTE por P. UNITARIO.',
        },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 180, align: 'left', editable: true }
      ]
    },
    {
      id: 'resumenReclamo',
      type: 'summary',
      title: 'Resumen del Reclamo',
      gridColumns: 4,
      fields: [
        { key: 'resumen.montoReclamado', label: 'MONTO RECLAMADO', type: 'currency', span: 2 },
        { key: 'resumen.partidasAfectadas', label: 'PARTIDAS AFECTADAS', type: 'number', span: 2 }
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
      title: 'Panel Fotografico',
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
        precioUnitario: 0,
        importe: 0,
        observacion: ''
      }
    ],
    resumen: {
      montoReclamado: 0,
      partidasAfectadas: 0
    },
    sustento: '',
    conclusiones: '',
    registroFotografico: { fotos: [] },
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Responsable Tecnico', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Jefe de Proyecto', cip: '' }
    }
  },
  // El resumen se DERIVA de los datos crudos (ejecutado, contrato, P.U.), NO de
  // la columna `importe`: esa se persiste solo cuando alguien edita la tabla en
  // el canvas, asi que un `sum(metradoReclamo, 'importe')` daria cero sobre un
  // cuadro sembrado por el agregador o cargado por la API.
  computedFields: [
    {
      key: 'resumen.montoReclamado',
      formula: "round((data.metradoReclamo || []).reduce((total, fila) => total + Math.max(0, num(fila.metradoEjecutado) ? num(fila.metradoEjecutado) - num(fila.metradoContrato) : 0) * num(fila.precioUnitario), 0), 2)",
      dependencies: ['metradoReclamo'],
    },
    {
      key: 'resumen.partidasAfectadas',
      formula: '(data.metradoReclamo || []).filter((fila) => num(fila.metradoEjecutado) > num(fila.metradoContrato)).length',
      dependencies: ['metradoReclamo'],
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
