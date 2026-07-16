import { DocumentSchema } from './types';

export const cotizacionServicioSchema: DocumentSchema = {
  id: 'cotizacion-servicio',
  code: 'COT-SER',
  name: 'Cotización de Servicio',
  description: 'Documento comercial de cotización para servicios y obras.',
  category: 'Financial',
  version: '1.1.0',
  lastUpdated: '2026-07-07',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  sections: [
    {
      id: 'header',
      type: 'header',
      headerConfig: {
        variant: 'quoteIssuer',
        boxTitle: 'COTIZACION',
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.issuerName',
        centerLinesKeys: [
          'header.issuerRuc',
          'header.issuerEmail',
          'header.issuerPhone',
          'header.issuerAddress',
        ],
        rightFields: [
          // folioPrefix NEUTRAL "COT": el documento del cliente no debe exponer un
          // código de industria ("SER"). El tipo interno (Agrupada/COT-SER) no se imprime.
          { label: 'COTIZACION N°', key: 'header.quoteNumber', folioPrefix: 'COT' },
          { label: 'FECHA', key: 'header.quoteDate' },
        ],
      },
    },
    {
      // Filas "CLIENTE: valor" como el PDF legacy (sin heading ni labels flotantes).
      id: 'customer',
      type: 'simpleFields',
      title: 'Cliente',
      showTitle: false,
      fieldsVariant: 'inlineRows',
      inlineLabelWidth: 70,
      fields: [
        { key: 'customer.name', label: 'CLIENTE', type: 'text' },
        { key: 'customer.ruc', label: 'RUC', type: 'text' },
        { key: 'customer.attention', label: 'ATT.', type: 'text' },
      ],
    },
    {
      id: 'intro',
      type: 'richText',
      title: 'Presentacion',
      // El PDF legacy no muestra heading: la presentación va directo.
      showTitle: false,
    },
    {
      id: 'items',
      type: 'dataTable',
      title: 'Detalle de Cotizacion',
      showTitle: false,
      // tableStyle 'columns' + agrupacion por fase (1 / 1.1 / 1.2…) + relleno = PDF legacy.
      tableStyle: 'columns',
      minVisibleRows: 20,
      groupBy: { key: 'phase', codeColumnKey: 'itemCode' },
      dynamicRows: true,
      minRows: 1,
      columns: [
        {
          key: 'itemCode',
          label: 'ITEM',
          type: 'text',
          width: 52,
          align: 'center',
          computed: true,
          formula: "'' + (rows.length + 1)",
        },
        { key: 'description', label: 'DESCRIPCION', type: 'text', width: 300, align: 'left' },
        { key: 'unit', label: 'UND.', type: 'text', width: 52, align: 'center' },
        { key: 'quantity', label: 'CANTIDAD', type: 'number', width: 72, align: 'right' },
        { key: 'unitPrice', label: 'P. UNIT.', type: 'currency', width: 80, align: 'right', decimals: 2 },
        {
          key: 'lineTotal',
          label: 'TOTAL',
          type: 'currency',
          width: 86,
          align: 'right',
          decimals: 2,
          computed: true,
          formula: 'round(num(row.quantity) * num(row.unitPrice), 2)',
        },
      ],
    },
    {
      // Igual que el PDF legacy: monto en letras + caja de totales a la derecha.
      id: 'totals',
      type: 'totalsPanel',
      title: 'Totales',
      totalsConfig: {
        amountInWordsKey: 'totals.amountInWords',
        rows: [
          { label: 'SUBTOTAL', key: 'totals.subtotal' },
          { label: 'IGV (18%)', key: 'totals.igv' },
          { label: 'TOTAL', key: 'totals.total' },
        ],
      },
    },
    {
      // Dos secciones INDEPENDIENTES que comparten el array `data.sections`
      // (sourceKey) por partición: "Condiciones de pago" a ancho completo…
      id: 'paymentTerms',
      type: 'noteSections',
      title: 'Condiciones de pago',
      noteSectionsConfig: {
        sourceKey: 'sections',
        partition: 'lead',
        leadTitle: 'Condiciones de pago',
        leadTitleContains: 'condiciones de pago',
      },
    },
    {
      // …y "Alcance del servicio" a 2 columnas (misma fuente, otra partición).
      id: 'scope',
      type: 'noteSections',
      title: 'Alcance del servicio',
      noteSectionsConfig: {
        sourceKey: 'sections',
        partition: 'scope',
        scopeTitle: 'Alcance del servicio',
        leadTitleContains: 'condiciones de pago',
      },
    },
    {
      // Cierre comercial del PDF legacy: despedida + ATENTAMENTE + firma a la
      // izquierda y panel de cuentas bancarias a la derecha.
      id: 'seller',
      type: 'signatureClosing',
      title: 'Firma y cuentas',
      closingConfig: {
        farewell: 'Sin otro particular, quedamos de ustedes.',
        signature: {
          imageKey: 'seller.signatureImageUrl',
          stampKey: 'seller.stampImageUrl',
          nameKey: 'seller.name',
          roleKey: 'seller.role',
        },
        bankAccountsKey: 'issuerBankAccounts',
        bankTitle: 'Cuentas bancarias',
      },
    },
    {
      // Pie compacto sobre una regla superior (sin labels).
      id: 'footer',
      type: 'footerNote',
      title: 'Pie de página',
      footerConfig: {
        lines: [
          { key: 'footer.address', placeholder: 'Dirección' },
          { key: 'footer.phone', placeholder: 'Teléfono' },
          { key: 'footer.email', placeholder: 'Email' },
        ],
      },
    },
  ],
  defaultData: {
    branding: {
      backgroundImageUrl: '',
    },
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
      ruc: '',
      attention: '',
    },
    intro: '',
    items: [],
    totals: {
      amountInWords: '',
      subtotal: 0,
      igv: 0,
      total: 0,
      igvRate: 0.18,
      currency: 'PEN',
    },
    sections: [],
    seller: {
      name: '',
      role: '',
      phone: '',
      email: '',
      signatureImageUrl: '',
      stampImageUrl: '',
    },
    issuerBankAccounts: [],
    footer: {
      address: '',
      phone: '',
      email: '',
      website: '',
    },
  },
  // Totales calculados por el motor del editor canvas (Portal). El renderer
  // Handlebars ignora esta metadata: sigue leyendo los valores ya calculados.
  computedFields: [
    {
      key: 'totals.subtotal',
      formula: "round(sum(items, 'lineTotal'), 2)",
      dependencies: ['items'],
    },
    {
      key: 'totals.igv',
      formula: 'round(num(totals.subtotal) * num(totals.igvRate), 2)',
      dependencies: ['totals.subtotal', 'totals.igvRate'],
    },
    {
      key: 'totals.total',
      formula: 'round(num(totals.subtotal) + num(totals.igv), 2)',
      dependencies: ['totals.subtotal', 'totals.igv'],
    },
  ],
  exportOptions: {
    pdf: true,
    docx: false,
    excel: false,
  },
  backgroundImageEnabled: true,
  // Ritmo vertical denso entre secciones (documento comercial compacto, legacy).
  compactPrint: true,
};
