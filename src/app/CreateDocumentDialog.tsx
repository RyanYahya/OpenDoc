import type { DocumentFormat } from '../shared/types';
import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "./ui";
import { Icon } from "./ui/Icon";
import type { Project } from "../shared/projects";
import type { TemplateItem } from "../shared/templates";
import type { ThemeSummary } from "../shared/themes";

export function CreateDocumentDialog({ open, onOpenChange, project, theme, template, format }: {
  format?: DocumentFormat;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  theme?: ThemeSummary;
  template?: TemplateItem;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const promptField = useRef<HTMLTextAreaElement>(null);
  const outputFormat = template ? template.descriptor.documentFormat ?? 'document' : format;
  const presentation = outputFormat === 'presentation';
  const prompt = [
    outputFormat ? `Create a ${presentation ? 'presentation' : 'document'} in this OpenDoc workspace.` : 'Create a document or presentation in this OpenDoc workspace, following my brief.',
    'Read this workspace’s AGENTS.md and follow its opendoc-create workflow.',
    project && `Project: ${project.name} (${project.id}).`,
    template && `Use the ${template.descriptor.name} template (${template.id}).`,
    theme && `Use the ${theme.name} theme (${theme.id}).`,
    presentation ? 'Deliver a reviewed PDF and editable PowerPoint.' : outputFormat ? 'Deliver a reviewed PDF.' : 'Deliver a reviewed PDF, plus editable PowerPoint for a presentation.',
  ].filter(Boolean).join('\n');
  useEffect(() => { if (open) { setCopied(false); setError(""); } }, [open, prompt]);
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setError(""); }
    catch { setError("Select the prompt and copy it manually."); promptField.current?.focus(); promptField.current?.select(); }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog">
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>Create with your agent</Dialog.Title>
        <Dialog.Description>Paste this prompt into your coding agent in the OpenDoc workspace. Add your brief, material, and any design preferences. The agent follows the workspace’s creation workflow.</Dialog.Description>
        {project && <p className="field-hint">Project: {project.name}</p>}
        {theme && <p className="field-hint">Theme: {theme.name}</p>}
        <textarea ref={promptField} className="prompt-example skill-invocation" aria-label={presentation ? "Presentation creation prompt" : outputFormat ? "Document creation prompt" : "Creation prompt"} readOnly rows={Math.max(3, prompt.split('\n').length + 1)} value={prompt} />
        <Button className="primary copy-prompt" onClick={() => void copy()}><Icon name={copied ? "check" : "copy"} size={16} />{copied ? "Copied" : "Copy prompt"}</Button>
        <span className="sr-only" role="status">{copied ? "Prompt copied to clipboard." : ""}</span>
        {error && <p className="comment-error" role="alert">{error}</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
