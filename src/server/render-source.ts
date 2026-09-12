import { writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { resolveAllSources } from '../rendering/resolve-sources';
import { renderPdfWithLayout } from '@formepdf/core';
import type { FormeDocument } from '@formepdf/react';
import { bundleSourceOverrides, type SourceOverride } from './source-overrides';

/** One serialization and asset resolution supplies both the PDF and editable exports. */
export async function renderDocumentSource(source: string, entry: string, overrides = new Map<string, SourceOverride>()) {
  const directory = dirname(entry);
  const code = await bundleSourceOverrides(`${source}\nexport { serialize as __serialize } from '@formepdf/react';`, entry, overrides);
  const temporary = resolve(directory, `.forme-render-${randomUUID()}.mjs`);
  await writeFile(temporary, code, { flag: 'wx' });
  let doc: FormeDocument;
  try {
    const module = await import(pathToFileURL(temporary).href);
    doc = module.__serialize(module.default());
  } finally { await unlink(temporary); }
  await resolveAllSources(doc as unknown as Record<string, unknown>, directory);
  const result = await renderPdfWithLayout(JSON.stringify(doc));
  return { ...result, doc, warnings: [] as string[] };
}
