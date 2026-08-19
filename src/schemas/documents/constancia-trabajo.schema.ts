import { DocumentSchema } from './types';

/**
 * CONS-TRA — Constancia de Trabajo.
 *
 * Documento administrativo de una hoja: la empresa certifica que una persona
 * trabajo con ella, en que cargos y durante cuanto tiempo.
 *
 * **Todo se tipea.** El legajo (`employee`) no guarda fecha de ingreso ni
 * historial de cargos, asi que no hay nada que sembrar: intentar derivarlo de
 * la asistencia daria un dato plausible y falso en un documento que la persona
 * lleva a un banco o a otro empleador. Lo unico derivado es la ARITMETICA de
 * fechas, que si es verificable.
 *
 * Dos reglas de dominio que sostienen el resto:
 *
 * 1. **Un periodo sin `hasta` esta ABIERTO**, no vacio ni cerrado hoy. La
 *    persona sigue trabajando; estampar la fecha de hoy congelaria un dato
 *    falso apenas se reimprima el documento.
 * 2. **El periodo abierto se mide contra la fecha del DOCUMENTO**, nunca contra
 *    "hoy". Un documento firmado que cambia de numeros al reimprimirse no se
 *    puede auditar. Misma regla que el atraso de LEV-OBS.
 */

/**
 * Antiguedad legible entre dos fechas date-only (`ini`, `fin`).
 *
 * Cuenta meses de CALENDARIO recortando el string `YYYY-MM-DD`, y no dividiendo
 * milisegundos por un "mes promedio". Dos motivos, los dos descubiertos por los
 * tests:
 *
 * 1. La division por un mes promedio da **11 meses para exactamente un anio**
 *    (365 dias / 30.44 = 11.99, y el floor lo corta). En una constancia de
 *    trabajo ese redondeo perjudica a la persona.
 * 2. Recortar el string no construye ningun `Date`, asi que la zona horaria no
 *    participa. Es la misma disciplina date-only del resto de Portal: una fecha
 *    de negocio no se convierte, se lee.
 *
 * Vacio si no se puede calcular: un "0 meses" se lee como un dato verificado.
 */
const antiguedadEntre = (ini: string, fin: string) => `(() => {
  const RX = /^\\d{4}-\\d{2}-\\d{2}$/;
  const ini = String(${ini} || '').trim().slice(0, 10);
  const fin = String(${fin} || '').trim().slice(0, 10);
  if (!RX.test(ini) || !RX.test(fin)) return '';
  let meses = (+fin.slice(0, 4) - +ini.slice(0, 4)) * 12 + (+fin.slice(5, 7) - +ini.slice(5, 7));
  if (+fin.slice(8, 10) < +ini.slice(8, 10)) meses--;
  if (meses < 0) return '';
  const anios = Math.floor(meses / 12), resto = meses % 12;
  if (!anios && !resto) return 'menos de 1 mes';
  return [
    anios ? anios + (anios === 1 ? ' anio' : ' anios') : '',
    resto ? resto + (resto === 1 ? ' mes' : ' meses') : ''
  ].filter(Boolean).join(', ');
})()`;

/** Fin del periodo de una fila: su `hasta`, o la fecha del DOCUMENTO si sigue abierto. */
const FIN_DE_FILA = `(String(row.hasta || '').trim() || String((data.header || {}).fecha || '').trim())`;

const FORMULA_TIEMPO = antiguedadEntre('row.desde', FIN_DE_FILA);

/** Filas con fecha de inicio: las vacias de la tabla no cuentan como periodo. */
const FILAS_VALIDAS = `(data.periodos || []).filter((p) => String(p.desde || '').trim())`;

export const constanciaTrabajoSchema: DocumentSchema = {
  id: 'constancia-trabajo',
  code: 'CONS-TRA',
  name: 'Constancia de Trabajo',
  description:
    'Constancia de que una persona presto servicios en la empresa, con sus cargos y periodos.',
  category: 'Administrative',
  version: '1.0.0',
  lastUpdated: '2026-08-19',
  orientation: 'portrait',
  pageSize: 'A4',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  sections: [
    {
      // Membrete de CARTA: el logo manda. Sin caja de 3 celdas ni panel de
      // CODIGO/VERSION/FOLIO — ese chrome es de registro interno y hacía que la
      // constancia se leyera como un informe.
      id: 'header',
      type: 'header',
      headerConfig: {
        variant: 'certificate',
        logoKey: 'header.logoUrl',
        leftTextKey: 'header.issuerName',
        placeKey: 'header.lugar',
        dateKey: 'header.fecha',
      },
    },
    {
      // El texto del heading vive en `data.titulo` (el renderer lo lee por el
      // id de la seccion, no por `title`), asi que se siembra en defaultData.
      id: 'titulo',
      type: 'heading',
      title: 'Titulo',
      headingLevel: 1,
    },
    {
      // El documento es una CARTA: los datos de la persona van en la prosa, no
      // en una tabla. Un cuadro "Datos del Trabajador" con NOMBRES / DOCUMENTO
      // / AREA es formato de registro interno; una constancia se lee corrida.
      // Se siembra con el nombre y el documento ya redactados.
      id: 'cuerpo',
      type: 'richText',
      // El rotulo se ve en el inspector y en los controles del canvas, pero NO
      // se imprime: en una carta nadie escribe "Cuerpo" encima del parrafo.
      title: 'Cuerpo',
      showTitle: false,
    },
    {
      id: 'periodos',
      type: 'dataTable',
      title: 'Periodos y Cargos',
      dataKey: 'periodos',
      minVisibleRows: 3,
      columns: [
        { key: 'desde', label: 'DESDE', type: 'date', width: 100, align: 'center', editable: true, required: true },
        {
          key: 'hasta',
          label: 'HASTA',
          type: 'date',
          width: 100,
          align: 'center',
          editable: true,
          // Sin `required`: un trabajador ACTIVO no tiene fecha de salida, y
          // exigirla obligaria a inventar uno.
          placeholder: 'A la fecha',
        },
        { key: 'puesto', label: 'CARGO / PUESTO', type: 'text', width: 220, align: 'left', editable: true, required: true },
        {
          key: 'tiempo',
          label: 'TIEMPO',
          type: 'text',
          width: 120,
          align: 'center',
          computed: true,
          formula: FORMULA_TIEMPO,
          computedHint:
            'Se calcula solo con DESDE y HASTA. Si dejas HASTA en blanco, el periodo cuenta hasta la fecha de la constancia.',
        },
      ],
    },
    {
      id: 'cierre',
      type: 'richText',
      title: 'Cierre',
      showTitle: false,
    },
    {
      id: 'firmas',
      type: 'signatures',
      title: 'Firmas',
      showTitle: false,
      signatures: [
        { key: 'representante', label: 'LA EMPRESA', sublabel: 'Representante autorizado', required: true },
      ],
    },
    {
      id: 'pie',
      type: 'footerNote',
      title: 'Pie de pagina',
      footerConfig: {
        lines: [
          { key: 'footer.address', placeholder: 'Direccion' },
          { key: 'footer.phone', placeholder: 'Telefono' },
          { key: 'footer.email', placeholder: 'Email' },
        ],
      },
    },
  ],
  computedFields: [
    {
      key: 'resumen.desde',
      label: 'Inicio',
      formula: `${FILAS_VALIDAS}.map((p) => String(p.desde)).sort()[0] || ''`,
    },
    {
      key: 'resumen.hasta',
      label: 'Fin',
      // Un solo periodo abierto deja TODO abierto: la persona sigue trabajando,
      // aunque cargos anteriores ya tengan fecha de cierre.
      formula: `${FILAS_VALIDAS}.some((p) => !String(p.hasta || '').trim())
        ? 'A LA FECHA'
        : (${FILAS_VALIDAS}.map((p) => String(p.hasta)).sort().slice(-1)[0] || '')`,
    },
    {
      key: 'resumen.tiempoTotal',
      label: 'Tiempo de servicio',
      // Del primer inicio al ultimo cierre (o a la fecha del documento si sigue
      // abierto). NO es la suma de los periodos: sumarlos contaria dos veces un
      // solapamiento y dejaria fuera los meses entre dos cargos.
      formula: antiguedadEntre(
        `${FILAS_VALIDAS}.map((p) => String(p.desde)).sort()[0]`,
        `(${FILAS_VALIDAS}.some((p) => !String(p.hasta || '').trim())
          ? String((data.header || {}).fecha || '')
          : ${FILAS_VALIDAS}.map((p) => String(p.hasta)).sort().slice(-1)[0])`
      ),
    },
  ],
  defaultData: {
    header: {
      logoUrl: '',
      issuerName: '',
      issuerRuc: '',
      issuerAddress: '',
      numero: '',
      lugar: '',
      fecha: '',
    },
    titulo: 'CONSTANCIA DE TRABAJO',
    // La identidad se REDACTA en el cuerpo (lo siembra Portal con el nombre y
    // el documento). `empleado` sigue existiendo como dato estructurado del
    // registro —alimenta el listado y la busqueda— pero ya no se imprime como
    // tabla.
    cuerpo: '',
    cierre:
      'Se expide la presente constancia a solicitud del interesado, para los ' +
      'fines que estime conveniente.',
    empleado: {
      nombre: '',
      tipoDocumento: 'DNI',
      documento: '',
      area: '',
    },
    periodos: [],
    resumen: {
      desde: '',
      hasta: '',
      tiempoTotal: '',
    },
    firmas: {
      representante: { name: '', role: '', signatureUrl: '' },
    },
    footer: {
      address: '',
      phone: '',
      email: '',
    },
  },
};
