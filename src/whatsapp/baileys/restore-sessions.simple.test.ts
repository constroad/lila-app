import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

const startSessionMock = jest.fn(async (..._args: unknown[]) => undefined);
const config: any = { whatsapp: { sessionDir: '' } };

jest.unstable_mockModule('./sessions.simple.js', () => ({
  __esModule: true,
  startSession: startSessionMock,
}));

jest.unstable_mockModule('../../config/environment.js', () => ({
  __esModule: true,
  config,
}));

const loadSubject = async () => {
  const mod = await import('./restore-sessions.simple.js');
  return mod.restoreAllSessions;
};

describe('restoreAllSessions', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lila-restore-'));
    config.whatsapp.sessionDir = tmpRoot;
    startSessionMock.mockClear();
    startSessionMock.mockImplementation(async () => undefined);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('does nothing when sessionDir is missing', async () => {
    config.whatsapp.sessionDir = path.join(tmpRoot, 'nope');
    const restoreAllSessions = await loadSubject();
    await restoreAllSessions();
    expect(startSessionMock).not.toHaveBeenCalled();
  });

  it('calls startSession only for phone-shaped directories', async () => {
    fs.mkdirSync(path.join(tmpRoot, '51949376824'));
    fs.mkdirSync(path.join(tmpRoot, '51902049935'));
    fs.mkdirSync(path.join(tmpRoot, 'backups'));
    fs.mkdirSync(path.join(tmpRoot, 'README'));
    fs.writeFileSync(path.join(tmpRoot, '12345678'), 'short-name file, ignored');
    fs.mkdirSync(path.join(tmpRoot, '12345678901234567'));

    const restoreAllSessions = await loadSubject();
    await restoreAllSessions();

    const calls = startSessionMock.mock.calls.map((c) => c[0] as string).sort();
    expect(calls).toEqual(['51902049935', '51949376824']);
  });

  it('continues restoring siblings even if one throws', async () => {
    fs.mkdirSync(path.join(tmpRoot, '51111111111'));
    fs.mkdirSync(path.join(tmpRoot, '52222222222'));

    startSessionMock.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    const restoreAllSessions = await loadSubject();
    await expect(restoreAllSessions()).resolves.toBeUndefined();
    expect(startSessionMock).toHaveBeenCalledTimes(2);
  });
});
