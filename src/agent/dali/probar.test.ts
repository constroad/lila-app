import { GUION_ASFALTO } from '../ventas/guion.asfalto';
import { CONSTROAD } from '../ventas/prompt.asfalto';
import { paso, validarExtraccion } from '../ventas/guiado';
import { camposDe, senalesDe } from './probar';

/**
 * EL SIMULADOR (A15) muestra lo que Dali entendió a partir del estado del
 * guion: qué dato ya tiene, cuál pregunta ahora y cuáles vienen después, más
 * las señales del mensaje. Es lectura pura del estado del motor.
 */
describe('camposDe', () => {
  it('sin servicio no hay campos; con servicio, listo / activo / pendiente en el orden del guion', () => {
    expect(camposDe(GUION_ASFALTO, {})).toEqual([]);
    const p = paso({}, validarExtraccion({ detalle: 'asfaltar el patio' }, 'necesito asfaltar el patio de mi almacén'), CONSTROAD, null, true, 'necesito asfaltar el patio de mi almacén');
    const campos = camposDe(GUION_ASFALTO, p.estado);
    expect(campos[0]).toMatchObject({ campo: 'area', etiqueta: 'Área', estado: 'activo' });
    expect(campos.slice(1).every((c) => c.estado === 'pendiente')).toBe(true);
    const p2 = paso(p.estado, validarExtraccion({ cantidad: '600 m2', distrito: 'Lurín' }, 'son como 600 m2 en Lurín'), CONSTROAD, null, true, 'son como 600 m2 en Lurín');
    const campos2 = camposDe(GUION_ASFALTO, p2.estado);
    expect(campos2.find((c) => c.campo === 'area')).toMatchObject({ estado: 'listo', valor: '600 m2' });
    expect(campos2.find((c) => c.campo === 'distrito')).toMatchObject({ estado: 'listo', valor: 'Lurín' });
    expect(campos2.find((c) => c.campo === 'espesor')).toMatchObject({ estado: 'activo' });
    expect(campos2.filter((c) => c.estado === 'listo')).toHaveLength(2);
    // Las condicionadas que no aplican todavía no aparecen (imprimante espera a imprimación).
    expect(campos2.some((c) => c.campo === 'imprimante')).toBe(false);
  });
});

describe('senalesDe', () => {
  it('lee las señales que el motor sacó por reglas', () => {
    const x = validarExtraccion({}, 'cuánto cuesta? quiero hablar con un asesor');
    expect(senalesDe(x)).toMatchObject({ preguntaPrecio: true, quierePersona: true, fueraDeTema: false, confirma: false });
    expect(senalesDe(validarExtraccion({}, 'hola'))).toMatchObject({ saludoSolo: true, quierePersona: false });
  });
});
