import type { RenderArtifact, ReviewIssue } from './types';
import type { ThemeAssetDefaults } from './assets';

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
  error?: string;
}
export interface ThemePreview { artifact?: RenderArtifact; error?: string; issues?: ReviewIssue[] }
