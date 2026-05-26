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
  orders: any[];
  dispatches: any[];
  certificates: any[];
  invoices: any[];
  payments: any[];
  financeEntries: ReportRecord[];
  financeMedia: ReportRecord[];
  serviceMedia: any[];
  orderMedia: any[];
}

function buildProjectData(service: any, orders: any[]) {
  const orderNumbers = orders
    .map((o: any) => o.orderNumber || o.orderNumberId || o._id)
    .filter(Boolean)
    .join(', ');

  return {
    proyecto: {
      obra: service.projectName || service.description || '',
      contratista: service.contratista || service.contractor || '',
      subcontratista: service.subcontratista || service.subcontractor || '',
      rucSubcontratista: service.rucSubcontratista || '',
      cui: service.cui || '',
      ordenCompra: orderNumbers,
      ubicacion: service.locationUrl || '',
    },
  };
}

export async function aggregateReportData(
  serviceId: string
): Promise<AggregatedReportData> {
  const ServiceManagement = await getFlexibleModel('ServiceManagement');
  const Order = await getFlexibleModel('Order');
  const Client = await getFlexibleModel('Client');
  const Dispatch = await getFlexibleModel('Dispatch');
  const Certificate = await getFlexibleModel('Certificate');
  const Invoice = await getFlexibleModel('Invoice');
  const Payment = await getFlexibleModel('Payment');
  const FinancialMovement = await getFlexibleModel('FinancialMovement');
  const Media = await getFlexibleModel('Media');
  const ServiceManagementDriveItem = await getFlexibleModel('ServiceManagementDriveItem');

  const service = await ServiceManagement.findById(serviceId).lean();
  if (!service) {
    return {
      service: null,
      client: null,
      orders: [],
      dispatches: [],
      certificates: [],
      invoices: [],
      payments: [],
      financeEntries: [],
      financeMedia: [],
      serviceMedia: [],
      orderMedia: [],
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

  return {
    service,
    client,
    orders,
    dispatches,
    certificates,
    invoices,
    payments,
    financeEntries,
    financeMedia,
    serviceMedia,
    orderMedia: [],
  };
}

function toCurrencyAmount(value: unknown): number {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function addLiquidacionIgv(subtotal: number): number {
  return Number((subtotal * LIQUIDACION_IGV_FACTOR).toFixed(2));
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
  const projectData = buildProjectData(service, orders);

  switch (reportType) {
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
            }
          : {}),
      };
    }
    default:
      return {
        ...projectData,
      };
  }
}
