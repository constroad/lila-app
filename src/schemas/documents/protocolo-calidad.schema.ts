import { DocumentSchema } from './types';

/**
 * Schema definition for Protocolo de Control de Calidad (CAL-PROT).
 */
export const protocoloCalidadSchema: DocumentSchema = {
  id: 'protocolo-calidad',
  code: 'CAL-PROT',
  name: 'Protocolo de Control de Calidad',
  description: 'Registro de ensayos y verificaciones de calidad.',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'PROTOCOLO DE CONTROL DE CALIDAD'],
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
      title: 'Informacion del Protocolo',
      gridColumns: 4,
      fields: [
        { key: 'control.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        { key: 'control.laboratorio', label: 'LABORATORIO', type: 'text', span: 5 },
        { key: 'control.responsable', label: 'RESPONSABLE', type: 'text', span: 4 },
        { key: 'control.norma', label: 'NORMA / ESPEC.', type: 'text', span: 4 }
      ]
    },
    {
      id: 'ensayos',
      type: 'dataTable',
      title: 'Ensayos de Calidad',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'ensayo', label: 'ENSAYO', type: 'text', width: 180, align: 'left', editable: true },
        { key: 'metodo', label: 'METODO', type: 'text', width: 120, align: 'center', editable: true },
        { key: 'resultado', label: 'RESULTADO', type: 'text', width: 110, align: 'center', editable: true },
        { key: 'especificacion', label: 'ESPECIFICACION', type: 'text', width: 130, align: 'center', editable: true },
        {
          key: 'cumple',
          label: 'CUMPLE',
          type: 'select',
          width: 90,
          align: 'center',
          editable: true,
          options: [
            { value: 'SI', label: 'SI' },
            { value: 'NO', label: 'NO' }
          ]
        },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 180, align: 'left', editable: true }
      ]
    },
    {
      id: 'checklist',
      type: 'checklist',
      title: 'Verificacion de Condiciones',
      items: [
        { key: 'muestrasRotuladas', label: 'Muestras rotuladas', required: true },
        { key: 'equiposCalibrados', label: 'Equipos calibrados', required: true },
        { key: 'cadenaCustodia', label: 'Cadena de custodia', required: true },
        { key: 'registroCompleto', label: 'Registro completo', required: true }
      ]
    },
    {
      id: 'registroFotografico',
      type: 'photoPanel',
      title: 'Panel Fotografico',
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
        { key: 'elaboradoPor', label: 'ELABORADO POR', sublabel: 'Responsable de Calidad', required: true, showCIP: true },
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
    control: {
      fecha: '',
      laboratorio: '',
      responsable: '',
      norma: ''
    },
    ensayos: [
      { ensayo: '', metodo: '', resultado: '', especificacion: '', cumple: 'SI', observacion: '' }
    ],
    checklist: {
      muestrasRotuladas: false,
      equiposCalibrados: false,
      cadenaCustodia: false,
      registroCompleto: false
    },
    registroFotografico: { fotos: [] },
    observaciones: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Responsable de Calidad', cip: '' },
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
