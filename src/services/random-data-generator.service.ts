import { faker } from '@faker-js/faker';
import { ColumnSchema, DocumentSchema, FieldSchema, SectionSchema } from '../schemas/documents/types';

function setNestedValue(target: Record<string, any>, path: string, value: any) {
  const parts = path.split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function generateFieldValue(field: FieldSchema): any {
  switch (field.type) {
    case 'text':
      return faker.lorem.words({ min: 1, max: 4 });
    case 'number':
      return faker.number.int({ min: 0, max: 1000 });
    case 'currency':
      return faker.number.float({ min: 0, max: 100000, precision: 0.01 });
    case 'percentage':
      return faker.number.float({ min: 0, max: 100, precision: 0.01 });
    case 'date':
      return faker.date.recent({ days: 30 }).toISOString().slice(0, 10);
    case 'datetime':
      return faker.date.recent({ days: 30 }).toISOString();
    case 'time':
      return faker.date.recent().toISOString().slice(11, 16);
    case 'select':
    case 'multiselect':
      if (field.options?.length) {
        return field.options[Math.floor(Math.random() * field.options.length)].value;
      }
      return '';
    case 'checkbox':
      return faker.datatype.boolean();
    case 'richtext':
      return faker.lorem.paragraphs({ min: 1, max: 2 });
    case 'signature':
      return { nombre: faker.person.fullName(), cargo: faker.person.jobTitle() };
    default:
      return '';
  }
}

function generateColumnValue(column: ColumnSchema): any {
  switch (column.type) {
    case 'text':
      return faker.lorem.words({ min: 1, max: 3 });
    case 'number':
      return faker.number.float({ min: 0, max: 1000, precision: 0.01 });
    case 'currency':
      return faker.number.float({ min: 0, max: 100000, precision: 0.01 });
    case 'percentage':
      return faker.number.float({ min: 0, max: 100, precision: 0.01 });
    case 'select':
      if (column.options?.length) {
        return column.options[Math.floor(Math.random() * column.options.length)].value;
      }
      return '';
    case 'checkbox':
      return faker.datatype.boolean();
    default:
      return '';
  }
}

function generateTableRows(section: SectionSchema): Array<Record<string, any>> {
  const rows: Array<Record<string, any>> = [];
  const minRows = section.minRows ?? 1;
  const maxRows = section.maxRows ?? Math.max(minRows, 5);
  const rowCount = faker.number.int({ min: minRows, max: Math.min(maxRows, minRows + 5) });

  if (!section.columns) {
    return rows;
  }

  for (let i = 0; i < rowCount; i += 1) {
    const row: Record<string, any> = {};
    for (const column of section.columns) {
      if (column.computed) {
        continue;
      }
      row[column.key] = generateColumnValue(column);
    }
    rows.push(row);
  }

  return rows;
}

export function generateRandomDataForSchema(schema: DocumentSchema): Record<string, any> {
  const data: Record<string, any> = schema.defaultData ? { ...schema.defaultData } : {};

  for (const section of schema.sections) {
    if (section.fields) {
      for (const field of section.fields) {
        const value = generateFieldValue(field);
        setNestedValue(data, field.key, value);
      }
    }

    if (section.columns && section.dynamicRows) {
      data[section.id] = generateTableRows(section);
    }
  }

  return data;
}
