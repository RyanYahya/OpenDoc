import type { DocumentFormat } from '../shared/types';

// Prompts the user pastes into their own coding agent. OpenDoc never runs them,
// and they must never carry local session details such as the server token.

export type ProjectThemeChoice = { format: DocumentFormat; id: string; name: string };

/** States the project's default for the requested format; an explicit theme replaces it. */
function projectThemeLine(defaults: ProjectThemeChoice[]) {
  const named = ({ id, name }: ProjectThemeChoice) => `${name} (${id})`;
  if (!defaults.length) return undefined;
  if (defaults.length === 1) return `Use the project’s default ${defaults[0].format} theme, ${named(defaults[0])}, unless my brief says otherwise.`;
  if (defaults.every(item => item.id === defaults[0].id)) return `Use the project’s default theme, ${named(defaults[0])}, unless my brief says otherwise.`;
  return `Unless my brief says otherwise, use the project’s default themes: ${defaults.map(item => `${item.format === 'presentation' ? 'presentations' : 'documents'}, ${named(item)}`).join('; ')}.`;
}

export function createDocumentPrompt({ format, project, template, theme, projectThemes = [], brief = '' }: {
  format?: DocumentFormat;
  project?: { id: string; name: string };
  template?: { id: string; name: string };
  theme?: { id: string; name: string };
  /** Available project defaults for the requested format, or both formats when it is open. */
  projectThemes?: ProjectThemeChoice[];
  brief?: string;
}) {
  const presentation = format === 'presentation';
  const details = brief.trim();
  return [
    format ? `Create a ${presentation ? 'presentation' : 'document'} in this OpenDoc workspace.` : 'Create a document or presentation in this OpenDoc workspace, following my brief.',
    'Read this workspace’s AGENTS.md and follow its opendoc-create workflow.',
    project && `Project: ${project.name} (${project.id}).`,
    template && `Use the ${template.name} template (${template.id}).`,
    theme ? `Use the ${theme.name} theme (${theme.id}).` : project && projectThemeLine(projectThemes),
    presentation ? 'Deliver a reviewed PDF and editable PowerPoint.' : format ? 'Deliver a reviewed PDF.' : 'Deliver a reviewed PDF, plus editable PowerPoint for a presentation.',
    details && `\nMy brief:\n<brief>\n${details}\n</brief>`,
  ].filter(Boolean).join('\n');
}

export function applyCommentsPrompt({ id, name, format }: { id: string; name?: string; format?: DocumentFormat }) {
  const presentation = format === 'presentation';
  return [
    `Apply the open comments on the ${presentation ? 'presentation' : 'document'} ${name && name !== id ? `“${name}” (${id})` : id} in this OpenDoc workspace.`,
    'Read this workspace’s AGENTS.md and follow its opendoc-apply-comments workflow.',
    'Resolve each comment only after its change is verified.',
    presentation ? 'Deliver the reviewed PDF and editable PowerPoint.' : 'Deliver the reviewed PDF.',
  ].join('\n');
}
