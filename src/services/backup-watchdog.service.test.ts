import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const sendTelegramAlert = jest.fn(async (_p: { dedupeKey?: string; message: string }) => true);
jest.unstable_mockModule('./telegram-alert.service.js', () => ({
  __esModule: true,
  sendTelegramAlert,
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Subject = typeof import('./backup-watchdog.service.js');
let subject: Subject;
let dir: string;

const escribirHeartbeat = async (archivo: string, horasAtras: number) => {
  const epoch = Math.floor((Date.now() - horasAtras * 3_600_000) / 1000);
  await fs.writeFile(path.join(dir, archivo), String(epoch), 'utf8');
};

/**
 * Deja los tres vigilados al día. Cada test sobrescribe SOLO el que ejercita,
 * para que un vencido no contamine las aserciones de otro (si no, agregar un
 * vigilado nuevo rompe todos los tests anteriores).
 */
const todosAlDia = async () => {
  await escribirHeartbeat('last-media-backup', 3);
  await escribirHeartbeat('last-db-backup', 0.5);
  await escribirHeartbeat('last-verify', 24);
  await escribirHeartbeat('last-offsite', 3);
  process.env.B2_ACCOUNT_ID = 'test-key-id'; // offsite configurado
};

beforeEach(async () => {
  jest.resetModules();
  sendTelegramAlert.mockClear();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bkwd-'));
  process.env.BACKUP_HEARTBEAT_DIR = dir;
  subject = await import('./backup-watchdog.service.js');
});

afterEach(async () => {
  delete process.env.B2_ACCOUNT_ID;
  subject.stopBackupWatchdog();
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.BACKUP_HEARTBEAT_DIR;
});

describe('dead man\'s switch de backups', () => {
  it('no alerta cuando ambos backups están al día', async () => {
    await todosAlDia();

    const r = await subject.checkBackupHeartbeats();

    expect(r.every((x) => !x.vencido)).toBe(true);
    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });

  // El caso que motivó todo esto: se migró de máquina y nadie corrió el
  // instalador, así que el agendado no existe y NUNCA hubo un backup.
  it('alerta cuando NUNCA hubo backup (heartbeat ausente)', async () => {
    const r = await subject.checkBackupHeartbeats();

    // Los CONFIGURADOS están todos vencidos; offsite se omite por no estarlo.
    expect(r.filter((x) => !x.omitido).every((x) => x.vencido)).toBe(true);
    expect(r.find((x) => x.nombre === 'réplica offsite')?.omitido).toBe(true);
    expect(sendTelegramAlert).toHaveBeenCalledTimes(3);
    const msg = sendTelegramAlert.mock.calls.map(([p]) => p.message).join('\n');
    expect(msg).toContain('NUNCA se registró un backup exitoso');
    expect(msg).toContain('install-backup-agent.sh');
  });

  it('alerta si los medios pasan de 25h (24h + 1h de gracia)', async () => {
    await todosAlDia();
    await escribirHeartbeat('last-media-backup', 26);

    const r = await subject.checkBackupHeartbeats();

    expect(r.find((x) => x.nombre === 'medios')?.vencido).toBe(true);
    expect(r.find((x) => x.nombre === 'base de datos')?.vencido).toBe(false);
    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
  });

  // La gracia existe para que el jitter normal no genere ruido: una alerta que
  // salta sin motivo se termina ignorando, y entonces no sirve para nada.
  it('NO alerta a las 24.5h de los medios: es jitter, no una falla', async () => {
    await todosAlDia();
    await escribirHeartbeat('last-media-backup', 24.5);

    await subject.checkBackupHeartbeats();

    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });

  it('la base tolera menos: alerta a las 3h (RPO horario)', async () => {
    await todosAlDia();
    await escribirHeartbeat('last-db-backup', 3);

    const r = await subject.checkBackupHeartbeats();

    expect(r.find((x) => x.nombre === 'base de datos')?.vencido).toBe(true);
    expect(r.find((x) => x.nombre === 'medios')?.vencido).toBe(false);
    expect(sendTelegramAlert.mock.calls[0][0].message).toContain('BASE DE DATOS');
  });

  it('usa dedupeKey por vigilado para no inundar mientras siga vencido', async () => {
    await subject.checkBackupHeartbeats();

    const keys = sendTelegramAlert.mock.calls.map(([p]) => p.dedupeKey);
    expect(keys).toContain('backup-stale-medios');
    expect(keys).toContain('backup-stale-base de datos');
  });

  it('un heartbeat corrupto se trata como ausente, no revienta', async () => {
    await todosAlDia();
    await fs.writeFile(path.join(dir, 'last-media-backup'), 'basura', 'utf8');

    const r = await subject.checkBackupHeartbeats();

    expect(r.find((x) => x.nombre === 'medios')?.horas).toBeNull();
    expect(r.find((x) => x.nombre === 'medios')?.vencido).toBe(true);
  });
});

describe('vigilancia de la réplica offsite', () => {
  // FALSA ALARMA REAL (2026-08-09): el watchdog gritó "DETENIDO" por la réplica
  // offsite, que estaba deliberadamente SIN instalar por faltar credenciales de
  // B2. Además contradecía al reporte diario, que sí decía "sin configurar".
  it('NO alerta si la réplica no está configurada (sin credenciales B2)', async () => {
    await todosAlDia();
    delete process.env.B2_ACCOUNT_ID; // no configurada
    await fs.rm(path.join(dir, 'last-offsite'), { force: true });

    const r = await subject.checkBackupHeartbeats();

    const off = r.find((x) => x.nombre === 'réplica offsite');
    expect(off?.omitido).toBe(true);
    expect(off?.vencido).toBe(false);
    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });

  // Si la réplica se detiene, las copias locales siguen pero se vuelve a estar
  // expuesto a incendio/robo/ransomware sin enterarse.
  it('alerta si la réplica offsite lleva más de 25h detenida', async () => {
    await todosAlDia();
    await escribirHeartbeat('last-offsite', 30);

    const r = await subject.checkBackupHeartbeats();

    expect(r.find((x) => x.nombre === 'réplica offsite')?.vencido).toBe(true);
    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
  });
});

describe('vigilancia de la verificación semanal', () => {
  it('alerta si la verificación no corre hace más de 8 días', async () => {
    await todosAlDia();
    await escribirHeartbeat('last-verify', 9 * 24);

    const r = await subject.checkBackupHeartbeats();

    expect(r.find((x) => x.nombre === 'verificación')?.vencido).toBe(true);
    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
  });

  it('no alerta a los 7.5 días: es jitter del agendado semanal', async () => {
    await todosAlDia();
    await escribirHeartbeat('last-verify', 7.5 * 24);

    await subject.checkBackupHeartbeats();

    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });
});
