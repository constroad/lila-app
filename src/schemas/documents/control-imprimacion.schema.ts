import { DocumentSchema } from './types';

const emptyMeasurementValues = () => ({
  uno: '',
  dos: '',
  tres: '',
});

const emptyControl = () => ({
  id: 'control-1',
  tramo: '',
  progresivaDesde: '',
  progresivaHasta: '',
  carril: '',
  horaInicio: '',
  horaFinal: '',
  material: {
    ligante: 'MC-30',
    gravilla: '',
    pesoEspecifico: '',
    velocidad: '',
    alturaBarraEsparcidor: '',
    penetracion: '',
  },
  equipo: {
    camionLabel: 'Camión',
    camion: '',
  },
  bandeja: {
    pesoBandejaSinAsfalto: emptyMeasurementValues(),
    pesoBandejaConAsfalto: emptyMeasurementValues(),
    pesoAsfalto: emptyMeasurementValues(),
    areaBandeja: emptyMeasurementValues(),
    rangoEsparcido: emptyMeasurementValues(),
    volumenEsparcido: emptyMeasurementValues(),
    volumenCorregido15_6: emptyMeasurementValues(),
    volumenCorregidoGalones: emptyMeasurementValues(),
    rangoEsparcidoPromedio: '',
  },
  camionImprimador: {
    lecturaInicial: '',
    lecturaFinal: '',
    consumo: '',
    longitud: '',
    ancho: '',
    areaTerreno: '',
    tasaRiegoCorregida: '',
    tasaRiegoCorregidaGalones: '',
  },
  temperaturaRiegoAsfaltico: '',
  temperaturaAmbiente: '',
  factorCorreccionTemperatura: 1,
  observaciones: '',
});

export const controlImprimacionSchema: DocumentSchema = {
  id: 'control-imprimacion',
  code: 'CTL-IMP',
  name: 'Control de Imprimacion',
  description: 'Control de tasa de imprimación con hoja repetible por control.',
  category: 'Quality',
  version: '2.0.0',
  lastUpdated: '2026-04-30',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 8, right: 8, bottom: 8, left: 8 },
  sections: [
    {
      id: 'header',
      type: 'header',
      pageOrientation: 'portrait',
      headerConfig: {
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.companyName',
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'PROTOCOLO DE RIEGO DE IMPRIMACION'],
        rightFields: [
          { label: 'CODIGO', key: 'header.codigo' },
          { label: 'VERSION', key: 'header.version' },
          { label: 'FECHA', key: 'header.fecha' },
          { label: 'FOLIO', key: 'header.pagina' },
        ],
      },
    },
    {
      id: 'registroFotografico',
      type: 'photoPanel',
      title: 'Panel Fotografico',
      pageBreakBefore: true,
      includeHeader: true,
      pageOrientation: 'portrait',
      maxImages: 20,
      layout: '2x3',
      showFecha: true,
      showProgresiva: true,
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatureStyle: 'line',
      pageBreakBefore: true,
      pageOrientation: 'portrait',
      signatures: [
        { key: 'responsable', label: 'RESPONSABLE', sublabel: 'Responsable', showCIP: true },
        { key: 'supervisadoPor', label: 'SUPERVISADO POR', sublabel: 'Supervisor', showCIP: true },
        { key: 'cliente', label: 'CLIENTE', sublabel: 'Cliente', showCIP: true },
      ],
    },
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
    general: {
      cliente: '',
      proyecto: '',
      ubicacion: '',
      responsable: '',
    },
    controles: [emptyControl()],
    registroFotografico: {
      fotos: [],
    },
    panelFotografico: {
      fotos: [],
    },
    firmas: {
      responsable: { nombre: '', cargo: 'Responsable', empresa: '', cip: '' },
      supervisadoPor: { nombre: '', cargo: 'Supervisado por', empresa: '', cip: '' },
      cliente: { nombre: '', cargo: 'Cliente', empresa: '', cip: '' },
    },
  },
  exportOptions: {
    pdf: true,
    docx: false,
    excel: false,
  },
};
