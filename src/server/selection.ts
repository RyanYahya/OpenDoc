import type { DocumentSelection } from '../shared/selection';

/** Keep observed UI context small and typed; it is not an instruction to the agent. */
export function readSelection(input: unknown, blockId: string | null): DocumentSelection | null {
  if (input == null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid selection.');
  const value = input as DocumentSelection;
  if (!blockId || value.blockId !== blockId) throw new Error('The selection does not match the active block.');
  // The user can scroll elsewhere while keeping a phrase selected.
  if (!Number.isInteger(value.page) || value.page < 1) throw new Error('Invalid selection page.');
  if (value.targetId !== undefined && (typeof value.targetId !== 'string' || !value.targetId || value.targetId.length > 1000)) throw new Error('Invalid selected field.');
  if ((value.start !== undefined || value.end !== undefined) && (!value.targetId || !Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start! < 0 || value.end! <= value.start!)) throw new Error('Invalid selected text range.');
  if (value.quote !== undefined && (typeof value.quote !== 'string' || value.quote.length > 8000)) throw new Error('Selected text is too long. Select a shorter passage.');
  if (value.renderHash !== undefined && (typeof value.renderHash !== 'string' || value.renderHash.length > 128)) throw new Error('Invalid selection version.');
  if (value.revision !== undefined && (!Number.isInteger(value.revision) || value.revision < 0)) throw new Error('Invalid selection revision.');
  return { blockId, page: value.page,
    ...(value.targetId === undefined ? {} : { targetId: value.targetId }),
    ...(value.start === undefined ? {} : { start: value.start, end: value.end }),
    ...(value.quote === undefined ? {} : { quote: value.quote }),
    ...(value.renderHash === undefined ? {} : { renderHash: value.renderHash }),
    ...(value.revision === undefined ? {} : { revision: value.revision }),
  };
}
