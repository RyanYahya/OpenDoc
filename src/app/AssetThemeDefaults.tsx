import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AssetCatalog, AssetInspection, AssetSummary, ThemeAssetDefaults } from '../shared/assets';
import type { ThemeSummary } from '../shared/themes';
import { api } from './api';
import { Button, Dialog, SelectControl, useNotifications } from './ui';
import { Icon } from './ui/Icon';
import './assets.css';

type DefaultsResponse = { defaults: ThemeAssetDefaults; revision: string };
const noChoice = '__none__';

export function AssetThemeDefaults({ themeId, generation, connected = true, suggested, onSaved }: {
  themeId: string; generation: number; connected?: boolean; suggested?: { kind: 'logo' | 'font'; id: string }; onSaved?: () => void;
}) {
  const [catalog, setCatalog] = useState<AssetSummary[]>([]);
  const [saved, setSaved] = useState<DefaultsResponse>();
  const [draft, setDraft] = useState<ThemeAssetDefaults>({ version: 1 });
  const [logo, setLogo] = useState<AssetInspection>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const working = useRef(false);
  const dirty = useRef(false);
  const revision = useRef('');
  const [remoteChanged, setRemoteChanged] = useState(false);
  const notifications = useNotifications();
  useEffect(() => { dirty.current = false; revision.current = ''; setSaved(undefined); setDraft({ version: 1 }); setRemoteChanged(false); }, [themeId]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([api<DefaultsResponse>(`/api/themes/${encodeURIComponent(themeId)}/assets`, { signal: controller.signal }), api<AssetCatalog>('/api/assets', { signal: controller.signal })]).then(([value, assets]) => {
      setCatalog(assets.items); setError('');
      if (dirty.current && revision.current !== value.revision) { setRemoteChanged(true); return; }
      if (!dirty.current) { setSaved(value); setDraft(value.defaults); revision.current = value.revision; }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [themeId, generation, retry]);
  useEffect(() => {
    if (!draft.logo) { setLogo(undefined); return; }
    const controller = new AbortController();
    void api<AssetInspection>(`/api/assets/logo/${encodeURIComponent(draft.logo.id)}`, { signal: controller.signal }).then(setLogo).catch(() => { if (!controller.signal.aborted) setLogo(undefined); });
    return () => controller.abort();
  }, [draft.logo?.id, generation]);
  function change(value: ThemeAssetDefaults) { dirty.current = true; setDraft(value); }
  function choices(kind: 'logo' | 'font', selected?: string) {
    const items = [{ value: noChoice, label: kind === 'logo' ? 'No preferred logo' : 'Keep theme font' }, ...catalog.filter(item => item.kind === kind && !item.archived && !item.error && (kind === 'logo' || item.compatibility?.defaultEligible)).map(item => ({ value: item.id, label: `${item.name}${item.id === suggested?.id ? ' · selected asset' : ''}` }))];
    if (selected && !items.some(item => item.value === selected)) items.push({ value: selected, label: `${selected} (unavailable)` });
    return items;
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!saved || working.current || !connected) return;
    working.current = true; setBusy(true); setError('');
    try {
      const value = await api<DefaultsResponse>(`/api/themes/${encodeURIComponent(themeId)}/assets`, { method: 'PUT', body: JSON.stringify({ defaults: draft, expectedRevision: saved.revision }) });
      dirty.current = false; revision.current = value.revision; setSaved(value); setDraft(value.defaults); setRemoteChanged(false); notifications.success('Assets for new documents saved'); onSaved?.();
    } catch (error) { setError((error as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  const variationItems = [{ value: noChoice, label: 'Logo’s default variation' }, ...(logo?.asset.kind === 'logo' && logo.asset.id === draft.logo?.id ? logo.asset.variations.map(item => ({ value: item.id, label: item.name })) : [])];
  if (draft.logo?.variation && !variationItems.some(item => item.value === draft.logo?.variation)) variationItems.push({ value: draft.logo.variation, label: `${draft.logo.variation} (unavailable)` });
  return <section className="asset-theme-defaults"><h2>Assets for new documents</h2><p>Choose a preferred logo and fonts. Existing documents keep their saved choices.</p>
    <form onSubmit={event => void save(event)} aria-busy={busy}>
      <fieldset disabled={busy || !connected || !saved} className="asset-fields" inert={busy || !connected || !saved || undefined}>
        <div className="create-field"><span>Preferred logo</span><SelectControl label="Preferred logo" value={draft.logo?.id ?? noChoice} onValueChange={value => change({ ...draft, logo: value === noChoice ? undefined : { id: value } })} items={choices('logo', draft.logo?.id)} /><p className="field-hint">Available to your agent; added only where the document uses a logo.</p></div>
        {draft.logo && <div className="create-field"><span>Variation</span><SelectControl label="Preferred logo variation" value={draft.logo.variation ?? noChoice} onValueChange={value => change({ ...draft, logo: { id: draft.logo!.id, ...(value !== noChoice ? { variation: value } : {}) } })} items={variationItems} /></div>}
        <div className="asset-font-defaults"><div className="create-field"><span>Body font</span><SelectControl label="Body font" value={draft.bodyFont ?? noChoice} onValueChange={value => change({ ...draft, bodyFont: value === noChoice ? undefined : value })} items={choices('font', draft.bodyFont)} /></div><div className="create-field"><span>Heading font</span><SelectControl label="Heading font" value={draft.headingFont ?? noChoice} onValueChange={value => change({ ...draft, headingFont: value === noChoice ? undefined : value })} items={choices('font', draft.headingFont)} /></div></div>
      </fieldset>
      {!saved && !error && <p role="status" className="small muted">Loading asset choices…</p>}
      {remoteChanged && <p className="field-error" role="alert">These defaults changed elsewhere. Your choices are still here. Reload the latest defaults before saving.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {(error || remoteChanged) && <Button className="text-button" disabled={busy} onClick={() => { dirty.current = false; setRemoteChanged(false); setRetry(value => value + 1); }}>Reload defaults</Button>}
      <Button type="submit" disabled={busy || !connected || !saved || !dirty.current || remoteChanged}>{busy ? 'Saving…' : 'Save defaults'}</Button>
    </form>
  </section>;
}

export function AssetThemeDialog({ open, onClose, themes, generation, connected, asset }: {
  open: boolean; onClose: () => void; themes: ThemeSummary[]; generation: number; connected: boolean; asset: { kind: 'logo' | 'font'; id: string; name: string };
}) {
  const [themeId, setThemeId] = useState('');
  useEffect(() => { if (open) setThemeId(''); }, [open]);
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="ui-dialog-backdrop" /><Dialog.Popup className="help-dialog create-dialog asset-dialog">
    <Dialog.Close render={<Button className="icon-button modal-close" aria-label="Close theme assignment" />}><Icon name="close" /></Dialog.Close>
    <Dialog.Title>Use with a theme</Dialog.Title><Dialog.Description>Choose a theme, then select {asset.name} as a default for new documents.</Dialog.Description>
    <div className="create-field"><span>Theme</span><SelectControl label="Choose theme" value={themeId} onValueChange={setThemeId} items={[{ value: '', label: 'Choose a theme' }, ...themes.filter(theme => !theme.error).map(theme => ({ value: theme.id, label: theme.name }))]} /></div>
    {themeId && <AssetThemeDefaults key={themeId} themeId={themeId} generation={generation} connected={connected} suggested={asset} onSaved={onClose} />}
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
