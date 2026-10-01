import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';
import { Icon } from './ui/Icon';

/** Comments are applied by the user's own agent; this footer hands it a ready prompt. */
export function CommentHandoff({ openCount, prompt }: { openCount: number; prompt: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setCopied(false); }, [prompt, openCount]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 4000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => { if (manual) { field.current?.focus(); field.current?.select(); } }, [manual]);

  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setManual(false); }
    catch { setManual(true); }
  }

  return <div className="comment-handoff">
    <div className="comment-handoff-row">
      <span className="comment-handoff-status" aria-hidden={copied || undefined}>{copied ? 'Prompt copied' : `${openCount} open ${openCount === 1 ? 'comment' : 'comments'}`}</span>
      <Button className="comment-handoff-copy" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={14} />Copy prompt for your agent</Button>
    </div>
    <span className="sr-only" role="status">{copied ? 'Prompt copied. Paste it into your agent.' : ''}</span>
    {manual && <>
      <p className="comment-error" role="alert">Copying isn’t available here. Select the prompt and copy it manually.</p>
      <textarea ref={field} className="prompt-example comment-handoff-prompt" aria-label="Prompt for your agent" readOnly rows={prompt.split('\n').length + 1} value={prompt} />
    </>}
  </div>;
}
