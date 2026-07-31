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
  version: '1.1.0',
  lastUpdated: '2026-07-31',
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
          // El dictamen se DERIVA de comparar el resultado con la especificacion
          // (>= 95, <= 5, 60-70, 95 +/- 2). La especificacion es texto libre: si
          // no se puede interpretar -"no presenta segregacion"- la formula
          // DEVUELVE LO TIPEADO. Nunca pisa el criterio del laboratorista, y el
          // try/catch interno garantiza que ningun fallo vacie la celda.
          computed: true,
          formula: "(() => { try { const espec = String(row.especificacion || '').trim(); const crudo = String(row.resultado || '').replace(',', '.').trim(); const previo = row.cumple || ''; if (!espec || crudo === '' || !Number.isFinite(Number(crudo))) return previo; const valor = Number(crudo); const rango = espec.match(/^([\\d.]+)\\s*(?:-|a)\\s*([\\d.]+)$/i); if (rango) return valor >= Number(rango[1]) && valor <= Number(rango[2]) ? 'SI' : 'NO'; const mas = espec.match(/([\\d.]+)\\s*(?:\\u00b1|\\+\\/-)\\s*([\\d.]+)/); if (mas) return Math.abs(valor - Number(mas[1])) <= Number(mas[2]) ? 'SI' : 'NO'; const min = espec.match(/(?:>=|\\u2265|min\\.?)\\s*([\\d.]+)/i); if (min) return valor >= Number(min[1]) ? 'SI' : 'NO'; const max = espec.match(/(?:<=|\\u2264|m\\u00e1x\\.?|max\\.?)\\s*([\\d.]+)/i); if (max) return valor <= Number(max[1]) ? 'SI' : 'NO'; return previo; } catch (error) { return row.cumple || ''; } })()",
          computedHint: 'Se calcula solo comparando RESULTADO con ESPECIFICACION (>= 95, <= 5, 60-70, 95 +/- 2). Con una especificacion cualitativa respeta lo que escribas.',
          options: [
            { value: 'SI', label: 'SI' },
            { value: 'NO', label: 'NO' }
          ]
        },
        { key: 'observacion', label: 'OBSERVACION', type: 'text', width: 180, align: 'left', editable: true }
      ]
    },
    {
      id: 'resumenCalidad',
      type: 'summary',
      title: 'Resumen de Conformidad',
      gridColumns: 4,
      fields: [
        { key: 'resumen.ensayos', label: 'ENSAYOS', type: 'number', span: 1 },
        { key: 'resumen.noConformes', label: 'NO CONFORMES', type: 'number', span: 1 },
        { key: 'resumen.conformidad', label: '% CONFORMIDAD', type: 'number', span: 1 },
        { key: 'resumen.condiciones', label: 'CONDICIONES (de 4)', type: 'number', span: 1 }
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
    resumen: {
      ensayos: 0,
      noConformes: 0,
      conformidad: 0,
      condiciones: 0
    },
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
  // Derivados de lo CRUDO: un protocolo con 12 ensayos obligaba a contar los
  // "NO" a ojo para saber si el lote se rechaza.
  computedFields: [
    {
      key: 'resumen.ensayos',
      formula: "(data.ensayos || []).filter((fila) => String(fila.ensayo || '').trim()).length",
      dependencies: ['ensayos'],
    },
    {
      key: 'resumen.noConformes',
      formula: "(data.ensayos || []).filter((fila) => String(fila.ensayo || '').trim() && String(fila.cumple || '') === 'NO').length",
      dependencies: ['ensayos'],
    },
    {
      key: 'resumen.conformidad',
      formula: "num(data.resumen.ensayos) > 0 ? round(((num(data.resumen.ensayos) - num(data.resumen.noConformes)) / num(data.resumen.ensayos)) * 100, 0) : 0",
      dependencies: ['resumen.ensayos', 'resumen.noConformes'],
    },
    {
      key: 'resumen.condiciones',
      formula: "['muestrasRotuladas', 'equiposCalibrados', 'cadenaCustodia', 'registroCompleto'].filter((clave) => (data.checklist || {})[clave]).length",
      dependencies: ['checklist'],
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
