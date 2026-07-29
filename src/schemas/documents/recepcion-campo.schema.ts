import { DocumentSchema } from './types';

/**
 * Schema definition for Informe de Recepcion de Campo (RCP-CAM).
 *
 * Acto de recepcion del area de trabajo, calle por calle, ANTES de intervenir:
 * deja constancia de COMO se recibe (estado, interferencias, accesos) y de las
 * tareas que el cliente/tercero debe corregir. NO metra: las dimensiones son
 * identificacion del tramo, no cantidad para pago (eso vive en MET-RES, IAA y la
 * valorizacion). Por eso `calles` NO lleva columna de area ni fila de TOTAL.
 *
 * El detalle cualitativo por calle (interferencias / estado de superficie /
 * accesos) NO es una seccion de este schema: Portal lo sintetiza como una
 * seccion por calle en el canvas (`canvasRecepcionCampo`), igual que CTL-IMP
 * expande su header por tramo. Ver Portal/specs/RECEPCION-CAMPO.spec.md.
 */
export const recepcionCampoSchema: DocumentSchema = {
  id: 'recepcion-campo',
  code: 'RCP-CAM',
  name: 'Informe de Recepcion de Campo',
  description: 'Recepcion del area de trabajo por calle: estado recibido, tareas a corregir y evidencia.',
  category: 'Operations',
  version: '1.0.0',
  lastUpdated: '2026-07-28',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 15, right: 15, bottom: 15, left: 15 },
  sections: [
    {
      id: 'header',
      type: 'header',
      headerConfig: {
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.companyName',
        centerLines: ['REGISTRO', 'CONTROL DE CALIDAD', 'INFORME DE RECEPCION DE CAMPO'],
        rightFields: [
          { label: 'CODIGO', key: 'header.codigo' },
          { label: 'VERSION', key: 'header.version' },
          { label: 'FECHA', key: 'header.fecha' },
          { label: 'FOLIO', key: 'header.pagina' },
        ],
      },
    },
    {
      id: 'datosProyecto',
      type: 'projectData',
      title: 'Datos del Proyecto',
      gridColumns: 4,
      fields: [
        { key: 'proyecto.obra', label: 'OBRA', type: 'text', span: 4, required: true },
        { key: 'proyecto.entidad', label: 'ENTIDAD', type: 'text', span: 2 },
        { key: 'proyecto.contratista', label: 'CONTRATISTA', type: 'text', span: 2 },
        { key: 'proyecto.subcontratista', label: 'SUBCONTRATISTA', type: 'text', span: 2 },
        { key: 'proyecto.ubicacion', label: 'UBICACION', type: 'text', span: 2 },
      ],
    },
    {
      id: 'datosRecepcion',
      type: 'simpleFields',
      title: 'Datos de la Recepcion',
      gridColumns: 4,
      fields: [
        { key: 'recepcion.fecha', label: 'FECHA', type: 'date', span: 2, required: true },
        { key: 'recepcion.turno', label: 'TURNO', type: 'text', span: 2 },
        { key: 'recepcion.entregadoPor', label: 'ENTREGADO POR', type: 'text', span: 2 },
        { key: 'recepcion.recibidoPor', label: 'RECIBIDO POR', type: 'text', span: 2 },
        { key: 'recepcion.clima', label: 'CLIMA', type: 'text', span: 2 },
        {
          key: 'recepcion.libreImpedimentos',
          label: 'AREA LIBRE DE IMPEDIMENTOS',
          type: 'checkbox',
          span: 2,
        },
      ],
    },
    {
      // Cuadro resumen: IDENTIFICA lo recibido (que calle, que tramo, de que
      // medida) y su estado. `largo`/`ancho` delimitan el tramo; deliberadamente
      // NO hay columna de area ni `totalColumns` (ver docstring del schema).
      id: 'calles',
      type: 'dataTable',
      title: 'Calles Recibidas',
      dynamicRows: true,
      minRows: 1,
      maxRows: 100,
      columns: [
        { key: 'item', label: 'NRO', type: 'text', width: 60, align: 'center', editable: true },
        { key: 'calle', label: 'CALLE / VIA', type: 'text', width: 220, align: 'left', editable: true, required: true },
        { key: 'tramo', label: 'TRAMO (DESDE - HASTA)', type: 'text', width: 200, align: 'left', editable: true },
        { key: 'largo', label: 'LARGO (m)', type: 'number', width: 90, align: 'right', editable: true, decimals: 2 },
        { key: 'ancho', label: 'ANCHO (m)', type: 'number', width: 90, align: 'right', editable: true, decimals: 2 },
        {
          key: 'estado',
          label: 'ESTADO',
          type: 'select',
          width: 150,
          align: 'center',
          editable: true,
          required: true,
          options: [
            { value: 'CONFORME', label: 'CONFORME' },
            { value: 'CON_OBSERVACIONES', label: 'CON OBSERVACIONES' },
            { value: 'NO_CONFORME', label: 'NO CONFORME' },
          ],
        },
      ],
    },
    {
      // Punch list. `calleId` guarda el id de la fila de `calles`; el canvas lo
      // convierte en select con las calles del informe (Portal, fase F3). En el
      // schema base queda texto para que el tipo funcione sin ese reshaper.
      id: 'tareas',
      type: 'dataTable',
      title: 'Tareas a Corregir',
      dynamicRows: true,
      minRows: 1,
      maxRows: 200,
      columns: [
        { key: 'item', label: 'NRO', type: 'text', width: 60, align: 'center', editable: true },
        { key: 'calleId', label: 'CALLE', type: 'text', width: 170, align: 'left', editable: true },
        { key: 'descripcion', label: 'DESCRIPCION', type: 'text', width: 250, align: 'left', editable: true, required: true },
        {
          key: 'responsable',
          label: 'RESPONSABLE',
          type: 'select',
          width: 120,
          align: 'center',
          editable: true,
          options: [
            { value: 'CLIENTE', label: 'CLIENTE' },
            { value: 'CONTRATISTA', label: 'CONTRATISTA' },
            { value: 'TERCERO', label: 'TERCERO' },
          ],
        },
        {
          key: 'prioridad',
          label: 'PRIORIDAD',
          type: 'select',
          width: 90,
          align: 'center',
          editable: true,
          options: [
            { value: 'ALTA', label: 'ALTA' },
            { value: 'MEDIA', label: 'MEDIA' },
            { value: 'BAJA', label: 'BAJA' },
          ],
        },
        {
          key: 'estado',
          label: 'ESTADO',
          type: 'select',
          width: 110,
          align: 'center',
          editable: true,
          options: [
            { value: 'PENDIENTE', label: 'PENDIENTE' },
            { value: 'EN_PROCESO', label: 'EN PROCESO' },
            { value: 'RESUELTO', label: 'RESUELTO' },
          ],
        },
        { key: 'fechaCompromiso', label: 'F. COMPROMISO', type: 'date', width: 110, align: 'center', editable: true },
      ],
    },
    {
      // Las fotos se agrupan por calle (`photo.category === calle.id`), igual que
      // IAA agrupa por zona. Techo alto porque son N calles x varias fotos.
      id: 'panelFotografico',
      type: 'photoPanel',
      title: 'Panel Fotografico',
      maxImages: 60,
      layout: '2x3',
      showProgresiva: false,
      showFecha: true,
      pageBreakBefore: true,
      includeHeader: true,
      headerOverride: {
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
      id: 'observacionesGenerales',
      type: 'richText',
      title: 'Observaciones Generales',
    },
    {
      // Entrega (cliente) y recibe (nosotros): las dos partes del acto. Sin CIP:
      // el representante del cliente no es necesariamente colegiado.
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas de Recepcion',
      signatureStyle: 'line',
      signatures: [
        { key: 'entregadoPor', label: 'ENTREGADO POR', sublabel: 'Representante del cliente', required: true, showCIP: false },
        { key: 'recibidoPor', label: 'RECIBIDO POR', sublabel: 'Responsable de obra', required: true, showCIP: false },
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
      entidad: '',
      contratista: '',
      subcontratista: '',
      ubicacion: '',
    },
    recepcion: {
      fecha: '',
      turno: '',
      entregadoPor: '',
      recibidoPor: '',
      clima: '',
      libreImpedimentos: false,
    },
    // Fila semilla CON `id` estable: es la clave que liga la foto
    // (`photo.category === calle.id`) y la tarea (`tarea.calleId`) con su calle.
    // `estado` arranca VACIO a proposito: es una declaracion que se firma, no un
    // default.
    calles: [{ item: '01', id: 'calle-1', calle: '', tramo: '', largo: '', ancho: '', estado: '' }],
    // Punch list arranca VACIA (y sin fila semilla, para que el seeding de fechas
    // de Portal no rellene `fechaCompromiso` con la fecha de hoy).
    tareas: [],
    panelFotografico: { fotos: [] },
    observacionesGenerales: '',
    firmas: {
      entregadoPor: { nombre: '', cargo: 'Representante del cliente' },
      recibidoPor: { nombre: '', cargo: 'Responsable de obra' },
    },
  },
  exportOptions: {
    docx: true,
    pdf: true,
    excel: false,
  },
};
