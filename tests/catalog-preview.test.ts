import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogPreview } from '../src/app/catalogPreview';
import { until } from './helpers';

test('gallery requests leave connections free and discard previews canceled before they start', async t => {
  const started: string[] = [];
  const finish = new Map<string, () => void>();
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    started.push(path);
    return new Promise<Response>((accept, reject) => {
      finish.set(path, () => accept(Response.json({ path })));
      init.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    });
  });
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const requests = controllers.map((controller, index) => catalogPreview<{ path: string }>(`/preview/${index}`, controller.signal));
  const canceled = assert.rejects(requests[2], { name: 'AbortError' });
  await until(() => started.length === 2);
  controllers[2].abort(); await canceled;
  assert.deepEqual(started, ['/preview/0', '/preview/1']);
  finish.get('/preview/0')!(); await requests[0];
  await until(() => started.length === 3);
  assert.equal(started[2], '/preview/3');
  finish.get('/preview/1')!(); finish.get('/preview/3')!();
  await Promise.all([requests[1], requests[3]]);
});
