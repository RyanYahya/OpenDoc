import { dirname, resolve } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { runtimeResolve, applicationRoot } from '../runtime/paths';
import { runProcess } from './process';
import { packageIdentity, packageMetadata } from './workspace';

export async function validateInstallation() {
  const { edition } = packageIdentity(await packageMetadata());
  await Promise.all([...(edition === 'normal' ? ['dist/index.html'] : []), 'src/server/worker.ts', 'src/assets/import-worker.ts', 'tsconfig.workspace.json'].map(path => access(resolve(applicationRoot, path))));
  const core = runtimeResolve('@formepdf/core');
  const manifest = JSON.parse(await readFile(resolve(dirname(core), '../package.json'), 'utf8'));
  if (manifest.version !== '0.20.1-opendoc.3') throw new Error('The repaired OpenDoc rendering engine is missing. Reinstall this OpenDoc release.');
  const { transform } = await import('esbuild');
  await transform('const ok: boolean = true', { loader: 'ts' });
}

export async function checkWorkspace(root: string, json = false, quiet = false) {
  const compiler = runtimeResolve('typescript/lib/tsc.js');
  const result = await runProcess(process.execPath, [compiler, '--project', resolve(root, 'tsconfig.json'), '--noEmit'], root, { capture: true });
  if (result.code) {
    if (result.stdout.trim()) process.stderr.write(result.stdout);
    throw new Error('Workspace typecheck failed. Correct the authoring errors above and run npx opendoc check again.');
  }
  if (!quiet) console.log(json ? JSON.stringify({ ok: true, workspace: root }) : 'Workspace authoring files typecheck successfully.');
}
