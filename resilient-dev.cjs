const { spawn } = require('child_process');
const path = require('path');

const RESTART_BASE_DELAY_MS = 3000;
const RESTART_MAX_DELAY_MS = 20000;
const KILL_GRACE_MS = 5000;

const tsxBin = path.resolve(__dirname, 'node_modules/.bin/tsx');
const entry = path.resolve(__dirname, 'src/index.ts');

let child = null;
let restartCount = 0;
let isShuttingDown = false;

const getDelay = () => {
  const factor = Math.min(restartCount, 4);
  const delay = RESTART_BASE_DELAY_MS * Math.pow(2, factor);
  return Math.min(delay, RESTART_MAX_DELAY_MS);
};

const start = () => {
  if (isShuttingDown) return;
  console.log(`[watchdog] starting lila-app dev: ${tsxBin} ${entry}`);

  child = spawn(tsxBin, [entry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'development'
    }
  });

  child.on('exit', (code, signal) => {
    child = null;

    if (isShuttingDown || signal === 'SIGINT' || signal === 'SIGTERM' || signal === 'SIGQUIT') {
      console.log('[watchdog] child exited due to shutdown, exiting.');
      process.exit(0);
      return;
    }

    console.log(
      `[watchdog] dev process exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`
    );

    const delay = getDelay();
    restartCount += 1;
    console.log(`[watchdog] restarting in ${Math.round(delay / 1000)}s...`);
    setTimeout(start, delay);
  });
};

const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[watchdog] received ${signal}, shutting down child...`);

  if (!child) {
    process.exit(0);
    return;
  }

  const killTimer = setTimeout(() => {
    if (child) {
      console.log('[watchdog] child did not exit in time, force killing.');
      child.kill('SIGKILL');
    }
  }, KILL_GRACE_MS);

  child.on('exit', () => {
    clearTimeout(killTimer);
    process.exit(0);
  });

  child.kill(signal);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGQUIT', () => shutdown('SIGQUIT'));

start();
