import { getBotConfigModel } from '../../database/bot.models.js';
import { getCompanyModel } from '../../database/models.js';
import { GUION_ASFALTO, PREGUNTA_SERVICIO_POR_DEFECTO, type Guion } from '../ventas/guion.asfalto.js';
import { HOJAS } from './importar.js';
import { RUBROS, type Rubro } from './registro.js';
import { editableDe, restaurarPack, type GuionEditable, type Servicios } from './servicios.js';

/**
 * LOS PACKS POR RUBRO (S3 «Verticales», spec DALI §5): hoy hay UN pack de
 * verdad, el de asfalto, y vive en el código (`ventas/guion.asfalto.ts`, v1):
 * sus servicios con sus preguntas, las preguntas de cierre, la pregunta de
 * apertura y la plantilla de Excel de A13. Los demás rubros del registro se
 * listan como «próximamente», con el modo del motor que les tocará (§5).
 * Editar un pack desde la consola queda para cuando exista `vertical_packs`
 * (hoy se edita con un deploy); aplicarlo a una empresa es lo mismo que
 * «restaurar el pack» de A8: la empresa vuelve al guion de fábrica.
 */
export type ModoVertical = 'lead' | 'pedido' | 'cita' | 'info';

export const MODOS: Record<Rubro['id'], ModoVertical> = { asphalt: 'lead', restaurant: 'pedido', grifo: 'info', lubricentro: 'cita', otro: 'info' };
export const MODO_LEGIBLE: Record<ModoVertical, string> = {
  lead: 'Junta datos para cotizar',
  pedido: 'Toma pedidos del catálogo',
  cita: 'Agenda citas',
  info: 'Informa (horarios, precios del día)',
};
export const VERSION_PACK_ASFALTO = 'v1';

export interface EmpresaDeVertical {
  companyId: string;
  nombre: string;
}

export interface VerticalResumen {
  id: Rubro['id'];
  nombre: string;
  detalle: string;
  disponible: boolean;
  modo: ModoVertical;
  modoLegible: string;
  version: string | null;
  servicios: number;
  preguntas: number;
  cierre: number;
  plantilla: string | null;
  empresas: EmpresaDeVertical[];
}

export const resumenDePack = (guion: Guion): { servicios: number; preguntas: number; cierre: number } => ({
  servicios: guion.servicios.length,
  preguntas: guion.servicios.reduce((a, s) => a + s.preguntas.length, 0),
  cierre: guion.cierre.length,
});

export const verticalesDe = (empresasPor: Map<string, EmpresaDeVertical[]>): VerticalResumen[] =>
  RUBROS.map((r) => {
    const pack = r.id === 'asphalt' ? resumenDePack(GUION_ASFALTO) : { servicios: 0, preguntas: 0, cierre: 0 };
    return {
      id: r.id,
      nombre: r.nombre,
      detalle: r.detalle,
      disponible: r.disponible,
      modo: MODOS[r.id],
      modoLegible: MODO_LEGIBLE[MODOS[r.id]],
      version: r.disponible ? VERSION_PACK_ASFALTO : null,
      ...pack,
      plantilla: r.disponible ? `Excel ${VERSION_PACK_ASFALTO}` : null,
      empresas: empresasPor.get(r.id) ?? [],
    };
  });

const empresasPorVertical = async (): Promise<Map<string, EmpresaDeVertical[]>> => {
  const [Config, Company] = await Promise.all([getBotConfigModel(), getCompanyModel()]);
  const configs = (await Config.find({}).select('companyId vertical').lean()) as Array<{ companyId: string; vertical?: string }>;
  const nombres = new Map(
    (
      (await Company.find({ companyId: { $in: configs.map((c) => c.companyId) } })
        .select('companyId name')
        .lean()) as Array<{ companyId: string; name?: unknown }>
    ).map((c) => [c.companyId, String(c.name ?? c.companyId)])
  );
  const por = new Map<string, EmpresaDeVertical[]>();
  for (const c of configs) {
    const lista = por.get(String(c.vertical ?? '')) ?? [];
    lista.push({ companyId: c.companyId, nombre: nombres.get(c.companyId) ?? c.companyId });
    por.set(String(c.vertical ?? ''), lista);
  }
  return por;
};

export const listarVerticales = async (): Promise<VerticalResumen[]> => verticalesDe(await empresasPorVertical());

export interface VerticalDetalle extends VerticalResumen {
  guion: GuionEditable | null;
  textos: { preguntaServicio: string };
  hojas: readonly string[];
}

export const leerVertical = async (id: string): Promise<VerticalDetalle | null> => {
  const resumen = (await listarVerticales()).find((v) => v.id === id);
  if (!resumen) return null;
  const conPack = resumen.id === 'asphalt';
  return {
    ...resumen,
    guion: conPack ? editableDe(GUION_ASFALTO) : null,
    textos: { preguntaServicio: conPack ? PREGUNTA_SERVICIO_POR_DEFECTO : '' },
    hojas: conPack ? HOJAS : [],
  };
};

export class VerticalSinPack extends Error {}

/** La empresa vuelve al guion de fábrica del rubro (solo asfalto tiene uno). */
export const aplicarVertical = async (id: string, companyId: string, quien: string): Promise<Servicios> => {
  if (id !== 'asphalt') throw new VerticalSinPack('Ese rubro todavía no tiene pack');
  return restaurarPack(companyId, quien);
};
