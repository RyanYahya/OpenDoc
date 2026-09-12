// Maintenance only. Normal installations use the checked-in package archive.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'vendor/formepdf');
const work = process.argv[2]
  ? resolve(process.argv[2])
  : mkdtempSync(resolve(tmpdir(), 'opendoc-forme-rebuild-'));
if (process.argv[2] && existsSync(work)) throw new Error(`Choose a new build directory; ${work} already exists.`);
const commit = '0d706f839617b775e90edcc93d6001a8b0145a78';
const originalIntegrity = '348ERmxZGqMbTuLzAikY/ktKqn+FZuFuxT6KBLf0k9s4wHO8kR9z8C4fMutPYXy9dM+ynVlr+Buqt6xPCE6RkA==';
const env = { ...process.env, RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN ?? '1.98.1' };
function run(command, args, cwd = work, capture = false) {
  return execFileSync(command, args, { cwd, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
}
mkdirSync(work, { recursive: true });
// Rust panic locations otherwise embed the builder's home and Cargo registry paths.
const mappings = [
  [homedir(), '/build/home'],
  [process.env.CARGO_HOME ?? resolve(homedir(), '.cargo'), '/build/cargo'],
  [process.env.RUSTUP_HOME ?? resolve(homedir(), '.rustup'), '/build/rustup'],
  [work, '/build/forme'], [realpathSync(work), '/build/forme'],
];
env.CARGO_ENCODED_RUSTFLAGS = [...(process.env.CARGO_ENCODED_RUSTFLAGS?.split('\u001f') ?? []),
  ...mappings.map(([from, to]) => `--remap-path-prefix=${from}=${to}`)].join('\u001f');
console.log(`Rebuilding Forme in ${work}`);
if (!run('rustc', ['--version'], work, true).startsWith('rustc 1.98.1 ')) throw new Error('This patch is built with Rust 1.98.1.');
if (run('wasm-pack', ['--version'], work, true).trim() !== 'wasm-pack 0.15.0') throw new Error('Install wasm-pack 0.15.0 to reproduce the package.');
run('git', ['clone', '--depth', '1', '--branch', 'v0.20.1', 'https://github.com/formepdf/forme.git', 'source']);
const source = resolve(work, 'source');
if (run('git', ['rev-parse', 'HEAD'], source, true).trim() !== commit) throw new Error('The upstream tag no longer matches the pinned commit.');
for (const patch of ['text-writer.patch', 'font-subset.patch']) {
  run('git', ['apply', '--check', resolve(destination, patch)], source);
  run('git', ['apply', resolve(destination, patch)], source);
}
run('cargo', ['test', '--manifest-path', 'engine/Cargo.toml', '--lib', '--locked'], source);
for (const [target, folder] of [['bundler', 'pkg'], ['web', 'pkg-web'], ['nodejs', 'pkg-node']]) {
  run('wasm-pack', ['build', '--target', target, '--out-dir', `../packages/core/${folder}`, '--features', 'wasm', '--locked'], resolve(source, 'engine'));
  const wasm = readFileSync(resolve(source, 'packages/core', folder, 'forme_bg.wasm'));
  if (mappings.some(([from]) => wasm.includes(Buffer.from(from)))) throw new Error('The generated engine still contains a local build path.');
}
const packed = JSON.parse(run('npm', ['pack', '@formepdf/core@0.20.1', '--ignore-scripts', '--json'], work, true))[0];
const archive = resolve(work, packed.filename);
if (createHash('sha512').update(readFileSync(archive)).digest('base64') !== originalIntegrity) throw new Error('The published upstream package failed its integrity check.');
run('tar', ['-xzf', archive]);
const pkg = resolve(work, 'package');
for (const folder of ['pkg', 'pkg-web', 'pkg-node']) {
  rmSync(resolve(pkg, folder), { recursive: true });
  cpSync(resolve(source, 'packages/core', folder), resolve(pkg, folder), { recursive: true });
  rmSync(resolve(pkg, folder, '.gitignore'), { force: true });
}
const manifest = JSON.parse(readFileSync(resolve(pkg, 'package.json'), 'utf8'));
manifest.version = '0.20.1-opendoc.3';
writeFileSync(resolve(pkg, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
cpSync(resolve(source, 'LICENSE'), resolve(pkg, 'LICENSE'));
run('npm', ['pack', '--ignore-scripts', '--pack-destination', destination], pkg);
