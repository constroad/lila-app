import {
  generateWeatherAsphaltForecast,
  getCombinedRiskLevel,
} from './weather-asphalt-forecast.service';

function buildDailyPayload(prob: number, mm: number) {
  return {
    daily: {
      time: ['2026-06-16', '2026-06-17', '2026-06-18'],
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
    expect(result.message).toContain('NO APTO PARA PRODUCIR');
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
