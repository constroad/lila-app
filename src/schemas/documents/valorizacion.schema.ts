import { DocumentSchema } from './types';

/**
 * Schema definition for Valorizacion de Servicios (VAL-SRV).
 */
export const valorizacionSchema: DocumentSchema = {
  id: 'valorizacion',
  code: 'VAL-SRV',
  name: 'Valorizacion de Servicios',
  description: 'Valorizacion economica de servicios ejecutados por periodo.',
  category: 'Financial',
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
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'VALORIZACION DE SERVICIOS'],
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
          required: true
        },
        {
          key: 'proyecto.contratista',
          label: 'CONTRATISTA',
          type: 'text',
          span: 6
        },
        {
          key: 'proyecto.subcontratista',
          label: 'SUBCONTRATISTA',
          type: 'text',
          span: 6
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
          span: 8
        }
      ]
    },
    {
      id: 'periodo',
      type: 'simpleFields',
      title: 'Periodo de Valorizacion',
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
          key: 'valorizacion.numero',
          label: 'NRO VALORIZACION',
          type: 'text',
          span: 2,
          required: true
        },
        {
          key: 'valorizacion.moneda',
          label: 'MONEDA',
          type: 'select',
          span: 2,
          options: [
            { value: 'PEN', label: 'S/.' },
            { value: 'USD', label: 'USD' }
          ]
        }
      ]
    },
    {
      id: 'partidas',
      type: 'dataTable',
      title: 'Detalle de Valorizacion',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      showTotals: true,
      totalColumns: ['importe'],
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
          width: 320,
          align: 'left',
          editable: true,
          required: true
        },
        {
          key: 'unidad',
          label: 'UND',
          type: 'text',
          width: 60,
          align: 'center',
          editable: true
        },
        {
          key: 'cantidad',
          label: 'CANTIDAD',
          type: 'number',
          width: 90,
          align: 'right',
          editable: true
        },
        {
          key: 'precioUnitario',
          label: 'P.U.',
          type: 'currency',
          width: 100,
          align: 'right',
          editable: true
        },
        {
          key: 'importe',
          label: 'IMPORTE',
          type: 'currency',
          width: 110,
          align: 'right',
          computed: true,
          formula: 'row.cantidad * row.precioUnitario'
        }
      ]
    },
    {
      id: 'resumen',
      type: 'summary',
      title: 'Resumen',
      gridColumns: 4,
      fields: [
        {
          key: 'resumen.subtotal',
          label: 'SUBTOTAL',
          type: 'currency',
          span: 4,
          required: true
        },
        {
          key: 'resumen.igv',
          label: 'IGV',
          type: 'currency',
          span: 4
        },
        {
          key: 'resumen.total',
          label: 'TOTAL',
          type: 'currency',
          span: 4,
          required: true
        }
      ]
    },
    {
      id: 'observaciones',
      type: 'richText',
      title: 'Observaciones',
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        {
          key: 'elaboradoPor',
          label: 'ELABORADO POR',
          sublabel: 'Responsable de Valorizacion',
          entity: 'subcontratista',
          required: true,
          showCIP: true
        },
        {
          key: 'revisadoPor',
          label: 'REVISADO POR',
          sublabel: 'Supervisor',
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
      ordenCompra: '',
      ubicacion: ''
    },
    periodo: {
      inicio: '',
      fin: ''
    },
    valorizacion: {
      numero: '01',
      moneda: 'PEN'
    },
    partidas: [
      {
        item: '01',
        descripcion: '',
        unidad: 'm2',
        cantidad: 0,
        precioUnitario: 0,
        importe: 0
      }
    ],
    resumen: {
      subtotal: 0,
      igv: 0,
      total: 0
    },
    observaciones: '',
    firmas: {
      elaboradoPor: { nombre: '', cargo: 'Responsable de Valorizacion', cip: '' },
      revisadoPor: { nombre: '', cargo: 'Supervisor', cip: '' }
    }
  },
  computedFields: [
    {
      key: 'resumen.subtotal',
      formula: "sum(partidas, 'importe')",
      dependencies: ['partidas']
    },
    {
      key: 'resumen.igv',
      formula: 'resumen.subtotal * 0.18',
      dependencies: ['resumen.subtotal']
    },
    {
      key: 'resumen.total',
      formula: 'resumen.subtotal + resumen.igv',
      dependencies: ['resumen.subtotal', 'resumen.igv']
    }
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
