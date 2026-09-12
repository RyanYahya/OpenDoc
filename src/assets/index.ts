import { relative } from 'node:path';
import type { DocTheme } from '../themes/types';
import type { AssetRef, DocumentAssets, FontRevision } from '../shared/assets';
import { fontCanBeDefault } from '../shared/assets';
import { assetFile, assetRevisionPath, bindingDependencies, parseDocumentAssets, readAssetRevision } from './files';

const appliedAssets = Symbol.for('opendoc.document-assets');
export interface AppliedDocumentAssets {
  bindings: DocumentAssets;
  fonts: Map<string, FontRevision>;
  dependencies: Set<string>;
}
type AssetTheme = DocTheme & { [appliedAssets]?: AppliedDocumentAssets };

/** An internal family alias isolates revisions and never changes a shared font's name. */
export function assetFontFamily(ref: AssetRef) { return `ODAsset-${ref.id}-${ref.revision}`; }
export function documentThemeAssets(theme: DocTheme) { return (theme as AssetTheme)[appliedAssets]; }

/** Apply saved asset choices before constructing a template. All other theme tokens remain live. */
export function withDocumentAssets(base: DocTheme, bindings: DocumentAssets): DocTheme {
  bindings = parseDocumentAssets(bindings);
  const root = (globalThis as { __opendocRoot?: string }).__opendocRoot ?? process.cwd();
  const state: AppliedDocumentAssets = { bindings, fonts: new Map(), dependencies: new Set(bindingDependencies(root, bindings)) };
  const theme: AssetTheme = { ...base, fonts: [...(base.fonts ?? [])] };
  const useFont = (ref: AssetRef | undefined) => {
    if (!ref) return undefined;
    const alias = assetFontFamily(ref);
    if (!state.fonts.has(alias)) {
      const asset = readAssetRevision(root, 'font', ref.id, ref.revision);
      if (asset.kind !== 'font') throw new Error(`Asset ${ref.id} is not a font family.`);
      if (!fontCanBeDefault(asset)) throw new Error(`Font “${asset.name}” cannot be a body or heading default. ${asset.compatibility.message ?? 'Import a regular face and a semibold or bold face.'}`);
      state.fonts.set(alias, asset);
      state.dependencies.add(relative(root, assetRevisionPath(root, 'font', ref.id, ref.revision)));
      for (const face of asset.faces) {
        const path = assetFile(root, 'font', asset.id, face.file);
        state.dependencies.add(relative(root, path));
        theme.fonts!.push({ family: alias, src: relative(root, path), fontWeight: face.weight, fontStyle: face.style });
      }
    }
    return alias;
  };
  const body = useFont(bindings.bodyFont), heading = useFont(bindings.headingFont);
  if (body) theme.body = body;
  if (heading) theme.heading = heading;
  // Only semantic body/display roles change. Code, labels, captions, and furniture
  // may deliberately use a different family even when it matches the old body.
  if ((body || heading) && base.design) {
    theme.design = { ...base.design, typography: { ...base.design.typography } };
    if (body && base.design.typography?.lead?.fontFamily) theme.design.typography!.lead = { ...base.design.typography.lead, fontFamily: body };
    if (heading) {
      for (const role of ['h1', 'h2', 'h3'] as const) if (base.design.typography?.[role]) theme.design.typography![role] = { ...base.design.typography[role], fontFamily: heading };
      if (base.design.title?.heading) theme.design.title = { ...base.design.title, heading: { ...base.design.title.heading, fontFamily: heading } };
      if (base.design.cover?.title) theme.design.cover = { ...base.design.cover, title: { ...base.design.cover.title, fontFamily: heading } };
    }
  }
  theme[appliedAssets] = state;
  return theme;
}

export type { AssetRef, DocumentAssets, LogoBinding } from '../shared/assets';
