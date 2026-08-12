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
        // variant 'quoteIssuer': emisor a la izquierda (logo + nombre + RUC/
        // email/telefono/direccion) y caja de folio a la derecha, como el PDF.
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
          // código de industria ("ASF"). El tipo interno (Simple/COT-ASF) no se imprime.
          { label: 'COTIZACION N°', key: 'header.quoteNumber', folioPrefix: 'COT' },
          { label: 'FECHA', key: 'header.quoteDate' },
        ],
      },
    },
    {
      // Filas "SEÑOR(ES): valor" como el PDF legacy (sin heading ni labels flotantes).
      id: 'customer',
      type: 'simpleFields',
      title: 'Cliente',
      showTitle: false,
      fieldsVariant: 'inlineRows',
      inlineLabelWidth: 90,
      fields: [
        { key: 'customer.name', label: 'SEÑOR(ES)', type: 'text' },
        { key: 'customer.attention', label: 'ATT.', type: 'text' },
        { key: 'customer.reference', label: 'REF.', type: 'text' },
      ],
    },
    {
      id: 'intro',
      type: 'richText',
      title: 'Presentacion',
      // El PDF legacy no muestra heading: el texto de presentación va directo.
      showTitle: false,
    },
    {
      id: 'items',
      type: 'dataTable',
      title: 'Detalle de Cotizacion',
      showTitle: false,
      // tableStyle 'columns' + relleno hasta 12 filas + decimales fijos = PDF legacy.
      tableStyle: 'columns',
      // Relleno de la tabla a la MITAD (12 -> 6). Con 1 solo ítem, 12 filas
      // vacías comían un tercio de la hoja y empujaban el cierre (firma + cuentas)
      // a una segunda página (producción, COT-0000273). 6 alcanzan para que la
      // tabla se lea "cerrada" sin gastar la hoja.
      minVisibleRows: 6,
      dynamicRows: true,
      minRows: 1,
      columns: [
        {
          key: 'itemCode',
          label: 'ITEM',
          type: 'text',
          width: 40,
          align: 'center',
          computed: true,
          formula: "'' + (rows.length + 1)",
        },
        { key: 'description', label: 'DESCRIPCION', type: 'text', width: 320, align: 'left' },
        { key: 'unit', label: 'UND.', type: 'text', width: 50, align: 'center' },
        { key: 'quantity', label: 'CANTIDAD', type: 'number', width: 82, align: 'right', decimals: 3 },
        { key: 'unitPrice', label: 'P. UNIT. PEN', type: 'currency', width: 86, align: 'right', decimals: 2 },
        {
          key: 'lineTotal',
          label: 'PARCIAL PEN',
          type: 'currency',
          width: 92,
          align: 'right',
          decimals: 2,
          computed: true,
          formula: 'round(num(row.quantity) * num(row.unitPrice), 2)',
        },
      ],
    },
    {
      // Igual que el PDF legacy: monto en letras a la izquierda + caja de
      // totales con bordes pegada a la derecha (sin heading "TOTALES").
      id: 'totals',
      type: 'totalsPanel',
      title: 'Totales',
      totalsConfig: {
        amountInWordsKey: 'totals.amountInWords',
        rows: [
          { label: 'V. VENTA', key: 'totals.subtotal' },
          { label: 'IGV (18%)', key: 'totals.igv' },
          { label: 'TOTAL', key: 'totals.total' },
        ],
      },
    },
    {
      id: 'observations',
      type: 'richText',
      title: 'Observaciones',
    },
    {
      // Filas "FORMA DE PAGO: valor" como los term-rows del PDF legacy.
      id: 'commercialTerms',
      type: 'simpleFields',
      title: 'Condiciones Comerciales',
      fieldsVariant: 'inlineRows',
      inlineLabelWidth: 150,
      fields: [
        { key: 'commercialTerms.paymentTerms', label: 'FORMA DE PAGO', type: 'text' },
        { key: 'commercialTerms.deliveryPlace', label: 'LUGAR DE ENTREGA', type: 'text' },
        { key: 'commercialTerms.offerValidUntil', label: 'OFERTA VALIDA HASTA', type: 'text' },
        { key: 'commercialTerms.deliveryLeadTime', label: 'PLAZO DE ENTREGA', type: 'text' },
      ],
    },
    {
      // Cierre comercial del PDF legacy: despedida + ATENTAMENTE + firma a la
      // izquierda y panel de cuentas bancarias a la derecha (reemplaza a las
      // antiguas secciones "Asesor Comercial" y tabla de cuentas).
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
          contactKey: 'seller.phone',
        },
        bankAccountsKey: 'issuerBankAccounts',
        bankTitle: 'Cuentas bancarias',
      },
    },
    {
      // Pie compacto sobre una regla superior (sin labels DIRECCION/TELEFONO…).
      id: 'footer',
      type: 'footerNote',
      title: 'Pie de página',
      footerConfig: {
        lines: [
          { key: 'footer.address', placeholder: 'Dirección' },
          { key: 'footer.phone', placeholder: 'Teléfono' },
          { key: 'footer.website', placeholder: 'Web' },
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
      igvRate: 0.18,
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
