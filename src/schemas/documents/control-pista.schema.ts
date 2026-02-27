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
  version: '1.2.1',
  lastUpdated: '2026-02-26',
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
        { key: 'control.fecha', label: 'FECHA', type: 'date', span: 2, required: true },
        { key: 'control.tramo', label: 'TRAMO', type: 'text', span: 2, required: true },
        { key: 'control.frente', label: 'FRENTE', type: 'text', span: 2 },
        { key: 'control.turno', label: 'TURNO', type: 'text', span: 2 },
        { key: 'control.clima', label: 'CLIMA', type: 'text', span: 2 },
        { key: 'control.supervisor', label: 'SUPERVISOR', type: 'text', span: 2 }
      ]
    },
    {
      id: 'resumenControl',
      type: 'simpleFields',
      title: 'Resumen de Control',
      gridColumns: 4,
      fields: [
        { key: 'resumenControl.totalCarros', label: 'TOTAL CARROS', type: 'number', span: 2 },
        { key: 'resumenControl.totalM3', label: 'TOTAL m³', type: 'number', span: 2 },
        { key: 'resumenControl.tempSalidaProm', label: 'TEMP SALIDA PROM', type: 'number', span: 2 },
        { key: 'resumenControl.tempLlegadaProm', label: 'TEMP LLEGADA PROM', type: 'number', span: 2 },
        { key: 'resumenControl.tempRodilloLisoProm', label: 'TEMP RODILLO LISO PROM', type: 'number', span: 2 },
        { key: 'resumenControl.tempRodilloNeumaticoProm', label: 'TEMP RODILLO NEUM PROM', type: 'number', span: 2 },
        { key: 'resumenControl.unidadesSinTemperatura', label: 'UNIDADES SIN TEMP', type: 'number', span: 2 }
      ]
    },
    {
      id: 'controlPistaColumns',
      type: 'checklist',
      title: 'Columnas en PDF',
      items: [
        { key: 'hideHoraFinalColocacion', label: 'Ocultar H. Final Colocación' },
        { key: 'hideTempRodilloLiso', label: 'Ocultar Temp. Rodillo Liso' },
        { key: 'hideTempRodilloNeumatico', label: 'Ocultar Temp. Rodillo Neumático' }
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
        { key: 'ordenColocacion', label: 'ORDEN', type: 'text', width: 50, align: 'center', editable: true },
        { key: 'placa', label: 'PLACA', type: 'text', width: 70, align: 'center', editable: true },
        { key: 'numeroGuia', label: 'N° GUIA', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'horaSalida', label: 'H SALIDA', type: 'time', width: 55, align: 'center', editable: true },
        { key: 'horaLlegada', label: 'H LLEGADA', type: 'time', width: 55, align: 'center', editable: true },
        { key: 'volumenM3', label: 'VOL m3', type: 'number', width: 60, align: 'right', editable: true },
        { key: 'tempSalida', label: 'TEMP SALIDA', type: 'number', width: 60, align: 'right', editable: true },
        { key: 'horaInicioColocacion', label: 'H INICIO COLOC', type: 'time', width: 60, align: 'center', editable: true },
        { key: 'horaFinalColocacion', label: 'H FINAL COLOC', type: 'time', width: 60, align: 'center', editable: true },
        { key: 'tempLlegada', label: 'LLEGADA', type: 'number', width: 60, align: 'right', editable: true, group: 'TEMPERATURA' },
        { key: 'tempRodilloLiso', label: 'RODILLO LISO', type: 'number', width: 60, align: 'right', editable: true, group: 'TEMPERATURA' },
        { key: 'tempRodilloNeumatico', label: 'RODILLO NEUM', type: 'number', width: 60, align: 'right', editable: true, group: 'TEMPERATURA' },
        { key: 'observaciones', label: 'OBSERVACIONES', type: 'text', width: 140, align: 'left', editable: true }
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
    resumenControl: {
      totalCarros: 0,
      totalM3: 0,
      tempSalidaProm: 0,
      tempLlegadaProm: 0,
      tempRodilloLisoProm: 0,
      tempRodilloNeumaticoProm: 0,
      unidadesSinTemperatura: 0
    },
    controlPistaColumns: {
      hideHoraFinalColocacion: false,
      hideTempRodilloLiso: false,
      hideTempRodilloNeumatico: false
    },
    controlPista: [
      {
        ordenColocacion: '',
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
