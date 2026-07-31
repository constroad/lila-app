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
  version: '1.1.0',
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
        { key: 'topografia.precision', label: 'PRECISION', type: 'text', span: 2 },
        // Igual que TOP-CMP: sin tolerancia declarada el protocolo no dictamina.
        { key: 'topografia.toleranciaPlanimetrica', label: 'TOL. PLANIM. (m)', type: 'number', span: 3 },
        { key: 'topografia.toleranciaAltimetrica', label: 'TOL. ALTIM. (m)', type: 'number', span: 3 }
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
        { key: 'cota', label: 'COTA (m)', type: 'number', width: 95, align: 'right', editable: true },
        { key: 'esteProyecto', label: 'ESTE PROY.', type: 'number', width: 105, align: 'right', editable: true },
        { key: 'norteProyecto', label: 'NORTE PROY.', type: 'number', width: 105, align: 'right', editable: true },
        { key: 'cotaProyecto', label: 'COTA PROY.', type: 'number', width: 100, align: 'right', editable: true },
        {
          key: 'error',
          label: 'ERROR (m)',
          type: 'number',
          width: 85,
          align: 'right',
          // Mismo criterio que TOP-CMP (es su hermano simple): el error de
          // replanteo se DERIVA de comparar contra el punto de proyecto. Sin esa
          // coordenada queda VACIO, no en cero.
          computed: true,
          formula: "num(row.esteProyecto) || num(row.norteProyecto) ? round(Math.sqrt(Math.pow(num(row.este) - num(row.esteProyecto), 2) + Math.pow(num(row.norte) - num(row.norteProyecto), 2)), 3) : ''",
          computedHint: 'Se calcula solo: distancia entre el punto medido y el de proyecto. Llena ESTE PROY. y NORTE PROY.',
        },
        {
          key: 'cumple',
          label: 'CUMPLE',
          type: 'select',
          width: 75,
          align: 'center',
          computed: true,
          formula: "num((data.topografia || {}).toleranciaPlanimetrica) > 0 && row.error !== '' ? (num(row.error) <= num((data.topografia || {}).toleranciaPlanimetrica) ? 'SI' : 'NO') : ''",
          computedHint: 'Se calcula solo: compara el ERROR con la TOL. PLANIM. declarada arriba.',
          options: [
            { value: 'SI', label: 'SI' },
            { value: 'NO', label: 'NO' }
          ]
        },
        {
          key: 'difCota',
          label: 'DIF. COTA (m)',
          type: 'number',
          width: 100,
          align: 'right',
          computed: true,
          formula: "num(row.cotaProyecto) ? round(num(row.cota) - num(row.cotaProyecto), 3) : ''",
          computedHint: 'Se calcula solo: COTA menos COTA PROY.',
        },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 140, align: 'left', editable: true }
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
      precision: '',
      toleranciaPlanimetrica: 0,
      toleranciaAltimetrica: 0
    },
    puntosControl: [
      { punto: '', este: 0, norte: 0, cota: 0, esteProyecto: 0, norteProyecto: 0, cotaProyecto: 0, error: '', cumple: '', difCota: '', observacion: '' }
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
