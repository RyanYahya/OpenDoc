import type { ReviewIssue } from '../shared/types';

/** Preserve actionable layout diagnostics across the isolated render process. */
export class RenderFailure extends Error {
  constructor(message: string, readonly issues: ReviewIssue[] = []) {
    super(message);
    this.name = 'RenderFailure';
  }
}
