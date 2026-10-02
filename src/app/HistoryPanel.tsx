import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { api } from './api';
import { Button, IconButton, useNotifications } from './ui';
import { Icon } from './ui/Icon';
import { formatFull, formatTime, formatTimeRange, formatWhen } from '../shared/dates';
import { historyHighlightCss, outlinedChanges } from './historyView';
import { compactDiff, compacts, diffWords, hasChanges, type DiffChunk } from '../shared/word-diff';
import { textLang } from '../shared/language';
import { describeVersions, groupVersions, historyChangeLabels, type VersionRun, type BlockHistory, type HistoryBlockChange, type HistoryComparison, type HistoryList, type HistorySummaryPart, type HistoryVersionSummary, type RestoreResult, type RestoreScope } from '../shared/history';
import './history.css';

export type HistoryTarget = { kind: 'document' } | { kind: 'block'; blockId: string };

const codeFile = /\.(?:tsx|jsx|ts|js|mjs)$/;
// Long wordings open in a compact view: each change with a few words around it.
const compactLength = 300;

/** A version description with block words quoted and isolated, so Arabic and English names keep their order. */
function Summary({ parts }: { parts: HistorySummaryPart[] }) {
  return <>{parts.map((part, index) => typeof part === 'string' ? <Fragment key={index}>{part}</Fragment> : <Fragment key={index}>“<bdi>{part.quote}</bdi>”</Fragment>)}</>;
}

/** Marked text keeps its surrounding spaces outside the mark, so only words are struck or underlined. */
function Marked({ text, as: Tag }: { text: string; as: 'del' | 'ins' }) {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  return <>{lead}{core && <Tag>{core}</Tag>}{trail}</>;
}

function Side({ chunks, side }: { chunks: DiffChunk[]; side: 'before' | 'after' }) {
  return <>{chunks.map((chunk, index) => chunk.type === 'same' ? <Fragment key={index}>{chunk.text}</Fragment>
    : chunk.type === 'gap' ? <span key={index} className="history-gap">…</span>
      : <Marked key={index} text={side === 'before' ? chunk.removed : chunk.added} as={side === 'before' ? 'del' : 'ins'} />)}</>;
}

/** Earlier and current wording, with removed and added words marked; long text starts compact. */
function WordingDiff({ before, after }: { before?: string; after?: string }) {
  const [full, setFull] = useState(false);
  const diff = useMemo(() => before !== undefined && after !== undefined ? diffWords(before, after) : null, [before, after]);
  const empty = <em>No text</em>;
  if (!diff) return <dl className="history-diff">
    {before !== undefined && <div><dt>Then</dt><dd dir="auto" lang={textLang(before ?? '')}>{before || empty}</dd></div>}
    {after !== undefined && <div><dt>Now</dt><dd dir="auto" lang={textLang(after ?? '')}>{after || empty}</dd></div>}
  </dl>;
  if (!hasChanges(diff)) return <>
    <p className="history-note">Same wording; only layout or code changed.</p>
    <dl className="history-diff"><div><dt>Now</dt><dd dir="auto" lang={textLang(after ?? '')}>{after || empty}</dd></div></dl>
  </>;
  // A near-total rewrite reads better as two plain paragraphs than as one long strike-through.
  const marked = diff.kept >= 0.2;
  const long = marked && Math.max(before!.length, after!.length) > compactLength && compacts(diff.chunks, 8);
  const chunks = long && !full ? compactDiff(diff.chunks, 8) : diff.chunks;
  return <>
    <dl className={`history-diff${marked ? ' marked' : ''}`}>
      <div><dt>Then</dt><dd dir="auto" lang={textLang(before ?? '')}>{marked ? <Side chunks={chunks} side="before" /> : before || empty}</dd></div>
      <div><dt>Now</dt><dd dir="auto" lang={textLang(after ?? '')}>{marked ? <Side chunks={chunks} side="after" /> : after || empty}</dd></div>
    </dl>
    {long && <Button className="text-button history-expand" aria-expanded={full} onClick={() => setFull(value => !value)}>{full ? 'Show changes only' : 'Show full text'}</Button>}
  </>;
}

/** The authoring ID, for agents and support. It stays collapsed until asked for. */
function IdDetails({ id, file, region }: { id: string; file?: string; region: string }) {
  const notify = useNotifications();
  return <p className="history-details" id={region}>
    <span>ID</span> <code>{id}</code>
    <IconButton label="Copy ID" className="history-copy" onClick={() => void navigator.clipboard.writeText(id).then(() => notify.success('ID copied'), () => notify.error('The ID could not be copied. Select it and copy it instead.'))}><Icon name="copy" size={13} /></IconButton>
    {file && <><span className="history-details-file">in</span> <code>{file}</code></>}
  </p>;
}

/** A quiet toggle in an item's action row; the ID appears below the row only while it is open. */
function useIdDetails(id: string, file?: string) {
  const [open, setOpen] = useState(false);
  const region = `history-id-${useId()}`;
  return {
    toggle: <Button className="text-button history-details-toggle" aria-expanded={open} aria-controls={open ? region : undefined} onClick={() => setOpen(value => !value)}>Details</Button>,
    panel: open ? <IdDetails id={id} file={file} region={region} /> : null,
  };
}

function Origin({ version }: { version: HistoryVersionSummary }) {
  return <span className={`history-origin origin-${version.origin}`}>{version.label}</span>;
}

/** One way to restore an item: its scope, how the confirmation names it, and what the success notice calls it. */
interface RestoreOption { scope: RestoreScope; /** The scope in a few words, for the choice between two scopes. */ label: string; message: string; /** Such as “Section”. */ noun: string }

/**
 * A pending restore. Every restore is one action, “Restore”; the scope is named in its confirmation.
 * A section, slide, or other container whose own text and contents can both be restored offers
 * that choice there, starting with the narrower one.
 */
interface Confirming { key: string; versionId: string; blockId?: string; base?: string; options: RestoreOption[] }

const wholeVersion = (comparison: HistoryComparison, whole: string): Confirming => ({ key: 'version', versionId: comparison.version.id, base: comparison.base, options: [{
  scope: 'version', label: 'Whole version', noun: 'Version', message: `Restore the whole ${whole} to this version? Media files are not changed, and you can undo it.` }] });

/** Restore choices for one changed item in a version comparison, narrowest first. */
function changeOptions(change: HistoryBlockChange): RestoreOption[] {
  const kind = change.kindLabel.toLowerCase();
  const options: RestoreOption[] = [];
  if (change.block.ok) options.push(change.container
    ? { scope: 'block', label: 'Its own text', noun: `${change.kindLabel} text`, message: `Restore only this ${kind}’s own text, as shown above? What is inside it stays as it is now.` }
    : { scope: 'block', label: `This ${kind}`, noun: change.kindLabel, message: `Restore this ${kind} to its wording in this version? Everything else stays as it is.` });
  if (change.container && change.section.ok) options.push({ scope: 'section', label: 'With its contents', noun: change.kindLabel,
    message: `Restore this ${kind} and everything inside it to this version? The rest stays as it is.` });
  return options;
}

/** The History tab of the reader's side panel: browse recorded versions, inspect changed blocks, and restore with Undo. */
export function HistoryPanel({ documentId, target, generation, connected, pageLabel, unsaved, saving, onSave, onDiscard, onJump, onShowDocument, onClose }: {
  documentId: string;
  target: HistoryTarget;
  generation: number;
  connected: boolean;
  pageLabel: string;
  unsaved: number;
  saving: boolean;
  onSave: () => Promise<boolean | undefined>;
  onDiscard: () => void;
  onJump: (ids: string[]) => void;
  onShowDocument: () => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<HistoryList | null>(null);
  const [block, setBlock] = useState<BlockHistory | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [comparison, setComparison] = useState<HistoryComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [scope, setScope] = useState<RestoreScope | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [focused, setFocused] = useState<HistoryBlockChange | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef(0);
  const notify = useNotifications();
  const blocked = unsaved > 0 || saving;
  const blockId = target.kind === 'block' ? target.blockId : null;
  const whole = pageLabel === 'Slide' ? 'presentation' : 'document';

  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    setLoading(true);
    try {
      if (blockId) {
        const value = await api<BlockHistory>(`/api/documents/${documentId}/history/blocks/${encodeURIComponent(blockId)}`);
        if (sequence === request.current) { setBlock(value); setError(''); }
      } else {
        const value = await api<HistoryList>(`/api/documents/${documentId}/history`);
        const compared = selected ? await api<HistoryComparison>(`/api/documents/${documentId}/history/${selected}`).catch(() => null) : null;
        if (sequence === request.current) { setList(value); setComparison(compared); if (selected && !compared) setSelected(null); setError(''); }
      }
    } catch (failure) { if (sequence === request.current) { setError((failure as Error).message); setBlock(null); } }
    finally { if (sequence === request.current) setLoading(false); }
  }, [documentId, blockId, selected]);

  // The document changed (an edit, an agent write, or a restore): the comparison is against the new current source.
  useEffect(() => { void refresh(); }, [refresh, generation]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [blockId, selected]);
  useEffect(() => { setConfirming(null); setFocused(null); }, [selected, blockId]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      event.preventDefault();
      if (confirming) setConfirming(null); else onClose();
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [confirming, onClose]);

  const days = useMemo(() => groupVersions(list?.versions ?? []), [list]);

  const highlight = useMemo(() => {
    if (blockId && block) return historyHighlightCss([], [block.id]);
    if (!comparison) return '';
    return historyHighlightCss(outlinedChanges(comparison.blocks), focused && focused.status !== 'removed' ? [focused.id] : []);
  }, [comparison, focused, block, blockId]);

  async function restore(item: Confirming, option: RestoreOption) {
    if (restoring || blocked || !connected) return;
    setRestoring(true); setError('');
    try {
      const body = { scope: option.scope, ...(item.blockId ? { blockId: item.blockId } : {}), ...(item.base ? { base: item.base } : {}) };
      const result = await api<RestoreResult>(`/api/documents/${documentId}/history/${item.versionId}/restore`, { method: 'POST', body: JSON.stringify(body) });
      setConfirming(null);
      notify.success(`${option.noun} restored`, { label: 'Undo', onClick: async () => {
        await api<RestoreResult>(`/api/documents/${documentId}/history/${result.previous}/restore`, { method: 'POST', body: JSON.stringify({ scope: option.scope, ...(item.blockId ? { blockId: item.blockId } : {}) }) });
        notify.success('Restore undone');
      } });
      if (option.scope === 'version') setSelected(null);
      await refresh();
    } catch (failure) { setError((failure as Error).message); }
    finally { setRestoring(false); }
  }

  function confirmRow(item: Confirming) {
    if (confirming?.key !== item.key) return null;
    const option = item.options.find(entry => entry.scope === scope) ?? item.options[0];
    return <div className="history-confirm" role="group" aria-label="Confirm restore">
      {item.options.length > 1 && <ToggleGroup className="history-scope" aria-label="What to restore" value={[option.scope]}
        onValueChange={values => { const next = item.options.find(entry => entry.scope === values[0]); if (next) setScope(next.scope); }}>
        {item.options.map(entry => <Toggle key={entry.scope} value={entry.scope} className="ui-button tool-button" data-static>{entry.label}</Toggle>)}
      </ToggleGroup>}
      <p aria-live="polite">{option.message}</p>
      <div className="history-confirm-actions">
        <Button disabled={restoring} onClick={() => setConfirming(null)}>Cancel</Button>
        <Button className="primary" disabled={restoring || blocked || !connected} onClick={() => void restore(item, option)}>{restoring ? 'Restoring…' : 'Restore'}</Button>
      </div>
    </div>;
  }

  /** The one restore action of an item; its accessible name adds the scope, and the item's heading describes it. */
  function action(item: Confirming, name: string, describedBy?: string) {
    const open = confirming?.key === item.key;
    return <Button className="history-action" disabled={restoring || blocked || !connected} aria-expanded={open} aria-label={`Restore ${name}`} aria-describedby={describedBy}
      onClick={() => { setScope(item.options[0]?.scope ?? null); setConfirming(open ? null : item); }}>Restore</Button>;
  }

  function versionRow(version: HistoryVersionSummary, nested = false) {
    return <li key={version.id}>
      <Button static className="history-version" onClick={() => setSelected(version.id)}>
        <span className="history-version-title"><Summary parts={describeVersions([version])} /></span>
        <span className="history-version-meta">
          <time dateTime={version.at} title={formatFull(version.at)}>{formatTime(version.at)}</time>
          {!nested && <Origin version={version} />}
        </span>
        {version.unavailable && <span className="history-warning">Some files are still syncing or missing</span>}
      </Button>
    </li>;
  }

  function runRow(run: VersionRun) {
    if (run.versions.length === 1) return versionRow(run.versions[0]);
    const open = expanded.has(run.key);
    const [newest] = run.versions, oldest = run.versions.at(-1)!;
    const toggle = () => setExpanded(current => { const next = new Set(current); if (open) next.delete(run.key); else next.add(run.key); return next; });
    return <li key={run.key} className="history-run">
      <Button static className="history-version history-run-toggle" aria-expanded={open} aria-controls={`history-run-${run.key}`} onClick={toggle}>
        <span className="history-version-title"><Summary parts={describeVersions(run.versions)} /></span>
        <span className="history-version-meta">
          <time dateTime={oldest.at} title={`${formatFull(oldest.at)} to ${formatFull(newest.at)}`}>{formatTimeRange(oldest.at, newest.at)}</time>
          <Origin version={newest} />
          <span className="history-run-count">{run.versions.length} versions<Icon name="down" size={12} /></span>
        </span>
      </Button>
      {open && <ol id={`history-run-${run.key}`} className="history-run-versions">{run.versions.map(version => versionRow(version, true))}</ol>}
    </li>;
  }

  const selectedVersion = list?.versions.find(version => version.id === selected) ?? comparison?.version;
  const title = blockId ? block ? `${block.kindLabel} history` : 'History' : selectedVersion ? formatWhen(selectedVersion.at) : 'History';
  const differing = comparison?.blocks.filter(item => item.status !== 'contents').length ?? 0;
  const otherFiles = comparison?.files.filter(file => !codeFile.test(file.path)) ?? [];

  return <section className="history-panel" id="reader-history" aria-labelledby="history-heading" aria-busy={loading || restoring}>
    {highlight && <style>{highlight}</style>}
    {/* The side panel's tab already names the list, so its heading is only read aloud there. */}
    <div className={`history-heading${selected || blockId ? '' : ' sr-only'}`}>
      {(selected || blockId) && <IconButton label={blockId ? 'Show document history' : 'All versions'} className="history-back" onClick={() => { if (blockId) onShowDocument(); else setSelected(null); }}><Icon name="left" size={15} /></IconButton>}
      <div className="history-title">
        <h2 id="history-heading" ref={heading} tabIndex={-1} title={selectedVersion && !blockId ? formatFull(selectedVersion.at) : undefined}>{title}</h2>
        {selectedVersion && !blockId && <p><Origin version={selectedVersion} /><span className="history-title-summary"><Summary parts={describeVersions([selectedVersion])} /></span></p>}
        {blockId && block && <p><span>{block.kindLabel}</span>{block.name && <span className="history-title-summary">“<bdi lang={textLang(block.name)}>{block.name}</bdi>”</span>}</p>}
      </div>
    </div>
    <div className="history-content">
      {blocked && <div className="history-notice" role="status">
        <p><strong>{saving ? 'Saving your changes…' : `Save or discard ${unsaved} unsaved ${unsaved === 1 ? 'change' : 'changes'} first`}</strong>Restoring replaces the saved source, so drafts must be settled before you restore.</p>
        {!saving && <div className="history-notice-actions"><Button onClick={onDiscard}>Discard</Button><Button className="primary" onClick={() => void onSave()}>Save all</Button></div>}
      </div>}
      {/* While disconnected, this one notice explains both the missing list and the paused restores. */}
      {!connected && <p className="history-notice" role="status">OpenDoc can’t reach the local server. Versions load again, and restores resume, once it reconnects.</p>}
      {error && connected && <p className="history-error" role="alert">{error}</p>}
      {loading && !list && !block && !error && <div className="history-skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {blockId && block && <>
        <div className="history-block-current">
          <span className="history-meta">Now{block.resolution === 'enclosing' ? `, the ${block.kindLabel.toLowerCase()} containing your selection` : ''}</span>
          <p dir="auto" lang={textLang(block.current)}>{block.current || <em>No text</em>}</p>
        </div>
        {block.entries.length ? <ol className="history-entries">{block.entries.map(entry => {
          const kind = block.kindLabel.toLowerCase();
          const item: Confirming = { key: entry.version.id, versionId: entry.version.id, blockId: block.id, base: block.base, options: [{
            scope: entry.container ? 'section' : 'block', label: kind, noun: block.kindLabel,
            message: `Restore this ${kind}${entry.container ? ' and everything inside it' : ''} to its wording from ${formatFull(entry.version.at)}? The rest of the ${whole} stays as it is.` }] };
          return <li key={entry.version.id} className="history-entry">
            <div className="history-entry-meta"><time dateTime={entry.version.at} title={formatFull(entry.version.at)}>{formatWhen(entry.version.at)}</time><Origin version={entry.version} /></div>
            <WordingDiff before={entry.text} after={block.current} />
            <div className="history-entry-actions">{action(item, `this ${kind} from ${formatWhen(entry.version.at)}`)}</div>
            {confirmRow(item)}
          </li>;
        })}</ol> : !loading && <div className="history-empty"><strong>No earlier wording</strong><p>This {block.kindLabel.toLowerCase()} has not changed in the recorded history. Versions are kept for 90 days.</p></div>}
        <BlockIdDetails id={block.id} />
        <Button className="text-button history-link" onClick={onShowDocument}>Show all versions of the {whole}</Button>
      </>}

      {!blockId && !selected && list && (list.versions.length ? <>
        {days.map(day => <section key={day.key} className="history-day" aria-labelledby={`history-day-${day.key}`}>
          <h3 id={`history-day-${day.key}`}>{day.day}</h3>
          <ol>{day.runs.map(runRow)}</ol>
        </section>)}
        <p className="history-footnote">OpenDoc records a version when your edits are saved, when your agent changes the source, and before and after every restore. Versions are kept for {list.retentionDays} days and travel with the {whole}.</p>
      </> : <div className="history-empty"><strong>No versions yet</strong><p>OpenDoc records a version whenever this {whole}’s text changes: your saved edits, your agent’s changes, and restores. Versions are kept for {list.retentionDays} days.</p></div>)}

      {!blockId && selected && comparison && <>
        {comparison.identical ? <p className="history-summary-line">This version matches the current {whole}.</p> : <>
          <p className="history-summary-line">{comparison.blocks.length ? `${differing} ${differing === 1 ? 'change' : 'changes'} from now` : 'Only layout, code, or data files differ from now'}</p>
          {!!comparison.blocks.length && <ol className="history-changes">{comparison.blocks.map(change => <ChangeItem key={`${change.file}:${change.id}`} change={change}
            inside={comparison.blocks.filter(item => item.parent === change.id).length} pageLabel={pageLabel} onJump={onJump} onFocusChange={setFocused}
            item={{ key: `change:${change.file}:${change.id}`, versionId: comparison.version.id, blockId: change.id, base: comparison.base, options: changeOptions(change) }}
            action={action} confirmRow={confirmRow} />)}</ol>}
          {!!otherFiles.length && <div className="history-files">
            <h3>Other files</h3>
            <ul>{otherFiles.map(file => <li key={file.path}><code>{file.path}</code> <span>{file.status === 'added' ? 'added since' : file.status === 'removed' ? 'removed since' : 'changed'}</span></li>)}</ul>
          </div>}
          <div className="history-whole">
            <div className="history-whole-row">
              <div><h3 id="history-whole-heading">Whole version</h3><p>{otherFiles.length ? 'Brings back these files too.' : 'Every change above at once.'} Media files are not changed.</p></div>
              {action(wholeVersion(comparison, whole), 'whole version', 'history-whole-heading')}
            </div>
            {confirmRow(wholeVersion(comparison, whole))}
          </div>
        </>}
      </>}
    </div>
  </section>;
}

/** The ID of the block whose history is shown, under its own Details toggle. */
function BlockIdDetails({ id }: { id: string }) {
  const details = useIdDetails(id);
  return <div className="history-block-details">{details.toggle}{details.panel}</div>;
}

/** One changed item of a version: its name, earlier and current wording, and one Restore. */
function ChangeItem({ change, inside, pageLabel, item, onJump, onFocusChange, action, confirmRow }: {
  change: HistoryBlockChange; inside: number; pageLabel: string; item: Confirming;
  onJump: (ids: string[]) => void; onFocusChange: (update: (current: HistoryBlockChange | null) => HistoryBlockChange | null) => void;
  action: (item: Confirming, name: string, describedBy?: string) => ReactNode; confirmRow: (item: Confirming) => ReactNode;
}) {
  const details = useIdDetails(change.id, change.file);
  const heading = `history-change-${useId()}`;
  const kind = change.kindLabel.toLowerCase();
  const reason = !item.options.length ? change.block.reason ?? change.section.reason : undefined;
  const leave = () => onFocusChange(current => current === change ? null : current);
  return <li className={`history-change status-${change.status}`}
    onPointerEnter={() => onFocusChange(() => change)} onPointerLeave={leave}
    onFocus={() => onFocusChange(() => change)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) leave(); }}>
    <div className="history-change-heading" id={heading}>
      <span className="history-change-name">{change.name ? <>“<bdi lang={textLang(change.name)}>{change.name}</bdi>”</> : change.kindLabel}</span>
      <span className="history-change-meta">{change.name ? `${change.kindLabel} · ` : ''}{historyChangeLabels[change.status]}</span>
    </div>
    {/* A container's own text is what its Then and Now rows show; the changes inside it are listed separately. */}
    {change.status === 'contents' ? <p className="history-note">{inside ? `${inside} ${inside === 1 ? 'change' : 'changes'} inside it, listed separately.` : 'Its contents changed.'}</p>
      : change.status !== 'moved' && change.status !== 'ambiguous' && <WordingDiff before={change.before} after={change.after} />}
    {reason && <p className="history-note">{reason}</p>}
    <div className="history-entry-actions">
      {change.status !== 'removed' && <Button className="text-button" onClick={() => onJump([change.id, ...change.descendants])}>Show on {pageLabel.toLowerCase()}</Button>}
      {details.toggle}
      {item.options.length > 0 && action(item, `this ${kind}`, heading)}
    </div>
    {details.panel}
    {confirmRow(item)}
  </li>;
}
