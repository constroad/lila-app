import { herramientaDeDatosPorReglas } from './herramientas';
import { lineaInforme, nombreArchivo, resumenServicio, sinDuplicados, textoDeBusqueda, tipoDeInforme, tiposDeInforme } from './informes';

/**
 * LOS INFORMES EN PDF (José, 14/09): «dame el informe de planta», «dame el
 * informe de control de pista»… Acá lo que se decide sin base ni modelo: qué
 * pide, de qué tipo, de qué obra o cliente, y cuándo NO es un pedido de PDF.
 */
describe('qué tipo de informe piden', () => {
  it('el alias más largo gana: «solicitud de imprimación» no es el control de imprimación', () => {
    expect(tipoDeInforme('dame el informe de planta de ayer')?.codigo).toBe('IPP');
    expect(tipoDeInforme('pásame el control de pista de los pinos')?.codigo).toBe('CTL-PIS');
    expect(tipoDeInforme('manda el pdf de la solicitud de imprimación')?.codigo).toBe('SOL-IMP');
    expect(tipoDeInforme('manda el control de imprimación')?.codigo).toBe('CTL-IMP');
    expect(tipoDeInforme('dame el acta de conformidad de comas')?.codigo).toBe('ACT-CNF');
    expect(tipoDeInforme('dame el último informe')).toBeUndefined();
  });

  it('lo que queda es la obra, el cliente o la persona', () => {
    expect(textoDeBusqueda('dame el control de pista de los pinos de ayer', tipoDeInforme('dame el control de pista de los pinos de ayer'))).toBe('pinos');
    expect(textoDeBusqueda('pásame el informe de planta de globofast del 10 de septiembre', tipoDeInforme('pásame el informe de planta de globofast del 10 de septiembre'))).toBe('');
    expect(textoDeBusqueda('mándame el pdf del acta de conformidad de la municipalidad de comas', tipoDeInforme('mándame el pdf del acta de conformidad de la municipalidad de comas'))).toBe('municipalidad comas');
    expect(textoDeBusqueda('dame el último informe de jeremy', undefined)).toBe('jeremy');
  });
});

describe('cuándo es un pedido de PDF y cuándo no', () => {
  it('pedir el archivo va a informes; preguntar cómo va o cuántos hay, no', () => {
    expect(herramientaDeDatosPorReglas('dame el informe de control de pista de los pinos')).toBe('informes');
    expect(herramientaDeDatosPorReglas('manda el pdf del ipp de ayer')).toBe('informes');
    expect(herramientaDeDatosPorReglas('descárgame el control de pista de hoy')).toBe('informes');
    // 15/09 15:13: «descargaron» empezaba con «descarga» (el verbo de bajar el
    // PDF) y con «pista» al lado mandaba la pregunta al PDF. Los verbos son
    // palabras enteras: descargaron es que bajaron el asfalto, no el archivo.
    expect(herramientaDeDatosPorReglas('cuantos carros ya se descargaron en campo en el control dr pista?')).toBeNull();
    expect(herramientaDeDatosPorReglas('cuántos carros descargados en pista')).toBeNull();
    expect(herramientaDeDatosPorReglas('pásame la valorización de comas')).toBe('informes');
    expect(herramientaDeDatosPorReglas('el pdf')).toBe('informes');
    expect(herramientaDeDatosPorReglas('quiero ver cómo va la pista')).toBeNull();
    expect(herramientaDeDatosPorReglas('cuántos informes se hicieron hoy')).toBeNull();
    expect(herramientaDeDatosPorReglas('ya está el ipp de hoy?')).toBeNull();
    expect(herramientaDeDatosPorReglas('cuántos agregados llegaron hoy')).not.toBe('informes');
  });
});

describe('cómo se muestran', () => {
  const informe = { id: 'x', companyId: 'globofas-s8k', empresa: 'Globofast', tipo: 'CTL-PIS', nombreTipo: 'Control de pista', fecha: '2026-04-02', estado: 'completed', servicio: 'Mejoramiento del servicio de movilidad urbana en avenida los…', cliente: 'MUNICIPALIDAD DE COMAS', pdfUrl: undefined };
  it('una línea para elegir, un nombre de archivo limpio, la descripción recortada', () => {
    expect(lineaInforme(informe)).toBe('*Control de pista* · 02/04 · Globofast · MUNICIPALIDAD DE COMAS\n   Mejoramiento del servicio de movilidad urbana en avenida los… · _(se genera al pedirlo)_');
    expect(nombreArchivo(informe)).toBe('Control de pista - MUNICIPALIDAD DE COMAS - 2026-04-02.pdf');
    expect(resumenServicio('Mejoramiento del servicio de movilidad urbana en avenida los pinos en la zonal 07')).toBe('Mejoramiento del servicio de movilidad urbana en avenida…');
    expect(resumenServicio('Obra corta')).toBe('Obra corta');
  });
});

describe('sinDuplicados: el borrador y el completado del mismo informe son uno', () => {
  it('se queda el completado; dos servicios distintos siguen siendo dos', () => {
    const base = { companyId: 'globofas-s8k', empresa: 'Globofast', tipo: 'IPP', nombreTipo: 'IPP', fecha: '2026-09-15', servicio: 'MOVILIDAD…', cliente: 'LOMAS' };
    const lista = [
      { ...base, id: 'a', estado: 'draft' },
      { ...base, id: 'b', estado: 'completed' },
      { ...base, id: 'c', estado: 'draft', servicio: 'OTRA OBRA' },
    ] as never[];
    expect(sinDuplicados(lista).map((i: { id: string }) => i.id)).toEqual(['b', 'c']);
  });
});

describe('varios informes en una pregunta, y los verbos de generar', () => {
  it('«el informe de pista, planta e imprimación» son tres, en orden; y el texto de búsqueda queda vacío', () => {
    expect(tiposDeInforme('enviame el informe de pista, planta e imprimacion').map((t) => t.codigo)).toEqual(['CTL-PIS', 'IPP', 'CTL-IMP']);
    expect(textoDeBusqueda('enviame el informe de pista, planta e imprimacion')).toBe('');
    expect(tiposDeInforme('manda la solicitud de imprimación').map((t) => t.codigo)).toEqual(['SOL-IMP']);
    expect(tiposDeInforme('dame el último informe')).toEqual([]);
  });
  it('«genérame», «imprime», «saca» también piden el archivo', () => {
    expect(herramientaDeDatosPorReglas('generame el informe de planta de ayer')).toBe('informes');
    expect(herramientaDeDatosPorReglas('imprime el control de pista')).toBe('informes');
  });
});
