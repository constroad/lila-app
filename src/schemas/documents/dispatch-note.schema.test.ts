import { dispatchNoteSchema } from './dispatch-note.schema.js';
import { getSchemaByCode } from './registry.js';

describe('dispatchNoteSchema', () => {
  it('registers the vale schema with the expected code and defaults', () => {
    expect(dispatchNoteSchema.code).toBe('DISPATCH-NOTE');
    expect(dispatchNoteSchema.orientation).toBe('portrait');
    expect(dispatchNoteSchema.defaultData.header.companySubtitle).toBe('');
    expect(getSchemaByCode('DISPATCH-NOTE')).toBe(dispatchNoteSchema);
  });
});
