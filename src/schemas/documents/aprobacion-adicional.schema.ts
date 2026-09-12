import { DocumentSchema } from './types';

/**
 * APR-ADI — Acta de aprobacion de adicional.
 *
 * **Lo que aporta es la DECISION del cliente, no el sustento tecnico.** El
 * cuadro "contratado vs ejecutado vs excedente" ya existe y vive en `REC-EXC`
 * (columnas `metradoContrato`, `metradoEjecutado`, `excedente`), y el metrado
 * medido sobre foto vive en `IAA`. Los dos los firma la empresa. Lo que no
 * existia en ningun papel es el SI del cliente sobre ese excedente.
 *
 * Por eso este acta **referencia** el documento de sustento (tipo, numero y
 * fecha) en vez de repetir su cuadro: dos papeles con el mismo metrado tipeado
 * dos veces terminan diciendo numeros distintos, y el que discute la deuda
 * elige el que le conviene.
 *
 * Tampoco se solapa con `VAL-SRV`, que valoriza lo ejecutado para cobrar
 * (item / cantidad / P.U. / importe, sin comparar contra el contrato): una
 * valorizacion cobra, esta acta autoriza a cobrar.
 *
 * El `detalle` por partida existe para el adicional que abarca mas de una
 * (mezcla + imprimacion, por ejemplo) y se OCULTA si esta vacio: el caso normal
 * es una sola cifra, y un cuadro en blanco hace dudar de si falto llenarlo.
 */
export const aprobacionAdicionalSchema: DocumentSchema = {
  id: 'aprobacion-adicional',
  code: 'APR-ADI',
  name: 'Acta de Aprobacion de Adicional',
  description:
    'Aprobacion firmada por el cliente del adicional sustentado en un informe previo.',
  category: 'Administrative',
  version: '1.0.0',
  lastUpdated: '2026-09-10',
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
        centerLines: ['REGISTRO', 'CONTROL DE OBRA', 'ACTA DE APROBACION DE ADICIONAL'],
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
        { key: 'proyecto.ubicacion', label: 'UBICACION', type: 'text', span: 12 },
      ],
    },
    {
      id: 'sustento',
      // No repite el cuadro del sustento: lo NOMBRA. Ver el comentario de arriba.
      type: 'simpleFields',
      title: 'Documento de Sustento',
      gridColumns: 4,
      fields: [
        {
          key: 'sustento.tipo',
          label: 'DOCUMENTO',
          type: 'select',
          span: 4,
          required: true,
          options: [
            { value: 'REC-EXC', label: 'REC-EXC - Informe tecnico reclamo excedente' },
            { value: 'IAA', label: 'IAA - Informe de area adicional' },
            { value: 'MET-RES', label: 'MET-RES - Resumen de metrados' },
            { value: 'OTRO', label: 'Otro' },
          ],
        },
        { key: 'sustento.numero', label: 'NUMERO', type: 'text', span: 4, required: true },
        { key: 'sustento.fecha', label: 'FECHA DEL DOCUMENTO', type: 'date', span: 4 },
        { key: 'sustento.contrato', label: 'CONTRATO / OS', type: 'text', span: 5 },
        { key: 'sustento.causa', label: 'CAUSA DEL ADICIONAL', type: 'text', span: 7 },
      ],
    },
    {
      id: 'adicional',
      type: 'simpleFields',
      title: 'Adicional Aprobado',
      gridColumns: 4,
      fields: [
        { key: 'adicional.concepto', label: 'CONCEPTO', type: 'text', span: 12, required: true },
        {
          key: 'adicional.unidad',
          label: 'UNIDAD',
          type: 'select',
          span: 2,
          defaultValue: 'm3',
          options: [
            { value: 'm3', label: 'm3' },
            { value: 'm2', label: 'm2' },
            { value: 'ton', label: 'ton' },
            { value: 'glb', label: 'glb' },
          ],
        },
        { key: 'adicional.cantidad', label: 'CANTIDAD APROBADA', type: 'number', span: 3, required: true },
        { key: 'adicional.precioUnitario', label: 'P. UNITARIO', type: 'currency', span: 3 },
        {
          key: 'adicional.montoAprobado',
          label: 'MONTO APROBADO',
          type: 'currency',
          span: 4,
          tooltip: 'Se calcula solo: cantidad por P. unitario, o la suma del detalle si lo hay.',
        },
      ],
    },
    {
      id: 'detalle',
      type: 'dataTable',
      title: 'Detalle por Partida (solo si el adicional abarca mas de una)',
      dynamicRows: true,
      // Vacio NO se imprime: el caso normal es una sola cifra y un cuadro en
      // blanco hace dudar de si falto llenarlo (mismo criterio que FRE-PAV).
      minRows: 0,
      maxRows: 50,
      hideWhenEmpty: true,
      columns: [
        { key: 'item', label: 'Nro', type: 'text', width: 60, align: 'center', editable: true },
        { key: 'descripcion', label: 'Descripcion', type: 'text', width: 260, align: 'left', editable: true },
        { key: 'unidad', label: 'Unidad', type: 'text', width: 80, align: 'center', editable: true },
        { key: 'cantidad', label: 'Cantidad', type: 'number', width: 100, align: 'right', editable: true, decimals: 2 },
        { key: 'precioUnitario', label: 'P. Unitario', type: 'currency', width: 110, align: 'right', editable: true },
        {
          key: 'importe',
          label: 'Importe',
          type: 'currency',
          width: 120,
          align: 'right',
          computed: true,
          formula:
            "num(row.cantidad) && num(row.precioUnitario) ? round(num(row.cantidad) * num(row.precioUnitario), 2) : ''",
          computedHint: 'Se calcula solo: Cantidad por P. Unitario.',
        },
      ],
    },
    {
      id: 'declaracion',
      type: 'checklist',
      title: 'Declaracion del Cliente',
      items: [
        {
          key: 'verificadoEnCampo',
          label: 'El adicional fue verificado en campo con el residente y la supervision',
          required: true,
        },
        {
          key: 'correspondeSustento',
          label: 'El metrado y el precio unitario corresponden al documento de sustento indicado',
          required: true,
        },
        {
          key: 'apruebaValorizacion',
          label: 'Se APRUEBA el adicional y se autoriza su valorizacion y facturacion',
          required: true,
        },
      ],
    },
    {
      id: 'observaciones',
      type: 'richText',
      title: 'Observaciones',
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        {
          key: 'presentadoPor',
          label: 'PRESENTADO POR',
          sublabel: 'Contratista',
          required: true,
          showCIP: true,
        },
        {
          key: 'aprobadoPor',
          label: 'APROBADO POR',
          sublabel: 'Representante del cliente',
          required: true,
          showCIP: true,
        },
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
    proyecto: {
      obra: '',
      contratista: '',
      subcontratista: '',
      ubicacion: '',
    },
    sustento: {
      tipo: 'REC-EXC',
      numero: '',
      fecha: '',
      contrato: '',
      causa: '',
    },
    adicional: {
      concepto: '',
      unidad: 'm3',
      cantidad: 0,
      precioUnitario: 0,
      montoAprobado: 0,
    },
    detalle: [],
    declaracion: {
      verificadoEnCampo: false,
      correspondeSustento: false,
      apruebaValorizacion: false,
    },
    observaciones: '',
    firmas: {
      presentadoPor: { nombre: '', cargo: 'Contratista', cip: '' },
      aprobadoPor: { nombre: '', cargo: 'Representante del cliente', cip: '' },
    },
  },
  computedFields: [
    {
      // El detalle MANDA cuando tiene filas con cantidad: si alguien lo llena,
      // la cifra de arriba deja de ser la fuente y pasa a ser su total. Se suma
      // desde cantidad x P.U. y no desde la columna `importe`, que solo se
      // persiste cuando alguien edita el cuadro en el canvas.
      key: 'adicional.montoAprobado',
      formula:
        'round((data.detalle || []).some((fila) => num(fila.cantidad) > 0) ? (data.detalle || []).reduce((total, fila) => total + num(fila.cantidad) * num(fila.precioUnitario), 0) : num(data.adicional && data.adicional.cantidad) * num(data.adicional && data.adicional.precioUnitario), 2)',
      dependencies: ['detalle', 'adicional'],
    },
  ],
  exportOptions: {
    docx: true,
    pdf: true,
    excel: false,
  },
};
