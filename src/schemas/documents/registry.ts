import { controlImprimacionSchema } from './control-imprimacion.schema';
import { controlPistaSchema } from './control-pista.schema';
import { informeActividadesSchema } from './informe-actividades.schema';
import { metradoResumenSchema } from './metrado-resumen.schema';
import { panelFotograficoSchema } from './panel-fotografico.schema';
import { protocoloCalidadSchema } from './protocolo-calidad.schema';
import { protocoloTopoSchema } from './protocolo-topo.schema';
import { informeReclamoSchema } from './informe-reclamo.schema';
import { levantamientoObsSchema } from './levantamiento-obs.schema';
import { actaConformidadSchema } from './acta-conformidad.schema';
import { protocoloTopoCompletoSchema } from './protocolo-topo-completo.schema';
import { dossierObraSchema } from './dossier-obra.schema';
import { valorizacionSchema } from './valorizacion.schema';
import { informeAreaAdicionalSchema } from './informe-area-adicional.schema';
import { informeProduccionPlantaSchema } from './informe-produccion-planta.schema';
import { cotizacionAsfaltoSchema } from './cotizacion-asfalto.schema';
import { DocumentSchema, DocumentCategory } from './types';

export const schemaRegistry: Record<string, DocumentSchema> = {
  'panel-fotografico': panelFotograficoSchema,
  valorizacion: valorizacionSchema,
  'control-imprimacion': controlImprimacionSchema,
  'control-pista': controlPistaSchema,
  'informe-actividades': informeActividadesSchema,
  'metrado-resumen': metradoResumenSchema,
  'protocolo-calidad': protocoloCalidadSchema,
  'protocolo-topo': protocoloTopoSchema,
  'informe-reclamo': informeReclamoSchema,
  'levantamiento-obs': levantamientoObsSchema,
  'acta-conformidad': actaConformidadSchema,
  'protocolo-topo-completo': protocoloTopoCompletoSchema,
  'dossier-obra': dossierObraSchema,
  'informe-area-adicional': informeAreaAdicionalSchema,
  'informe-produccion-planta': informeProduccionPlantaSchema,
  'cotizacion-asfalto': cotizacionAsfaltoSchema
};

const schemaList = Object.values(schemaRegistry);
const schemaByCode = new Map(schemaList.map((schema) => [schema.code, schema]));

export function getSchema(documentId: string): DocumentSchema | undefined {
  return schemaRegistry[documentId];
}

export function getSchemaByCode(code: string): DocumentSchema | undefined {
  return schemaByCode.get(code);
}

export function getAllSchemas(): DocumentSchema[] {
  return schemaList;
}

export function getAllDocumentCodes(): string[] {
  return getAllSchemas().map((schema) => schema.code);
}

export function getSchemasByCategory(category: DocumentCategory): DocumentSchema[] {
  return getAllSchemas().filter((schema) => schema.category === category);
}

export function validateAllSchemas(): void {
  const schemas = getAllSchemas();

  for (const schema of schemas) {
    if (!schema.id || !schema.code || !schema.name) {
      throw new Error(`Invalid schema metadata: ${schema.id || '(unknown)'}`);
    }

    if (!schema.sections || schema.sections.length === 0) {
      throw new Error(`Schema ${schema.code} has no sections`);
    }

    const sectionIds = new Set<string>();
    for (const section of schema.sections) {
      if (sectionIds.has(section.id)) {
        throw new Error(`Schema ${schema.code} has duplicate section id: ${section.id}`);
      }
      sectionIds.add(section.id);
    }
  }
}
