import {
  generateWeatherAsphaltForecast,
  getCombinedRiskLevel,
} from './weather-asphalt-forecast.service';

/** Genera 3 fechas consecutivas empezando desde hoy en formato yyyy-mm-dd. */
function dailyDates(): string[] {
  const now = new Date();
  return [0, 1, 2].map((offset) => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12));
    return d.toISOString().slice(0, 10);
  });
}

function buildDailyPayload(prob: number, mm: number) {
  return {
    daily: {
      time: dailyDates(),
      temperature_2m_mean: [18, 18, 18],
      precipitation_probability_max: [prob, prob, prob],
      precipitation_sum: [mm, mm, mm],
    },
  };
}

function buildOpenMeteoPayload(firstProb: number, firstMm: number) {
  return Array.from({ length: 41 }, (_value, index) =>
    index === 0 ? buildDailyPayload(firstProb, firstMm) : buildDailyPayload(0, 0),
  );
}

describe('weather-asphalt-forecast service', () => {
  it('calcula el nivel combinado de riesgo', () => {
    expect(getCombinedRiskLevel(45, 0.2)).toBe('ok');
    expect(getCombinedRiskLevel(25, 0.8)).toBe('moderate_risk');
    expect(getCombinedRiskLevel(45, 1.2)).toBe('high_risk');
  });

  it('devuelve mensaje cuando hay riesgo de lluvia', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(buildOpenMeteoPayload(60, 2.5)),
    });

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: fetcher as any,
      notifyError: jest.fn(),
    });

    expect(result.status).toBe('ok');
    expect(result.hasRainRisk).toBe(true);
    expect(result.message).toContain('REPORTE DE CLIMA');
    expect(result.message).toContain(
      'Constroad (Planta de asfalto - Distrito de Lurigancho-Chosica)'
    );
    expect(result.message).toContain('NO APTO PARA PRODUCIR EN PLANTA');
    expect(result.message).toContain('Distritos no aptos para asfaltar');
    expect(result.message).toContain('Ninguno detectado');
  });

  it('identifica por nombre los distritos donde no se debe asfaltar', async () => {
    const payload = buildOpenMeteoPayload(60, 2.5);
    payload[1] = buildDailyPayload(70, 3);
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(payload),
    });

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: fetcher as any,
      notifyError: jest.fn(),
    });

    expect(result.message).toContain('NO ASFALTAR - RIESGO ALTO');
    expect(result.message).toContain('ANCON');
    expect(result.message).not.toContain('Ninguno detectado');
  });

  it('degrada sin mensaje WhatsApp y alerta Telegram si Open-Meteo falla', async () => {
    const notifyError = jest.fn().mockResolvedValue(true);
    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: jest.fn().mockRejectedValue(new Error('network timeout')) as any,
      notifyError,
    });

    expect(result.status).toBe('degraded');
    expect(result.message).toBeNull();
    expect(result.mensaje).toBeNull();
    expect(result.telegramAlert).toBe(true);
    expect(notifyError).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'weather-asphalt-forecast',
      }),
    );
  });
});
