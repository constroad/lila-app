import { CANVAS_QUOTE_PDF_MARGIN, getCanvasQuoteHtml } from './quote-documents.helpers.js';

describe('quote-documents.helpers', () => {
  describe('getCanvasQuoteHtml', () => {
    it('returns trimmed canvas html when present', () => {
      expect(getCanvasQuoteHtml({ html: '  <div>doc</div>  ' })).toBe('<div>doc</div>');
    });

    it('returns empty string when html is missing (Handlebars path stays intact)', () => {
      expect(getCanvasQuoteHtml({ schemaCode: 'COT-ASF' })).toBe('');
    });

    it.each([
      [null],
      [undefined],
      ['raw-string-body'],
      [{ html: 42 }],
      [{ html: { nested: true } }],
      [{ html: '   ' }],
    ])('returns empty string for non-string html payloads (%p)', (body) => {
      expect(getCanvasQuoteHtml(body)).toBe('');
    });
  });

  it('exposes the 14mm canvas margin for Puppeteer', () => {
    expect(CANVAS_QUOTE_PDF_MARGIN).toEqual({
      top: '14mm',
      right: '14mm',
      bottom: '14mm',
      left: '14mm',
    });
  });
});
