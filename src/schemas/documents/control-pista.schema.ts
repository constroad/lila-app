import { DocumentSchema } from './types';

/**
 * Schema definition for Formato Control de Pista (CTL-PIS).
 */
export const controlPistaSchema: DocumentSchema = {
  id: 'control-pista',
  code: 'CTL-PIS',
  name: 'Control de Pista',
  description: 'Formato de control de pista para verificaciones en campo.',
  category: 'Operations',
  version: '1.1.0',
  lastUpdated: '2026-02-23',
  orientation: 'landscape',
  pageSize: 'A4',
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  sections: [
    {
      id: 'header',
      type: 'header',
      headerConfig: {
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.companyName',
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'CONTROL DE PISTA'],
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
        { key: 'control.tramo', label: 'TRAMO', type: 'text', span: 5, required: true },
        { key: 'control.frente', label: 'FRENTE', type: 'text', span: 4 },
        { key: 'control.turno', label: 'TURNO', type: 'text', span: 3 },
        { key: 'control.clima', label: 'CLIMA', type: 'text', span: 3 },
        { key: 'control.supervisor', label: 'SUPERVISOR', type: 'text', span: 6 }
      ]
    },
    {
      id: 'controlPista',
      type: 'dataTable',
      title: 'Registro de Control de Pista',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'item', label: 'ITEM', type: 'number', width: 60, align: 'center', editable: true },
        { key: 'placa', label: 'PLACA', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'numeroGuia', label: 'N° GUIA', type: 'text', width: 110, align: 'center', editable: true },
        { key: 'horaSalida', label: 'H SALIDA', type: 'time', width: 80, align: 'center', editable: true },
        { key: 'horaLlegada', label: 'H LLEGADA', type: 'time', width: 80, align: 'center', editable: true },
        { key: 'volumenM3', label: 'VOL m3', type: 'number', width: 80, align: 'right', editable: true },
        { key: 'tempSalida', label: 'TEMP SALIDA', type: 'number', width: 90, align: 'right', editable: true },
        { key: 'horaInicioColocacion', label: 'H INICIO COLOC', type: 'time', width: 90, align: 'center', editable: true },
        { key: 'horaFinalColocacion', label: 'H FINAL COLOC', type: 'time', width: 90, align: 'center', editable: true },
        { key: 'tempLlegada', label: 'LLEGADA', type: 'number', width: 90, align: 'right', editable: true, group: 'TEMPERATURA' },
        { key: 'tempRodilloLiso', label: 'RODILLO LISO', type: 'number', width: 90, align: 'right', editable: true, group: 'TEMPERATURA' },
        { key: 'tempRodilloNeumatico', label: 'RODILLO NEUM', type: 'number', width: 95, align: 'right', editable: true, group: 'TEMPERATURA' },
        { key: 'observaciones', label: 'OBSERVACIONES', type: 'text', width: 180, align: 'left', editable: true }
      ]
    },
    {
      id: 'checklist',
      type: 'checklist',
      title: 'Verificacion de Pista',
      items: [
        { key: 'superficieLimpia', label: 'Superficie limpia', required: true },
        { key: 'senalizacion', label: 'Senalizacion y seguridad', required: true },
        { key: 'riegoLiga', label: 'Riego de liga aplicado', required: true },
        { key: 'temperaturaAdecuada', label: 'Temperatura adecuada', required: true },
        { key: 'compactacionAdecuada', label: 'Compactacion adecuada', required: true }
      ]
    },
    {
      id: 'registroFotografico',
      type: 'photoPanel',
      title: 'Registro Fotografico',
      maxImages: 20,
      layout: '2x3',
      showFecha: true,
      showProgresiva: true
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
      signatureStyle: 'line',
      signatures: [
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Supervisor de Campo', required: true, showCIP: true },
        { key: 'aprobadoPor', label: 'APROBADO POR', sublabel: 'Supervisor de Calidad', required: true, showCIP: true }
      ]
    }
  ],
  defaultData: {
    header: {
      logoUrl: '',
      companyName: '',
      projectDescription: '',
      controlArea: '',
      reportTitle: '',
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
      tramo: '',
      frente: '',
      turno: '',
      clima: '',
      supervisor: ''
    },
    controlPista: [
      {
        item: 1,
        placa: '',
        numeroGuia: '',
        horaSalida: '',
        horaLlegada: '',
        volumenM3: 0,
        tempSalida: 0,
        horaInicioColocacion: '',
        horaFinalColocacion: '',
        tempLlegada: 0,
        tempRodilloLiso: 0,
        tempRodilloNeumatico: 0,
        observaciones: '',
      }
    ],
    checklist: {
      superficieLimpia: false,
      senalizacion: false,
      riegoLiga: false,
      temperaturaAdecuada: false,
      compactacionAdecuada: false
    },
    registroFotografico: { fotos: [] },
    observaciones: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Supervisor de Campo', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Supervisor de Calidad', cip: '' }
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
