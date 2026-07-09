/**
 * Core schema types for the document generator.
 * Single Source of Truth for document structure.
 */

/**
 * Field types supported by the dynamic renderer.
 */
export type FieldType =
  | 'text'
  | 'number'
  | 'currency'
  | 'percentage'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'richtext'
  | 'image'
  | 'signature'
  | 'computed';

/**
 * Section types for document layout.
 */
export type SectionType =
  | 'header'
  | 'projectData'
  | 'simpleFields'
  | 'dataTable'
  | 'checklist'
  | 'richText'
  | 'photoPanel'
  | 'photoSection'
  | 'signatures'
  | 'summary'
  | 'verification'
  | 'resultsTable'
  // Cotizaciones canvas (Portal): layout fiel al PDF comercial legacy. El
  // renderer Handlebars no las usa (el PDF canvas llega por passthrough).
  | 'totalsPanel'
  | 'signatureClosing'
  | 'footerNote'
  | 'noteSections';

/**
 * Document categories.
 */
export type DocumentCategory =
  | 'Operations'
  | 'Technical'
  | 'Quality'
  | 'Financial'
  | 'Administrative'
  | 'Claims'
  | 'Compilation'
  | 'Documentation';

/**
 * Column definition for data tables.
 */
export interface ColumnSchema {
  key: string;
  label: string;
  shortLabel?: string;
  group?: string;
  type: FieldType;
  width?: number;
  align?: 'left' | 'center' | 'right';
  editable?: boolean;
  required?: boolean;
  visible?: boolean;
  sortable?: boolean;
  computed?: boolean;
  formula?: string;
  exclusiveGroup?: string;
  options?: {
    value: string;
    label: string;
    color?: string;
  }[];
  min?: number;
  max?: number;
  pattern?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  showIf?: {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
    value: any;
  };
  tooltip?: string;
  placeholder?: string;
}

/**
 * Field definition for simple form fields.
 */
export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  editable?: boolean;
  defaultValue?: any;
  span?: number;
  row?: number;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    message?: string;
  };
  options?: { value: string; label: string }[];
  formula?: string;
  showIf?: {
    field: string;
    operator: string;
    value: any;
  };
  tooltip?: string;
  placeholder?: string;
}

/**
 * Section definition for document structure.
 */
export interface SectionSchema {
  id: string;
  type: SectionType;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  visible?: boolean;
  headerConfig?: {
    logoUrl?: string;
    logoKey?: string;
    leftTextKey?: string;
    centerTitle?: string;
    centerTitleKey?: string;
    centerSubtitle?: string;
    centerSubtitleKey?: string;
    centerLines?: string[];
    centerLinesKeys?: string[];
    /** `folioPrefix`: el canvas muestra el valor como folio con serie
     * ("ASF - 0000106", formato `formatQuoteFolio`) y no editable inline. */
    rightFields?: { label: string; key: string; folioPrefix?: string }[];
    secondaryRow?: {
      leftText?: string;
      leftTextKey?: string;
      centerText?: string;
      centerTextKey?: string;
      rightFields?: { label: string; key: string }[];
    };
  };
  signatureStyle?: 'line' | 'box';
  includeHeader?: boolean;
  headerOverride?: SectionSchema['headerConfig'];
  pageBreakBefore?: boolean;
  pageOrientation?: 'portrait' | 'landscape';

  // DataTable specific
  columns?: ColumnSchema[];
  dynamicRows?: boolean;
  minRows?: number;
  maxRows?: number;
  showTotals?: boolean;
  totalColumns?: string[];
  /** Columna (key) sumada para el pie de totales (SUB TOTAL/IGV/TOTAL). */
  totalsColumn?: string;
  /** Tasa de IGV del pie de totales (0 = solo TOTAL). Default 0.18. */
  igvRate?: number;
  reorderable?: boolean;
  /** `summary`: render como caja con bordes. */
  boxed?: boolean;

  // SimpleFields specific
  fields?: FieldSchema[];
  gridColumns?: number;
  /** Oculta el título visual (el rótulo sigue en controles/inspector del canvas). */
  showTitle?: boolean;
  /** simpleFields: 'inlineRows' = filas "LABEL: valor" fiel al PDF comercial. */
  fieldsVariant?: 'grid' | 'inlineRows';
  /** Ancho en px de la columna de labels en `fieldsVariant: 'inlineRows'`. */
  inlineLabelWidth?: number;

  // Cotizaciones canvas (Portal renderiza; el Handlebars legacy las ignora)
  /** totalsPanel: monto en letras (izq) + caja de totales con bordes (der). */
  totalsConfig?: {
    amountInWordsKey?: string;
    rows: { label: string; key: string }[];
  };
  /** signatureClosing: despedida + firma (izq) y cuentas bancarias (der). */
  closingConfig?: {
    farewell?: string;
    signature?: {
      imageKey?: string;
      /** Imagen del sello de la empresa (opcional, junto a la firma). */
      stampKey?: string;
      nameKey?: string;
      roleKey?: string;
      contactKey?: string;
    };
    bankAccountsKey?: string;
    bankTitle?: string;
  };
  /** footerNote: líneas pequeñas sobre una regla superior (pie del documento). */
  footerConfig?: {
    lines: { key: string; placeholder?: string }[];
  };
  /** noteSections: bloques {title, lines[]} en `data[section.id]` (alcance COT-SER). */
  noteSectionsConfig?: {
    scopeTitle?: string;
    leadTitleContains?: string;
    leadTitle?: string;
    /** Clave del array de bloques (default: section.id); dos secciones pueden
     * compartir el mismo array (`sections`). */
    sourceKey?: string;
    /** Partición a renderizar en el canvas: 'lead' (Condiciones) o 'scope' (Alcance). */
    partition?: 'lead' | 'scope';
  };

  // Checklist specific
  items?: {
    key: string;
    label: string;
    required?: boolean;
    defaultChecked?: boolean;
  }[];

  // PhotoPanel / PhotoSection specific
  maxImages?: number;
  layout?: '2x2' | '2x3' | '3x2' | '3x3' | '4x3';
  showProgresiva?: boolean;
  showFecha?: boolean;
  showHora?: boolean;
  categories?: {
    key: string;
    label: string;
    maxPhotos?: number;
  }[];

  // Signatures specific
  signatures?: {
    key: string;
    label: string;
    sublabel?: string;
    entity?: string;
    required?: boolean;
    showCIP?: boolean;
  }[];

  // Verification specific
  verificationItems?: {
    key: string;
    label: string;
    type: 'checkbox' | 'select' | 'text';
    options?: string[];
    required?: boolean;
  }[];

  // Conditional visibility
  showIf?: {
    field: string;
    operator: string;
    value: any;
  };
}

/**
 * Complete document schema definition.
 * Single Source of Truth for each document type.
 */
export interface DocumentSchema {
  // Metadata
  id: string;
  code: string;
  name: string;
  description: string;
  category: DocumentCategory;
  version: string;
  lastUpdated: string;

  // Layout
  orientation: 'portrait' | 'landscape';
  pageSize: 'A4' | 'Letter' | 'Legal';
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  // Structure
  sections: SectionSchema[];
  defaultData: Record<string, any>;
  computedFields?: {
    key: string;
    formula: string;
    dependencies: string[];
  }[];

  // Export
  exportOptions?: {
    docx?: boolean;
    pdf?: boolean;
    excel?: boolean;
  };
  normativeReference?: string[];

  // Background image support (letterhead).
  // When true, data.branding.backgroundImageUrl is rendered as a full-page watermark.
  backgroundImageEnabled?: boolean;
}
