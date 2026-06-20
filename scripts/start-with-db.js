const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { Client } = require('pg');

require('dotenv').config();

if (!process.env.DATABASE_URL && fs.existsSync('.env.example')) {
  require('dotenv').config({ path: '.env.example', override: false });
}

const DEFAULT_LOCAL_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/securex';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runDockerComposeUp = () => {
  const result = spawnSync('docker', ['compose', 'up', '-d', 'postgres'], {
    stdio: 'inherit',
  });

  return result.status === 0;
};

const waitForDatabase = async (connectionString, attempts = 30) => {
  for (let i = 1; i <= attempts; i += 1) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.end();
      return true;
    } catch (_error) {
      await client.end().catch(() => {});
      if (i < attempts) {
        await sleep(1000);
      }
    }
  }

  return false;
};

const startAppProcess = () => {
  const child = spawn('node', ['src/app.js'], {
    stdio: 'inherit',
    env: process.env,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
};

const run = async () => {
  const autoStartDb = process.env.AUTO_START_DB !== 'false';

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_LOCAL_DATABASE_URL;
  }

  if (autoStartDb) {
    console.info('Starting PostgreSQL container (docker compose)...');
    const started = runDockerComposeUp();

    if (!started) {
      console.warn('Could not start PostgreSQL via docker compose. Continuing startup.');
    } else {
      console.info('Waiting for PostgreSQL to accept connections...');
      const ready = await waitForDatabase(process.env.DATABASE_URL);
      if (!ready) {
        console.warn('PostgreSQL did not become ready in time. Continuing startup.');
      } else {
        console.info('PostgreSQL is ready.');
      }
    }
  }

  startAppProcess();
};

run().catch((error) => {
  console.error('Startup failed:', error.message);
  process.exitCode = 1;
});
