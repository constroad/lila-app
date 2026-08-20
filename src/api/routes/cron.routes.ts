import { Router } from 'express';
import { generateWeatherAsphaltForecast } from '../../services/weather-asphalt-forecast.service.js';

const router = Router();

router.get('/weather-asphalt-forecast', async (req, res, next) => {
  try {
    const result = await generateWeatherAsphaltForecast({
      run: typeof req.query.run === 'string' ? req.query.run : undefined,
    });

    // UN CRON QUE PIERDE SU REPORTE NO ES UN ÉXITO (20/08/2026).
    //
    // El servicio atrapa el fallo de Open-Meteo, avisa por Telegram y devuelve
    // `status: 'degraded'` — pero esto respondía 200 igual, así que el
    // JobExecutor lo anotaba como `success`, con `failureCount: 0` y sin
    // `lastError`. Resultado: llegó la alerta a Telegram diciendo que falló, y
    // al mismo tiempo el cronjob en la base decía que había salido bien. El
    // panel mostraba salud donde no la había, y el reintento del executor
    // nunca se disparaba (solo reintenta ante no-2xx).
    //
    // 502 y no 500: el fallo es de un tercero (Open-Meteo), no nuestro. El
    // executor lo registra, reintenta una vez, y la alerta de Telegram no se
    // duplica porque ya viene deduplicada por 5 min con la misma clave.
    if (result.status === 'degraded') {
      res.status(502).json({ ok: false, ...result });
      return;
    }

    res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
