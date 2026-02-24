import {
  DocumentSchema,
  SectionSchema,
  ColumnSchema,
  FieldSchema,
} from '../schemas/documents/types.js';

export interface SignatureBlock {
  id: string;
  label: string;
  position?: string;
  order?: number;
  showCIP?: boolean;
}

export interface SignatureCustomization {
  sectionId: string;
  signatures: SignatureBlock[];
}

export interface SchemaOverrides {
  columnWidths?: Record<string, number>;
  hiddenSections?: string[];
  sectionOrder?: string[];
  signatureCustomizations?: SignatureCustomization[];
  photoLayouts?: Record<string, '2x2' | '2x3' | '3x3' | '4x3'>;
}

export interface CustomSectionConfig {
  fields?: FieldSchema[];
  columns?: ColumnSchema[];
  allowAddRows?: boolean;
  placeholder?: string;
  maxImages?: number;
  layout?: '2x2' | '2x3' | '3x3';
  gridColumns?: number;
}

export interface CustomSection {
  id: string;
  title: string;
  type: 'simpleFields' | 'dataTable' | 'richText' | 'photoPanel';
  position: number;
  config: CustomSectionConfig;
}

const PROTECTED_SECTION_TYPES = new Set<SectionSchema['type']>(['header', 'signatures']);
const PROTECTED_SECTION_IDS = new Set(['header', 'signatures']);

function isProtectedSection(section: SectionSchema): boolean {
  return PROTECTED_SECTION_TYPES.has(section.type) || PROTECTED_SECTION_IDS.has(section.id);
}

function applyColumnWidthsToSection(
  section: SectionSchema,
  columnWidths: Record<string, number>
): SectionSchema {
  if (!section.columns || section.columns.length === 0) return section;
  const columns = section.columns.map((column) => {
    const key = `${section.id}-${column.key}`;
    const width = columnWidths[key];
    return width ? { ...column, width } : column;
  });
  return { ...section, columns };
}

function applySignatureCustomizations(
  section: SectionSchema,
  customization?: SignatureCustomization
): SectionSchema {
  if (!customization || section.type !== 'signatures') return section;

  const signatures = customization.signatures
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((sig) => ({
      key: sig.id,
      label: sig.label,
      sublabel: sig.position,
      showCIP: sig.showCIP ?? true,
    }));

  return { ...section, signatures };
}

function applyPhotoLayoutOverride(
  section: SectionSchema,
  layoutOverride?: string
): SectionSchema {
  if (!layoutOverride) return section;
  if (section.type !== 'photoPanel' && section.type !== 'photoSection') return section;
  return { ...section, layout: layoutOverride as SectionSchema['layout'] };
}

export function mergeSchemaWithCustomSections(
  baseSchema: DocumentSchema,
  customSections: CustomSection[]
): DocumentSchema {
  if (!customSections || customSections.length === 0) return baseSchema;

  const baseSections = [ ...baseSchema.sections ];
  const sorted = [ ...customSections ].sort((a, b) => a.position - b.position);

  sorted.forEach((custom) => {
    const section: SectionSchema = {
      id: custom.id,
      type: custom.type,
      title: custom.title,
      ...(custom.type === 'simpleFields'
        ? {
            fields: custom.config.fields || [],
            gridColumns: custom.config.gridColumns || 2,
          }
        : {}),
      ...(custom.type === 'dataTable'
        ? {
            columns: custom.config.columns || [],
            dynamicRows: true,
            minRows: 1,
            maxRows: 1000,
            reorderable: true,
          }
        : {}),
      ...(custom.type === 'photoPanel'
        ? {
            maxImages: custom.config.maxImages || 20,
            layout: custom.config.layout || '2x2',
            showFecha: true,
            showProgresiva: true,
          }
        : {}),
    };

    const position = Math.max(0, Math.min(custom.position, baseSections.length));
    baseSections.splice(position, 0, section);
  });

  return { ...baseSchema, sections: baseSections };
}

export function applySchemaOverrides(
  schema: DocumentSchema,
  overrides?: SchemaOverrides
): DocumentSchema {
  if (!overrides) return schema;

  const signatureMap = new Map(
    (overrides.signatureCustomizations || []).map((customization) => [
      customization.sectionId,
      customization,
    ])
  );

  const columnWidths = overrides.columnWidths || {};
  const hiddenSections = new Set(overrides.hiddenSections || []);
  const photoLayouts = overrides.photoLayouts || {};

  let sections = schema.sections.map((section) => {
    let next = section;
    if (Object.keys(columnWidths).length > 0) {
      next = applyColumnWidthsToSection(next, columnWidths);
    }
    const customization = signatureMap.get(section.id);
    if (customization) {
      next = applySignatureCustomizations(next, customization);
    }
    if (photoLayouts[section.id]) {
      next = applyPhotoLayoutOverride(next, photoLayouts[section.id]);
    }
    return next;
  });

  if (hiddenSections.size > 0) {
    sections = sections.filter((section) => !hiddenSections.has(section.id) || isProtectedSection(section));
  }

  if (overrides.sectionOrder && overrides.sectionOrder.length > 0) {
    const order = overrides.sectionOrder;
    const map = new Map(sections.map((section) => [section.id, section]));
    const ordered: SectionSchema[] = [];

    order.forEach((id) => {
      const found = map.get(id);
      if (found) {
        ordered.push(found);
        map.delete(id);
      }
    });

    const remaining = Array.from(map.values());
    sections = [ ...ordered, ...remaining ];
  }

  return { ...schema, sections };
}

export function buildEffectiveSchema(
  baseSchema: DocumentSchema,
  overrides?: SchemaOverrides,
  customSections?: CustomSection[]
): DocumentSchema {
  const withCustom = mergeSchemaWithCustomSections(baseSchema, customSections || []);
  return applySchemaOverrides(withCustom, overrides);
}
