/**
 * messageTemplate — renderizador de plantillas logic-less para mensajes de WhatsApp.
 *
 * POR QUÉ EXISTE (lo que codex/deepseek deben entender antes de tocar esto):
 * Las alertas programadas (crons) construyen un cuerpo dinámico (un reporte). Queremos que el
 * usuario edite el TEXTO del mensaje pero NO los VALORES (que los calcula el backend). La
 * solución estándar es una plantilla "logic-less" estilo Mustache: el usuario escribe prosa con
 * marcadores `{{variable}}`; el backend provee un "contexto" de datos; el render sustituye.
 *
 * Soporta lo mínimo necesario, SIN dependencia externa (evita supply-chain y es predecible):
 *  - Escalares:        `{{nombre}}`            → contexto.nombre
 *  - Secciones (loop): `{{#items}}…{{/items}}` → repite el bloque por cada elemento del array
 *                                                 (cada item se apila como contexto: dentro del
 *                                                 bloque `{{campo}}` busca primero en el item).
 *  - Sección verdad:   `{{#flag}}…{{/flag}}`   → si `flag` es truthy (no-array), renderiza 1 vez
 *  - Inversa (vacío):  `{{^items}}…{{/items}}` → renderiza SOLO si `items` es falsy/array vacío
 *
 * NO soporta (a propósito, para mantenerlo seguro y simple): condicionales con operadores,
 * helpers, expresiones, acceso por índice. Si se necesita lógica, va en el contexto (backend).
 *
 * SEGURIDAD: no ejecuta código; solo sustituye texto. Las variables desconocidas se renderizan
 * como cadena vacía (no se filtra `{{x}}` crudo al usuario). `validateTemplate` (abajo) avisa de
 * variables/secciones desconocidas EN TIEMPO DE GUARDADO para que el editor lo muestre.
 *
 * Las llaves se escriben `{{...}}`. En la UI el usuario inserta variables como chips (no teclea
 * llaves), así que la sintaxis es invisible para él (ver spec §6.3 / §Q1).
 */

/** Valor escalar admitido en el contexto de una plantilla. */
export type TemplateScalar = string | number | boolean | null | undefined;

/** Valor de contexto: escalar, objeto anidado, o lista (para secciones iterables). */
export type TemplateValue = TemplateScalar | TemplateContext | TemplateValue[];

/** Contexto de datos que provee el backend para renderizar una plantilla. */
export interface TemplateContext {
  [key: string]: TemplateValue;
}

// --- Nodos del AST -----------------------------------------------------------

interface TextNode {
  type: 'text';
  value: string;
}
interface VarNode {
  type: 'var';
  name: string;
}
interface SectionNode {
  type: 'section';
  name: string;
  inverted: boolean;
  children: TemplateNode[];
}
type TemplateNode = TextNode | VarNode | SectionNode;

const TOKEN_RE = /\{\{(#|\^|\/)?\s*([\w.]+)\s*\}\}/g;

/**
 * Parsea la plantilla a un AST. Maneja secciones anidadas con una pila. Lanza si una sección
 * queda sin cerrar o si un cierre no coincide con la apertura (plantilla malformada).
 */
function parseTemplate(template: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: SectionNode[] = [];
  const push = (node: TemplateNode) => {
    const target = stack.length > 0 ? stack[stack.length - 1].children : root;
    target.push(node);
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(template)) !== null) {
    const [raw, sigil, name] = match;
    if (match.index > lastIndex) {
      push({ type: 'text', value: template.slice(lastIndex, match.index) });
    }
    lastIndex = match.index + raw.length;

    if (sigil === '#' || sigil === '^') {
      const section: SectionNode = {
        type: 'section',
        name,
        inverted: sigil === '^',
        children: [],
      };
      push(section);
      stack.push(section);
    } else if (sigil === '/') {
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new Error(
          `Plantilla malformada: cierre {{/${name}}} sin apertura correspondiente`
        );
      }
    } else {
      push({ type: 'var', name });
    }
  }
  if (lastIndex < template.length) {
    push({ type: 'text', value: template.slice(lastIndex) });
  }
  if (stack.length > 0) {
    throw new Error(`Plantilla malformada: sección {{#${stack[stack.length - 1].name}}} sin cerrar`);
  }
  return root;
}

/** Busca `name` en la pila de contextos (del más interno al más externo, estilo Mustache). */
function lookup(name: string, stack: TemplateContext[]): TemplateValue {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const ctx = stack[i];
    if (ctx && Object.prototype.hasOwnProperty.call(ctx, name)) {
      return ctx[name];
    }
  }
  return undefined;
}

/** Convierte un valor escalar a texto para sustitución. `null`/`undefined` → ''. */
function scalarToString(value: TemplateValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return ''; // objetos/arrays no se imprimen como escalar
  return String(value);
}

function renderNodes(nodes: TemplateNode[], stack: TemplateContext[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += node.value;
    } else if (node.type === 'var') {
      out += scalarToString(lookup(node.name, stack));
    } else {
      out += renderSection(node, stack);
    }
  }
  return out;
}

function renderSection(node: SectionNode, stack: TemplateContext[]): string {
  const value = lookup(node.name, stack);
  const isArray = Array.isArray(value);
  const isEmpty = isArray
    ? (value as TemplateValue[]).length === 0
    : !value;

  if (node.inverted) {
    return isEmpty ? renderNodes(node.children, stack) : '';
  }
  if (isEmpty) return '';

  if (isArray) {
    return (value as TemplateValue[])
      .map((item) => {
        const itemCtx: TemplateContext =
          item && typeof item === 'object' && !Array.isArray(item)
            ? (item as TemplateContext)
            : { '.': item as TemplateScalar }; // escalar dentro de lista → `{{.}}`
        return renderNodes(node.children, [...stack, itemCtx]);
      })
      .join('');
  }

  // Sección "verdad" sobre objeto o escalar truthy → renderiza una vez.
  const ctx: TemplateContext =
    value && typeof value === 'object' ? (value as TemplateContext) : {};
  return renderNodes(node.children, [...stack, ctx]);
}

/**
 * Renderiza una plantilla con un contexto de datos. Determinista y sin efectos.
 *
 * @param template - texto con marcadores `{{var}}` y secciones `{{#list}}…{{/list}}`.
 * @param context - datos provistos por el backend (ver registry de cada alerta).
 * @returns el mensaje final listo para enviar por WhatsApp.
 * @throws si la plantilla está malformada (sección sin cerrar / cierre huérfano).
 *
 * @example
 * renderMessageTemplate(
 *   'Hola {{name}}, vence {{fecha}}:\n{{#items}}- {{nombre}} ({{dias}}d)\n{{/items}}',
 *   { name: 'Equipo', fecha: 'viernes', items: [{ nombre: 'Volquete', dias: 3 }] }
 * )
 * // "Hola Equipo, vence viernes:\n- Volquete (3d)\n"
 */
export function renderMessageTemplate(template: string, context: TemplateContext): string {
  if (!template) return '';
  const ast = parseTemplate(template);
  return renderNodes(ast, [context]);
}

/** Resultado de validar una plantilla contra las variables permitidas de una alerta. */
export interface TemplateValidation {
  valid: boolean;
  /** Variables/secciones usadas que NO están declaradas para esa alerta. */
  unknown: string[];
  /** Error de parseo (sección sin cerrar, etc.), si lo hay. */
  error?: string;
}

/**
 * Valida una plantilla en TIEMPO DE GUARDADO: parsea (detecta malformación) y verifica que
 * todas las variables/secciones usadas estén en `allowedNames`. Permite `.` (item escalar de
 * lista) y los campos declarados de cada lista. El editor usa esto para avisar antes de guardar.
 *
 * @param allowedNames - nombres válidos: escalares + nombres de lista + `lista.campo` y `.`.
 */
export function validateTemplate(template: string, allowedNames: string[]): TemplateValidation {
  let ast: TemplateNode[];
  try {
    ast = parseTemplate(template);
  } catch (error) {
    return { valid: false, unknown: [], error: (error as Error).message };
  }
  const allowed = new Set([...allowedNames, '.']);
  const unknown = new Set<string>();
  const walk = (nodes: TemplateNode[]) => {
    for (const node of nodes) {
      if (node.type === 'var' && !allowed.has(node.name)) unknown.add(node.name);
      if (node.type === 'section') {
        if (!allowed.has(node.name)) unknown.add(node.name);
        walk(node.children);
      }
    }
  };
  walk(ast);
  return { valid: unknown.size === 0, unknown: Array.from(unknown), error: undefined };
}
