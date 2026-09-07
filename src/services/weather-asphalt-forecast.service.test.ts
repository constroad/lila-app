import {
  describeRainLine,
  fetchForecastConReintentos,
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

  /**
   * EL REPORTE DECÍA «Prob. lluvia: 0% - (2 mm)» Y SE LEÍA COMO UN BOT ROTO.
   *
   * El dato es REAL y está bien traído (verificado el 30/08/2026 contra
   * Open-Meteo: Barranco, 31/08, `precipitation_probability_max: 0` y
   * `precipitation_sum: 2.0`; el desglose horario son 16 horas seguidas de
   * 0.1–0.2 mm/h). Lo que pasa es que los dos campos responden preguntas
   * DISTINTAS: la probabilidad es «¿habrá un evento de lluvia?» y el acumulado
   * es «¿cuánta agua cae?». En la costa de Lima en invierno se contradicen a
   * diario, porque la garúa moja todo el día sin llegar a ser un evento.
   *
   * Imprimir los dos números pegados presenta como UN hecho lo que son DOS, y
   * quema la confianza en todo el reporte. La línea tiene que nombrar qué manda.
   */
  describe('la línea de lluvia explica QUÉ manda', () => {
    it('0% con acumulado real se nombra como garúa, no como una contradicción', () => {
      const linea = describeRainLine(0, 2);
      expect(linea).toContain('2 mm');
      expect(linea.toLowerCase()).toContain('garúa');
      // Lo que no puede volver a pasar: los dos números pegados sin explicación.
      expect(linea).not.toContain('0% - (2 mm)');
    });

    it('con evento de lluvia de verdad se sigue mostrando la probabilidad', () => {
      const linea = describeRainLine(64, 1.2);
      expect(linea).toContain('64%');
      expect(linea).toContain('1.2 mm');
      expect(linea.toLowerCase()).not.toContain('garúa');
    });

    it('la garúa SIGUE contando como riesgo: moja la carpeta igual', () => {
      // No se trata de silenciar el aviso — 2 mm en el día importan para
      // asfaltar. Se trata de decir por qué está avisando.
      expect(getCombinedRiskLevel(0, 2)).toBe('moderate_risk');
    });

    it('el mensaje del distrito usa la línea explicada', async () => {
      const payload = buildOpenMeteoPayload(0, 0);
      payload[1] = buildDailyPayload(0, 2);
      const fetcher = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(payload),
      });

      const result = await generateWeatherAsphaltForecast({
        run: '6am',
        fetcher: fetcher as any,
        notifyError: jest.fn(),
      });

      expect(result.message).toContain('ANCON');
      expect(result.message).not.toContain('0% - (2 mm)');
      expect(result.message?.toLowerCase()).toContain('garúa');
    });
  });

  /**
   * Un dato AUSENTE no puede convertirse en la peor alerta posible.
   *
   * `getMmBand(undefined)` caía en el último `else` y devolvía `high`, y
   * `getProbBand(undefined)` también: un índice fuera de rango producía un
   * «NO ASFALTAR - RIESGO ALTO» con «undefined%» en el texto. Nunca se vio en
   * producción porque Open-Meteo siempre devolvió el día completo, pero es la
   * clase de fallo que aparece el día que la API cambia.
   */
  it('un día sin dato se OMITE, no se reporta como riesgo alto', async () => {
    const payload = buildOpenMeteoPayload(0, 0);
    const roto = buildDailyPayload(0, 0);
    // Las fechas siguen ahí, pero los arrays de valores llegan cortados.
    roto.daily.precipitation_probability_max = [];
    roto.daily.precipitation_sum = [];
    payload[1] = roto;

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: jest.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(payload),
      }) as any,
      notifyError: jest.fn(),
    });

    expect(result.message).toBeNull();
    expect(result.hasRainRisk).toBe(false);
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

  /**
   * Los horarios extra del cron son una RED DE RECUPERACIÓN, no reportes
   * repetidos. Estos tres casos son el contrato completo.
   */
  describe('entrega única por día (con companyId)', () => {
    const okFetcher = () =>
      jest.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(buildOpenMeteoPayload(60, 2.5)),
      });

    it('el primer horario del día entrega y se queda con el cupo', async () => {
      const claim = jest.fn().mockResolvedValue(true);

      const result = await generateWeatherAsphaltForecast({
        run: '6am',
        fetcher: okFetcher() as any,
        notifyError: jest.fn(),
        companyId: 'inframaq-iax',
        claim,
      });

      expect(result.status).toBe('ok');
      expect(result.message).toContain('REPORTE DE CLIMA');
      expect(claim).toHaveBeenCalledWith(
        expect.stringContaining('weather-forecast:inframaq-iax:'),
        'inframaq-iax'
      );
    });

    it('un horario posterior NO repite el reporte si ya se entregó', async () => {
      // `false` = otro llamado ya se quedó con la clave del día.
      const claim = jest.fn().mockResolvedValue(false);

      const result = await generateWeatherAsphaltForecast({
        run: '6am',
        fetcher: okFetcher() as any,
        notifyError: jest.fn(),
        companyId: 'inframaq-iax',
        claim,
      });

      expect(result.status).toBe('skipped');
      expect(result.message).toBeNull();
    });

    /**
     * EL CASO QUE DA SENTIDO A TODO (incidente 20/08/2026): si Open-Meteo está
     * caída, ese intento NO puede gastar el cupo del día — si lo gastara, el
     * horario de respaldo se encontraría la clave tomada y nunca entregaría
     * nada. Reclamar antes de tener el dato sería exactamente ese bug.
     */
    it('un fallo NO consume el cupo: el horario de respaldo puede entregar', async () => {
      const claim = jest.fn().mockResolvedValue(true);

      const fallo = await generateWeatherAsphaltForecast({
        run: '6am',
        fetcher: jest
          .fn()
          .mockResolvedValue({ ok: false, status: 503, text: async () => '' }) as any,
        notifyError: jest.fn().mockResolvedValue(true),
        companyId: 'inframaq-iax',
        claim,
      });

      expect(fallo.status).toBe('degraded');
      expect(claim).not.toHaveBeenCalled();

      // Más tarde, con Open-Meteo ya recuperada, el reporte sale igual.
      const recuperado = await generateWeatherAsphaltForecast({
        run: '6am',
        fetcher: okFetcher() as any,
        notifyError: jest.fn(),
        companyId: 'inframaq-iax',
        claim,
      });

      expect(recuperado.status).toBe('ok');
      expect(recuperado.message).toContain('REPORTE DE CLIMA');
    });
  });
});

/**
 * PRESUPUESTOS ANIDADOS (07/09/2026).
 *
 * El proxy de Portal cortaba a los 8 s; este servicio se daba 25 s POR INTENTO
 * × 3 intentos (~79 s en el peor caso). El tramo del medio era el más corto, así
 * que abortaba trabajo que acá abajo terminaba bien: 8 corridas caídas entre el
 * 19/08 y el 07/09, cada una con su alerta de Telegram por un reporte que sí se
 * había calculado.
 */
describe('el trabajo cabe en el presupuesto de quien llama', () => {
  const payloadOk = () =>
    JSON.stringify(
      Array.from({ length: 41 }, () => ({
        daily: {
          time: dailyDates(),
          temperature_2m_mean: [18, 18, 18],
          precipitation_probability_max: [0, 0, 0],
          precipitation_sum: [0, 0, 0],
        },
      })),
    );

  it('el tope total es MENOR que el del proxy que nos llama (25 s)', () => {
    expect(WEATHER_ASPHALT_FORECAST.totalBudgetMs).toBeLessThan(25_000);
    // Y el peor caso completo tiene que caber en ese tope, no excederlo 3×.
    expect(WEATHER_ASPHALT_FORECAST.totalBudgetMs).toBeLessThanOrEqual(
      WEATHER_ASPHALT_FORECAST.fetchTimeoutMs,
    );
  });

  it('cada intento se recorta a lo que queda del presupuesto', async () => {
    const señales: number[] = [];
    let ahora = 0;
    const reloj = () => ahora;
    const fetcher = jest.fn(async (_url: string, init: any) => {
      señales.push(init.signal.constructor === AbortSignal ? 1 : 0);
      ahora += 9_000; // cada intento consume 9 s del presupuesto
      return { ok: false, status: 503, text: async () => '' };
    });

    await expect(
      fetchForecastConReintentos('https://x', fetcher as any, reloj),
    ).rejects.toThrow(/503/);

    // 20 s de tope: entran dos intentos (9 s + 1.5 s de espera + 9 s = 19.5 s);
    // el tercero ya no cabe y no se lanza. Antes salían los 3, sin mirar el reloj.
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('con la API rápida sigue reintentando las 3 veces', async () => {
    let ahora = 0;
    const fetcher = jest.fn(async () => {
      ahora += 100;
      return { ok: false, status: 503, text: async () => '' };
    });

    await expect(
      fetchForecastConReintentos('https://x', fetcher as any, () => ahora),
    ).rejects.toThrow(/503/);

    expect(fetcher).toHaveBeenCalledTimes(WEATHER_ASPHALT_FORECAST.maxAttempts);
  });

  /**
   * EL CUPO DEL DÍA NO SE GASTA A CAMBIO DE NADA.
   *
   * Pasó de verdad el 07/09: Portal abortó a los 8 s, lila terminó igual a los
   * 10.2 s, se quedó con el cupo y escribió el mensaje en un socket cerrado. El
   * reintento encontró el cupo tomado y respondió "sin mensajes que enviar", con
   * el cronjob registrado como exitoso. Un día con lluvia, ese aviso no llegaba.
   */
  it('si el que preguntó ya cortó, NO se consume el cupo del día', async () => {
    const claim = jest.fn().mockResolvedValue(true);

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: jest.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(buildOpenMeteoPayload(60, 2.5)),
      }) as any,
      notifyError: jest.fn(),
      companyId: 'inframaq-iax',
      claim,
      callerGone: () => true,
    });

    expect(result.message).toContain('REPORTE DE CLIMA');
    expect(claim).not.toHaveBeenCalled(); // el horario de respaldo podrá entregarlo
  });

  it('sin nada que avisar tampoco se consume el cupo', async () => {
    const claim = jest.fn().mockResolvedValue(true);

    const result = await generateWeatherAsphaltForecast({
      run: '6am',
      fetcher: jest.fn().mockResolvedValue({ ok: true, text: payloadOk }) as any,
      notifyError: jest.fn(),
      companyId: 'inframaq-iax',
      claim,
    });

    expect(result.status).toBe('ok');
    expect(result.message).toBeNull();
    // Sin mensaje no hay nada que repetir: tomar el cupo solo impediría que la
    // corrida de las 10:00 avise de un riesgo que apareció después.
    expect(claim).not.toHaveBeenCalled();
  });
});
