import { Router } from 'express';
import {
  deleteOrderExport,
  getOrderExportFile,
  requestOrderExport,
} from '../../services/order-export.service.js';
import { heavyRateLimiter, heavyRequestGuard } from '../middlewares/heavyLoad.js';

/**
 * Exports de pedidos para el "Panel de exportación" del reporte público.
 * Contrato heredado del Portal (ScOrderExportPanel): público por orderId —
 * la descarga es una navegación del browser (sin headers), así que NO se puede
 * exigir `requireTenant`. En su lugar: `heavyRateLimiter` (por IP; el tráfico de
 * cliente sale de IPs distintas, no auto-estrangula) + `heavyRequestGuard` en el
 * armado del ZIP, más el lock `busy` por orden que ya existe en el service.
 */
const router = Router();

router.post('/orders/:orderId/request', heavyRateLimiter, heavyRequestGuard, async (req, res, next) => {
  try {
    const result = await requestOrderExport(req.params.orderId);
    if (result.ok) {
      res.status(201).json({ success: true });
      return;
    }
    const statusByCode = { not_found: 404, busy: 409, empty: 422 } as const;
    res.status(statusByCode[result.code]).json({ success: false, code: result.code });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:orderId/download', heavyRateLimiter, async (req, res, next) => {
  try {
    const result = await getOrderExportFile(req.params.orderId);
    if (!result.ok) {
      res.status(result.code === 'not_found' ? 404 : 409).json({
        success: false,
        code: result.code,
      });
      return;
    }
    res.download(result.absolutePath, result.fileName, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/orders/:orderId', heavyRateLimiter, async (req, res, next) => {
  try {
    const result = await deleteOrderExport(req.params.orderId);
    res.status(result.ok ? 200 : 404).json({ success: result.ok });
  } catch (error) {
    next(error);
  }
});

export default router;
