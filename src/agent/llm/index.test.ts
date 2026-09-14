import { argumentosDeRango } from './index';

const lunes = new Date('2026-09-14T14:00:00Z').getTime(); // lunes 14/09, 09:00 Lima

/** «Qué pedidos hay esta semana» no es «qué pedidos hay hoy». */
describe('argumentosDeRango', () => {
  it('un rango de varios días en la pregunta, con la empresa si la nombra', () => {
    expect(argumentosDeRango('qué pedidos tenemos programados esta semana', lunes)).toEqual({ desde: '2026-09-14', hasta: '2026-09-20' });
    expect(argumentosDeRango('cuántos pedidos tuvo globofast la semana pasada', lunes)).toEqual({ desde: '2026-09-07', hasta: '2026-09-13', companyId: 'globofas-s8k' });
    expect(argumentosDeRango('qué pedidos tenemos programados en inframaq esta semana', lunes)).toEqual({ desde: '2026-09-14', hasta: '2026-09-20', companyId: 'inframaq-iax' });
  });

  it('un solo día, o ningún rango, no es cosa de esta ruta', () => {
    expect(argumentosDeRango('qué pedidos hay hoy', lunes)).toBeNull();
    expect(argumentosDeRango('qué pedidos hay el miércoles', lunes)).toBeNull();
    expect(argumentosDeRango('qué pedidos hay', lunes)).toBeNull();
  });
});
