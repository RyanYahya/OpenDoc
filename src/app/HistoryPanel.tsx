import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { Button, IconButton, useNotifications } from './ui';
import { Icon } from './ui/Icon';
import type { BlockHistory, HistoryBlockChange, HistoryComparison, HistoryList, HistoryVersionSummary, RestoreResult, RestoreScope } from '../shared/history';
import './history.css';

export type HistoryTarget = { kind: 'document' } | { kind: 'block'; blockId: string };

const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const codeFile = /\.(?:tsx|jsx|ts|js|mjs)$/;
// Composite blocks render child targets from their own literal ID.
const derivedSuffixes = ['', '-heading', '-lead', '-title', '-subtitle', '-byline', '-eyebrow', '-caption'];
const statusLabels: Record<HistoryBlockChange['status'], string> = {
  changed: 'Changed', contents: 'Contents changed', added: 'Added since', removed: 'Removed since', moved: 'Moved', ambiguous: 'Duplicate ID',
};

function dayLabel(at: string, now = new Date()) {
  const date = new Date(at);
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

export function describeVersion(version: HistoryVersionSummary) {
  if (version.origin === 'baseline') return 'First recorded state';
  if (version.restore) return version.restore.scope === 'version' ? 'Restored an earlier version' : `Restored a ${version.restore.scope}`;
  const parts: string[] = [];
  if (version.summary.blocks) parts.push(`${version.summary.blocks} ${version.summary.blocks === 1 ? 'block' : 'blocks'} changed`);
  const others = version.summary.files.filter(file => !codeFile.test(file));
  if (others.length) parts.push(others.length === 1 ? `${others[0]} changed` : `${others.length} files changed`);
  return parts.join(' · ') || 'Source changed without text changes';
}

function highlightRules(ids: string[], className: string) {
  if (!ids.length) return '';
  const selectors = ids.flatMap(id => derivedSuffixes.flatMap(suffix => [
    `.component-target[data-block-id="${CSS.escape(id + suffix)}"]`,
    `.component-target[data-text-target^="${CSS.escape(`${id}${suffix}:`)}"]`,
  ]));
  return `:is(${selectors.join(', ')}) { ${className} }`;
}

const wholeVersion = (comparison: HistoryComparison): Confirming => ({ key: 'version', versionId: comparison.version.id, scope: 'version', base: comparison.base,
  message: 'Replace every text source with this version? Media files are not changed, and you can undo the restore.' });

interface Confirming { key: string; versionId: string; scope: RestoreScope; blockId?: string; base?: string; message: string }

/** A non-modal side panel: browse recorded versions, inspect changed blocks, and restore with Undo. */
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
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef(0);
  const notify = useNotifications();
  const blocked = unsaved > 0 || saving;
  const blockId = target.kind === 'block' ? target.blockId : null;

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

  const groups = useMemo(() => {
    const result: { day: string; versions: HistoryVersionSummary[] }[] = [];
    for (const version of list?.versions ?? []) {
      const day = dayLabel(version.at);
      if (result.at(-1)?.day === day) result.at(-1)!.versions.push(version); else result.push({ day, versions: [version] });
    }
    return result;
  }, [list]);

  const highlight = useMemo(() => {
    if (blockId && block) return highlightRules([block.id], 'background: var(--history-mark-strong); box-shadow: inset 0 0 0 1.5px var(--history-mark-line);');
    if (!comparison) return '';
    const changed = comparison.blocks.filter(item => item.status !== 'removed' && item.status !== 'contents').map(item => item.id);
    const strong = focused && focused.status !== 'removed' ? [focused.id, ...focused.descendants] : [];
    return [highlightRules(changed, 'background: var(--history-mark);'), highlightRules(strong, 'background: var(--history-mark-strong); box-shadow: inset 0 0 0 1.5px var(--history-mark-line);')].join('\n');
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

  function action(label: string, item: Confirming, primary = false) {
    return <Button className={primary ? 'history-action primary-action' : 'history-action'} disabled={restoring || blocked || !connected} aria-expanded={confirming?.key === item.key}
      onClick={() => setConfirming(confirming?.key === item.key ? null : item)}>{label}</Button>;
  }

  const selectedVersion = list?.versions.find(version => version.id === selected) ?? comparison?.version;
  const title = blockId ? 'Block history' : selectedVersion ? full.format(new Date(selectedVersion.at)) : 'History';

  return <section className="history-panel" id="reader-history" role="dialog" aria-modal="false" aria-labelledby="history-heading" aria-busy={loading || restoring}>
    {highlight && <style>{highlight}</style>}
    <div className="history-heading">
      {(selected || blockId) && <IconButton label={blockId ? 'Show document history' : 'All versions'} className="history-back" onClick={() => { if (blockId) onShowDocument(); else setSelected(null); }}><Icon name="left" size={15} /></IconButton>}
      <div className="history-title">
        <h2 id="history-heading" ref={heading} tabIndex={-1}>{title}</h2>
        {selectedVersion && !blockId && <p>{selectedVersion.label}</p>}
      </div>
      <IconButton label="Close history" onClick={onClose}><Icon name="close" size={15} /></IconButton>
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
          <span className="history-meta">{block.kind}{block.resolution === 'enclosing' ? ' containing your selection' : ''} · now</span>
          <p dir="auto">{block.current || <em>No text</em>}</p>
        </div>
        {block.entries.length ? <ol className="history-entries">{block.entries.map(entry => {
          const scope: RestoreScope = entry.container ? 'section' : 'block';
          const item: Confirming = { key: entry.version.id, versionId: entry.version.id, scope, blockId: block.id, base: block.base,
            message: `Replace this ${scope} with its wording from ${full.format(new Date(entry.version.at))}? The rest of the ${pageLabel.toLowerCase() === 'slide' ? 'presentation' : 'document'} stays as it is.` };
          return <li key={entry.version.id} className="history-entry">
            <div className="history-entry-meta"><time dateTime={entry.version.at} title={full.format(new Date(entry.version.at))}>{dayLabel(entry.version.at)}, {time.format(new Date(entry.version.at))}</time><span>{entry.version.label}</span></div>
            <p className="history-excerpt" dir="auto">{entry.text || <em>No text</em>}</p>
            <div className="history-entry-actions">{action(scope === 'section' ? 'Restore section' : 'Restore', item)}</div>
            {confirmRow(item)}
          </li>;
        })}</ol> : !loading && <div className="history-empty"><strong>No earlier wording</strong><p>This block has not changed in the recorded history. Versions are kept for 90 days.</p></div>}
        <Button className="text-button history-link" onClick={onShowDocument}>Show all versions of the {pageLabel === 'Slide' ? 'presentation' : 'document'}</Button>
      </>}

      {!blockId && !selected && list && (list.versions.length ? <>
        {groups.map(group => <section key={group.day} className="history-day" aria-labelledby={`history-day-${group.versions[0].id}`}>
          <h3 id={`history-day-${group.versions[0].id}`}>{group.day}</h3>
          <ol>{group.versions.map(version => <li key={version.id}>
            <Button static className="history-version" onClick={() => setSelected(version.id)}>
              <span className="history-version-line"><time dateTime={version.at} title={full.format(new Date(version.at))}>{time.format(new Date(version.at))}</time><span className={`history-origin origin-${version.origin}`}>{version.label}</span></span>
              <span className="history-summary">{describeVersion(version)}</span>
              {version.unavailable && <span className="history-warning">Some files are still syncing or missing</span>}
            </Button>
          </li>)}</ol>
        </section>)}
        <p className="history-footnote">OpenDoc records a version when your edits are saved, when your agent changes the source, and before and after every restore. Versions are kept for {list.retentionDays} days, in the document’s .history folder.</p>
      </> : <div className="history-empty"><strong>No versions yet</strong><p>OpenDoc records a version whenever this document’s text changes: your saved edits, your agent’s changes, and restores. Versions are kept for {list.retentionDays} days.</p></div>)}

      {!blockId && selected && comparison && <>
        {comparison.identical ? <p className="history-summary-line">This version matches the current source.</p> : <>
          <div className="history-version-actions">
            <p className="history-summary-line">{comparison.blocks.length ? `${comparison.blocks.filter(item => item.status !== 'contents').length} ${comparison.blocks.filter(item => item.status !== 'contents').length === 1 ? 'block differs' : 'blocks differ'} from now` : 'Only non-text files differ'}</p>
            {action('Restore whole version', wholeVersion(comparison), true)}
          </div>
          {confirmRow(wholeVersion(comparison))}
          {!!comparison.blocks.length && <ol className="history-changes">{comparison.blocks.map(change => {
            const blockItem: Confirming = { key: `block:${change.id}`, versionId: comparison.version.id, scope: 'block', blockId: change.id, base: comparison.base,
              message: change.container ? 'Restore this block’s own wording and keep the current blocks inside it?' : 'Replace this block with its wording from this version? Everything else stays as it is.' };
            const sectionItem: Confirming = { key: `section:${change.id}`, versionId: comparison.version.id, scope: 'section', blockId: change.id, base: comparison.base,
              message: 'Replace this section, including everything inside it, with this version? The rest stays as it is.' };
            const reason = !change.block.ok && !change.section.ok ? change.block.reason ?? change.section.reason : undefined;
            const inside = comparison.blocks.filter(item => item.parent === change.id).length;
            return <li key={`${change.file}:${change.id}`} className={`history-change status-${change.status}`}
              onPointerEnter={() => setFocused(change)} onPointerLeave={() => setFocused(current => current === change ? null : current)}
              onFocus={() => setFocused(change)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(current => current === change ? null : current); }}>
              <div className="history-change-heading">
                <span className="history-kind">{change.kind}</span>
                <span className="history-status">{statusLabels[change.status]}</span>
                <code className="history-id" title={change.file}>{change.id}</code>
              </div>
              {change.status === 'contents' ? <p className="history-note">{inside ? `${inside} ${inside === 1 ? 'block' : 'blocks'} inside changed.` : 'Blocks inside it changed.'}</p> : <dl className="history-diff">
                {change.before !== undefined && <div><dt>Then</dt><dd dir="auto">{change.before || <em>No text</em>}</dd></div>}
                {change.after !== undefined && <div><dt>Now</dt><dd dir="auto">{change.after || <em>No text</em>}</dd></div>}
              </dl>}
              {reason && <p className="history-note">{reason}</p>}
              <div className="history-entry-actions">
                {change.status !== 'removed' && <Button className="text-button" onClick={() => onJump([change.id, ...change.descendants])}>Show on {pageLabel.toLowerCase()}</Button>}
                {change.block.ok && action(change.container ? 'Restore block only' : 'Restore block', blockItem)}
                {change.container && change.section.ok && action('Restore section', sectionItem)}
              </div>
              {confirmRow(blockItem)}
              {confirmRow(sectionItem)}
            </li>;
          })}</ol>}
          {comparison.files.some(file => !codeFile.test(file.path)) && <div className="history-files">
            <h3>Other files</h3>
            <ul>{comparison.files.filter(file => !codeFile.test(file.path)).map(file => <li key={file.path}><code>{file.path}</code> <span>{file.status === 'added' ? 'added since' : file.status === 'removed' ? 'removed since' : 'changed'}</span></li>)}</ul>
            <p className="history-note">Restore the whole version to bring these back.</p>
          </div>}
        </>}
      </>}
    </div>
  </section>;
}
