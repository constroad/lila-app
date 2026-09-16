import { esPregunta, esTentativo, horaDe, interpretarJsonDeAnuncio, resolverFechaAnunciada } from './anuncios';

const lima = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-05:00`).getTime();
const lunes = lima('2026-09-14', '10:23');

describe('resolver lo que el modelo copió', () => {
  it('fechas como las escriben: «Jueves 17», «MARTES 15-09», «17/09», «mañana», «viernes» (relativas al mensaje)', () => {
    expect(resolverFechaAnunciada('Jueves 17', lunes)).toBe('2026-09-17');
    expect(resolverFechaAnunciada('MARTES 15-09', lunes)).toBe('2026-09-15');
    expect(resolverFechaAnunciada('17/09', lunes)).toBe('2026-09-17');
    expect(resolverFechaAnunciada('mañana', lunes)).toBe('2026-09-15');
    expect(resolverFechaAnunciada('viernes', lunes)).toBe('2026-09-18');
    expect(resolverFechaAnunciada('', lunes)).toBeUndefined();
  });
  it('horas: «04:30 am», «4.30», «5», «5 pm»', () => {
    expect(horaDe('04:30 am')).toBe('04:30');
    expect(horaDe('4.30')).toBe('04:30');
    expect(horaDe('5')).toBe('05:00');
    expect(horaDe('5 pm')).toBe('17:00');
    expect(horaDe('')).toBeUndefined();
    expect(horaDe('a las cinco')).toBeUndefined();
  });
});

describe('interpretarJsonDeAnuncio: el modelo señala, el código resuelve y valida', () => {
  it('el anuncio real del 14/09 de dos días: dos producciones con su fecha, hora, m³ y cliente', () => {
    const texto = 'Buenos dias tenemos producción en INFRAMAQ 2 dias : MARTES 15-09 / H.de producion. 04:30 am / M3: 250.00 APROX. MIERCOLES 16-09 / H.de producion. 04:30 am / M3: 274.00 APROX. Cliente : CONSORCIO LOMAS';
    const json = JSON.stringify({ accion: 'programar', producciones: [{ empresa: '', cliente: 'CONSORCIO LOMAS', fecha: 'MARTES 15-09', hora: '04:30 am', m3: '250.00' }, { empresa: '', cliente: 'CONSORCIO LOMAS', fecha: 'MIERCOLES 16-09', hora: '04:30 am', m3: '274.00' }], desde_fecha: '' });
    const a = interpretarJsonDeAnuncio(json, texto, lunes, { companyId: 'globofas-s8k', empresa: 'Globofast Solkali' });
    expect(a).toMatchObject({ accion: 'programar' });
    expect(a!.producciones).toEqual([
      { companyId: 'globofas-s8k', empresa: 'Globofast Solkali', cliente: 'CONSORCIO LOMAS', fecha: '2026-09-15', hora: '04:30', cubos: 250 },
      { companyId: 'globofas-s8k', empresa: 'Globofast Solkali', cliente: 'CONSORCIO LOMAS', fecha: '2026-09-16', hora: '04:30', cubos: 274 },
    ]);
  });
  it('la empresa sale del texto (alias) o del autor; lo que el modelo inventa (m³ que no están, cliente que no está) no pasa', () => {
    const texto = '📣 Jueves 17 tengo produccion de 137m3 para globo';
    const json = JSON.stringify({ accion: 'programar', producciones: [{ empresa: 'constroad', cliente: 'LOS PINOS', fecha: 'Jueves 17', hora: '', m3: '150' }], desde_fecha: '' });
    const a = interpretarJsonDeAnuncio(json, texto, lunes, { companyId: 'constroad', empresa: 'ConstRoad' });
    // «globo» está en el texto: gana el alias del texto sobre lo que dijo el modelo y sobre el autor.
    // Los «150» inventados no pasan; los 137 del texto sí.
    expect(a!.producciones[0]).toMatchObject({ companyId: 'globofas-s8k', fecha: '2026-09-17', cubos: 137, cliente: undefined, hora: undefined });
  });
  it('mover trae el día de origen; cancelar la fecha; ninguna, nada', () => {
    const mover = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'mover', producciones: [{ empresa: 'globofast', cliente: '', fecha: 'viernes', hora: '', m3: '' }], desde_fecha: 'jueves' }), 'la producción de globofast del jueves ya no va, pasa al viernes', lima('2026-09-15', '11:00'));
    expect(mover).toMatchObject({ accion: 'mover', desdeFecha: '2026-09-17', producciones: [{ companyId: 'globofas-s8k', fecha: '2026-09-18' }] });
    const cancelar = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'cancelar', producciones: [{ empresa: '', cliente: '', fecha: 'jueves', hora: '', m3: '' }], desde_fecha: '' }), 'se suspende la producción del jueves por lluvia', lima('2026-09-15', '11:00'));
    expect(cancelar).toMatchObject({ accion: 'cancelar', producciones: [{ fecha: '2026-09-17' }] });
    expect(interpretarJsonDeAnuncio(JSON.stringify({ accion: 'ninguna', producciones: [], desde_fecha: '' }), 'ok gracias', lunes)).toEqual({ accion: 'ninguna', producciones: [] });
    expect(interpretarJsonDeAnuncio('no es json', 'x', lunes)).toBeNull();
  });
});

describe('lo que el modelo confunde y el código endereza', () => {
  it('«en INFRAMAQ» es la planta: la empresa es la del autor', () => {
    const a = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'programar', producciones: [{ empresa: 'inframaq', cliente: '', fecha: 'martes 15-09', hora: '04:30', m3: '250' }], desde_fecha: '' }), 'tenemos producción en INFRAMAQ martes 15-09 04:30 250 m3', lunes, { companyId: 'globofas-s8k', empresa: 'Globofast Solkali' });
    expect(a!.producciones[0]).toMatchObject({ companyId: 'globofas-s8k', empresa: 'Globofast Solkali' });
  });
  it('«el jueves cambia: 160 en vez de 137» vino como mover del jueves al jueves: es programar (actualización)', () => {
    const a = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'mover', producciones: [{ empresa: '', cliente: '', fecha: 'jueves', hora: '', m3: '160' }], desde_fecha: 'jueves' }), 'el jueves cambia: 160 m3 en vez de 137', lima('2026-09-15', '11:00'), { companyId: 'globofas-s8k', empresa: 'Globofast Solkali' });
    expect(a).toMatchObject({ accion: 'programar', producciones: [{ fecha: '2026-09-17', cubos: 160 }] });
    expect(a!.desdeFecha).toBeUndefined();
  });
  it('lo que apunta al pasado («ayer terminamos») no es cancelar ni programar', () => {
    const a = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'cancelar', producciones: [{ empresa: '', cliente: '', fecha: 'ayer', hora: '', m3: '250' }], desde_fecha: '' }), 'ayer terminamos a las 3 con 250 m3', lima('2026-09-15', '11:00'));
    expect(a).toEqual({ accion: 'ninguna', producciones: [] });
  });
});

describe('una pregunta no anuncia nada, y un anuncio sin hora ni m³ no programa', () => {
  it('16/09 06:50, Nene: «mañana tienen producción, @CONSTROAD, GLOBOFAST??» → ninguna aunque el modelo diga programar', () => {
    const texto = 'Buen dia,mañana tienen producción,@CONSTROAD,GLOBO FAST??';
    expect(esPregunta(texto)).toBe(true);
    expect(esPregunta('hay producción mañana')).toBe(false); // sin «?» no se adivina: el modelo decide
    expect(esPregunta('tenemos producción en INFRAMAQ martes 15-09')).toBe(false);
    expect(esPregunta('📣 Jueves 17 tengo produccion de 137m3')).toBe(false);
    const a = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'programar', producciones: [{ empresa: 'globofast', cliente: '', fecha: 'mañana', hora: '', m3: '' }], desde_fecha: '' }), texto, lima('2026-09-16', '06:50'));
    expect(a).toEqual({ accion: 'ninguna', producciones: [] });
  });
  it('lo tentativo («puede haber», «aún no confirman», «mañana o viernes») es posible, no anuncio', () => {
    expect(esTentativo('Puede haber produccion mañana o Viernes. Son 300m3 de 2 pulgadas')).toBe(true);
    expect(esTentativo('Aun no me confirman')).toBe(true);
    expect(esTentativo('producción jueves o viernes 300 m3')).toBe(true);
    expect(esTentativo('📣 Jueves 17 tengo produccion de 137m3')).toBe(false);
    const a = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'programar', producciones: [{ empresa: '', cliente: '', fecha: 'mañana', hora: '', m3: '300' }], desde_fecha: '' }), 'Puede haber produccion mañana o Viernes. Son 300m3 de 2 pulgadas', lima('2026-09-16', '07:12'), { companyId: 'globofas-s8k', empresa: 'Globofast Solkali' });
    expect(a).toEqual({ accion: 'posible', producciones: [] });
  });
  it('sin empresa (ni en el texto ni por el autor) no se programa: es incompleto', () => {
    const a = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'programar', producciones: [{ empresa: '', cliente: '', fecha: 'jueves 17', hora: '04:30', m3: '300' }], desde_fecha: '' }), 'Jueves 17 producción 04:30 300 m3', lima('2026-09-16', '07:12'));
    expect(a).toMatchObject({ accion: 'ninguna', vago: true });
  });
  it('«mañana producción de globofast» sin hora ni m³: vago, se pregunta el dato', () => {
    const a = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'programar', producciones: [{ empresa: 'globofast', cliente: '', fecha: 'mañana', hora: '', m3: '' }], desde_fecha: '' }), 'mañana producción de globofast', lima('2026-09-16', '06:50'));
    expect(a).toMatchObject({ accion: 'ninguna', vago: true });
    // Con m³ o con hora, sí.
    const b = interpretarJsonDeAnuncio(JSON.stringify({ accion: 'programar', producciones: [{ empresa: 'globofast', cliente: '', fecha: 'mañana', hora: '', m3: '137' }], desde_fecha: '' }), 'mañana producción de globofast 137 m3', lima('2026-09-16', '06:50'));
    expect(b).toMatchObject({ accion: 'programar', producciones: [{ cubos: 137 }] });
  });
});
