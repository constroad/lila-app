import mongoose, { Model, Schema } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

const modelCache = new Map<string, Model<any>>();

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
  orders: any[];
  dispatches: any[];
  certificates: any[];
  invoices: any[];
  payments: any[];
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
  const Dispatch = await getFlexibleModel('Dispatch');
  const Certificate = await getFlexibleModel('Certificate');
  const Invoice = await getFlexibleModel('Invoice');
  const Payment = await getFlexibleModel('Payment');
  const ServiceManagementDriveItem = await getFlexibleModel('ServiceManagementDriveItem');

  const service = await ServiceManagement.findById(serviceId).lean();
  if (!service) {
    return {
      service: null,
      orders: [],
      dispatches: [],
      certificates: [],
      invoices: [],
      payments: [],
      serviceMedia: [],
      orderMedia: [],
    };
  }

  const orderIds = Array.isArray(service.orderIds) ? service.orderIds : [];
  const orderQueryIds = normalizeIds(orderIds);

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

  const serviceMedia = await ServiceManagementDriveItem.find({
    serviceManagementId: serviceId,
  }).lean();

  return {
    service,
    orders,
    dispatches,
    certificates,
    invoices,
    payments,
    serviceMedia,
    orderMedia: [],
  };
}

export function structureDataForReportType(reportType: string, rawData: AggregatedReportData): Record<string, any> {
  if (!rawData.service) {
    return {};
  }

  const service = rawData.service;
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
              item: p._id || String(index + 1),
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
    case 'CTL-IMP':
      return {
        ...projectData,
        proyecto: {
          ...projectData.proyecto,
          descripcion: '',
          documentoReferencia: '',
        },
      };
    default:
      return {
        ...projectData,
      };
  }
}
