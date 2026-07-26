import { Schema, type Model } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

/**
 * Idempotencia de las recepciones públicas (insumos/combustible). La cola offline
 * de Portal re-envía una recepción cuya respuesta 202 se perdió; sin dedupe, el
 * workflow corre dos veces y DUPLICA lo recibido en obra. Este flag persiste el
 * `clientMutationId` estable que manda la cola: la compuerta de enqueue lo reclama
 * (índice único) y, si ya estaba reclamado, responde 202 sin re-encolar el
 * workflow. TTL 30d — cubre de sobra los reintentos (la cola de Portal purga a 7d).
 */
const publicReceptionIdempotencySchema = new Schema(
  {
    companyId: { type: String, required: true },
    clientMutationId: { type: String, required: true },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 60 * 24 * 30,
    },
  },
  {
    collection: 'public_reception_idempotency',
  }
);
publicReceptionIdempotencySchema.index(
  { companyId: 1, clientMutationId: 1 },
  { unique: true }
);

let publicReceptionIdempotencyModel: Model<Record<string, unknown>> | null = null;

async function getPublicReceptionIdempotencyModel() {
  if (publicReceptionIdempotencyModel) {
    return publicReceptionIdempotencyModel;
  }

  const conn = await getSharedConnection();
  publicReceptionIdempotencyModel =
    (conn.models.PublicReceptionIdempotency as Model<Record<string, unknown>>) ||
    conn.model<Record<string, unknown>>(
      'PublicReceptionIdempotency',
      publicReceptionIdempotencySchema
    );

  return publicReceptionIdempotencyModel;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * Reclama la key de idempotencia. Devuelve `true` si es la PRIMERA vez (hay que
 * encolar el workflow) o `false` si ya estaba reclamada (reintento tras 202 perdido
 * → NO re-encolar). El índice único cierra la carrera de dos drenados concurrentes:
 * uno gana el insert, el otro cae en E11000 y se trata como duplicado.
 */
export async function claimPublicReceptionIdempotency(
  companyId: string,
  clientMutationId: string
): Promise<boolean> {
  const model = await getPublicReceptionIdempotencyModel();
  try {
    await model.create({ companyId, clientMutationId });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}
