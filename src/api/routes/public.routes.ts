import { Router } from 'express';
import { getCompanyLogin } from '../controllers/public.controller.js';

const router = Router();

router.get('/company-login', getCompanyLogin);

export default router;
