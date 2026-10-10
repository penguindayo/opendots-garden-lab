import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertFreeRunner, MODEL } from './lab.mjs';

// Official release bytes pinned to the GitHub release API digest, 2026-10-10.
const URL =
  'https://github.com/ollama/ollama/releases/download/v0.40.2/ollama-linux-amd64.tar.zst';
const SHA256 =
  '726bee78706c281b0eeef00746efe51a044d71c592c3f0b195820707f31fdf04';
const execute = promisify(execFile);
const silent = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: 'ignore',
      killSignal: 'SIGKILL',
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Local model setup failed')),
    );
  });
try {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'),
  );
  assertFreeRunner(event, process.env);
  if (!process.env.RUNNER_TEMP?.startsWith('/'))
    throw new Error('Runner temporary directory missing');
  const directory = join(process.env.RUNNER_TEMP, 'garden-lab-ollama');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const archive = join(directory, 'ollama.tar.zst');
  const environment = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: 'C.UTF-8',
    OLLAMA_HOST: '127.0.0.1:11434',
    OLLAMA_MODELS: join(directory, 'models'),
    OLLAMA_NO_CLOUD: '1',
    OLLAMA_NUM_PARALLEL: '1',
    OLLAMA_MAX_LOADED_MODELS: '1',
  };
  const options = {
    cwd: directory,
    env: environment,
    timeout: 180000,
    maxBuffer: 1024,
  };
  await execute(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--proto',
      '=https',
      '--max-time',
      '180',
      '--output',
      archive,
      URL,
    ],
    options,
  );
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== SHA256)
    throw new Error('Official distribution hash mismatch');
  await execute('tar', ['--zstd', '-xf', archive, '-C', directory], options);
  const binary = join(directory, 'bin', 'ollama');
  const server = spawn(binary, ['serve'], {
    cwd: directory,
    env: environment,
    stdio: 'ignore',
    detached: true,
  });
  server.unref();
  for (let i = 0; i < 30; i++) {
    try {
      if (
        (
          await fetch('http://127.0.0.1:11434/api/version', {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await silent(binary, ['pull', MODEL], {
    cwd: directory,
    env: environment,
    timeout: 240000,
  });
  console.log(
    JSON.stringify({
      localModelReady: true,
      model: MODEL,
      distribution: 'official-0.40.2-pinned',
    }),
  );
} catch {
  console.log(
    JSON.stringify({
      localModelReady: false,
      fallback: 'three-static-variants',
    }),
  );
  process.exitCode = 1;
}
