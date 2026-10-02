let session: Promise<string> | undefined;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const unreachable = 'OpenDoc can’t reach the local server.';

/** The local server could not be reached or did not answer in time. Status 0: no response arrived. */
export class ConnectionError extends ApiError {
  constructor(public reason: 'unreachable' | 'timeout', write = false) {
    super(reason === 'timeout' ? 'The local OpenDoc server took too long to answer. Try again.'
      : write ? `${unreachable} Try again once it reconnects.` : `${unreachable} It reconnects automatically when the server is running again.`, 0);
  }
}

/**
 * Browsers report an unreachable server as a bare `TypeError: Failed to fetch` and a deadline as a
 * `TimeoutError`. Name the problem and the recovery instead; caller aborts and server answers pass through.
 */
export function connectionFailure(error: unknown, write = false): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === 'TimeoutError') return new ConnectionError('timeout', write);
  if (error instanceof TypeError) return new ConnectionError('unreachable', write);
  return error;
}

/** A failure's message. When the server is unreachable, `kept` says what stays in the browser, such as an unsaved draft. */
export function failureMessage(error: unknown, kept: string) {
  if (error instanceof ConnectionError && error.reason === 'unreachable') return `${unreachable} ${kept}`;
  return error instanceof Error ? error.message : String(error);
}

function sessionToken() {
  session ??= fetch('/api/session', { signal: AbortSignal.timeout(10_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error('Could not reconnect to the local workspace. Try again.');
      const value = await response.json();
      if (typeof value.token !== 'string') throw new Error('The local session is unavailable. Reload OpenDoc.');
      return value.token as string;
    })
    .catch((error) => { session = undefined; throw error; });
  return session;
}

export async function request(path: string, init?: RequestInit) {
  const write = Boolean(init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase()));
  try { return await send(path, write, init); }
  catch (error) { throw connectionFailure(error, write); }
}

async function send(path: string, write: boolean, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  // Reads must stop waiting even when callers supply their own unmount signal.
  if (!write) {
    const deadline = AbortSignal.timeout(60_000);
    init = { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline };
  }
  if (write) {
    headers.set('X-OpenDoc-Token', await sessionToken());
    if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  }
  let response = await fetch(path, { ...init, headers });
  // A local server restart changes its session. Retry only a rejected write.
  if (write && response.status === 403 && !init?.signal?.aborted) {
    session = undefined;
    headers.set('X-OpenDoc-Token', await sessionToken());
    response = await fetch(path, { ...init, headers });
  }
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new ApiError(value.error ?? 'OpenDoc could not complete that request. Try again.', response.status);
  }
  return response;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).json();
}
