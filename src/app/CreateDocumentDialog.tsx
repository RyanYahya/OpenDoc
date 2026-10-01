import type { DocumentFormat } from '../shared/types';
import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "./ui";
import { Icon } from "./ui/Icon";
import { createDocumentPrompt } from "./agentPrompts";
import type { Project } from "../shared/projects";
import type { TemplateItem } from "../shared/templates";
import type { ThemeSummary } from "../shared/themes";

/** OpenDoc never authors documents itself: this dialog prepares a prompt for the user's own agent. */
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
  const [brief, setBrief] = useState("");
  const briefField = useRef<HTMLTextAreaElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);
  const outputFormat = template ? template.descriptor.documentFormat ?? 'document' : format;
  const presentation = outputFormat === 'presentation';
  const noun = presentation ? 'presentation' : outputFormat ? 'document' : 'document or presentation';
  const prompt = createDocumentPrompt({
    format: outputFormat,
    project,
    template: template && { id: template.id, name: template.descriptor.name },
    theme,
    brief,
  });
  useEffect(() => { if (open) { setCopied(false); setError(""); } }, [open, prompt]);
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setError(""); }
    catch { setError("Select the prompt and copy it manually."); promptField.current?.focus(); promptField.current?.select(); }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog agent-prompt-dialog" initialFocus={briefField}>
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>Copy prompt for your agent</Dialog.Title>
        <Dialog.Description>Your coding agent creates the {noun} in this OpenDoc workspace. Describe what you need, copy the prompt, and paste it into your agent with any source material.</Dialog.Description>
        {(project || template || theme) && <div className="agent-prompt-context">
          {project && <p className="field-hint">Project: {project.name}</p>}
          {template && <p className="field-hint">Template: {template.descriptor.name}</p>}
          {theme && <p className="field-hint">Theme: {theme.name}</p>}
        </div>}
        <label className="create-field" htmlFor="create-brief">
          <span>Brief <span className="muted">(optional)</span></span>
          <textarea ref={briefField} id="create-brief" rows={4} maxLength={8000} value={brief} placeholder="Who it’s for, what it should say, and any design preferences." onChange={event => setBrief(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void copy(); }
          }} />
        </label>
        <label className="create-field" htmlFor="create-prompt">
          <span>Prompt</span>
          <textarea ref={promptField} id="create-prompt" className="prompt-example skill-invocation" readOnly rows={Math.min(14, Math.max(3, prompt.split('\n').length + 1))} value={prompt} />
        </label>
        <Button className="primary copy-prompt" onClick={() => void copy()}><Icon name={copied ? "check" : "copy"} size={16} />{copied ? "Copied" : "Copy prompt"}</Button>
        <span className="sr-only" role="status">{copied ? "Prompt copied. Paste it into your agent." : ""}</span>
        {error && <p className="comment-error" role="alert">{error}</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
