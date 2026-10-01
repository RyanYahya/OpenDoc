import type { DocumentFormat, RenderArtifact, ReviewIssue } from './types';
import type { Language } from './language';

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
  /** Derived from the template's source text and declared direction. */
  language?: Language;
  error?: string;
}

export interface TemplatePreview { artifact?: RenderArtifact; error?: string; issues?: ReviewIssue[] }
