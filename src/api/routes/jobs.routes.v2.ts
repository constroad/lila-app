import { Router } from 'express';
import { jobsLimiter } from '../middlewares/rateLimiter.js';
import { JobsControllerV2 } from '../controllers/jobs.controller.v2.js';
import jobSchedulerV2 from '../../jobs/scheduler.v2.instance.js';
import { validateCompany } from '../middlewares/validateCompany.middleware.js';
import { validateSender } from '../middlewares/validateSender.middleware.js';
import { requireTenantOrApiKey } from '../../middleware/tenant.middleware.js';

const router = Router();
const controller = new JobsControllerV2(jobSchedulerV2);

// AUTH EN TODAS LAS RUTAS (2026-08-09). Antes NINGUNA la tenía y lila está
// expuesta a internet por el Funnel sin WAF: verificado en vivo, un `curl` sin
// credenciales a https://<funnel>/api/jobs devolvía la lista COMPLETA de
// cronjobs de todas las empresas — companyId, URLs internas y horarios.
//
// Y lo escribible era peor que la fuga:
//   - DELETE /:id       → borrar cualquier cronjob de cualquier empresa.
//   - POST /:id/run     → disparar jobs a demanda. Los de `type: 'message'`
//                         MANDAN WhatsApp a grupos: spam masivo desde tus
//                         números y riesgo de ban de las cuentas.
//   - PATCH/PUT /:id    → alterar qué hace cada job.
//
// `validateCompany`/`validateSender` NO son autenticación: resuelven el
// companyId leyéndolo del BODY/QUERY del cliente, que es justo lo que la
// invariante de frontera de confianza prohíbe. Se conservan por su validación
// de negocio, pero el guard de identidad va PRIMERO.
//
// El `x-cron-secret` no era exfiltrable —`isPortalCronUrl` valida el host contra
// PORTAL_BASE_URL— pero eso era la única barrera, y dependía de que esa env
// estuviera puesta.
router.use(requireTenantOrApiKey);

router.post('/', jobsLimiter, validateCompany, validateSender, controller.createJob);
router.get('/', controller.listJobs);
router.get('/:id', controller.getJob);
router.patch('/:id', validateCompany, validateSender, controller.updateJob);
router.put('/:id', validateCompany, validateSender, controller.updateJob);
router.delete('/:id', controller.deleteJob);
router.post('/:id/run', controller.runJobNow);

export default router;
