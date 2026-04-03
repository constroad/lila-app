import { DocumentSchema } from './types';

/**
 * Schema definition for Protocolo Topografia Completo (TOP-CMP).
 */
export const protocoloTopoCompletoSchema: DocumentSchema = {
  id: 'protocolo-topo-completo',
  code: 'TOP-CMP',
  name: 'Protocolo Topografia Completo',
  description: 'Registro completo de control topografico con planimetria y altimetria.',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'PROTOCOLO TOPOGRAFIA COMPLETO'],
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
      title: 'Informacion General',
      gridColumns: 4,
      fields: [
        { key: 'topografia.fecha', label: 'FECHA', type: 'date', span: 3, required: true },
        { key: 'topografia.equipo', label: 'EQUIPO', type: 'text', span: 4 },
        { key: 'topografia.operador', label: 'OPERADOR', type: 'text', span: 4 },
        { key: 'topografia.sistemaReferencia', label: 'SISTEMA REF.', type: 'text', span: 5 },
        { key: 'topografia.metodologia', label: 'METODOLOGIA', type: 'text', span: 4 }
      ]
    },
    {
      id: 'planimetria',
      type: 'dataTable',
      title: 'Planimetria',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'punto', label: 'PUNTO', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'este', label: 'ESTE (m)', type: 'number', width: 120, align: 'right', editable: true },
        { key: 'norte', label: 'NORTE (m)', type: 'number', width: 120, align: 'right', editable: true },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 200, align: 'left', editable: true }
      ]
    },
    {
      id: 'altimetria',
      type: 'dataTable',
      title: 'Altimetria',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'punto', label: 'PUNTO', type: 'text', width: 90, align: 'center', editable: true },
        { key: 'cota', label: 'COTA (m)', type: 'number', width: 120, align: 'right', editable: true },
        { key: 'diferencia', label: 'DIFERENCIA', type: 'number', width: 120, align: 'right', editable: true },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 200, align: 'left', editable: true }
      ]
    },
    {
      id: 'resumenControl',
      type: 'resultsTable',
      title: 'Resumen de Control',
      dynamicRows: true,
      minRows: 1,
      maxRows: 50,
      columns: [
        { key: 'control', label: 'CONTROL', type: 'text', width: 200, align: 'left', editable: true },
        { key: 'resultado', label: 'RESULTADO', type: 'text', width: 120, align: 'center', editable: true },
        { key: 'tolerancia', label: 'TOLERANCIA', type: 'text', width: 120, align: 'center', editable: true },
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
        }
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
      metodologia: ''
    },
    planimetria: [
      { punto: '', este: 0, norte: 0, observacion: '' }
    ],
    altimetria: [
      { punto: '', cota: 0, diferencia: 0, observacion: '' }
    ],
    resumenControl: [
      { control: '', resultado: '', tolerancia: '', cumple: 'SI' }
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
