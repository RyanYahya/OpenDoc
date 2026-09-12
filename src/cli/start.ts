import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { runtimeResolve, runtimeSource } from '../runtime/paths';
import { packageIdentity, packageMetadata } from './workspace';
import { withWorkspaceLock } from './lock';
import { validateInstallation } from './check';

export async function runningSession(root: string): Promise<{ origin: string; pid: number } | null> {
  let session: { origin: string; token: string; pid: number };
  try { session = JSON.parse(await readFile(resolve(root, '.opendoc/server.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('Cannot read the OpenDoc session. Check .opendoc/server.json before starting another server.'); }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(session?.origin ?? '') || typeof session.token !== 'string' || !session.token) throw new Error('The OpenDoc session record is invalid. Check .opendoc/server.json before starting another server.');
  let response;
  try { response = await fetch(`${session.origin}/api/session`, { signal: AbortSignal.timeout(1500), redirect: 'error' }); }
  catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') {
      if (Number.isSafeInteger(session.pid) && session.pid > 0 && session.pid <= 2 ** 31 - 1) {
        try { process.kill(session.pid, 0); }
        catch (ownerError) { if ((ownerError as NodeJS.ErrnoException).code === 'ESRCH') return null; throw ownerError; }
        throw new Error('OpenDoc is still finishing its previous session. Wait for its terminal to stop, then retry.');
      }
      return null;
    }
    throw new Error('Cannot verify whether OpenDoc is running. Check its terminal before starting another server.');
  }
  const live = await response.json().catch(() => null);
  if (response.ok && live?.token === session.token) return { origin: session.origin, pid: session.pid };
  throw new Error('The recorded OpenDoc session no longer matches the server at its address. Stop the previous server and remove the stale .opendoc/server.json before retrying.');
}

async function openBrowser(origin: string) {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  await new Promise<void>(accept => {
    const child = spawn(command, [origin], { stdio: 'ignore' });
    child.once('error', () => { console.error(`Open ${origin} in your browser.`); accept(); });
    child.once('exit', code => { if (code) console.error(`Open ${origin} in your browser.`); accept(); });
  });
}

export async function runStart(args: string[], root: string) {
  if (packageIdentity(await packageMetadata()).edition === 'headless') throw new Error('OpenDoc Headless has no browser service. Use npx opendoc create, review, and export to produce files, then deliver the PDF or PowerPoint directly.');
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { 'no-open': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
  const usage = 'Usage: npx opendoc start [folder] [--no-open] [--json]\nRuns the installed workspace version. Ctrl+C stops the server.';
  if (values.help) { console.log(values.json ? JSON.stringify({ usage }) : usage); return; }
  if (positionals.length) throw new Error(usage);
  let child: ChildProcess | undefined;
  let exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
  let stopped: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  let startupFailure: Error | undefined;
  const forwardInterrupt = () => child?.kill('SIGINT');
  const forwardTerminate = () => child?.kill('SIGTERM');
  process.on('SIGINT', forwardInterrupt);
  process.on('SIGTERM', forwardTerminate);
  try {
    const ready = await withWorkspaceLock(root, async () => {
      const existing = await runningSession(root);
      if (existing) return { ...existing, reused: true };
      await validateInstallation();
      child = spawn(process.execPath, ['--import', runtimeResolve('tsx'), runtimeSource('server/index.ts'), '--production'], { cwd: root, stdio: ['inherit', values.json ? 'pipe' : 'inherit', 'inherit'] });
      if (values.json) child.stdout?.on('data', data => process.stderr.write(data));
      exited = new Promise((accept, reject) => {
        child!.once('error', error => { startupFailure = error; reject(error); });
        child!.once('exit', (code, signal) => { stopped = { code, signal }; accept(stopped); });
      });
      // Attach a handler immediately so a spawn error cannot become an unhandled rejection.
      void exited.catch(() => {});
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (startupFailure) throw startupFailure;
        if (stopped) throw new Error(`OpenDoc stopped during startup (${stopped.signal ?? stopped.code}).`);
        const session = await runningSession(root);
        if (session && child.pid && session.pid === child.pid) return { ...session, reused: false };
        await setTimeout(100);
      }
      throw new Error('OpenDoc did not become ready within 30 seconds. See its terminal output.');
    });
    const { version } = await packageMetadata();
    if (values.json) console.log(JSON.stringify({ workspace: root, version, origin: ready.origin, reused: ready.reused }));
    else if (ready.reused) console.log(`OpenDoc is already running at ${ready.origin}`);
    if (!values['no-open']) await openBrowser(ready.origin);
    if (exited) {
      const result = await exited;
      if (result.code) process.exitCode = result.code;
      else if (result.signal && !['SIGINT', 'SIGTERM'].includes(result.signal)) process.exitCode = 1;
    }
  } catch (error) {
    child?.kill('SIGTERM');
    throw error;
  } finally {
    process.off('SIGINT', forwardInterrupt);
    process.off('SIGTERM', forwardTerminate);
  }
}
