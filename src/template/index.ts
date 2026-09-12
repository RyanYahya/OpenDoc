import type { ReactNode } from 'react';
import type { DocumentMeta } from '../shared/types';

/** A template is ordinary, local code. Its parser owns its data contract. */
export interface DocumentTemplate<T> {
  parse(input: unknown): T;
  meta(data: T): DocumentMeta;
  render(data: T): ReactNode;
}

export function defineTemplate<T>(template: DocumentTemplate<T>): DocumentTemplate<T> {
  return template;
}

/** Used by isolated edit validation to confirm the existing data contract ran. */
export function validateTemplateInput<T>(parse: (input: unknown) => T, input: unknown): T {
  const data = parse(input);
  (globalThis as typeof globalThis & { __opendocTemplateValidated?: boolean }).__opendocTemplateValidated = true;
  return data;
}

/** Validate once at entry load, before either metadata or the PDF is produced. */
export function bindTemplate<T>(template: DocumentTemplate<T>, input: unknown) {
  const data = validateTemplateInput(template.parse, input);
  const meta = template.meta(data);
  return { data, meta, Document: () => template.render(data) };
}
