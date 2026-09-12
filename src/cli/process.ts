import { spawn } from 'node:child_process';

export async function runProcess(command: string, args: string[], cwd: string, options: { capture?: boolean; diagnostics?: boolean } = {}) {
  return await new Promise<{ stdout: string; code: number }>((accept, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['inherit', options.capture || options.diagnostics ? 'pipe' : 'inherit', 'inherit'] });
    let stdout = '';
    let canceled = false;
    child.stdout?.on('data', chunk => { if (options.capture) stdout += String(chunk); else process.stderr.write(chunk); });
    const cancel = () => { canceled = true; child.kill('SIGINT'); };
    process.on('SIGINT', cancel);
    child.once('error', error => { process.off('SIGINT', cancel); reject(error); });
    child.once('exit', (code, signal) => {
      process.off('SIGINT', cancel);
      if (canceled || signal === 'SIGINT') { process.exitCode = 130; reject(new Error('Operation canceled.')); }
      else if (signal) reject(new Error(`${command} stopped (${signal}).`));
      else accept({ stdout, code: code ?? 1 });
    });
  });
}
