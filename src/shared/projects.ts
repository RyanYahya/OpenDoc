import type { DocumentFormat } from './types';
export interface Project {
  id: string;
  name: string;
  defaultTheme: string | null;
}

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
