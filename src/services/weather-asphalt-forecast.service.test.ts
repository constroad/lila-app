import {
  generateWeatherAsphaltForecast,
  getCombinedRiskLevel,
  isRetriableWeatherStatus,
  WEATHER_ASPHALT_FORECAST,
} from './weather-asphalt-forecast.service';

/**
 * Genera 3 fechas consecutivas empezando desde "hoy en Lima" — MISMO anclaje
 * que usa el servicio (`resolveReportDate`, `timeZone: 'America/Lima'`).
 *
 * Bug real (CI, 20/08/2026): la versión anterior usaba `now.getFullYear()` /
 * `getMonth()` / `getDate()` — hora LOCAL de la máquina que corre el test — y
 * las reinterpretaba como UTC. En un dev Mac en horario de Lima da lo mismo
 * por coincidencia; en el runner de GitHub (UTC) NO: de 00:00 a 05:00 UTC el
 * día en Lima todavía es el anterior, así que el test fabricaba un payload
 * fechado "mañana" respecto de lo que el servicio consideraba "hoy" — el
 * lookup por fecha no encontraba nada y `hasRainRisk` daba `false` siempre.
 * Flakeaba ~5 de 24 horas, sin relación con el código que se estuviera
 * probando ese día.
 */
function dailyDates(): string[] {
  const now = new Date();
  const todayLima = now.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const [year, month, day] = todayLima.split('-').map(Number);
  return [0, 1, 2].map((offset) => {
    const d = new Date(Date.UTC(year, month - 1, day + offset, 12));
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

  /**
   * Incidente real (20/08/2026, 08:00): un 503 puntual de Open-Meteo -API
   * pública y gratuita, un 503 es esperable- se llevó puesto el reporte del día
   * entero y despertó a todos con una alerta. Con un solo intento, cada blip
   * momentáneo cuesta un día sin reporte.
   */
  it('reintenta un 503 transitorio y entrega el reporte igual', async () => {
    const notifyError = jest.fn();
    const fetcher = jest
      .fn()
      // Primer intento: el 503 que disparó la alerta de producción.
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
      // Segundo: Open-Meteo ya se recuperó.
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(buildOpenMeteoPayload(60, 2.5)),
      });

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: fetcher as any,
      notifyError,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ok');
    expect(result.hasRainRisk).toBe(true);
    // Lo importante: NO se alerta por un fallo del que se pudo recuperar solo.
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('reintenta un error de red y entrega el reporte igual', async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(buildOpenMeteoPayload(60, 2.5)),
      });

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: fetcher as any,
      notifyError: jest.fn(),
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ok');
  });

  it('degrada tras agotar los reintentos si Open-Meteo sigue caída', async () => {
    const notifyError = jest.fn().mockResolvedValue(true);
    const fetcher = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => '' });

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: fetcher as any,
      notifyError,
    });

    expect(fetcher).toHaveBeenCalledTimes(WEATHER_ASPHALT_FORECAST.maxAttempts);
    expect(result.status).toBe('degraded');
    expect(result.error).toContain('503');
    // Una caída sostenida SÍ se avisa: es lo que el reintento no puede resolver.
    expect(notifyError).toHaveBeenCalled();
  });

  /**
   * Un 4xx (salvo 429) es culpa NUESTRA — URL mal armada, parámetro inválido.
   * Reintentar tres veces lo mismo solo demora el diagnóstico.
   */
  it('NO reintenta un 400: el error es nuestro, no de Open-Meteo', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => '' });

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: fetcher as any,
      notifyError: jest.fn().mockResolvedValue(true),
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('degraded');
    expect(result.error).toContain('400');
  });

  it('un 429 sí se reintenta (rate limit es transitorio)', () => {
    expect(isRetriableWeatherStatus(429)).toBe(true);
    expect(isRetriableWeatherStatus(503)).toBe(true);
    expect(isRetriableWeatherStatus(500)).toBe(true);
    expect(isRetriableWeatherStatus(400)).toBe(false);
    expect(isRetriableWeatherStatus(404)).toBe(false);
  });
});
