import mongoose, { Model, Schema } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

const modelCache = new Map<string, Model<any>>();
const LIQUIDACION_IGV_FACTOR = 1.18;

type ReportRecord = Record<string, unknown>;

type LiquidacionRow = {
  item: string;
  descripcion: string;
  unidad: string;
  metrado: number;
  precioUnitario: number;
  parcial: number;
  adicional: boolean;
};

type LiquidacionPayment = {
  _financeEntryId: string;
  fecha: unknown;
  operacion: string;
  destinatario: string;
  monto: number;
};

function asRecord(value: unknown): ReportRecord {
  return value && typeof value === 'object' ? value as ReportRecord : {};
}

async function getFlexibleModel(modelName: string): Promise<Model<any>> {
  if (modelCache.has(modelName)) {
    return modelCache.get(modelName)!;
  }

  const conn = await getSharedConnection();
  const model =
    (conn.models[modelName] as Model<any>) ||
    conn.model(modelName, new Schema({}, { strict: false }));

  modelCache.set(modelName, model);
  return model;
}

function normalizeIds(ids: string[]): Array<string | mongoose.Types.ObjectId> {
  const unique = new Set<string>();
  ids.forEach((id) => {
    if (id) unique.add(String(id));
  });

  const results: Array<string | mongoose.Types.ObjectId> = [];
  for (const value of unique) {
    if (mongoose.Types.ObjectId.isValid(value)) {
      results.push(new mongoose.Types.ObjectId(value));
    }
    results.push(value);
  }

  return results;
}

export interface AggregatedReportData {
  service: any;
  client: any;
  company: any;
  orders: any[];
  dispatches: any[];
  certificates: any[];
  invoices: any[];
  payments: any[];
  financeEntries: ReportRecord[];
  financeMedia: ReportRecord[];
  serviceMedia: any[];
  orderMedia: any[];
  /** Informes del MISMO servicio. Un informe puede citar a otro: el reclamo por
   *  excedente se sustenta en los informes de area adicional ya levantados. */
  reports: ReportRecord[];
}

/**
 * Datos del proyecto para el informe. Autocompleta con FALLBACKS cuando el
 * servicio no trae el campo explícito (el personal de campo no edita el servicio):
 * contratista = cliente (contratista principal de la obra), subcontratista = la
 * empresa que ejecuta el servicio, ubicación = URL de mapa o dirección. Los valores
 * explícitos del servicio SIEMPRE ganan (misma convención que LIQ-SRV).
 */
function buildProjectData(service: any, orders: any[], client?: any, company?: any) {
  const orderNumbers = orders
    .map((o: any) => o.orderNumber || o.orderNumberId || o._id)
    .filter(Boolean)
    .join(', ');

  const companyName = company?.legalInfo?.businessName || company?.name || '';

  return {
    proyecto: {
      obra: service.projectName || service.description || '',
      contratista:
        service.contratista || service.contractor || client?.name || service.clientName || '',
      subcontratista: service.subcontratista || service.subcontractor || companyName || '',
      rucSubcontratista: service.rucSubcontratista || company?.legalInfo?.ruc || '',
      cui: service.cui || '',
      ordenCompra: orderNumbers,
      ubicacion: service.locationUrl || service.location?.address || '',
    },
  };
}

export async function aggregateReportData(
  serviceId: string
): Promise<AggregatedReportData> {
  const ServiceManagement = await getFlexibleModel('ServiceManagement');
  const Order = await getFlexibleModel('Order');
  const Client = await getFlexibleModel('Client');
  const Company = await getFlexibleModel('Company');
  const Dispatch = await getFlexibleModel('Dispatch');
  const Certificate = await getFlexibleModel('Certificate');
  const Invoice = await getFlexibleModel('Invoice');
  const Payment = await getFlexibleModel('Payment');
  const FinancialMovement = await getFlexibleModel('FinancialMovement');
  const Media = await getFlexibleModel('Media');
  const ServiceManagementDriveItem = await getFlexibleModel('ServiceManagementDriveItem');
  const ServiceManagementReport = await getFlexibleModel('ServiceManagementReport');

  const service = await ServiceManagement.findById(serviceId).lean();
  if (!service) {
    return {
      service: null,
      client: null,
      company: null,
      orders: [],
      dispatches: [],
      certificates: [],
      invoices: [],
      payments: [],
      financeEntries: [],
      financeMedia: [],
      serviceMedia: [],
      orderMedia: [],
      reports: [],
    };
  }

  const orderIds = Array.isArray(service.orderIds) ? service.orderIds : [];
  const orderQueryIds = normalizeIds(orderIds);
  const clientId = String(service.clientId || '').trim();

  const client =
    clientId && mongoose.Types.ObjectId.isValid(clientId)
      ? await Client.findById(new mongoose.Types.ObjectId(clientId)).lean()
      : clientId
      ? await Client.findOne({ _id: clientId }).lean()
      : null;

  // Empresa emisora del servicio: fallback de subcontratista (empresa ejecutora).
  const serviceCompanyId = String(service.companyId || '').trim();
  const company = serviceCompanyId
    ? await Company.findOne({ companyId: serviceCompanyId }).lean()
    : null;

  const orders = orderQueryIds.length
    ? await Order.find({ _id: { $in: orderQueryIds } }).lean()
    : [];

  const dispatches = orderQueryIds.length
    ? await Dispatch.find({ orderId: { $in: orderQueryIds } }).lean()
    : [];

  const certificates = orderQueryIds.length
    ? await Certificate.find({ orderId: { $in: orderQueryIds } }).lean()
    : [];

  const invoices = orderQueryIds.length
    ? await Invoice.find({ orderId: { $in: orderQueryIds } }).lean()
    : [];

  const payments = orderQueryIds.length
    ? await Payment.find({ orderId: { $in: orderQueryIds } }).lean()
    : [];

  const financeEntries = await FinancialMovement.find({
    serviceManagementId: serviceId,
    sourceModule: 'service_finance',
    recordStatus: { $nin: ['cancelled', 'deleted'] },
  }).lean();
  const financeEntryIds = financeEntries
    .map((entry) => String(entry._id || '').trim())
    .filter(Boolean);
  const financeResourceIds = financeEntryIds.flatMap((id) => [id, `service-finance-${id}`]);
  const financeMedia = financeResourceIds.length
    ? await Media.find({
        resourceId: { $in: financeResourceIds },
        type: 'SERVICE_FINANCE',
        status: { $ne: 'DELETED' },
      }).lean()
    : [];

  const serviceMedia = await ServiceManagementDriveItem.find({
    serviceManagementId: serviceId,
  }).lean();

  // Solo lo necesario para citar informes entre si (tipo, fecha y su cuadro).
  const reports = await ServiceManagementReport.find({ serviceManagementId: serviceId })
    .select({ type: 1, date: 1, status: 1, 'schemaData.cuadroMetrado': 1 })
    .lean();

  return {
    service,
    client,
    company,
    orders,
    dispatches,
    certificates,
    invoices,
    payments,
    financeEntries,
    financeMedia,
    serviceMedia,
    orderMedia: [],
    reports,
  };
}

/**
 * Sustento del reclamo a partir de los INFORMES DE AREA ADICIONAL del servicio.
 *
 * IAA y REC-EXC no son el mismo informe -IAA prueba trabajo FUERA del contrato,
 * midiendolo en campo; REC-EXC reclama MAS CANTIDAD de una partida existente-,
 * pero estaban desconectados: el area ya medida con foto se volvia a tipear.
 * NO se siembra el metrado ejecutado por partida: IAA mide por ZONA y el reclamo
 * va por PARTIDA, asi que mapearlos seria adivinar. Se cita la evidencia, que es
 * verificable, y el responsable decide cuanto reclama.
 */
function buildSustentoDesdeIaa(reports: ReportRecord[]): string {
  const iaa = reports.filter((report) => String(report.type || '') === 'IAA');
  if (iaa.length === 0) return '';

  const detalle = iaa.map((report) => {
    const zonas = ((asRecord(report.schemaData).cuadroMetrado as ReportRecord[]) || []);
    const area = zonas.reduce((total, zona) => total + toCurrencyAmount(zona.area), 0);
    const fecha = toLimaDateOnly(report.date);
    return `- Informe de area adicional${fecha ? ` del ${fecha}` : ''}: ${zonas.length} zona(s), ${area.toFixed(2)} m2 medidos.`;
  });

  return [
    'Sustento en informes de area adicional del servicio:',
    ...detalle,
    'El metrado ejecutado de cada partida debe verificarse contra estos informes.',
  ].join('\n');
}

function toCurrencyAmount(value: unknown): number {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function addLiquidacionIgv(subtotal: number): number {
  return Number((subtotal * LIQUIDACION_IGV_FACTOR).toFixed(2));
}

/** Fecha date-only en LIMA. Un despacho de las 02:00Z es del dia ANTERIOR en Peru. */
function toLimaDateOnly(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(date);
}

type ActividadRow = {
  fecha: string;
  actividad: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  ubicacion: string;
};

/**
 * Actividades realizadas a partir de los DESPACHOS del servicio, agrupadas POR
 * DIA: un dia con 8 viajes es una actividad con 8 viajes, no 8 filas. La cantidad
 * es el m3 del dia y los equipos salen de las placas reales.
 */
function buildActividadesFromDispatches(dispatches: ReportRecord[]): ActividadRow[] {
  const byDay = new Map<string, { cantidad: number; viajes: number; obra: string }>();

  dispatches.forEach((dispatch) => {
    const fecha = toLimaDateOnly(dispatch.date);
    if (!fecha) return;
    const current = byDay.get(fecha) || { cantidad: 0, viajes: 0, obra: '' };
    current.cantidad += toCurrencyAmount(dispatch.quantity);
    current.viajes += 1;
    current.obra = current.obra || String(dispatch.obra || dispatch.destino || '');
    byDay.set(fecha, current);
  });

  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fecha, day]) => ({
      fecha,
      actividad: 'Despacho y colocacion de mezcla asfaltica',
      descripcion: `${day.viajes} viaje(s) despachado(s)`,
      cantidad: Number(day.cantidad.toFixed(2)),
      unidad: 'm3',
      ubicacion: day.obra,
    }));
}

function buildPartidaItemCode(partida: ReportRecord, index: number): string {
  return String(partida.itemCode || partida.item || index + 1);
}

function buildLiquidacionRows(partidas: ReportRecord[]): LiquidacionRow[] {
  return partidas.map((partida, index) => {
    const quantity = toCurrencyAmount(partida.quantity);
    const unitPrice = toCurrencyAmount(partida.unitPrice);
    const total = toCurrencyAmount(partida.total || quantity * unitPrice);
    return {
      item: buildPartidaItemCode(partida, index),
      descripcion: String(partida.description || ''),
      unidad: String(partida.unit || ''),
      metrado: quantity,
      precioUnitario: unitPrice,
      parcial: total,
      adicional: Boolean(partida.isAdditional),
    };
  });
}

function buildLiquidacionPayments(entries: ReportRecord[]): LiquidacionPayment[] {
  return entries
    .filter((entry) => entry.movementType === 'income' || entry.entryType === 'income')
    .map((entry) => ({
      _financeEntryId: String(entry._id || ''),
      fecha: entry.date || '',
      operacion: String(entry.referenceNumber || entry.paymentMethod || 'INGRESO'),
      destinatario: String(entry.description || ''),
      monto: toCurrencyAmount(entry.amountBase),
    }));
}

function buildLiquidacionVoucherPhotos(
  payments: LiquidacionPayment[],
  media: ReportRecord[]
) {
  const paymentIds = new Set(payments.map((payment) => payment._financeEntryId));
  return media
    .filter((file) => {
      const resourceId = String(file.resourceId || '').replace(/^service-finance-/, '');
      const mimeType = String(file.mimeTye || '').toLowerCase();
      return paymentIds.has(resourceId) && mimeType.startsWith('image/');
    })
    .map((file) => {
      const metadata = asRecord(file.metadata);
      return {
        id: String(file._id || ''),
        descripcion: String(file.name || 'Voucher'),
        fecha: file.date || file.createdAt || '',
        url: String(file.url || metadata.lilaAppUrl || metadata.fileUrl || ''),
        renderedUrl: String(metadata.lilaAppUrl || metadata.fileUrl || file.url || ''),
        thumbnailUrl: String(file.thumbnailUrl || metadata.thumbnailUrl || ''),
      };
    });
}

function buildLiquidacionData(rawData: AggregatedReportData, projectData: Record<string, any>) {
  const service = rawData.service;
  const client = rawData.client;
  const partidas = Array.isArray(service.partidas) ? service.partidas as ReportRecord[] : [];
  const rows = buildLiquidacionRows(partidas);
  const payments = buildLiquidacionPayments(rawData.financeEntries || []);
  const montoEjecutadoSubtotal = rows.reduce((sum, row) => sum + toCurrencyAmount(row.parcial), 0);
  const montoEjecutado = addLiquidacionIgv(montoEjecutadoSubtotal);
  const montoPagado = payments.reduce((sum, row) => sum + toCurrencyAmount(row.monto), 0);

  return {
    ...projectData,
    proyecto: {
      ...projectData.proyecto,
      obra: service.projectName || service.description || projectData.proyecto?.obra || '',
      contratista: service.contratista || client?.name || projectData.proyecto?.contratista || '',
      contratistaRuc: client?.ruc || '',
      proveedor: service.subcontratista || projectData.proyecto?.subcontratista || '',
      proveedorRuc: service.rucSubcontratista || '',
      servicio: service.description || service.projectName || '',
    },
    cotizacionInicial: rows.filter((row) => !row.adicional),
    pagos: payments,
    montoEjecutado: rows,
    saldo: {
      montoEjecutado,
      montoPagado,
      saldoPorPagar: montoEjecutado - montoPagado,
    },
    vouchers: {
      fotos: buildLiquidacionVoucherPhotos(payments, rawData.financeMedia || []),
    },
    observaciones: '',
    firmas: {},
  };
}

export function structureDataForReportType(reportType: string, rawData: AggregatedReportData): Record<string, any> {
  if (!rawData.service) {
    return {};
  }

  const service = rawData.service;
  const client = rawData.client;
  const orders = rawData.orders;
  const projectData = buildProjectData(service, orders, client, rawData.company);

  switch (reportType) {
    // DOS-OBR (dossier de obra): siembra proyecto y resumen. El INDICE de
    // documentos NO se siembra aca: lo compila Portal desde los informes reales
    // del servicio (DOSSIER-OBRA.spec.md D1) porque el estado de cada informe
    // -aprobado o borrador- vive en `servicemanagementreports`, no aca.
    case 'DOS-OBR':
      return {
        ...projectData,
        resumen: {
          periodo: '',
          responsable: client?.name || '',
          descripcion: service.projectName || service.description || '',
        },
      };
    // ACT-CNF (acta de conformidad): el acta se creaba con contratista,
    // subcontratista y monto VACIOS. Portal los rellena, pero recien cuando
    // alguien ABRE el editor: un acta impresa sin abrirla salia sin las partes.
    // No se duplica la regla: se mapean los MISMOS `projectData` que ya calcula
    // `buildProjectData`, y el efecto de Portal solo rellena lo que siga vacio.
    case 'ACT-CNF': {
      const partidas = Array.isArray(service.partidas) ? service.partidas as ReportRecord[] : [];
      const total = buildLiquidacionRows(partidas).reduce(
        (sum, row) => sum + toCurrencyAmount(row.parcial),
        0
      );
      return {
        ...projectData,
        contratista: {
          razonSocial: projectData.proyecto.contratista,
          ruc: client?.ruc || client?.taxId || '',
          representante: client?.legalRepresentative || client?.representanteLegal || '',
        },
        subcontratista: {
          razonSocial: projectData.proyecto.subcontratista,
          ruc: projectData.proyecto.rucSubcontratista,
          representanteLegal: '',
        },
        obra: { nombre: projectData.proyecto.obra, cui: projectData.proyecto.cui },
        ...(total > 0 ? { valorizacion: { presupuestoMatriz: '', monto: total } } : {}),
      };
    }
    // INF-ACT (informe de actividades): 200 filas a mano cuando el trabajo del dia
    // ya esta en los DESPACHOS. Se agrupa por dia (no por viaje) y los equipos
    // salen de las placas reales. Lo que no tenemos -personal, horas, avance- NO
    // se inventa: queda vacio para que alguien lo ponga.
    case 'INF-ACT': {
      const dispatches = (rawData.dispatches || []) as ReportRecord[];
      const actividades = buildActividadesFromDispatches(dispatches);
      if (actividades.length === 0) return { ...projectData };
      const placas = Array.from(
        new Set(
          dispatches
            .map((dispatch) => String(dispatch.plate || '').trim())
            .filter(Boolean)
        )
      );
      return {
        ...projectData,
        actividades,
        periodo: {
          inicio: actividades[0].fecha,
          fin: actividades[actividades.length - 1].fecha,
          turno: '',
          responsable: '',
        },
        resumen: {
          avance: 0,
          personal: 0,
          equipos: placas.join(', '),
          horas: 0,
        },
      };
    }
    // MET-RES (cuadro resumen de metrado): 300 filas a mano cuando el metrado ya
    // vive en las partidas del servicio. Se siembra igual que el presupuesto del
    // contrato; `parcial` y los totales los deriva el schema (formulas).
    case 'MET-RES': {
      const partidas = Array.isArray(service.partidas) ? service.partidas as ReportRecord[] : [];
      const rows = buildLiquidacionRows(partidas);
      if (rows.length === 0) return { ...projectData };
      return {
        ...projectData,
        metrado: rows.map((row) => ({
          item: row.item,
          descripcion: row.descripcion,
          unidad: row.unidad,
          metrado: row.metrado,
          precioUnitario: row.precioUnitario,
          parcial: row.parcial,
        })),
        resumen: {
          totalMetrado: rows.reduce((sum, row) => sum + toCurrencyAmount(row.metrado), 0),
          totalParcial: rows.reduce((sum, row) => sum + toCurrencyAmount(row.parcial), 0),
          observaciones: '',
        },
      };
    }
    // REC-EXC (reclamo por excedente): el metrado de CONTRATO ya vive en las
    // partidas del servicio; retipearlo es la forma mas facil de reclamar contra
    // una cifra equivocada. El EJECUTADO se deja en cero a proposito: es el dato
    // que sostiene el reclamo y nadie mas que el responsable lo conoce.
    case 'REC-EXC': {
      const partidas = Array.isArray(service.partidas) ? service.partidas as ReportRecord[] : [];
      const rows = buildLiquidacionRows(partidas);
      const sustentoIaa = buildSustentoDesdeIaa(rawData.reports || []);
      if (rows.length === 0) {
        return sustentoIaa ? { ...projectData, sustento: sustentoIaa } : { ...projectData };
      }
      return {
        ...projectData,
        ...(sustentoIaa ? { sustento: sustentoIaa } : {}),
        reclamo: {
          fecha: toLimaDateOnly(new Date()),
          solicitante: '',
          contrato: '',
          motivo: '',
        },
        metradoReclamo: rows.map((row) => ({
          item: row.item,
          descripcion: row.descripcion,
          unidad: row.unidad,
          metradoContrato: row.metrado,
          metradoEjecutado: 0,
          precioUnitario: row.precioUnitario,
          observacion: '',
        })),
      };
    }
    // TOP-CMP / TOP-PROT: las lecturas nacen del equipo topografico; lo unico
    // que se siembra es la fecha del levantamiento. El protocolo simple es el
    // mismo caso que el completo, sin duplicar la rama.
    case 'TOP-PROT':
    case 'TOP-CMP':
      return {
        ...projectData,
        topografia: {
          fecha: toLimaDateOnly(new Date()),
          equipo: '',
          operador: '',
          sistemaReferencia: '',
          metodologia: '',
          precision: '',
          toleranciaPlanimetrica: 0,
          toleranciaAltimetrica: 0,
        },
      };
    // CAL-PROT: los ensayos los produce el laboratorio; se siembra la fecha del
    // protocolo y nada mas.
    case 'CAL-PROT':
      return {
        ...projectData,
        control: {
          fecha: toLimaDateOnly(new Date()),
          laboratorio: '',
          responsable: '',
          norma: '',
        },
      };
    // LEV-OBS: la observacion NACE en campo, asi que no hay nada que compilar.
    // Lo unico que se siembra es la fecha del control, porque el cuadro la usa
    // como referencia para los dias de atraso de lo que sigue abierto.
    case 'LEV-OBS':
      return {
        ...projectData,
        control: {
          fecha: toLimaDateOnly(new Date()),
          responsable: '',
          area: '',
        },
      };
    case 'PNL-FOT':
      return {
        ...projectData,
        periodo: {
          inicio: orders[0]?.createdAt || new Date().toISOString(),
          fin: new Date().toISOString(),
        },
        numeroPanel: 1,
        version: '1.0',
        partidasIncluidas: Array.isArray(service.partidas)
          ? service.partidas.map((p: any, index: number) => ({
              item: p._id || String(index + 1),
              descripcion: p.description || '',
              unidad: p.unit || '',
              progresivas: '',
            }))
          : [],
        secciones: {
          trabajosCampo: { fotos: [] },
          ensayosCampo: { fotos: [] },
          ensayosLaboratorio: { fotos: [] },
        },
        observaciones: '',
      };
    case 'VAL-SRV':
      return {
        ...projectData,
        periodo: {
          inicio: orders[0]?.createdAt || new Date().toISOString(),
          fin: new Date().toISOString(),
        },
        valorizacion: { numero: '01', moneda: 'PEN' },
        partidas: Array.isArray(service.partidas)
          ? service.partidas.map((p: any, index: number) => ({
              item: buildPartidaItemCode(p, index),
              descripcion: p.description || '',
              unidad: p.unit || '',
              cantidad: p.quantity || 0,
              precioUnitario: p.unitPrice || 0,
              importe: p.total || 0,
            }))
          : [],
        resumen: {
          subtotal: 0,
          igv: 0,
          total: 0,
        },
        observaciones: '',
      };
    case 'LIQ-SRV':
      return buildLiquidacionData(rawData, projectData);
    case 'CTL-IMP':
      return {
        general: {
          cliente: client?.name || client?.alias || '',
          proyecto: service.description || service.projectName || '',
          ubicacion: service.locationUrl || '',
          responsable: '',
        },
      };
    case 'IPP': {
      return {
        datosProyecto: {
          obra: service.projectName || service.description || '',
          contratista: service.contratista || service.contractor || '',
          subcontratista: service.subcontratista || service.subcontractor || '',
          frenteDestino: service.frente || service.front || '',
          progresiva: service.progresiva || '',
        },
        datosPlanta: {
          planta: '',
          ubicacion: '',
          tipoModelo: '',
          capacidad: '',
          operadorEmpresa: '',
          operadorRuc: '',
          operadorJefe: '',
        },
        registroDespachos: [],
        resumenProduccion: {
          totalDespachos: 0,
          vehiculosUtilizados: 0,
          totalCubos: 0,
          tempSalidaPromedio: 0,
          horarioProduccion: '',
          despachosConformes: 0,
          despachosObservados: 0,
          despachosRechazados: 0,
        },
        panelFotograficoPlanta: { fotos: [] },
        panelFotograficoLaboratorio: { fotos: [] },
        observaciones: '',
        firmas: {
          jefePlanta: { nombre: '', cargo: 'Jefe de Produccion de Planta', empresa: '', cip: '' },
          laboratorista: { nombre: '', cargo: 'Jefe de Laboratorio de Planta', empresa: '', cip: '' },
          controlCalidad: { nombre: '', cargo: 'Ing. Control de Calidad', empresa: '', cip: '' },
        },
      };
    }
    case 'IAA': {
      const allPartidas = Array.isArray(service.partidas) ? service.partidas : [];
      const partidasAdicionales = allPartidas.filter(
        (p: any) => p && typeof p === 'object' && p.isAdditional === true
      );

      const metrado = partidasAdicionales.map((p: any, index: number) => {
        return {
          item: String(index + 1).padStart(2, '0'),
          partida: String(p.description || ''),
          descripcion: String(p.description || ''),
          unidad: String(p.unit || ''),
          metodo: '',
          referencia: '',
          area: 0,
          volumen: 0,
        };
      });

      return {
        ...projectData,
        proyecto: {
          ...projectData.proyecto,
          entidad: '',
          supervision: '',
          contrato: '',
          frente: '',
        },
        levantamiento: {
          incluir: false,
          topografo: '',
          cip: '',
          equipo: '',
          nroSerie: '',
          certCalibracion: '',
          fechaCalibracion: '',
          fechaLevantamiento: '',
          sistemaReferencia: '',
          planoReferencia: '',
        },
        antecedentes: '',
        objetoInforme: '',
        descripcionTrabajos: '',
        justificacionTecnica: '',
        ubicacionTecnica: [
          {
            item: '01',
            tramoZona: '',
            progInicial: '',
            progFinal: '',
            lado: '',
            descripcion: '',
          },
        ],
        cuadroMetrado: metrado.length > 0 ? metrado : [
          {
            item: '01',
            id: 'area-1',
            ubicacion: '',
            descripcion: 'Bacheo localizado',
            area: 0,
            volumen: 0,
            observaciones: '',
          },
        ],
        panelFotografico: { fotos: [] },
        conclusiones: '',
        firmas: {
          elaboradoPor: { nombre: '', cargo: 'Supervisor de Campo', cip: '' },
          supervisadoPor: { nombre: '', cargo: 'Residente de Obra', cip: '' },
          aprobadoPor: { nombre: '', cargo: 'Residente de Obra', cip: '' }
        }
      };
    }
    case 'CONT-SRV': {
      const clientName = client?.name || client?.alias || '';
      const clientRuc = client?.ruc || client?.taxId || '';
      const clientAddress = client?.address || client?.domicilio || '';
      const clientRepresentante = client?.legalRepresentative || client?.representanteLegal || '';
      const partidas = Array.isArray(service.partidas) ? service.partidas as ReportRecord[] : [];
      const contractRows = buildLiquidacionRows(partidas);
      // C4: trazabilidad con la cotizacion de origen. El numero vive por PARTIDA
      // (`sourceQuoteNro`), asi que un contrato puede venir de mas de una.
      const quoteNumbers = Array.from(
        new Set(
          partidas
            .map((partida) => String(partida.sourceQuoteNro ?? '').trim())
            .filter((numero) => numero && numero !== '0')
        )
      );
      const contractTotal = contractRows.reduce(
        (sum, row) => sum + toCurrencyAmount(row.parcial),
        0
      );
      return {
        cliente: {
          razonSocial: clientName,
          ruc: clientRuc,
          domicilio: clientAddress,
          representante: clientRepresentante,
          dniRepresentante: '',
        },
        obra: {
          nombre: service.projectName || service.description || '',
          cui: service.cui || '',
          ubicacion: service.locationUrl || '',
        },
        ...(quoteNumbers.length > 0
          ? { cotizacion: { numeros: quoteNumbers.join(', '), fecha: '', observacion: '' } }
          : {}),
        ...(contractRows.length > 0
          ? {
              monto: { total: contractTotal },
              preciosUnitarios: contractRows.map((row) => ({
                detalle: row.descripcion,
                unidad: row.unidad,
                costo: row.precioUnitario,
              })),
              sectoresPago: contractRows.map((row) => ({
                sector: '',
                itemCode: row.item,
                descripcion: row.descripcion,
                unidad: row.unidad,
                metrado: row.metrado,
                precioUnit: row.precioUnitario,
                parcial: row.parcial,
              })),
              // C3 — Anexo 2: el cronograma nace con las partidas y sus metrados.
              // `rendimiento` y fechas van en cero/vacio A PROPOSITO: los pacta la
              // empresa. Un rendimiento inventado seria peor que ninguno, porque
              // es la referencia contra la que se mide el cumplimiento del plazo.
              cronograma: contractRows.map((row) => ({
                item: row.item,
                partida: row.descripcion,
                unidad: row.unidad,
                metrado: row.metrado,
                rendimiento: 0,
                dias: 0,
                inicio: '',
                fin: '',
              })),
            }
          : {}),
      };
    }
    // RCP-CAM (recepcion de campo): quien ENTREGA el area es el cliente. La
    // fecha NO se siembra aca a proposito: la pone Portal con la fecha de Lima
    // (`REPORT_TYPES_WITH_DATE_DEFAULTS`); mandar un ISO desde el server la
    // escribiria como medianoche UTC = dia anterior en Peru.
    case 'RCP-CAM':
      return {
        ...projectData,
        recepcion: {
          entregadoPor: client?.name || projectData.proyecto.contratista || '',
        },
      };
    default:
      return {
        ...projectData,
      };
  }
}
