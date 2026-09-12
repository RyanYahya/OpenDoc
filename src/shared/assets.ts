/** Shared, file-first asset identities. Documents always store exact revisions. */
export type AssetKind = 'logo' | 'font';
export interface AssetRef {
  id: string;
  revision: string;
}
export interface LogoBinding extends AssetRef {
  variation?: string;
}
export interface DocumentAssets {
  version: 1;
  logo?: LogoBinding;
  logos?: Record<string, LogoBinding>;
  bodyFont?: AssetRef;
  headingFont?: AssetRef;
}
export interface ThemeAssetDefaults {
  version: 1;
  logo?: {
    id: string;
    variation?: string;
  };
  bodyFont?: string;
  headingFont?: string;
}
export interface AssetFile {
  file: string;
  hash: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
}
export interface LogoVariation {
  id: string;
  name: string;
  description: string;
  original: AssetFile;
  image: AssetFile;
}
export interface FontFace {
  id: string;
  family: string;
  postscriptName?: string;
  weight: number;
  style: 'normal' | 'italic';
  file: AssetFile;
}
export interface FontCompatibility {
  status: 'ready' | 'needs-attention';
  defaultEligible: boolean;
  message?: string;
}
interface AssetRevisionBase {
  version: 1;
  id: string;
  revision: string;
  name: string;
  description: string;
  createdAt: string;
}
export interface LogoRevision extends AssetRevisionBase {
  kind: 'logo';
  defaultVariation: string;
  variations: LogoVariation[];
}
export interface FontRevision extends AssetRevisionBase {
  kind: 'font';
  faces: FontFace[];
  compatibility: FontCompatibility;
  specimen?: AssetFile;
}
export type AssetRevision = LogoRevision | FontRevision;
export interface ArchivedThemeDefault {
  id: string;
  defaults: ThemeAssetDefaults;
  cleared: string;
}
export interface AssetHead {
  version: 1;
  id: string;
  kind: AssetKind;
  revision: string;
  archived?: boolean;
  builtIn?: boolean;
  archivedDefaults?: ArchivedThemeDefault[];
}
export interface AssetUse extends AssetRef {
  kind: AssetKind;
  variation?: string;
  face?: string;
  blockId?: string;
}
export interface AssetUsage {
  themes: {
    id: string;
    name: string;
    roles: string[];
  }[];
  documents: {
    id: string;
    name: string;
    revision: string;
    roles: string[];
    rendered: boolean;
    current: boolean;
    trashed?: boolean;
  }[];
}
export interface AssetSummary {
  id: string;
  kind: AssetKind;
  name: string;
  description: string;
  revision: string;
  archived: boolean;
  builtIn?: boolean;
  count: number;
  error?: string;
  compatibility?: FontCompatibility;
  preview?: AssetFile;
}
export interface AssetInspection {
  asset: AssetRevision;
  head: AssetHead;
  usage: AssetUsage;
  versions: {
    revision: string;
    createdAt: string;
    name: string;
  }[];
  folder: string;
  examples: string[];
}
export interface SelectedAsset {
  kind: AssetKind;
  id: string;
  revision?: string;
  variation?: string;
  face?: string;
}
export interface AssetCatalog {
  items: AssetSummary[];
  issues: string[];
}
/** Semantic font defaults need both readable body text and a real emphasis face. */
export function fontCanBeDefault(font: FontRevision): boolean {
  return (
    font.compatibility.status === 'ready' &&
    font.compatibility.defaultEligible &&
    font.faces.some((face) => face.weight === 400 && face.style === 'normal') &&
    font.faces.some((face) => (face.weight === 600 || face.weight === 700) && face.style === 'normal')
  );
}
