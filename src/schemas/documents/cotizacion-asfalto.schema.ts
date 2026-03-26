import { DocumentSchema } from './types';

/**
 * Schema base para cotización de asfalto (COT-ASF).
 * Diseñado para renderizar cotizaciones comerciales en formato A4.
 */
export const cotizacionAsfaltoSchema: DocumentSchema = {
  id: 'cotizacion-asfalto',
  code: 'COT-ASF',
  name: 'Cotización de Asfalto',
  description: 'Documento comercial de cotización para venta de asfalto.',
  category: 'Financial',
  version: '1.0.0',
  lastUpdated: '2026-03-25',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  sections: [
    {
      id: 'header',
      type: 'header',
      headerConfig: {
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.issuerName',
        centerLinesKeys: ['header.issuerAddress', 'header.issuerPhone', 'header.issuerRuc'],
        rightFields: [
          { label: 'COTIZACION N°', key: 'header.quoteNumber' },
          { label: 'FECHA', key: 'header.quoteDate' },
        ],
      },
    },
    {
      id: 'customer',
      type: 'simpleFields',
      title: 'Cliente',
      gridColumns: 4,
      fields: [
        { key: 'customer.name', label: 'SENOR(ES)', type: 'text', span: 12 },
        { key: 'customer.attention', label: 'ATT', type: 'text', span: 6 },
        { key: 'customer.reference', label: 'REF', type: 'text', span: 6 },
      ],
    },
    {
      id: 'intro',
      type: 'richText',
      title: 'Presentacion',
    },
    {
      id: 'items',
      type: 'dataTable',
      title: 'Detalle de Cotizacion',
      dynamicRows: true,
      minRows: 1,
      columns: [
        { key: 'itemCode', label: 'ITEM', type: 'text', width: 55, align: 'center' },
        { key: 'description', label: 'DESCRIPCION', type: 'text', width: 220, align: 'left' },
        { key: 'unit', label: 'UND.', type: 'text', width: 60, align: 'center' },
        { key: 'quantity', label: 'CANTIDAD', type: 'number', width: 90, align: 'right' },
        { key: 'unitPrice', label: 'P. UNIT. PEN', type: 'currency', width: 95, align: 'right' },
        { key: 'lineTotal', label: 'PARCIAL PEN', type: 'currency', width: 95, align: 'right' },
        { key: 'lineNotes', label: 'GLOSA', type: 'text', width: 180, align: 'left' },
      ],
    },
    {
      id: 'totals',
      type: 'simpleFields',
      title: 'Totales',
      gridColumns: 4,
      fields: [
        { key: 'totals.amountInWords', label: 'SON', type: 'text', span: 12 },
        { key: 'totals.subtotal', label: 'V. VENTA PEN', type: 'currency', span: 4 },
        { key: 'totals.igv', label: 'IGV (18%)', type: 'currency', span: 4 },
        { key: 'totals.total', label: 'TOTAL PEN', type: 'currency', span: 4 },
      ],
    },
    {
      id: 'observations',
      type: 'richText',
      title: 'Observaciones',
    },
    {
      id: 'commercialTerms',
      type: 'simpleFields',
      title: 'Condiciones Comerciales',
      gridColumns: 4,
      fields: [
        { key: 'commercialTerms.paymentTerms', label: 'FORMA DE PAGO', type: 'text', span: 6 },
        { key: 'commercialTerms.deliveryPlace', label: 'LUGAR DE ENTREGA', type: 'text', span: 6 },
        { key: 'commercialTerms.offerValidUntil', label: 'OFERTA VALIDA HASTA', type: 'text', span: 6 },
        { key: 'commercialTerms.deliveryLeadTime', label: 'PLAZO DE ENTREGA', type: 'text', span: 6 },
      ],
    },
    {
      id: 'seller',
      type: 'simpleFields',
      title: 'Asesor Comercial',
      gridColumns: 4,
      fields: [
        { key: 'seller.name', label: 'NOMBRE', type: 'text', span: 3 },
        { key: 'seller.role', label: 'CARGO', type: 'text', span: 3 },
        { key: 'seller.phone', label: 'TELEFONO', type: 'text', span: 3 },
        { key: 'seller.email', label: 'EMAIL', type: 'text', span: 3 },
      ],
    },
    {
      id: 'issuerBankAccounts',
      type: 'dataTable',
      title: 'Cuentas Bancarias',
      dynamicRows: true,
      minRows: 0,
      columns: [
        { key: 'bank', label: 'BANCO', type: 'text', width: 120, align: 'left' },
        { key: 'account', label: 'CUENTA', type: 'text', width: 140, align: 'left' },
        { key: 'cci', label: 'CCI', type: 'text', width: 190, align: 'left' },
        { key: 'type', label: 'TIPO', type: 'text', width: 120, align: 'left' },
      ],
    },
    {
      id: 'footer',
      type: 'simpleFields',
      title: 'Pie de Pagina',
      gridColumns: 4,
      fields: [
        { key: 'footer.address', label: 'DIRECCION', type: 'text', span: 6 },
        { key: 'footer.phone', label: 'TELEFONO', type: 'text', span: 2 },
        { key: 'footer.email', label: 'EMAIL', type: 'text', span: 2 },
        { key: 'footer.website', label: 'WEB', type: 'text', span: 2 },
      ],
    },
  ],
  defaultData: {
    header: {
      logoUrl: '',
      issuerName: '',
      issuerAddress: '',
      issuerPhone: '',
      issuerEmail: '',
      issuerRuc: '',
      quoteNumber: '',
      quoteDate: '',
    },
    customer: {
      name: '',
      attention: '',
      reference: '',
    },
    intro: '',
    items: [],
    totals: {
      amountInWords: '',
      subtotal: 0,
      igv: 0,
      total: 0,
      currency: 'PEN',
    },
    observations: '',
    commercialTerms: {
      paymentTerms: '',
      deliveryPlace: 'Cajamarquilla',
      offerValidUntil: '7 días',
      deliveryLeadTime: '',
    },
    seller: {
      name: '',
      role: '',
      phone: '',
      email: '',
      signatureImageUrl: '',
    },
    issuerBankAccounts: [],
    footer: {
      address: '',
      phone: '',
      email: '',
      website: '',
    },
  },
  exportOptions: {
    pdf: true,
    docx: false,
    excel: false,
  },
};
