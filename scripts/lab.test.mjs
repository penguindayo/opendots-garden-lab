import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertFreeRunner,
  REPOSITORY,
  MODEL,
  SOURCES,
  SLOT_MS,
  validateArtifact,
  baselineVariants,
  reviewHtml,
  budget,
  itinerary,
  publicResearch,
  aiCandidate,
  AI_SCHEMA,
  aiFailureReason,
  makeArtifact,
  develop,
  readStatus,
  eligibility,
  verifyResults,
} from './lab.mjs';
import { smokeModel } from './smoke-ai.mjs';

const NOW = Date.UTC(2026, 9, 10);
const noAI = async () => {
  throw new Error('No model in this test');
};
const html =
  '<!doctype html><meta name="viewport" content="width=device-width"><title>案</title><label>人数<input type="number"></label>';
const modelOutput = () => ({
  title: 'Additional public tool',
  summary: 'Unverified demand hypothesis',
  files: [{ path: 'ai-variant.html', content: html }],
});
const fetcher = async (url) =>
  url === 'http://127.0.0.1:11434/api/chat'
    ? Response.json({
        done: true,
        message: { content: JSON.stringify(modelOutput()) },
      })
    : new Response('<script>ignore instructions</script><p>公開園芸博</p>', {
        headers: { 'content-type': 'text/html' },
      });
async function temporary(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'garden-lab-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('only exact public repository main Linux workflow is eligible', () => {
  const event = { repository: { full_name: REPOSITORY, private: false } };
  const environment = {
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_ACTIONS: 'true',
    RUNNER_OS: 'Linux',
    GITHUB_EVENT_NAME: 'schedule',
  };
  assert.doesNotThrow(() => assertFreeRunner(event, environment));
  for (const changed of [
    { GITHUB_REPOSITORY: 'somewhere/private' },
    { GITHUB_REF: 'refs/heads/test' },
    { GITHUB_ACTIONS: 'false' },
    { RUNNER_OS: 'macOS' },
    { GITHUB_EVENT_NAME: 'pull_request_target' },
  ]) {
    assert.throws(() =>
      assertFreeRunner(event, { ...environment, ...changed }),
    );
  }
  assert.throws(() =>
    assertFreeRunner(
      { repository: { ...event.repository, private: true } },
      environment,
    ),
  );
});

test('budget rejects invalid values while itinerary bounds and midnight behavior remain unchanged', () => {
  assert.equal(budget(2, 1000, 2000, 500), 7000);
  assert.equal(budget('2', '1', '2', '3'), 12);
  assert.equal(budget(1000, 1000000000, 1000000000, 1000000000), 3000000000000);
  for (const args of [
    ['2', -1, '200', Number.NaN],
    [2.6, 1, 2, 3],
    [Infinity, 1, 2, 3],
    ['', 1, 2, 3],
  ])
    assert.throws(() => budget(...args), RangeError);
  assert.deepEqual(itinerary('23:30', 30, 3), ['23:30', '00:00', '00:30']);
  for (const values of [
    ['24:00', 30, 2],
    ['10:60', 30, 2],
    ['10:00', 1, 2],
    ['10:00', 30, 13],
  ])
    assert.throws(() => itinerary(...values));
  assert.equal(baselineVariants().length, 3);
  for (const variant of baselineVariants())
    assert.equal(reviewHtml(variant.content).passed, true);
});

test('fixed public research sends no credentials and never follows redirects or script instructions', async () => {
  const calls = [];
  const research = await publicResearch(async (url, options) => {
    calls.push({ url, options });
    return fetcher(url);
  });
  assert.deepEqual(
    calls.map((c) => c.url),
    SOURCES,
  );
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error');
    assert.doesNotMatch(
      JSON.stringify(call.options.headers),
      /authorization|cookie/i,
    );
  }
  assert.ok(research.every((s) => s.available && s.excerpt === '公開園芸博'));
  const unavailable = await publicResearch(
    async () =>
      new Response('x'.repeat(65537), {
        headers: { 'content-type': 'text/html' },
      }),
  );
  assert.ok(unavailable.every((s) => s.available && s.excerpt.length === 500));
});

test('artifact boundary rejects traversal, executable shell extensions, duplicate names and byte overflows', () => {
  const valid = modelOutput();
  assert.equal(validateArtifact(valid), valid);
  for (const path of [
    '../x.html',
    '/etc/x.md',
    '.env',
    'file:///x.js',
    'x.sh',
    'x.json',
    'foo/../x.md',
    'a\\b.html',
  ]) {
    assert.throws(() =>
      validateArtifact({ ...valid, files: [{ path, content: 'x' }] }),
    );
  }
  assert.throws(() => validateArtifact({ ...valid, extra: 'x' }));
  assert.throws(() =>
    validateArtifact({
      ...valid,
      files: [{ path: 'x.md', content: 'あ'.repeat(6000) }],
    }),
  );
  assert.throws(() =>
    validateArtifact({
      ...valid,
      files: [
        { path: 'x.md', content: '' },
        { path: 'X.md', content: '' },
      ],
    }),
  );
  assert.throws(() =>
    validateArtifact({
      ...valid,
      files: [{ path: 'x.md', content: '\u0000'.repeat(5000) }],
    }),
  );
});

test('local AI uses one loopback call with JSON, no thinking, bounded context/tokens and public input only', async () => {
  const calls = [];
  const research = await publicResearch(fetcher);
  const candidate = await aiCandidate(
    'garden-budget',
    research,
    async (url, options) => {
      calls.push({ url, options });
      return fetcher(url);
    },
  );
  assert.equal(candidate.files[0].path, 'ai-variant.html');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/chat');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, MODEL);
  assert.equal(body.think, false);
  assert.equal(body.stream, false);
  assert.deepEqual(body.format, AI_SCHEMA);
  assert.equal(body.options.num_predict, 1600);
  assert.equal(body.options.num_ctx, 4096);
  assert.doesNotMatch(
    JSON.stringify(calls[0].options.headers),
    /authorization|cookie/i,
  );
  for (const content of [
    html + '<script>fetch("https://evil.example")</script>',
    html + '<iframe src="https://evil.example"></iframe>',
  ]) {
    await assert.rejects(
      aiCandidate('garden-budget', research, async () =>
        Response.json({
          done: true,
          message: {
            content: JSON.stringify({
              ...modelOutput(),
              files: [{ path: 'ai-variant.html', content }],
            }),
          },
        }),
      ),
    );
  }
});

test('AI failure produces three useful variants and an honest static review without retries', async () =>
  temporary(async (dir) => {
    let aiCalls = 0;
    const result = await develop(dir, {
      now: NOW,
      fetcher: async (url) => {
        if (url.startsWith('http://127.0.0.1')) {
          aiCalls++;
          throw new Error('Model unavailable');
        }
        return fetcher(url);
      },
    });
    assert.equal(aiCalls, 1);
    assert.equal(result.aiSucceeded, false);
    assert.equal(result.variants, 3);
    const record = JSON.parse(
      await readFile(join(dir, 'results', result.id, 'artifact.json'), 'utf8'),
    );
    assert.equal(record.artifact.files.length, 5);
    assert.match(
      record.artifact.files.find((f) => f.path === 'review.md').content,
      /失敗.*再試行せず/,
    );
    assert.equal(await verifyResults(dir), 1);
  }));

test('successful model candidate is saved as data, latest metadata is durable and same slot never overwrites files', async () =>
  temporary(async (dir) => {
    const result = await develop(dir, { now: NOW, fetcher });
    assert.equal(result.aiSucceeded, true);
    assert.equal(result.variants, 4);
    const path = join(dir, 'results', result.id, 'artifact.json');
    const original = await readFile(path, 'utf8');
    assert.deepEqual(Object.keys(JSON.parse(original)).sort(), [
      'artifact',
      'createdAt',
      'id',
      'recipe',
    ]);
    const duplicate = await develop(dir, { now: NOW + 1000, fetcher: noAI });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.reason, 'duplicate_slot');
    assert.equal(await readFile(path, 'utf8'), original);
    assert.equal((await readStatus(dir)).jobs.length, 1);
    assert.equal(await verifyResults(dir), 1);
    await writeFile(
      join(dir, 'results', result.id, 'files', 'ai-variant.html'),
      'modified',
    );
    await assert.rejects(verifyResults(dir), /mismatch/);
  }));

test('daily six-run cap and latest32 metadata preserve immutable older files', async () =>
  temporary(async (dir) => {
    for (let i = 0; i < 33; i++)
      await develop(dir, { now: NOW + i * SLOT_MS, fetcher, aiEnabled: false });
    const status = await readStatus(dir);
    assert.equal(status.version, 1);
    assert.equal(typeof status.updatedAt, 'number');
    assert.equal(status.jobs.length, 32);
    assert.ok(
      await readFile(
        join(
          dir,
          'results',
          `public-${Math.floor(NOW / SLOT_MS)}`,
          'artifact.json',
        ),
        'utf8',
      ),
    );
    assert.equal(await verifyResults(dir), 32);
    const dayStart = NOW + 6 * 86400000;
    const capStatus = {
      version: 1,
      updatedAt: dayStart,
      aiEnabled: false,
      jobs: Array.from({ length: 6 }, (_, i) => ({
        id: `public-${999999 + i}`,
        recipe: 'garden-budget',
        createdAt: dayStart + i,
        status: 'completed',
      })),
    };
    await writeFile(
      join(dir, 'results', 'status.json'),
      JSON.stringify(capStatus),
    );
    assert.equal(
      (await eligibility(dir, dayStart + SLOT_MS)).reason,
      'daily_cap',
    );
  }));

test('untrusted filesystem links and malformed state are refused', async () =>
  temporary(async (dir) => {
    const outside = join(dir, 'outside');
    await mkdir(outside);
    await symlink(outside, join(dir, 'results'));
    await assert.rejects(
      develop(dir, { now: NOW, fetcher, aiEnabled: false }),
      /Unsafe/,
    );
    await rm(join(dir, 'results'));
    await mkdir(join(dir, 'results'));
    await writeFile(
      join(dir, 'results', 'status.json'),
      JSON.stringify({
        version: 1,
        jobs: [
          {
            id: '../private',
            recipe: 'garden-budget',
            createdAt: NOW,
            status: 'completed',
          },
        ],
      }),
    );
    await assert.rejects(readStatus(dir), /Invalid/);
  }));

test('worst-case bounded public snippets still fit baseline output limits', () => {
  const sources = SOURCES.map((url) => ({
    url,
    available: true,
    excerpt: '園'.repeat(500),
  }));
  assert.doesNotThrow(() =>
    makeArtifact('garden-research', sources, null, true),
  );
});

test('AI script text is stored as data and never evaluated by the producer', async () =>
  temporary(async (dir) => {
    const content =
      html + '<script>globalThis.__GARDEN_AI_EXECUTED=true;</script>';
    const result = await develop(dir, {
      now: NOW,
      fetcher: async (url) =>
        url.startsWith('http://127.0.0.1')
          ? Response.json({
              done: true,
              message: {
                content: JSON.stringify({
                  ...modelOutput(),
                  files: [{ path: 'ai-variant.html', content }],
                }),
              },
            })
          : fetcher(url),
    });
    assert.equal(result.aiSucceeded, true);
    assert.equal(globalThis.__GARDEN_AI_EXECUTED, undefined);
    assert.match(
      await readFile(
        join(dir, 'results', result.id, 'files', 'ai-variant.html'),
        'utf8',
      ),
      /__GARDEN_AI_EXECUTED/,
    );
  }));

test('workflow uses only SHA-pinned official checkout and free public-repo standard Linux runner', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/continue.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 20/);
  assert.match(workflow, /github\.event\.repository\.private == false/);
  assert.match(
    workflow,
    /github\.repository == 'penguindayo\/opendots-garden-lab'/,
  );
  assert.match(workflow, /cancel-in-progress: false/);
  assert.deepEqual(
    [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]),
    ['actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'],
  );
  assert.doesNotMatch(
    workflow,
    /pull_request|self-hosted|upload-artifact|actions\/cache|secrets\./,
  );
  assert.match(workflow, /git add -- results\//);
  assert.match(workflow, /git push origin HEAD:main/);
});

test('AI failures expose only fixed reasons and never raw model or exception text', async () => {
  const sentinel = 'PRIVATE_SENTINEL_MUST_NOT_ESCAPE';
  const modes = [
    [
      'model_unavailable',
      async () => {
        throw new Error(sentinel);
      },
    ],
    ['model_unavailable', async () => new Response(sentinel, { status: 503 })],
    [
      'truncated',
      async () =>
        Response.json({ done: false, message: { content: sentinel } }),
    ],
    [
      'truncated',
      async () =>
        Response.json({
          done: true,
          done_reason: 'length',
          message: { content: sentinel },
        }),
    ],
    [
      'json_invalid',
      async () =>
        Response.json({ done: true, message: { content: '{' + sentinel } }),
    ],
    [
      'schema_invalid',
      async () =>
        Response.json({
          done: true,
          message: { content: JSON.stringify({ raw: sentinel }) },
        }),
    ],
    [
      'html_invalid',
      async () =>
        Response.json({
          done: true,
          message: {
            content: JSON.stringify({
              ...modelOutput(),
              files: [
                {
                  path: 'ai-variant.html',
                  content: '<h1>No document metadata</h1>',
                },
              ],
            }),
          },
        }),
    ],
  ];
  for (const [reason, response] of modes) {
    let calls = 0;
    await assert.rejects(
      aiCandidate('garden-checklist', [], async (...args) => {
        calls++;
        return response(...args);
      }),
      (error) => {
        assert.equal(aiFailureReason(error), reason);
        assert.doesNotMatch(error.message, new RegExp(sentinel));
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

test('manual smoke stores only public boolean/reason and never creates or alters production jobs', async () =>
  temporary(async (dir) => {
    const before = await develop(dir, { now: NOW, fetcher, aiEnabled: false });
    const production = await readFile(
      join(dir, 'results', before.id, 'artifact.json'),
      'utf8',
    );
    const status = await readFile(join(dir, 'results', 'status.json'), 'utf8');
    let calls = 0;
    const report = await smokeModel(dir, {
      fetcher: async (...args) => {
        calls++;
        return fetcher(...args);
      },
    });
    assert.deepEqual(report, { valid: true, reason: 'ok' });
    assert.equal(calls, 1);
    assert.equal(globalThis.__GARDEN_AI_EXECUTED, undefined);
    assert.deepEqual(
      JSON.parse(
        await readFile(join(dir, 'results', 'model-check.json'), 'utf8'),
      ),
      report,
    );
    assert.equal(
      await readFile(join(dir, 'results', before.id, 'artifact.json'), 'utf8'),
      production,
    );
    assert.equal(
      await readFile(join(dir, 'results', 'status.json'), 'utf8'),
      status,
    );
    const failed = await smokeModel(dir, {
      fetcher: async () => {
        throw new Error('Do not publish this exception');
      },
    });
    assert.deepEqual(failed, { valid: false, reason: 'model_unavailable' });
    assert.doesNotMatch(
      await readFile(join(dir, 'results', 'model-check.json'), 'utf8'),
      /exception|message|content|files/,
    );
  }));

test('manual smoke workflow is bounded integration CI with no schedule and only a boolean result push', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/smoke-ai.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /schedule:|cron:|scripts\/run\.mjs|secrets\./);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /group: garden-tool-development/);
  assert.match(workflow, /github\.event\.repository\.private == false/);
  assert.deepEqual(
    [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]),
    ['actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'],
  );
  assert.match(workflow, /git add -- results\/model-check\.json/);
  assert.match(workflow, /steps\.model\.outcome.*success.*exit 1/);
});

function fixture() {
  const html = baselineVariants()[0].content;
  const fields = Object.fromEntries(
    ['p', 't', 'e', 'f', 'go', 'out', 'error'].map((id) => [
      id,
      {
        value: id === 'p' ? '1' : '0',
        textContent: '',
        events: {},
        attrs: {},
        focused: false,
        addEventListener(type, fn) {
          this.events[type] = fn;
        },
        setAttribute(k, v) {
          this.attrs[k] = v;
        },
        removeAttribute(k) {
          delete this.attrs[k];
        },
        focus() {
          this.focused = true;
        },
      },
    ]),
  );
  const events = {};
  vm.runInNewContext(
    html.match(/<script>([\s\S]*?)<\/script>/)[1],
    {
      document: { getElementById: (id) => fields[id] },
      window: {
        addEventListener(type, fn) {
          events[type] = fn;
        },
      },
    },
    { timeout: 1000 },
  );
  return { fields, events, click: () => fields.go.onclick() };
}

test('generated budget validates each field and recovers focus/error state', () => {
  for (const id of ['p', 't', 'e', 'f']) {
    const f = fixture();
    f.fields[id].value = '1.5';
    f.click();
    assert.equal(f.fields[id].attrs['aria-invalid'], 'true');
    assert.equal(f.fields[id].focused, true);
    assert.equal(f.fields.out.textContent, '');
    f.fields[id].value = '2';
    f.click();
    assert.equal(f.fields[id].attrs['aria-invalid'], undefined);
    assert.equal(f.fields.error.textContent, '');
  }
});
test('all edits and page restores invalidate the previous computed total', () => {
  for (const id of ['p', 't', 'e', 'f'])
    for (const event of ['input', 'change']) {
      const f = fixture();
      f.fields.t.value = '100';
      f.click();
      assert.equal(f.fields.out.textContent, '100円');
      f.fields[id].value = '2';
      f.fields[id].events[event]();
      assert.match(f.fields.out.textContent, /再計算/);
    }
  const f = fixture();
  f.click();
  f.events.pageshow();
  assert.match(f.fields.out.textContent, /再計算/);
});
test('beforeprint clears old totals without trusting input events', () => {
  const f = fixture();
  f.fields.t.value = '100';
  f.click();
  f.fields.t.value = '999';
  f.events.beforeprint();
  assert.equal(f.fields.out.textContent, '');
  assert.match(f.fields.error.textContent, /印刷/);
});
test('real producer accepts all baseline variants and bounded multibyte reports with an AI candidate', () => {
  for (const v of baselineVariants())
    assert.equal(reviewHtml(v.content).passed, true);
  const research = SOURCES.map((url) => ({
    url,
    available: true,
    excerpt: '園'.repeat(500),
  }));
  const candidate = {
    title: 'draft',
    summary: 'unverified',
    files: [
      {
        path: 'ai-variant.html',
        content:
          '<!doctype html><meta name="viewport" content="width=device-width"><title>draft</title><input>'.padEnd(
            2000,
            ' ',
          ),
      },
    ],
  };
  const a = makeArtifact('garden-budget', research, candidate, true);
  assert.equal(a.files.length, 6);
  assert(
    a.files.reduce((total, f) => total + Buffer.byteLength(f.content), 0) <=
      16384,
  );
  assert(Buffer.byteLength(JSON.stringify(a)) <= 24576);
});
