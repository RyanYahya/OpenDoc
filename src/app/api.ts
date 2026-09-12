let session: Promise<string> | undefined;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
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
  const headers = new Headers(init?.headers);
  const write = init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase());
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
