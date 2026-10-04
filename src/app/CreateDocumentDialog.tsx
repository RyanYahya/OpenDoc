import type { DocumentFormat } from '../shared/types';
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Button, Dialog, SelectControl } from "./ui";
import { Icon } from "./ui/Icon";
import "./handoffs.css";
import { api } from "./api";
import { createDocumentPrompt, type ProjectThemeChoice } from "./agentPrompts";
import type { PendingHandoff } from "./pendingHandoffStore";
import { projectDefaultTheme, type Project } from "../shared/projects";
import type { TemplateItem } from "../shared/templates";
import type { ThemeSummary } from "../shared/themes";
import { themeChoiceLabel, type ThemeFoldersManifest } from "../shared/theme-folders";
import { itemType, typeLabel, type TagsManifest } from "../shared/tags";
import { textLang } from "../shared/language";

/** What an entry point already knows: the project page its project, a template or theme page its choice. */
export interface CreatePreset {
  format?: DocumentFormat;
  projectId?: string;
  themeId?: string;
  template?: { id: string; name: string; format: DocumentFormat };
}

/** A copied prompt, before the app adds the workspace snapshot it waits against. */
export type CopiedHandoff = Omit<PendingHandoff, 'knownIds'>;

const projectDefault = '__project_default__';
const noTemplate = '__no_template__';
const lastProjectKey = 'opendoc:create-project';
const shortcut = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

function rememberedProject(projects: Project[]) {
  let id: string | null = null;
  try { id = localStorage.getItem(lastProjectKey); } catch { /* Fall back to the only project, if any. */ }
  return projects.find(project => project.id === id)?.id ?? (projects.length === 1 ? projects[0].id : '');
}

/**
 * OpenDoc never authors documents itself: this dialog prepares a prompt for the user's own agent,
 * with the choices it should honor, and the library then waits for the result to appear.
 */
export function CreateDocumentDialog({ open, onOpenChange, finalFocus, preset = {}, projects, themes = [], themeFolders, tags, generation = 0, onCopied }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the dialog closes; by default, the element that had it before. */
  finalFocus?: () => HTMLElement | boolean;
  preset?: CreatePreset;
  projects: Project[];
  /** The workspace themes, to choose from, to name the project's default, and to notice a removed one. */
  themes?: ThemeSummary[];
  themeFolders?: ThemeFoldersManifest;
  tags?: TagsManifest;
  generation?: number;
  onCopied?: (handoff: CopiedHandoff) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState<DocumentFormat>('document');
  const [projectId, setProjectId] = useState('');
  const [themeId, setThemeId] = useState(projectDefault);
  const [template, setTemplate] = useState<CreatePreset['template']>();
  const [templates, setTemplates] = useState<TemplateItem[]>();
  const handoffId = useRef('');
  const briefField = useRef<HTMLTextAreaElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);

  // Each opening starts from its entry point; an unsent brief survives closing by accident.
  useEffect(() => {
    if (!open) return;
    if (handoffId.current) setBrief('');
    handoffId.current = '';
    setFormat(preset.template?.format ?? preset.format ?? 'document');
    setProjectId(preset.projectId ?? rememberedProject(projects));
    setThemeId(preset.themeId ?? projectDefault);
    setTemplate(preset.template);
    setCopied(false); setError('');
    // Presets are read once per opening; later catalog refreshes must not reset the user's choices.
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void api<TemplateItem[]>('/api/templates', { signal: controller.signal }).then(setTemplates, () => { if (!controller.signal.aborted) setTemplates([]); });
    return () => controller.abort();
  }, [open, generation]);

  const project = projects.find(item => item.id === projectId);
  const explicitTheme = themeId === projectDefault ? undefined : themes.find(item => item.id === themeId);
  const defaultId = project ? projectDefaultTheme(project, format) : null;
  const defaultTheme = defaultId ? themes.find(item => item.id === defaultId && !item.error) : undefined;
  // Before themes load, every default would look missing.
  const missingDefault = Boolean(defaultId && themes.length && !defaultTheme);
  const projectThemes: ProjectThemeChoice[] = !explicitTheme && defaultTheme ? [{ format, id: defaultTheme.id, name: defaultTheme.name }] : [];
  const noun = format === 'presentation' ? 'presentation' : 'document';
  const prompt = createDocumentPrompt({
    format,
    project,
    template: template && { id: template.id, name: template.name },
    theme: explicitTheme,
    projectThemes,
    brief,
  });
  // A changed prompt needs copying again; the step strip and button say so.
  useEffect(() => { setCopied(false); setError(''); }, [prompt]);

  function changeFormat(next: DocumentFormat) {
    setFormat(next);
    if (template && template.format !== next) setTemplate(undefined);
  }
  function changeProject(next: string) {
    setProjectId(next);
    try { if (next) localStorage.setItem(lastProjectKey, next); } catch { /* A convenience only. */ }
  }
  function record() {
    handoffId.current ||= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    onCopied?.({
      id: handoffId.current, copiedAt: Date.now(), format, prompt, brief: brief.trim(),
      projectId: project?.id, projectName: project?.name,
      themeName: explicitTheme?.name ?? defaultTheme?.name, templateName: template?.name,
    });
    setCopied(true); setError('');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); record(); }
    catch { setError("Copying isn’t available here. Select the prompt and copy it manually."); promptField.current?.focus(); promptField.current?.select(); }
  }
  function shortcutCopy(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void copy(); }
  }

  const themeItems = [
    { value: projectDefault, label: defaultTheme ? `Project default: ${themeChoiceLabel(defaultTheme, themeFolders)}` : 'Let your agent choose' },
    ...themes.filter(item => !item.error).map(item => ({ value: item.id, label: themeChoiceLabel(item, themeFolders) })),
  ];
  const formatTemplates = (templates ?? []).filter(item => !item.error && (item.descriptor.documentFormat ?? 'document') === format);
  const templateLabel = (id: string, name: string) => {
    const type = tags && itemType(tags, 'templates', id);
    return type ? `${name} · ${typeLabel(type)}` : name;
  };
  const templateItems = [
    { value: noTemplate, label: templates ? formatTemplates.length ? 'No template' : `No ${noun} templates` : 'Loading templates…' },
    ...formatTemplates.map(item => ({ value: item.id, label: templateLabel(item.id, item.descriptor.name) })),
    // A preset template stays selectable while the catalog loads.
    ...(template && !formatTemplates.some(item => item.id === template.id) ? [{ value: template.id, label: templateLabel(template.id, template.name) }] : []),
  ];
  const destination = project ? project.name : format === 'presentation' ? 'Presentations' : 'Documents';
  const steps = ['Describe it', 'Copy the prompt', 'Paste into your agent'];
  const current = copied ? 2 : 0;

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog agent-handoff-dialog" initialFocus={briefField} finalFocus={finalFocus} onKeyDown={shortcutCopy}>
        <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close" />}><Icon name="close" /></Dialog.Close>
        <Dialog.Title>Create with your agent</Dialog.Title>
        <Dialog.Description>OpenDoc prepares the prompt. Your coding agent writes the {noun} in this workspace, and it appears here when it’s ready.</Dialog.Description>
        <ol className="handoff-steps">
          {steps.map((step, index) => {
            const done = index < current;
            return <li key={step} data-state={done ? 'done' : index === current ? 'current' : 'next'} aria-current={index === current ? 'step' : undefined}>
              <span className="handoff-step-mark" aria-hidden="true">{done ? <Icon name="check" size={12} /> : index + 1}</span>
              <span>{step}{done && <span className="sr-only"> (done)</span>}</span>
            </li>;
          })}
        </ol>
        <div className="handoff-layout">
          <div className="handoff-compose">
            <label className="create-field" htmlFor="create-brief">
              <span>Brief <span className="muted">(optional)</span></span>
              <textarea ref={briefField} id="create-brief" dir="auto" lang={textLang(brief)} rows={5} maxLength={8000} value={brief} placeholder="Who it’s for, what it should say, and any sources you’ll share with your agent." onChange={event => setBrief(event.target.value)} />
            </label>
            <fieldset className="handoff-choices">
              <legend>Choices</legend>
              <div className="handoff-choice">
                <span id="create-format-label">Format</span>
                <ToggleGroup className="handoff-format" aria-labelledby="create-format-label" value={[format]} onValueChange={values => { if (values[0] === 'document' || values[0] === 'presentation') changeFormat(values[0]); }}>
                  <Toggle className="ui-button tool-button" data-static value="document"><Icon name="document" size={15} />Document</Toggle>
                  <Toggle className="ui-button tool-button" data-static value="presentation"><Icon name="monitor" size={15} />Presentation</Toggle>
                </ToggleGroup>
              </div>
              <div className="handoff-choice">
                <span aria-hidden="true">Project</span>
                <SelectControl label="Project" value={projectId} onValueChange={changeProject} items={[{ value: '', label: 'Let your agent choose' }, ...projects.map(item => ({ value: item.id, label: item.name }))]} />
              </div>
              <div className="handoff-choice">
                <span aria-hidden="true">Theme</span>
                <SelectControl label="Theme" value={themeItems.some(item => item.value === themeId) ? themeId : projectDefault} onValueChange={setThemeId} items={themeItems} />
              </div>
              <div className="handoff-choice">
                <span aria-hidden="true">Template</span>
                <SelectControl label="Template" value={template?.id ?? noTemplate} onValueChange={value => {
                  const item = formatTemplates.find(entry => entry.id === value);
                  setTemplate(item ? { id: item.id, name: item.descriptor.name, format } : value === template?.id ? template : undefined);
                }} items={templateItems} />
              </div>
              {missingDefault && <p className="field-hint">The project’s default {noun} theme, {defaultId}, is no longer available. Your agent will help choose one, or change it in Project settings.</p>}
            </fieldset>
          </div>
          <label className="create-field handoff-preview" htmlFor="create-prompt">
            <span>Prompt</span>
            <textarea ref={promptField} id="create-prompt" className="prompt-example skill-invocation" readOnly value={prompt} onCopy={() => record()} />
          </label>
        </div>
        <div className="handoff-footer">
          <p className="handoff-outcome" aria-hidden="true">{copied ? `Copied. Paste it into your agent; ${destination} shows the ${noun} when it arrives.` : `Your ${noun} will appear in ${destination}.`}</p>
          <Button className="primary copy-prompt" data-copied={copied || undefined} aria-keyshortcuts="Control+Enter Meta+Enter" onClick={() => void copy()}><Icon name={copied ? "check" : "copy"} size={16} />{copied ? "Copied" : "Copy prompt"}<kbd aria-hidden="true">{shortcut} Enter</kbd></Button>
        </div>
        <span className="sr-only" role="status">{copied ? `Prompt copied. Paste it into your agent. ${destination} shows the ${noun} when it arrives.` : ""}</span>
        {error && <p className="comment-error" role="alert">{error}</p>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
