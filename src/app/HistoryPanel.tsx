import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { Button, IconButton, useNotifications } from './ui';
import { Icon } from './ui/Icon';
import { formatFull, formatTime, formatTimeRange, formatWhen } from '../shared/dates';
import { historyHighlightCss, outlinedChanges } from './historyView';
import { compactDiff, compacts, diffWords, hasChanges, type DiffChunk } from '../shared/word-diff';
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
    {before !== undefined && <div><dt>Then</dt><dd dir="auto">{before || empty}</dd></div>}
    {after !== undefined && <div><dt>Now</dt><dd dir="auto">{after || empty}</dd></div>}
  </dl>;
  if (!hasChanges(diff)) return <>
    <p className="history-note">Same wording; only layout or code changed.</p>
    <dl className="history-diff"><div><dt>Now</dt><dd dir="auto">{after || empty}</dd></div></dl>
  </>;
  // A near-total rewrite reads better as two plain paragraphs than as one long strike-through.
  const marked = diff.kept >= 0.2;
  const long = marked && Math.max(before!.length, after!.length) > compactLength && compacts(diff.chunks, 8);
  const chunks = long && !full ? compactDiff(diff.chunks, 8) : diff.chunks;
  return <>
    <dl className={`history-diff${marked ? ' marked' : ''}`}>
      <div><dt>Then</dt><dd dir="auto">{marked ? <Side chunks={chunks} side="before" /> : before || empty}</dd></div>
      <div><dt>Now</dt><dd dir="auto">{marked ? <Side chunks={chunks} side="after" /> : after || empty}</dd></div>
    </dl>
    {long && <Button className="text-button history-expand" aria-expanded={full} onClick={() => setFull(value => !value)}>{full ? 'Show changes only' : 'Show full text'}</Button>}
  </>;
}

/** The authoring ID stays available for agents and support, out of the reader's way. */
function BlockDetails({ id, file }: { id: string; file?: string }) {
  const notify = useNotifications();
  return <details className="history-details">
    <summary>Details</summary>
    <p>
      <span>ID</span> <code>{id}</code>
      <IconButton label="Copy ID" className="history-copy" onClick={() => void navigator.clipboard.writeText(id).then(() => notify.success('ID copied'), () => notify.error('The ID could not be copied. Select it and copy it instead.'))}><Icon name="copy" size={13} /></IconButton>
      {file && <><span className="history-details-file">in</span> <code>{file}</code></>}
    </p>
  </details>;
}

function Origin({ version }: { version: HistoryVersionSummary }) {
  return <span className={`history-origin origin-${version.origin}`}>{version.label}</span>;
}

const wholeVersion = (comparison: HistoryComparison): Confirming => ({ key: 'version', versionId: comparison.version.id, scope: 'version', base: comparison.base,
  message: 'Replace the whole document with this version? Media files are not changed, and you can undo the restore.' });

interface Confirming { key: string; versionId: string; scope: RestoreScope; blockId?: string; base?: string; message: string }

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

  async function restore(item: Confirming) {
    if (restoring || blocked || !connected) return;
    setRestoring(true); setError('');
    try {
      const body = { scope: item.scope, ...(item.blockId ? { blockId: item.blockId } : {}), ...(item.base ? { base: item.base } : {}) };
      const result = await api<RestoreResult>(`/api/documents/${documentId}/history/${item.versionId}/restore`, { method: 'POST', body: JSON.stringify(body) });
      setConfirming(null);
      const noun = item.scope === 'version' ? 'Version' : item.scope === 'section' ? 'Section' : 'Block';
      notify.success(`${noun} restored`, { label: 'Undo', onClick: async () => {
        await api<RestoreResult>(`/api/documents/${documentId}/history/${result.previous}/restore`, { method: 'POST', body: JSON.stringify({ scope: item.scope, ...(item.blockId ? { blockId: item.blockId } : {}) }) });
        notify.success('Restore undone');
      } });
      if (item.scope === 'version') setSelected(null);
      await refresh();
    } catch (failure) { setError((failure as Error).message); }
    finally { setRestoring(false); }
  }

  function confirmRow(item: Confirming) {
    if (confirming?.key !== item.key) return null;
    return <div className="history-confirm" role="group" aria-label="Confirm restore">
      <p>{item.message}</p>
      <div className="history-confirm-actions">
        <Button disabled={restoring} onClick={() => setConfirming(null)}>Cancel</Button>
        <Button className="primary" disabled={restoring || blocked || !connected} onClick={() => void restore(item)}>{restoring ? 'Restoring…' : 'Restore'}</Button>
      </div>
    </div>;
  }

  function action(label: string, item: Confirming) {
    return <Button className="history-action" disabled={restoring || blocked || !connected} aria-expanded={confirming?.key === item.key}
      onClick={() => setConfirming(confirming?.key === item.key ? null : item)}>{label}</Button>;
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
  const title = blockId ? 'Block history' : selectedVersion ? formatWhen(selectedVersion.at) : 'History';
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
        {blockId && block && <p><span>{block.kindLabel}</span>{block.name && <span className="history-title-summary">“<bdi>{block.name}</bdi>”</span>}</p>}
      </div>
    </div>
    <div className="history-content">
      {blocked && <div className="history-notice" role="status">
        <p><strong>{saving ? 'Saving your changes…' : `Save or discard ${unsaved} unsaved ${unsaved === 1 ? 'change' : 'changes'} first`}</strong>Restoring replaces the saved source, so drafts must be settled before you restore.</p>
        {!saving && <div className="history-notice-actions"><Button onClick={onDiscard}>Discard</Button><Button className="primary" onClick={() => void onSave()}>Save all</Button></div>}
      </div>}
      {!connected && <p className="history-notice" role="status">Reconnect to the local workspace to restore versions.</p>}
      {error && <p className="history-error" role="alert">{error}</p>}
      {loading && !list && !block && !error && <div className="history-skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {blockId && block && <>
        <div className="history-block-current">
          <span className="history-meta">Now{block.resolution === 'enclosing' ? `, the ${block.kindLabel.toLowerCase()} containing your selection` : ''}</span>
          <p dir="auto">{block.current || <em>No text</em>}</p>
        </div>
        {block.entries.length ? <ol className="history-entries">{block.entries.map(entry => {
          const scope: RestoreScope = entry.container ? 'section' : 'block';
          const item: Confirming = { key: entry.version.id, versionId: entry.version.id, scope, blockId: block.id, base: block.base,
            message: `Replace this ${scope} with its wording from ${formatFull(entry.version.at)}? The rest of the ${whole} stays as it is.` };
          return <li key={entry.version.id} className="history-entry">
            <div className="history-entry-meta"><time dateTime={entry.version.at} title={formatFull(entry.version.at)}>{formatWhen(entry.version.at)}</time><Origin version={entry.version} /></div>
            <WordingDiff before={entry.text} after={block.current} />
            <div className="history-entry-actions">{action(scope === 'section' ? 'Restore section' : 'Restore', item)}</div>
            {confirmRow(item)}
          </li>;
        })}</ol> : !loading && <div className="history-empty"><strong>No earlier wording</strong><p>This block has not changed in the recorded history. Versions are kept for 90 days.</p></div>}
        <BlockDetails id={block.id} />
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
          <p className="history-summary-line">{comparison.blocks.length ? `${differing} ${differing === 1 ? 'block differs' : 'blocks differ'} from now` : 'Only layout, code, or data files differ from now'}</p>
          {!!comparison.blocks.length && <ol className="history-changes">{comparison.blocks.map(change => {
            const blockItem: Confirming = { key: `block:${change.id}`, versionId: comparison.version.id, scope: 'block', blockId: change.id, base: comparison.base,
              message: change.container ? `Restore this ${change.kindLabel.toLowerCase()}’s own wording and keep the current blocks inside it?` : 'Replace this block with its wording from this version? Everything else stays as it is.' };
            const sectionItem: Confirming = { key: `section:${change.id}`, versionId: comparison.version.id, scope: 'section', blockId: change.id, base: comparison.base,
              message: `Replace this ${change.kindLabel.toLowerCase()}, including everything inside it, with this version? The rest stays as it is.` };
            const reason = !change.block.ok && !change.section.ok ? change.block.reason ?? change.section.reason : undefined;
            const inside = comparison.blocks.filter(item => item.parent === change.id).length;
            return <li key={`${change.file}:${change.id}`} className={`history-change status-${change.status}`}
              onPointerEnter={() => setFocused(change)} onPointerLeave={() => setFocused(current => current === change ? null : current)}
              onFocus={() => setFocused(change)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(current => current === change ? null : current); }}>
              <div className="history-change-heading">
                <span className="history-change-name">{change.name ? <>“<bdi>{change.name}</bdi>”</> : change.kindLabel}</span>
                <span className="history-change-meta">{change.name ? `${change.kindLabel} · ` : ''}{historyChangeLabels[change.status]}</span>
              </div>
              {change.status === 'contents' ? <p className="history-note">{inside ? `${inside} ${inside === 1 ? 'block' : 'blocks'} inside changed.` : 'Blocks inside it changed.'}</p>
                : change.status !== 'moved' && change.status !== 'ambiguous' && <WordingDiff before={change.before} after={change.after} />}
              {reason && <p className="history-note">{reason}</p>}
              <div className="history-entry-actions">
                {change.status !== 'removed' && <Button className="text-button" onClick={() => onJump([change.id, ...change.descendants])}>Show on {pageLabel.toLowerCase()}</Button>}
                {change.block.ok && action(change.container ? `Restore ${change.kindLabel.toLowerCase()} only` : 'Restore block', blockItem)}
                {change.container && change.section.ok && action(`Restore ${change.kindLabel.toLowerCase()}`, sectionItem)}
              </div>
              {confirmRow(blockItem)}
              {confirmRow(sectionItem)}
              <BlockDetails id={change.id} file={change.file} />
            </li>;
          })}</ol>}
          {!!otherFiles.length && <div className="history-files">
            <h3>Other files</h3>
            <ul>{otherFiles.map(file => <li key={file.path}><code>{file.path}</code> <span>{file.status === 'added' ? 'added since' : file.status === 'removed' ? 'removed since' : 'changed'}</span></li>)}</ul>
          </div>}
          <div className="history-whole">
            <p>{otherFiles.length ? 'To bring back these files too, restore' : 'Or restore'} the whole version. Media files are not changed, and you can undo it.</p>
            {action('Restore whole version', wholeVersion(comparison))}
            {confirmRow(wholeVersion(comparison))}
          </div>
        </>}
      </>}
    </div>
  </section>;
}
