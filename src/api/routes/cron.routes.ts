import { Router } from 'express';
import { generateWeatherAsphaltForecast } from '../../services/weather-asphalt-forecast.service.js';

const router = Router();

router.get('/weather-asphalt-forecast', async (req, res, next) => {
  try {
    const result = await generateWeatherAsphaltForecast({
      run: typeof req.query.run === 'string' ? req.query.run : undefined,
    });
    res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
