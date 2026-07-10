import jwt from 'jsonwebtoken';
import {
  buildDriverLink,
  computeArrivalReminderDelayMs,
  computeLocationShareDelayMs,
  signDriverToken,
} from './driver-link.js';
import { config } from '../config/environment.js';

describe('signDriverToken / buildDriverLink', () => {
  it('firma el payload compatible con Portal (dispatchId+companyId+scope)', () => {
    const token = signDriverToken('disp-1', 'constroad');

    const decoded = jwt.verify(token, config.security.jwtSecret) as Record<string, unknown>;
    expect(decoded.dispatchId).toBe('disp-1');
    expect(decoded.companyId).toBe('constroad');
    expect(decoded.scope).toBe('driver-location');
    expect(typeof decoded.exp).toBe('number');
  });

  it('arma el link sobre el baseUrl de Portal sin doble slash', () => {
    const link = buildDriverLink('disp-1', 'constroad');

    expect(link).toMatch(/^https?:\/\/.+\/public\/driver\/[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(link).not.toContain('//public');
  });
});

describe('computeArrivalReminderDelayMs', () => {
  it('ETA + 10% de margen', () => {
    // 60 min de ruta → 66 min de delay.
    expect(computeArrivalReminderDelayMs(3600)).toBe(66 * 60 * 1000);
  });

  it('clamp inferior 15 min (rutas cortas)', () => {
    expect(computeArrivalReminderDelayMs(300)).toBe(15 * 60 * 1000);
  });

  it('clamp superior 6 h (ETA absurdo)', () => {
    expect(computeArrivalReminderDelayMs(10 * 60 * 60)).toBe(6 * 60 * 60 * 1000);
  });

  it('sin ETA usable → fallback 90 min', () => {
    expect(computeArrivalReminderDelayMs(null)).toBe(90 * 60 * 1000);
    expect(computeArrivalReminderDelayMs(0)).toBe(90 * 60 * 1000);
    expect(computeArrivalReminderDelayMs(Number.NaN)).toBe(90 * 60 * 1000);
  });
});

describe('computeLocationShareDelayMs', () => {
  it('1/4 del ETA (unidad ya en ruta)', () => {
    // 60 min de ruta → 15 min (justo en el clamp inferior).
    expect(computeLocationShareDelayMs(3600)).toBe(15 * 60 * 1000);
    // 80 min → 20 min (1/4 real, dentro del rango).
    expect(computeLocationShareDelayMs(4800)).toBe(20 * 60 * 1000);
  });

  it('clamp inferior 3 min (rutas muy cortas)', () => {
    expect(computeLocationShareDelayMs(60)).toBe(3 * 60 * 1000);
  });

  it('clamp superior 30 min (rutas muy largas)', () => {
    expect(computeLocationShareDelayMs(4 * 60 * 60)).toBe(30 * 60 * 1000);
  });

  it('sin ETA usable → fallback 10 min', () => {
    expect(computeLocationShareDelayMs(null)).toBe(10 * 60 * 1000);
    expect(computeLocationShareDelayMs(0)).toBe(10 * 60 * 1000);
    expect(computeLocationShareDelayMs(Number.NaN)).toBe(10 * 60 * 1000);
  });
});
