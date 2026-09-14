import { getClientModel, getOrderModel } from '../../database/models.js';
import { diaPeruano } from '../checklist/tiempo.js';

/**
 * ¿QUIÉN ESCRIBE? Si el número está en los clientes de la empresa, el agente
 * lo saluda por su nombre y sabe sus últimos pedidos. Se compara por los
 * últimos 9 dígitos (celular peruano): la base tiene «972224301»,
 * «51972224301» y con espacios.
 */

export interface ClienteConocido {
  nombre: string;
  empresa?: string;
  ultimosPedidos: string[];
}

type Doc = Record<string, unknown>;
const texto = (v: unknown): string => String(v ?? '').trim();

export const clientePorTelefono = async (companyId: string, telefono: string): Promise<ClienteConocido | null> => {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (digitos.length < 9) return null;
  const sufijo = digitos.slice(-9);
  const patron = new RegExp(`${sufijo}\\s*$`);
  const Client = await getClientModel();
  const c = (await Client.findOne({
    companyId,
    $or: [{ phone: patron }, { 'notifications.whatsAppAlerts': patron }, { 'notifications.whatsAppManagement': patron }],
  })
    .select('name alias contactPerson')
    .lean()) as Doc | null;
  if (!c) return null;
  const Order = await getOrderModel();
  const pedidos = (await Order.find({ companyId, $or: [{ clienteId: String(c._id) }, { cliente: texto(c.name) }], status: { $nin: ['eliminado', 'rechazado'] } })
    .select('fechaProgramacion obra cantidadCubos')
    .sort({ fechaProgramacion: -1 })
    .limit(3)
    .lean()) as Doc[];
  const nombre = texto(c.contactPerson) || texto(c.alias) || texto(c.name);
  const empresa = texto(c.name) !== nombre ? texto(c.name) : undefined;
  return {
    nombre,
    empresa,
    ultimosPedidos: pedidos.map((p) => {
      const ms = new Date(p.fechaProgramacion as string).getTime();
      return `${Number.isFinite(ms) ? diaPeruano(ms) : '?'} ${texto(p.obra) || 'sin obra'} ${Number(p.cantidadCubos) || 0} m³`;
    }),
  };
};
