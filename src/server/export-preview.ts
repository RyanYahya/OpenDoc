import { resolve } from 'node:path';
import type { DocumentState } from '../shared/types';
import { exportInfo } from '../shared/export';
import { readJSON } from './files';
import type { ExportOptions, ExportResult } from './export-batch';
import { ExportResponseLost } from './export-errors';

interface Connection { origin: string; token: string }
export interface PreviewSession { connection: Connection; states: DocumentState[] }
type Session = PreviewSession;

async function responseError(response: Response, fallback: string) {
  try { const data = await response.json() as { error?: unknown }; return typeof data.error === 'string' ? data.error : fallback; }
  catch { return fallback; }
}

async function request(url: string, timeout: number, init?: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeout), redirect: 'error' });
}

async function readStates(connection: Connection, timeout: number) {
  const response = await request(`${connection.origin}/api/documents`, timeout);
  if (!response.ok) throw new Error(await responseError(response, `The local OpenDoc session refused the request (${response.status}).`));
  const states = await response.json() as DocumentState[];
  if (!Array.isArray(states)) throw new Error('The local OpenDoc session returned an invalid document list.');
  return states;
}

export async function currentSession(root: string, timeout: number): Promise<Session | null> {
  const connection = await readJSON<Connection | null>(resolve(root, '.opendoc/server.json'), null);
  if (!connection) return null;
  if (typeof connection.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(connection.origin) || typeof connection.token !== 'string' || !connection.token) {
    throw new Error('The local OpenDoc session file is invalid. Restart OpenDoc before exporting.');
  }
  try { return { connection, states: await readStates(connection, timeout) }; }
  catch (error) {
    // Only an unavailable server permits an offline render. A live error stays authoritative.
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') return null;
    throw error;
  }
}

export async function exportPreview(root: string, id: string, session: Session, options: Required<Pick<ExportOptions, 'requestTimeoutMs' | 'readyTimeoutMs' | 'format'>>): Promise<ExportResult> {
  const deadline = Date.now() + options.readyTimeoutMs;
  let state = session.states.find(item => item.id === id);
  while (state?.status === 'rendering' && Date.now() < deadline) {
    await new Promise(accept => setTimeout(accept, Math.min(120, Math.max(1, deadline - Date.now()))));
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    state = (await readStates(session.connection, Math.min(options.requestTimeoutMs, remaining))).find(item => item.id === id);
  }
  if (!state) throw new Error(`Document "${id}" was not found in the current OpenDoc session.`);
  if (state.status !== 'ready' || !state.artifact) throw new Error(state.error ?? 'The current document is still rendering. Wait for its preview before exporting.');
  let response: Response;
  try {
    response = await request(`${session.connection.origin}/api/documents/${id}/export`, options.requestTimeoutMs, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenDoc-Token': session.connection.token },
      body: JSON.stringify({ hash: state.artifact.hash, format: options.format }),
    });
  } catch {
    throw new ExportResponseLost('The local session stopped responding during export. The output may have been saved; its status could not be confirmed.');
  }
  if (!response.ok) throw new Error(await responseError(response, `Export failed (${response.status}).`));
  // The endpoint saves locally before returning 200; the CLI needs no duplicate PDF download.
  await response.body?.cancel().catch(() => {});
  return { id, status: 'success', pages: state.artifact.pages.length, hash: state.artifact.hash, path: resolve(root, 'output', `${id}${exportInfo(options.format).extension}`), source: 'preview' };
}

