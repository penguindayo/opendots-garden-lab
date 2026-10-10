import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  assertFreeRunner,
  develop,
  eligibility,
  verifyResults,
} from './lab.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'),
  );
  assertFreeRunner(event, process.env);
  if (process.argv.includes('--check')) {
    const result = await eligibility(root, Date.now());
    if (process.env.GITHUB_OUTPUT)
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `eligible=${result.eligible}\n`,
      );
    console.log(
      JSON.stringify({ eligible: result.eligible, reason: result.reason }),
    );
  } else if (process.argv.includes('--verify')) {
    console.log(JSON.stringify({ verifiedResults: await verifyResults(root) }));
  } else {
    console.log(JSON.stringify(await develop(root)));
  }
} catch {
  console.error(
    'Garden repository workflow failed safely. No generated code was executed.',
  );
  process.exitCode = 1;
}
