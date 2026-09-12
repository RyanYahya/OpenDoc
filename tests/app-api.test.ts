import test from 'node:test';
import assert from 'node:assert/strict';

async function freshApi() {
  return import(`../src/app/api.ts?test=${Date.now()}-${Math.random()}`) as Promise<typeof import('../src/app/api')>;
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('reader requests recover after the local session changes without replaying rejected content', async () => {
  const original = globalThis.fetch;
  const calls: { path: string; token: string | null; body: BodyInit | null | undefined }[] = [];
  let sessions = 0;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    calls.push({ path, token: new Headers(init?.headers).get('X-OpenDoc-Token'), body: init?.body });
    if (path === '/api/session') return json({ token: ++sessions === 1 ? 'old-test-session' : 'new-test-session' });
    return new Headers(init?.headers).get('X-OpenDoc-Token') === 'old-test-session'
      ? json({ error: 'This write must come from the local OpenDoc session.' }, 403)
      : json({ id: 'created-document' });
  };
  try {
    const { api } = await freshApi();
    assert.deepEqual(await api('/api/documents', { method: 'POST', body: '{"title":"Example"}' }), { id: 'created-document' });
    assert.deepEqual(calls.map((call) => call.path), ['/api/session', '/api/documents', '/api/session', '/api/documents']);
    assert.equal(calls[1].token, 'old-test-session');
    assert.equal(calls[3].token, 'new-test-session');
    assert.equal(calls[1].body, calls[3].body);
  } finally {
    globalThis.fetch = original;
  }
});

test('a failed session request does not prevent the next attempt', async () => {
  const original = globalThis.fetch;
  let sessions = 0;
  globalThis.fetch = async (input) => {
    if (String(input) === '/api/session') return ++sessions === 1
      ? json({ error: 'Restarting' }, 503)
      : json({ token: 'recovered-test-session' });
    return json({ ok: true });
  };
  try {
    const { api } = await freshApi();
    await assert.rejects(api('/api/context', { method: 'POST', body: '{}' }), /reconnect/);
    assert.deepEqual(await api('/api/context', { method: 'POST', body: '{}' }), { ok: true });
    assert.equal(sessions, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('a content conflict is shown once and does not retry a mutation', async () => {
  const original = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (input) => {
    if (String(input) === '/api/session') return json({ token: 'test-session' });
    writes += 1;
    return json({ error: 'This preview changed. Review it before exporting.' }, 409);
  };
  try {
    const { api } = await freshApi();
    await assert.rejects(api('/api/documents/example/export', { method: 'POST', body: '{}' }), /preview changed/);
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = original;
  }
});
