/**
 * Los integrantes de un grupo como JIDs, listos para usar como `mentions`.
 *
 * Baileys los entrega como `{ id, admin }`, pero el store puede tener entradas
 * viejas ya aplanadas a string. Devolver una mezcla haría que Baileys mencione a
 * medias sin avisar, así que se normaliza acá y se descarta lo que no sea un JID.
 *
 * VIVE EN SU PROPIO MÓDULO, sin importar nada. `whatsapp-direct.service` arrastra
 * `config`, que usa `import.meta` y no parsea bajo CommonJS: cualquier test que
 * lo importara —aunque fuera para probar esta función de diez líneas— reventaba
 * al CARGARSE. Aislarlo es la cura estructural; mockear `config` en cada test
 * sería un parche que el siguiente test vuelve a pisar.
 */
export const normalizeGroupParticipants = (participants: unknown): string[] => {
  if (!Array.isArray(participants)) return [];
  const ids = participants
    .map((participant) => {
      if (typeof participant === 'string') return participant;
      const id = (participant as { id?: unknown } | null)?.id;
      return typeof id === 'string' ? id : '';
    })
    .map((id) => id.trim())
    .filter((id) => id.includes('@'));
  return Array.from(new Set(ids));
};
