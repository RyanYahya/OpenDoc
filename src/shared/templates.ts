import type { DocumentFormat, RenderArtifact, ReviewIssue } from './types';

export interface TemplateDescriptor {
  /** Omitted by existing document templates. */
  documentFormat?: DocumentFormat;
  name: string;
  description: string;
  format: string;
  structure: string[];
}
export interface TemplateItem {
  id: string;
  descriptor: TemplateDescriptor;
  revision: string;
  error?: string;
}

export interface TemplatePreview { artifact?: RenderArtifact; error?: string; issues?: ReviewIssue[] }
