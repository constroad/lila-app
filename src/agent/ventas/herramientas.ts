import type { EspecificacionHerramienta, LlamadaHerramienta, ResultadoHerramienta } from './llm.types.js';

/**
 * LAS HERRAMIENTAS DEL AGENTE DE VENTAS. Pocas y con efecto claro: guardar lo
 * que se sabe del lead, escalar a una persona, decir el horario. Ninguna toca
 * precios ni crea pedidos: para el vertical asfalto la cotización la hace el
 * asesor, y el bot junta los datos y avisa.
 */

export interface DatosLead {
  nombre?: string;
  empresa?: string;
  servicio?: 'venta' | 'colocacion' | 'transporte' | 'fabricacion' | 'otro';
  detalle?: string;
  cantidad?: string;
  distrito?: string;
  fecha?: string;
  /** El cliente confirmó el resumen: el lead está completo para el asesor. */
  listo?: boolean;
}

export const HERRAMIENTAS_VENTAS: EspecificacionHerramienta[] = [
  {
    nombre: 'guardar_lead',
    descripcion:
      'Guarda o actualiza lo que se sabe del cliente y de lo que necesita. Llámala cada vez que aparezca un dato nuevo, con TODOS los datos conocidos hasta ahora. Con listo=true cuando el cliente confirmó el resumen.',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de la persona' },
        empresa: { type: 'string', description: 'Empresa o consorcio, si aplica' },
        servicio: { type: 'string', enum: ['venta', 'colocacion', 'transporte', 'fabricacion', 'otro'] },
        detalle: { type: 'string', description: 'Qué necesita, en una frase: tipo de mezcla, espesor, base nueva o pavimento, fresado, etc.' },
        cantidad: { type: 'string', description: 'm³ o m² con la unidad, tal como lo dijo' },
        distrito: { type: 'string', description: 'Distrito o ubicación de la obra o entrega' },
        fecha: { type: 'string', description: 'Para cuándo lo necesita, tal como lo dijo' },
        listo: { type: 'boolean', description: 'true cuando el cliente confirmó el resumen' },
      },
    },
  },
  {
    nombre: 'escalar_a_humano',
    descripcion: 'Pasa la conversación a un asesor humano. Úsala si lo piden, si están molestos, si es fabricación de mezclas especiales, si es algo técnico o legal fuera de los servicios, o si llevas dos mensajes sin entender.',
    parametros: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Por qué se escala, en una frase' } },
      required: ['motivo'],
    },
  },
  {
    nombre: 'horario_atencion',
    descripcion: 'Devuelve el horario de atención y si ahora mismo está abierto.',
    parametros: { type: 'object', properties: {} },
  },
];

export interface ContextoHerramientas {
  guardarLead(datos: DatosLead): Promise<{ notificado: boolean }>;
  escalar(motivo: string): Promise<void>;
  horario(): { texto: string; abierto: boolean };
}

const texto = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 200) : undefined;
};

/** Ejecuta una llamada y devuelve el resultado para el modelo. Nunca lanza. */
export const ejecutarHerramienta = async (llamada: LlamadaHerramienta, ctx: ContextoHerramientas): Promise<ResultadoHerramienta> => {
  try {
    switch (llamada.nombre) {
      case 'guardar_lead': {
        const a = llamada.argumentos;
        const datos: DatosLead = {
          nombre: texto(a.nombre),
          empresa: texto(a.empresa),
          servicio: (['venta', 'colocacion', 'transporte', 'fabricacion', 'otro'] as const).find((s) => s === a.servicio),
          detalle: texto(a.detalle),
          cantidad: texto(a.cantidad),
          distrito: texto(a.distrito),
          fecha: texto(a.fecha),
          listo: a.listo === true,
        };
        const r = await ctx.guardarLead(datos);
        return { id: llamada.id, contenido: JSON.stringify({ ok: true, asesorAvisado: r.notificado }) };
      }
      case 'escalar_a_humano': {
        await ctx.escalar(texto(llamada.argumentos.motivo) ?? 'sin motivo');
        return { id: llamada.id, contenido: JSON.stringify({ ok: true, mensaje: 'Un asesor toma la conversación. Despídete con una línea y no prometas tiempos.' }) };
      }
      case 'horario_atencion':
        return { id: llamada.id, contenido: JSON.stringify(ctx.horario()) };
      default:
        return { id: llamada.id, contenido: `Herramienta desconocida: ${llamada.nombre}`, error: true };
    }
  } catch (error) {
    return { id: llamada.id, contenido: `Error: ${error instanceof Error ? error.message : String(error)}`, error: true };
  }
};
