import { DocumentSchema } from './types';

export const dispatchNoteSchema: DocumentSchema = {
  id: 'dispatch-note',
  code: 'DISPATCH-NOTE',
  name: 'Vale de Despacho',
  description: 'Documento operativo para despacho de mezcla asfaltica.',
  category: 'Operations',
  version: '1.0.0',
  lastUpdated: '2026-03-30',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  sections: [
    {
      id: 'header',
      type: 'header',
      headerConfig: {
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.companyName',
        centerTitleKey: 'header.servicesTitle',
        centerSubtitleKey: 'header.companySubtitle',
        centerLinesKeys: ['header.serviceLines'],
        rightFields: [
          { label: 'VALE', key: 'dispatch.valeNumber' },
          { label: 'FECHA', key: 'dispatch.dispatchDate' },
        ],
      },
    },
    {
      id: 'dispatch',
      type: 'simpleFields',
      title: 'Despacho',
      gridColumns: 4,
      fields: [
        { key: 'dispatch.customerName', label: 'SENORES', type: 'text', span: 12 },
        { key: 'dispatch.projectName', label: 'OBRA', type: 'text', span: 12 },
        { key: 'dispatch.materialName', label: 'TIPO DE MATERIAL', type: 'text', span: 12 },
        { key: 'dispatch.quantityLabel', label: 'M3', type: 'text', span: 4 },
        { key: 'dispatch.plate', label: 'PLACA', type: 'text', span: 4 },
        { key: 'dispatch.driverName', label: 'CHOFER', type: 'text', span: 4 },
        { key: 'dispatch.dispatchHour', label: 'HORA', type: 'text', span: 4 },
        { key: 'dispatch.notes', label: 'NOTA', type: 'text', span: 8 },
      ],
    },
  ],
  defaultData: {
    header: {
      companyName: '',
      companySubtitle: '',
      logoUrl: '',
      servicesTitle: 'Servicios de Asfalto y Pavimentacion',
      serviceLines: [],
    },
    dispatch: {
      valeNumber: '',
      dispatchDate: '',
      customerName: '',
      projectName: '',
      materialName: '',
      quantity: 0,
      quantityLabel: '',
      plate: '',
      driverName: '',
      dispatchHour: '',
      notes: '',
    },
    footer: {
      generatedBy: '',
    },
  },
  exportOptions: {
    pdf: true,
    docx: false,
    excel: false,
  },
};
