import type { RenderArtifact, ReviewIssue } from './types';
import type { ThemeAssetDefaults } from './assets';
import type { Language } from './language';

/** Small catalog records; executable rules and design guides are loaded on demand. */
export interface ThemeSummary {
  id: string;
  revision?: string;
  name: string;
  description: string;
  body: string;
  heading: string;
  /** Current defaults are preferences for future documents and theme specimens only. */
  assetDefaults?: ThemeAssetDefaults;
  assetError?: string;
  baseBody?: string;
  baseHeading?: string;
  pageSize: string;
  useFor: string[];
  principles: string[];
  palette?: { name: string; value: string; role: string }[];
  geometry?: string[];
  /** Derived from the theme's declared direction and language. */
  language?: Language;
  /** When the theme's files last changed, for sorting by last edited. */
  updatedAt?: string;
  error?: string;
}
export interface ThemePreview { artifact?: RenderArtifact; error?: string; issues?: ReviewIssue[] }
