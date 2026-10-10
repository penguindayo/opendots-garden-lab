import { mkdir, open, readFile, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { aiCandidate, aiFailureReason, assertFreeRunner } from './lab.mjs';

// CI integration check only: no production job, no model text persisted, no
// generated HTML execution and exactly one local model request.
export async function smokeModel(root, { fetcher = fetch } = {}) {
  let report;
  try {
    await aiCandidate('garden-checklist', [], fetcher);
    report = { valid: true, reason: 'ok' };
  } catch (error) {
    report = { valid: false, reason: aiFailureReason(error) };
  }
  const directory = join(root, 'results');
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Unsafe results directory');
  const file = await open(
    join(directory, 'model-check.json'),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o644,
  );
  try {
    await file.writeFile(JSON.stringify(report));
  } finally {
    await file.close();
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assertFreeRunner(
      JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')),
      process.env,
    );
    const report = await smokeModel(
      fileURLToPath(new URL('../', import.meta.url)),
    );
    console.log(JSON.stringify(report));
    if (!report.valid) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ valid: false, reason: 'schema_invalid' }));
    process.exitCode = 1;
  }
}
