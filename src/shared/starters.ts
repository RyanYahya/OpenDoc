import type { DocumentKind, DocumentFormat } from './types';

export const TITLE_MAX_LENGTH = 160;
export const DOCUMENT_ID_MAX_LENGTH = 80;
export type StarterId = 'blank' | 'article' | 'report' | 'proposal' | 'research' | 'technical';
export interface StarterSummary { id: StarterId; name: string; description: string; kind?: DocumentKind }
export interface CreateDocumentInput { format?: DocumentFormat; starter?: string; title: string; projectId: string; id?: string; theme?: string | null }
export interface CreatedDocument { id: string; title: string; starter: StarterId; entry: string; projectId: string }

/** Optional, explicitly requested examples. Ordinary agent creation uses the minimal blank scaffold. */
export const starters: readonly StarterSummary[] = [
  { id: 'article', name: 'Article', description: 'Essays, assignments, and ideas with room to develop.', kind: 'article' },
  { id: 'report', name: 'Report', description: 'Findings, evidence, and a clear recommendation.', kind: 'report' },
  { id: 'proposal', name: 'Proposal', description: 'A considered plan with scope, deliverables, and next steps.', kind: 'proposal' },
  { id: 'research', name: 'Research paper', description: 'A question, a method, results, and their limits.', kind: 'research' },
  { id: 'technical', name: 'Technical brief', description: 'Requirements, decisions, and how to verify them.', kind: 'technical' },
];

export function listStarters(): StarterSummary[] { return starters.map(starter => ({ ...starter })); }
