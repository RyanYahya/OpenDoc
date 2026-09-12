import { fork } from 'node:child_process';
import { mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RenderFailure } from './render-error';
import type { RenderArtifact, ReviewIssue } from '../shared/types';
import type { SourceOverride } from './source-overrides';
import { runtimeResolve, runtimeSource } from '../runtime/paths';

export function validId(id: string) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id); }
export async function documentEntry(root: string, id: string) {
  if (!validId(id)) throw new Error('Invalid document ID.');
  const docsRoot = await realpath(resolve(root, 'documents'));
  const path = await realpath(resolve(docsRoot, id, 'index.tsx'));
  const rel = relative(docsRoot, path);
  if (rel.startsWith(`..${sep}`) || rel === '..' || resolve(docsRoot, rel) !== path) throw new Error('Document path is outside this workspace.');
  return path;
}

export async function renderOnce(root: string, id: string, timeoutMs = 30_000, sourceOverrides?: SourceOverride[]): Promise<{ artifact: RenderArtifact; directory: string }> {
  const entry = await documentEntry(root, id);
  return renderEntry(root, entry, id, timeoutMs, sourceOverrides);
}

/** Render another workspace entry through the same isolated PDF worker. */
export async function renderEntry(root: string, entry: string, label: string, timeoutMs = 30_000, sourceOverrides?: SourceOverride[]): Promise<{ artifact: RenderArtifact; directory: string }> {
  const directory = resolve(root, '.opendoc/renders', `${label}-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  try {
    await new Promise<void>((accept, reject) => {
      const child = fork(runtimeSource('server/worker.ts'), [entry, directory, ...(sourceOverrides ? ['--source-overrides'] : [])], {
        cwd: root, execArgv: ['--import', runtimeResolve('tsx')], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      let stderr = '', failure: string | undefined, issues: ReviewIssue[] = [], signaled = false;
      child.stderr?.on('data', data => { stderr = (stderr + data.toString()).slice(-8000); });
      const timer = setTimeout(() => { failure = `Rendering timed out after ${timeoutMs / 1000} seconds.`; child.kill('SIGKILL'); }, timeoutMs);
      child.on('message', (message: { ok: boolean; error?: string; issues?: ReviewIssue[] }) => { signaled = message.ok; if (!message.ok) { failure = message.error; issues = message.issues ?? []; } });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => {
        clearTimeout(timer);
        if (code === 0 && signaled && !failure) accept();
        else reject(new RenderFailure(failure || stderr || `Render worker exited unexpectedly (${code ?? 'signal'}).`, issues));
      });
      if (sourceOverrides) child.send({ sourceOverrides });
    });
    return { artifact: JSON.parse(await readFile(resolve(directory, 'artifact.json'), 'utf8')), directory };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
