import { distritoDe, franjasDeRiesgo, textoClima, type Hora } from './clima';

/**
 * El clima, sin Open-Meteo: lo que se prueba es cómo se agrupan las horas con
 * riesgo en franjas y qué se dice. José, 13/09: «si hay riesgo de lluvia, en
 * qué franja horaria».
 */
const hora = (h: number, prob: number, mm = 0, codigo = 1, temperatura = 20): Hora => ({ hora: h, probLluvia: prob, mm, temperatura, codigo });

describe('franjas de riesgo', () => {
  it('agrupa horas contiguas con ≥30 % o ≥0,5 mm, y separa las que no lo son', () => {
    const horas = [hora(12, 5), hora(13, 35), hora(14, 60, 1.2), hora(15, 40), hora(16, 10), hora(17, 5, 0.6), hora(18, 0)];
    expect(franjasDeRiesgo(horas)).toEqual([
      { desde: 13, hasta: 15, probMax: 60, mm: 1.2 },
      { desde: 17, hasta: 17, probMax: 5, mm: 0.6 },
    ]);
  });

  it('sin horas de riesgo, sin franjas', () => {
    expect(franjasDeRiesgo([hora(8, 5), hora(9, 10, 0.1)])).toEqual([]);
  });
});

describe('texto', () => {
  const dia = (horas: Hora[]) => ({ fecha: '2026-09-13', distrito: 'Lurigancho', horas });

  it('sin riesgo: cielo, temperatura, y apto para asfaltar', () => {
    const t = textoClima(dia([hora(8, 5, 0, 0, 15), hora(14, 8, 0.2, 0, 25)]), 13);
    expect(t).toContain('🌤 *Clima en Lurigancho — domingo 13/09*');
    expect(t).toContain('Cielo despejado · 15 a 25 °C');
    expect(t).toContain('sin riesgo en todo el día');
    expect(t).toContain('✅ Apto para asfaltar.');
  });

  it('con riesgo: la franja con hora de inicio y fin, y si ya pasó', () => {
    const t = textoClima(dia([hora(9, 10), hora(10, 45, 1.5, 61), hora(11, 50, 2.0, 61), hora(12, 10), hora(15, 40, 0.8, 80), hora(16, 5)]), 13);
    expect(t).toContain('• 10:00–12:00: hasta 50 %, 3.5 mm (ya pasó)');
    expect(t).toContain('• 15:00–16:00: hasta 40 %, 0.8 mm');
    expect(t).not.toContain('15:00–16:00: hasta 40 %, 0.8 mm (ya pasó)');
    expect(t).toMatch(/⚠️|⛔/);
  });

  it('sin pronóstico lo dice, sin inventar', () => {
    expect(textoClima(null, 13)).toContain('No pude consultar el pronóstico');
  });
});

describe('distrito', () => {
  it('reconoce el distrito nombrado; sin nombre es la planta', () => {
    expect(distritoDe('cómo está el clima en Ate').name).toBe('Ate');
    expect(distritoDe('va a llover en san juan de lurigancho').name.toLowerCase()).toContain('lurigancho');
    expect(distritoDe('va a llover hoy').name).toBe('la planta');
  });
});
