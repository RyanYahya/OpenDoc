import type { DocumentFormat } from '../shared/types';

// Prompts the user pastes into their own coding agent. OpenDoc never runs them,
// and they must never carry local session details such as the server token.

export function createDocumentPrompt({ format, project, template, theme, brief = '' }: {
  format?: DocumentFormat;
  project?: { id: string; name: string };
  template?: { id: string; name: string };
  theme?: { id: string; name: string };
  brief?: string;
}) {
  const presentation = format === 'presentation';
  const details = brief.trim();
  return [
    format ? `Create a ${presentation ? 'presentation' : 'document'} in this OpenDoc workspace.` : 'Create a document or presentation in this OpenDoc workspace, following my brief.',
    'Read this workspace’s AGENTS.md and follow its opendoc-create workflow.',
    project && `Project: ${project.name} (${project.id}).`,
    template && `Use the ${template.name} template (${template.id}).`,
    theme && `Use the ${theme.name} theme (${theme.id}).`,
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
