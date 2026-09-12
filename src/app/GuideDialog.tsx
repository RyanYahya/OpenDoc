import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Button, Dialog } from './ui';
import { Icon } from './ui/Icon';
import type { GuideLocation } from './guideLinks';
import './guides.css';

let markdownModule: Promise<typeof import('./Markdown')> | undefined;
function loadMarkdown() {
  markdownModule ??= import('./Markdown').catch(error => { markdownModule = undefined; throw error; });
  return markdownModule;
}
type GuideVisit = GuideLocation & { scrollTop?: number };

export function GuideDialog({ kind, id, name, generation }: { kind: 'template' | 'theme'; id: string; name: string; generation: number | string }) {
  const template = kind === 'template';
  const initialFile = template ? `templates/${id}/AGENTS.md` : `themes/${id}/design.md`;
  const title = template ? 'AGENTS.md' : 'Design guide';
  const body = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [visits, setVisits] = useState<GuideVisit[]>([{ file: initialFile }]);
  const visit = visits.at(-1)!;
  const [content, setContent] = useState<{ key: string; markdown: string; file: string; Renderer: typeof import('./Markdown')['Markdown'] }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([visit.file, generation, attempt]);
  const guide = content?.key === key ? content : undefined;
  const Markdown = guide?.Renderer;
  const initial = visit.file === initialFile;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(''); setContent(undefined);
    void api<{ markdown: string; file: string }>(`/api/guides?path=${encodeURIComponent(visit.file)}`, { signal: controller.signal })
      .then(async result => {
        if (controller.signal.aborted) return;
        const { Markdown } = await loadMarkdown();
        if (!controller.signal.aborted) setContent({ key, ...result, Renderer: Markdown });
      })
      .catch(error => { if (!controller.signal.aborted) { setError(error.message); body.current?.focus({ preventScroll: true }); } });
    return () => controller.abort();
  }, [open, visit.file, key]);

  const restorePosition = useCallback(() => {
    const container = body.current;
    if (!container) return;
    const heading = visit.fragment ? container.querySelector<HTMLElement>(`[data-guide-heading="${CSS.escape(visit.fragment)}"]`) : null;
    if (visit.scrollTop !== undefined) container.scrollTop = visit.scrollTop;
    else if (heading) heading.scrollIntoView({ block: 'start' });
    else container.scrollTop = 0;
    container.focus({ preventScroll: true });
  }, [visit.file, visit.fragment, visit.scrollTop, visits.length]);

  function navigate(next: GuideLocation) {
    setError('');
    const scrollTop = body.current?.scrollTop ?? 0;
    setVisits(previous => [...previous.slice(0, -1), { ...previous.at(-1)!, scrollTop }, next]);
  }

  return <Dialog.Root open={open} onOpenChange={next => { if (next) { setVisits([{ file: initialFile }]); setError(''); } setOpen(next); }}>
    <Dialog.Trigger render={<Button className={`text-button${template ? ' template-guide-trigger' : ''}`} />}>{template ? 'View AGENTS.md' : <>Design guide<Icon name="arrow" size={16} /></>}</Dialog.Trigger>
    <Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" />
      <Dialog.Popup className="help-dialog template-guide-dialog">
        <header className="template-guide-heading">
          <Dialog.Title>{initial ? title : visit.file.split('/').at(-1)}</Dialog.Title>
          <Dialog.Description>{initial ? name : visit.file}</Dialog.Description>
          <Dialog.Close render={<Button className="icon-button modal-close" aria-label={template ? 'Close template guide' : 'Close design guide'} />}><Icon name="close" /></Dialog.Close>
          {visits.length > 1 && <Button className="text-button guide-back" onClick={() => { setError(''); setVisits(previous => previous.length > 1 ? previous.slice(0, -1) : previous); }}><Icon name="left" size={15} />Back to {visits.at(-2)!.file === initialFile ? title : visits.at(-2)!.file.split('/').at(-1)}</Button>}
        </header>
        <div ref={body} className="template-guide-body" tabIndex={0} role="region" aria-label={template ? 'Template guide content' : `${name} design guide`} aria-busy={!guide && !error}>
          {error ? <div role="alert"><p>{initial ? template ? 'Could not load this template’s AGENTS.md.' : 'Could not load this theme’s design guide.' : 'Could not load this guide.'}</p><p>{error}</p><Button onClick={() => { body.current?.focus(); setAttempt(value => value + 1); }}>Try again</Button></div>
            : !guide ? <p role="status">Loading guide…</p>
              : guide.markdown.trim() && Markdown ? <Markdown file={guide.file} onNavigate={navigate} onReady={restorePosition}>{guide.markdown}</Markdown>
                : <p>{initial ? template ? 'This template’s AGENTS.md is empty.' : 'This theme’s design guide is empty.' : 'This guide is empty.'}</p>}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
