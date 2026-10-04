import type { DocumentFormat } from './types';
export interface Project {
  id: string;
  name: string;
  /**
   * The default theme for new documents. Presentations share it unless
   * `defaultPresentationTheme` is present, so older workspaces keep one default.
   */
  defaultTheme: string | null;
  /** Present only when presentations use a different default; null means none. */
  defaultPresentationTheme?: string | null;
}

export type ProjectThemeDefaults = Record<DocumentFormat, string | null>;

/** The theme a new item of this format starts from, before any explicit choice. */
export function projectDefaultTheme(project: Project, format: DocumentFormat): string | null {
  return format === 'presentation' && project.defaultPresentationTheme !== undefined ? project.defaultPresentationTheme : project.defaultTheme;
}

export const projectThemeDefaults = (project: Project): ProjectThemeDefaults => ({ document: projectDefaultTheme(project, 'document'), presentation: projectDefaultTheme(project, 'presentation') });

/** Projects organize stable document folders; moving a document does not move its files. */
export interface ProjectsManifest {
  version: 1;
  projects: Project[];
  assignments: Record<string, string>;
  /** Library names are independent of authored PDF titles. */
  names?: Record<string, string>;
  /** Missing formats are ordinary documents, including older workspaces. */
  formats?: Record<string, DocumentFormat>;
}

export const emptyProjects = (): ProjectsManifest => ({ version: 1, projects: [], assignments: {} });
