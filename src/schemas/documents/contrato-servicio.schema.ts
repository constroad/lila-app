import { DocumentSchema } from './types';

const CLAUSULA1_DEFAULT = `EL CLIENTE está dedicada a la Elaboración de Perfiles y Expedientes, Ejecución y Supervisión de Obras Públicas y Privadas.

EL PROVEEDOR, empresa jurídica, que declara tener conocimiento y todo tipo de obras de pavimentación y que cuenta con especialista y maquinaria necesarias para poder desarrollar la presente obra.`;

const CLAUSULA2_TRABAJOS_DEFAULT = `Los trabajos a realizar tendrán las siguientes características básicas, las cuales no son limitativas:

a) Movilización y desmovilización de maquinarias y herramientas
Bajo esta partida el subcontratista deberá ejecutar las acciones necesarias para suministrar y transportar los elementos necesarios de su organización al lugar del servicio, incluyendo, equipos mecánicos, materiales, herramientas y en general todo lo necesario para instalar y empezar los trabajos.

b) Seguridad y salud en el trabajo - Equipos de protección individual
Comprenden los equipos de protección individual (EPP) que deben ser utilizados por el personal del servicio a ejecutar, para estar protegidos asociados a los trabajos que se realicen, de acuerdo a la Norma G.050 Seguridad durante la construcción, del Reglamento Nacional de Edificaciones.

c) Fresado, imprimación, riego de liga y carpeta asfáltica en caliente
Cuando corresponda según las partidas contratadas, EL PROVEEDOR ejecutará fresado de carpeta asfáltica, imprimación asfáltica MC-30, riego de liga, colocación de carpeta asfáltica en caliente y elementos complementarios.

EL PROVEEDOR deberá realizar todos los ensayos de los materiales empleados, de acuerdo a la Norma Técnica de Edificaciones CE 010, Pavimentos Urbanos, y proporcionar los certificados de calidad y garantía de los trabajos efectuados. Las partidas y metrados aplicables constarán en el anexo o cuadro contractual correspondiente.`;

const CLAUSULA4_DEFAULT = `EL CLIENTE se obliga a pagar la contraprestación a EL PROVEEDOR en Soles, de la siguiente manera:

EL PROVEEDOR se obliga a entregar a EL CLIENTE las guías de remisión remitente, por los materiales y/o servicios que realizara día a día, para poder efectuar el pago correspondiente.

Los pagos se realizarán de acuerdo a los avances de obra verificados y aprobados por la supervisión, de acuerdo al siguiente cronograma de pagos:

- Abono 01: Al inicio de trabajos, previo a la movilización de equipos.
- Abono 02: A la mitad de ejecución de la obra, previa valorización aprobada.
- Abono 03: A la finalización y conformidad de todos los trabajos.

EL CLIENTE efectuará los pagos mediante depósito bancario a las cuentas indicadas por EL PROVEEDOR en el presente contrato, dentro de los 15 días calendario contados desde la presentación de la factura correspondiente.`;

const CLAUSULA5_DEFAULT = `El plazo de ejecución de la prestación se extenderá desde el día siguiente de la suscripción del presente contrato, hasta que EL CLIENTE otorgue la conformidad del cumplimiento de la prestación a cargo de EL PROVEEDOR y se efectuará la recepción, debiendo considerarse como ejecutada al término de dicho plazo.

El inicio de los trabajos está condicionado a que EL CLIENTE proporcione el acceso a la obra y las condiciones previas necesarias para la ejecución, incluyendo la base terminada que cumpla con las especificaciones técnicas del expediente.

La conformidad del servicio será otorgada por EL CLIENTE en un plazo no mayor a 10 días calendario contados desde la culminación de los trabajos, previa verificación del cumplimiento de las especificaciones técnicas.

En caso de incumplimiento del plazo por causas imputables a EL PROVEEDOR, se aplicará una penalidad de 0.10% del monto del contrato por cada día de retraso, hasta un máximo del 10% del monto total.`;

const CLAUSULA6_DEFAULT = `En lo no previsto en este contrato, en la Ley y su Reglamento, será de aplicación las disposiciones pertinentes del Código Civil vigente y demás normas concordantes del ordenamiento jurídico peruano.`;

const CLAUSULA7_DEFAULT = `EL CLIENTE entrega a EL PROVEEDOR el acabado de la base cumpliendo con las especificaciones técnicas del expediente junto con los certificados y ensayos de compactación previos a la imprimación asfáltica, siendo responsabilidad de EL CLIENTE las fallas de los niveles de terminación del terreno.

Dar las garantías del caso para la buena ejecución de la obra, así mismo todo pago sindical será cubierto por EL CLIENTE.

Para la ejecución de trabajos adicionales, distintos a los especificados en el presente contrato y no contemplados en el mismo, se requiere de común acuerdo de las partes la suscripción de la CLÁUSULA adicional respectiva.

EL PROVEEDOR es responsable por el personal que lleva a obra (Cuadrilla), por lo que debe entregar al inicio del servicio copia de los DNI del personal, así como el SCTR al Residente, para que puedan ingresar a obra.

EL PROVEEDOR garantiza que la mezcla asfáltica en caliente llegará al lugar de ejecución con una temperatura mínima de 135 °C, salvo especificación técnica distinta acordada por escrito.

El espesor de la carpeta asfáltica será el definido en las partidas o especificaciones técnicas contratadas y será controlado durante la colocación.

Ni la suscripción del Acta de Recepción del servicio, ni el consentimiento de la liquidación del contrato de obra, enervan el derecho de EL CLIENTE a reclamar, posteriormente, por defectos o vicios ocultos, conforme al artículo 40 de la Ley de Contrataciones del Estado y el artículo 146 de su Reglamento. El plazo máximo de responsabilidad de EL PROVEEDOR es de 7 AÑOS, contados a partir de la conformidad de la recepción del Servicio, sin comprender fallas estructurales o de subbase ajenas a la prestación contratada.`;

const CLAUSULA8_DEFAULT = `Cualquiera de las partes tiene el derecho a iniciar el arbitraje administrativo a fin de resolver las controversias que se presenten durante la etapa de ejecución contractual, conforme a los artículos 144, 170, 175 y 177 del Reglamento y el artículo 52 de la Ley.

Facultativamente, cualquiera de las partes podrá someter a conciliación la referida controversia, conforme al artículo 214 del Reglamento de la Ley de Contrataciones del Estado, sin perjuicio de recurrir al arbitraje.

El laudo arbitral emitido es definitivo e inapelable, tiene el valor de cosa juzgada y se ejecuta como una sentencia.`;

const CLAUSULA9_DEFAULT = `Las partes contratantes han declarado sus respectivos domicilios en la parte introductoria del presente contrato. Cualquier cambio de domicilio deberá ser comunicado por escrito a la otra parte con una anticipación mínima de 5 días hábiles.`;

export const contratoServicioSchema: DocumentSchema = {
  id: 'contrato-servicio',
  code: 'CONT-SRV',
  name: 'Contrato de Servicio',
  description: 'Contrato de colocación de mezclas asfálticas u otros servicios bajo el sistema de precios unitarios.',
  category: 'Administrative',
  version: '1.2.0',
  lastUpdated: '2026-05-25',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  backgroundImageEnabled: true,
  sections: [
    {
      id: 'titulo',
      type: 'simpleFields',
      title: 'Encabezado del Contrato',
      gridColumns: 1,
      fields: [
        {
          key: 'titulo.texto',
          label: 'TÍTULO DEL CONTRATO',
          type: 'text',
          span: 12,
          placeholder: 'CONTRATO DE COLOCACIÓN DE MEZCLAS ASFÁLTICAS EN CALIENTE...',
        },
      ],
    },
    {
      id: 'partes',
      type: 'simpleFields',
      title: 'Partes Contratantes',
      defaultCollapsed: false,
      gridColumns: 2,
      fields: [
        { key: 'proveedor.razonSocial', label: 'PROVEEDOR - Razón Social', type: 'text', span: 6 },
        { key: 'proveedor.ruc', label: 'RUC', type: 'text', span: 3 },
        { key: 'proveedor.domicilio', label: 'Domicilio', type: 'text', span: 9 },
        { key: 'proveedor.representante', label: 'Representante Legal', type: 'text', span: 6 },
        { key: 'proveedor.dniRepresentante', label: 'DNI Representante', type: 'text', span: 3 },
        { key: 'cliente.razonSocial', label: 'CLIENTE - Razón Social', type: 'text', span: 6 },
        { key: 'cliente.ruc', label: 'RUC', type: 'text', span: 3 },
        { key: 'cliente.domicilio', label: 'Domicilio', type: 'text', span: 9 },
        { key: 'cliente.representante', label: 'Representante Legal', type: 'text', span: 6 },
        { key: 'cliente.dniRepresentante', label: 'DNI Representante', type: 'text', span: 3 },
      ],
    },
    {
      id: 'clausula1',
      type: 'richText',
      title: 'CLAUSULA PRIMERA: ANTECEDENTES',
    },
    {
      id: 'clausula2Obra',
      type: 'simpleFields',
      title: 'CLAUSULA SEGUNDA: OBJETO - Datos de la Obra',
      gridColumns: 4,
      fields: [
        { key: 'obra.nombre', label: 'OBRA', type: 'text', span: 12 },
        { key: 'obra.cui', label: 'CUI', type: 'text', span: 4 },
        { key: 'obra.ubicacion', label: 'UBICACIÓN', type: 'text', span: 8 },
      ],
    },
    {
      id: 'clausula2Trabajos',
      type: 'richText',
      title: 'Descripción de los Trabajos',
    },
    {
      id: 'clausula3Monto',
      type: 'simpleFields',
      title: 'CLAUSULA TERCERA: MONTO CONTRACTUAL',
      defaultCollapsed: false,
      gridColumns: 4,
      fields: [
        { key: 'monto.total', label: 'MONTO TOTAL (S/)', type: 'currency', span: 4 },
        { key: 'monto.totalEnLetras', label: 'MONTO EN LETRAS (auto)', type: 'text', span: 8 },
        { key: 'monto.descripcionMetrado', label: 'DESCRIPCIÓN DEL METRADO', type: 'text', span: 12 },
      ],
    },
    {
      id: 'preciosUnitarios',
      type: 'dataTable',
      title: 'Precios Unitarios',
      defaultCollapsed: false,
      dynamicRows: true,
      minRows: 1,
      showTotals: false,
      columns: [
        { key: 'detalle', label: 'DETALLE', type: 'text', width: 300, align: 'left', editable: true },
        { key: 'unidad', label: 'UND.', type: 'text', width: 70, align: 'center', editable: true },
        { key: 'costo', label: 'COSTO (S/)', type: 'currency', width: 100, align: 'right', editable: true },
      ],
    },
    {
      id: 'clausula4FormaPago',
      type: 'richText',
      title: 'CLAUSULA CUARTA: FORMA DE PAGO Y GARANTÍA DE CRÉDITO',
    },
    {
      id: 'sectoresPago',
      type: 'dataTable',
      title: 'Partidas y Costos por Sector/Etapa',
      dynamicRows: true,
      minRows: 1,
      showTotals: false,
      columns: [
        { key: 'sector', label: 'SECTOR/ETAPA', type: 'text', width: 110, align: 'left', editable: true },
        { key: 'itemCode', label: 'ITEM', type: 'text', width: 55, align: 'center', editable: true },
        { key: 'descripcion', label: 'DESCRIPCIÓN', type: 'text', width: 190, align: 'left', editable: true },
        { key: 'unidad', label: 'UNID.', type: 'text', width: 55, align: 'center', editable: true },
        { key: 'metrado', label: 'METRADO', type: 'number', width: 70, align: 'right', editable: true },
        { key: 'precioUnit', label: 'PRECIO UNIT.', type: 'currency', width: 90, align: 'right', editable: true },
        { key: 'parcial', label: 'P. PARCIAL', type: 'currency', width: 90, align: 'right', editable: true },
      ],
    },
    {
      id: 'cuentasBancarias',
      type: 'dataTable',
      title: 'Cuentas Bancarias del Proveedor',
      dynamicRows: true,
      minRows: 0,
      columns: [
        { key: 'banco', label: 'BANCO', type: 'text', width: 120, align: 'left', editable: true },
        { key: 'cuenta', label: 'CUENTA', type: 'text', width: 160, align: 'left', editable: true },
        { key: 'cci', label: 'CCI', type: 'text', width: 190, align: 'left', editable: true },
        { key: 'tipo', label: 'TIPO', type: 'text', width: 90, align: 'left', editable: true },
      ],
    },
    {
      id: 'clausula5Plazos',
      type: 'simpleFields',
      title: 'CLAUSULA QUINTA: INICIO Y CULMINACIÓN',
      gridColumns: 4,
      fields: [
        { key: 'plazos.fechaInicio', label: 'FECHA DE INICIO', type: 'date', span: 3 },
        { key: 'plazos.fechaCulminacion', label: 'FECHA DE CULMINACIÓN', type: 'date', span: 3 },
        { key: 'plazos.responsableInicio', label: 'RESPONSABLE DE INICIO', type: 'text', span: 6 },
        { key: 'plazos.descripcion', label: 'DESCRIPCIÓN DEL PLAZO', type: 'text', span: 12 },
      ],
    },
    {
      id: 'clausula5Texto',
      type: 'richText',
      title: 'Condiciones del Plazo',
    },
    {
      id: 'clausula6Marco',
      type: 'richText',
      title: 'CLAUSULA SEXTA: MARCO LEGAL DEL CONTRATO',
    },
    {
      id: 'clausula7Responsabilidades',
      type: 'richText',
      title: 'CLAUSULA SEPTIMA: RESPONSABILIDAD DEL CLIENTE Y EL PROVEEDOR',
    },
    {
      id: 'clausula8Arbitraje',
      type: 'richText',
      title: 'CLAUSULA OCTAVA: ARBITRAJE',
    },
    {
      id: 'clausula9Domicilios',
      type: 'richText',
      title: 'CLAUSULA NOVENA: VERACIDAD DE DOMICILIOS',
    },
    {
      id: 'cierre',
      type: 'simpleFields',
      title: 'Cierre y Fecha de Firma',
      gridColumns: 4,
      fields: [
        { key: 'cierre.ciudad', label: 'CIUDAD', type: 'text', span: 4 },
        { key: 'cierre.fechaFirma', label: 'FECHA DE FIRMA', type: 'date', span: 4 },
      ],
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      signatures: [
        {
          key: 'firmas.cliente',
          label: 'EL CLIENTE',
          sublabel: 'Representante Legal',
          entity: 'cliente',
        },
        {
          key: 'firmas.proveedor',
          label: 'EL PROVEEDOR',
          sublabel: 'Representante Legal',
          entity: 'proveedor',
        },
      ],
    },
  ],
  defaultData: {
    branding: {
      backgroundImageUrl: '',
    },
    titulo: {
      texto: 'CONTRATO DE COLOCACIÓN DE MEZCLAS ASFÁLTICAS EN CALIENTE (BAJO EL SISTEMA DE PRECIOS UNITARIOS)',
    },
    proveedor: {
      razonSocial: '',
      ruc: '',
      domicilio: '',
      representante: '',
      dniRepresentante: '',
    },
    cliente: {
      razonSocial: '',
      ruc: '',
      domicilio: '',
      representante: '',
      dniRepresentante: '',
    },
    clausula1: CLAUSULA1_DEFAULT,
    obra: {
      nombre: '',
      cui: '',
      ubicacion: '',
    },
    clausula2Trabajos: CLAUSULA2_TRABAJOS_DEFAULT,
    monto: {
      total: 0,
      totalEnLetras: '',
      descripcionMetrado: '',
    },
    preciosUnitarios: [
      { detalle: '', unidad: '', costo: 0 },
    ],
    clausula4FormaPago: CLAUSULA4_DEFAULT,
    sectoresPago: [
      {
        sector: '',
        itemCode: '',
        descripcion: '',
        unidad: '',
        metrado: 0,
        precioUnit: 0,
        parcial: 0,
      },
    ],
    cuentasBancarias: [],
    plazos: {
      fechaInicio: '',
      fechaCulminacion: '',
      responsableInicio: '',
      descripcion: '',
    },
    clausula5Texto: CLAUSULA5_DEFAULT,
    clausula6Marco: CLAUSULA6_DEFAULT,
    clausula7Responsabilidades: CLAUSULA7_DEFAULT,
    clausula8Arbitraje: CLAUSULA8_DEFAULT,
    clausula9Domicilios: CLAUSULA9_DEFAULT,
    cierre: {
      ciudad: 'Lima',
      fechaFirma: '',
    },
    firmas: {
      cliente: { nombre: '', cargo: 'Representante Legal' },
      proveedor: { nombre: '', cargo: 'Representante Legal' },
    },
  },
  exportOptions: {
    pdf: true,
    docx: true,
    excel: false,
  },
};
