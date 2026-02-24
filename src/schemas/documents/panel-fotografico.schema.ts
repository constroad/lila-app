import { DocumentSchema } from './types';

/**
 * Schema definition for Panel Fotografico de Obra (PNL-FOT).
 */
export const panelFotograficoSchema: DocumentSchema = {
  id: 'panel-fotografico',
  code: 'PNL-FOT',
  name: 'Panel Fotografico de Obra',
  description: 'Registro fotografico de trabajos ejecutados y ensayos de control de calidad.',
  category: 'Documentation',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'PANEL FOTOGRAFICO'],
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
        {
          key: 'proyecto.obra',
          label: 'OBRA',
          type: 'text',
          span: 12,
          required: true,
          placeholder: 'Ej: MEJORAMIENTO AV. JUAN PABLO II'
        },
        {
          key: 'proyecto.contratista',
          label: 'CONTRATISTA',
          type: 'text',
          span: 6,
          placeholder: 'Empresa contratista principal'
        },
        {
          key: 'proyecto.subcontratista',
          label: 'SUBCONTRATISTA',
          type: 'text',
          span: 6,
          placeholder: 'Empresa subcontratista'
        },
        {
          key: 'proyecto.cui',
          label: 'CUI',
          type: 'text',
          span: 4,
          placeholder: 'Codigo Unico de Inversion'
        },
        {
          key: 'proyecto.rucSubcontratista',
          label: 'RUC SUBCONTRATISTA',
          type: 'text',
          span: 4,
          placeholder: '20123456789'
        },
        {
          key: 'proyecto.ordenCompra',
          label: 'ORDEN DE COMPRA',
          type: 'text',
          span: 4
        },
        {
          key: 'proyecto.ubicacion',
          label: 'UBICACION',
          type: 'text',
          span: 12,
          placeholder: 'Km 0+000 - Km 0+500'
        }
      ]
    },
    {
      id: 'periodo',
      type: 'simpleFields',
      title: 'Periodo',
      gridColumns: 4,
      fields: [
        {
          key: 'periodo.inicio',
          label: 'INICIO',
          type: 'date',
          span: 4,
          required: true
        },
        {
          key: 'periodo.fin',
          label: 'FIN',
          type: 'date',
          span: 4,
          required: true
        },
        {
          key: 'numeroPanel',
          label: 'NUMERO DE PANEL',
          type: 'number',
          span: 2,
          required: true
        },
        {
          key: 'version',
          label: 'VERSION',
          type: 'text',
          span: 2,
          required: true
        }
      ]
    },
    {
      id: 'partidasIncluidas',
      type: 'dataTable',
      title: 'Partidas Incluidas',
      dynamicRows: true,
      minRows: 1,
      maxRows: 50,
      columns: [
        {
          key: 'item',
          label: 'ITEM',
          type: 'text',
          width: 80,
          align: 'center',
          editable: true,
          required: true
        },
        {
          key: 'descripcion',
          label: 'DESCRIPCION',
          type: 'text',
          width: 400,
          align: 'left',
          editable: true,
          required: true
        },
        {
          key: 'unidad',
          label: 'UNIDAD',
          type: 'text',
          width: 80,
          align: 'center',
          editable: true,
          placeholder: 'm2'
        },
        {
          key: 'progresivas',
          label: 'PROGRESIVAS',
          type: 'text',
          width: 150,
          align: 'center',
          editable: true,
          placeholder: 'Km 0+000 - Km 0+500'
        }
      ]
    },
    {
      id: 'trabajosCampo',
      type: 'photoSection',
      title: 'II. REGISTRO FOTOGRAFICO - TRABAJOS EJECUTADOS EN CAMPO',
      maxImages: 20,
      layout: '2x3',
      showProgresiva: true,
      showFecha: true,
      categories: [
        { key: 'IMPRIMACION', label: 'Imprimacion', maxPhotos: 5 },
        { key: 'COLOCACION_ASFALTO', label: 'Colocacion Asfalto', maxPhotos: 5 },
        { key: 'COMPACTACION', label: 'Compactacion', maxPhotos: 5 },
        { key: 'ACABADO_FINAL', label: 'Acabado Final', maxPhotos: 5 }
      ]
    },
    {
      id: 'ensayosCampo',
      type: 'photoSection',
      title: 'III. REGISTRO FOTOGRAFICO - ENSAYOS DE CAMPO',
      maxImages: 20,
      layout: '2x2',
      showProgresiva: true,
      showFecha: true,
      categories: [
        { key: 'CONTROL_TEMPERATURA', label: 'Control Temperatura', maxPhotos: 5 },
        { key: 'CONTROL_ESPESOR', label: 'Control Espesor', maxPhotos: 5 },
        { key: 'DENSIDAD_CAMPO', label: 'Densidad de Campo', maxPhotos: 5 },
        { key: 'EXTRACCION_DIAMANTINA', label: 'Extraccion Testigos', maxPhotos: 5 }
      ]
    },
    {
      id: 'ensayosLaboratorio',
      type: 'photoSection',
      title: 'IV. REGISTRO FOTOGRAFICO - ENSAYOS DE LABORATORIO',
      maxImages: 20,
      layout: '2x2',
      showFecha: true,
      categories: [
        { key: 'MARSHALL', label: 'Ensayo Marshall', maxPhotos: 5 },
        { key: 'LAVADO_ASFALTICO', label: 'Lavado Asfaltico', maxPhotos: 5 },
        { key: 'EXTRACCION_DIAMANTINA_LAB', label: 'Diamantinas (Lab)', maxPhotos: 5 },
        { key: 'GRANULOMETRIA', label: 'Granulometria', maxPhotos: 5 }
      ]
    },
    {
      id: 'resultadosEnsayos',
      type: 'resultsTable',
      title: 'V. RESUMEN DE RESULTADOS DE ENSAYOS',
      dynamicRows: true,
      minRows: 1,
      maxRows: 25,
      columns: [
        {
          key: 'ensayo',
          label: 'ENSAYO',
          type: 'text',
          width: 200,
          align: 'left',
          editable: true,
          placeholder: 'Ej: Densidad Marshall (gr/cm3)'
        },
        {
          key: 'resultado',
          label: 'RESULTADO',
          type: 'text',
          width: 120,
          align: 'center',
          editable: true,
          placeholder: '2.38'
        },
        {
          key: 'especificacion',
          label: 'ESPECIFICACION',
          type: 'text',
          width: 150,
          align: 'center',
          editable: true,
          placeholder: '>= 2.35'
        },
        {
          key: 'cumple',
          label: 'CUMPLE',
          type: 'select',
          width: 100,
          align: 'center',
          editable: true,
          options: [
            { value: 'true', label: 'SI', color: 'green' },
            { value: 'false', label: 'NO', color: 'red' }
          ]
        }
      ]
    },
    {
      id: 'observaciones',
      type: 'richText',
      title: 'VI. OBSERVACIONES',
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'VII. FIRMAS DE CONFORMIDAD',
      signatures: [
        {
          key: 'elaboradoPor',
          label: 'ELABORADO POR',
          sublabel: 'Ing. Responsable de Produccion',
          entity: 'subcontratista',
          required: true,
          showCIP: true
        },
        {
          key: 'revisadoPor',
          label: 'REVISADO POR',
          sublabel: 'Ing. de Suelos y Pavimentos',
          entity: 'contratista',
          required: true,
          showCIP: true
        },
        {
          key: 'aprobadoPor',
          label: 'APROBADO POR',
          sublabel: 'Ing. de Calidad',
          entity: 'contratista',
          required: true,
          showCIP: true
        }
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
      rucSubcontratista: '',
      cui: '',
      ordenCompra: '',
      ubicacion: ''
    },
    periodo: {
      inicio: '',
      fin: ''
    },
    numeroPanel: 1,
    version: '1.0',
    partidasIncluidas: [
      { item: '01', descripcion: '', unidad: 'm2', progresivas: '' }
    ],
    secciones: {
      trabajosCampo: { fotos: [] },
      ensayosCampo: { fotos: [] },
      ensayosLaboratorio: { fotos: [] }
    },
    resumenFotografico: {
      fotosTrabajoCampo: 0,
      fotosEnsayoCampo: 0,
      fotosEnsayoLaboratorio: 0,
      totalFotos: 0
    },
    resultadosEnsayos: [],
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Ing. Responsable de Produccion', cip: '' },
      revisadoPor: { nombre: '', cargo: 'Ing. de Suelos y Pavimentos', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Ing. de Calidad', cip: '' }
    },
    observaciones: ''
  },
  computedFields: [
    {
      key: 'resumenFotografico.totalFotos',
      formula: 'resumenFotografico.fotosTrabajoCampo + resumenFotografico.fotosEnsayoCampo + resumenFotografico.fotosEnsayoLaboratorio',
      dependencies: [
        'resumenFotografico.fotosTrabajoCampo',
        'resumenFotografico.fotosEnsayoCampo',
        'resumenFotografico.fotosEnsayoLaboratorio'
      ]
    }
  ],
  exportOptions: {
    docx: true,
    pdf: true,
    excel: false
  },
  normativeReference: [
    'EG-2013 MTC - Manual de Carreteras: Especificaciones Tecnicas Generales para Construccion',
    'CE.010 Pavimentos Urbanos - Reglamento Nacional de Edificaciones'
  ]
};
