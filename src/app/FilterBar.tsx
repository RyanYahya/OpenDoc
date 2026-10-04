import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { textLang } from '../shared/language';
import { chosenLabel, hashWith, offered, readSort, splitHash, storeSort, isSortKey, type Facet, type SortOption } from './libraryFilters';
import { DocumentViewControl, type DocumentView } from './DocumentViewControl';
import { SearchField } from './SearchField';
import { Button } from './ui';
import { Icon } from './ui/Icon';
import './filter-bar.css';

/**
 * The hash query that holds a library page's filters. Choosing a filter adds a history entry, so
 * back and forward step through filters; typing in search replaces the current entry instead.
 */
export function useHashQuery() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const sync = () => setHash(location.hash);
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  const update = useCallback((changes: Record<string, string | null | undefined>, { replace = false } = {}) => {
    const next = hashWith(location.hash, changes);
    if (next === (location.hash || '#')) return;
    if (!replace) { location.hash = next; return; }
    const oldURL = location.href;
    history.replaceState(history.state, '', next);
    // Routing and other views listen for hash changes; a replaced entry announces itself the same way.
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: location.href }));
  }, []);
  return { params: splitHash(hash).params, update };
}

/** A page's sort order, remembered in browser storage and shared by its open windows. */
export function useSortPreference(page: string, options: readonly SortOption[], fallback: string) {
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
  const [value, setValue] = useState(() => readSort(storage, page, options, fallback));
  const allowed = options.map(option => option.value).join('\n');
  useEffect(() => {
    setValue(readSort(storage, page, options, fallback));
    const sync = (event: StorageEvent) => { if (event.key === null || isSortKey(event.key, page)) setValue(readSort(storage, page, options, fallback)); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
    // The options are rebuilt on each render; their values decide when the stored choice is reread.
  }, [page, allowed, fallback]);
  const current = options.some(option => option.value === value) ? value : fallback;
  return [current, (next: string) => { setValue(next); storeSort(storage, page, next); }] as const;
}

export interface Choice { value: string; label: string; count?: number; icon?: string }

/**
 * The page's primary dimension as always-visible buttons, such as a project's formats or the
 * template formats; one is always chosen. `decorate` adds per-button props, such as drop targets.
 */
export function FilterChoices({ label, value, choices, onChange, decorate, className = '' }: {
  label: string; value: string; choices: readonly Choice[]; onChange: (value: string) => void;
  decorate?: (choice: Choice) => Record<string, unknown>; className?: string;
}) {
  return <ToggleGroup className={`filter-choices ${className}`.trim()} aria-label={label} value={[value]} onValueChange={values => { if (values[0] !== undefined) onChange(values[0]); }}>
    {choices.map(choice => {
      const extra = decorate?.(choice) ?? {};
      return <Toggle key={choice.value} value={choice.value} aria-label={choice.count === undefined ? undefined : `${choice.label}, ${choice.count}`} {...extra}
        className={`ui-button filter-choice ${typeof extra.className === 'string' ? extra.className : ''}`.trim()}>
        {choice.icon && <Icon name={choice.icon} size={15} />}
        <span className="filter-choice-name" dir="auto" lang={textLang(choice.label)}>{choice.label}</span>
        {choice.count !== undefined && <span className="filter-choice-count" aria-hidden="true">{choice.count}</span>}
      </Toggle>;
    })}
  </ToggleGroup>;
}

/** A facet's values as radio rows with item counts, led by the choice that keeps every item. */
function FacetOptions({ facet, onChange }: { facet: Facet; onChange: (key: string, value: string) => void }) {
  return <Menu.RadioGroup value={facet.value} onValueChange={value => onChange(facet.key, String(value ?? ''))}>
    {[{ value: '', label: facet.anyLabel, count: undefined as number | undefined }, ...facet.options].map(option => <Menu.RadioItem key={option.value || '*'} value={option.value} closeOnClick className="ui-menu-item filter-option" lang={textLang(option.label)}>
      <span><bdi>{option.label}</bdi></span>
      {option.count !== undefined && <span className="ui-menu-value filter-option-count">{option.count}</span>}
      <span className="ui-menu-check filter-option-check"><Menu.RadioItemIndicator><Icon name="check" size={14} /></Menu.RadioItemIndicator></span>
    </Menu.RadioItem>)}
  </Menu.RadioGroup>;
}

/**
 * One Filter button for every secondary dimension. Each dimension opens a submenu of its values;
 * a page with a single dimension lists its values directly.
 */
function FilterMenu({ facets, active, onChange, onClear }: { facets: Facet[]; active: number; onChange: (key: string, value: string) => void; onClear: () => void }) {
  const [single] = facets.length === 1 ? facets : [];
  return <Menu.Root>
    <Menu.Trigger render={<Button className="tool-button filter-button" data-filter-trigger aria-label={active ? `Filter, ${active} active` : 'Filter'} />}>
      <Icon name="filter" size={16} /><span>Filter</span>{active > 0 && <span className="filter-count" aria-hidden="true">{active}</span>}
    </Menu.Trigger>
    <Menu.Portal><Menu.Positioner className="ui-positioner" sideOffset={6} align="start"><Menu.Popup className={`ui-menu-popup filter-menu${single ? ' filter-options' : ''}`}>
      {single ? <Menu.Group><Menu.GroupLabel className="ui-menu-label">{single.label}</Menu.GroupLabel><FacetOptions facet={single} onChange={onChange} /></Menu.Group>
        : facets.map(facet => <Menu.SubmenuRoot key={facet.key}>
          <Menu.SubmenuTrigger className="ui-menu-item">
            <span>{facet.label}</span>
            <span className="ui-menu-value"><bdi lang={textLang(facet.value ? chosenLabel(facet) : '')}>{facet.value ? chosenLabel(facet) : 'Any'}</bdi></span>
            <Icon name="right" size={14} />
          </Menu.SubmenuTrigger>
          <Menu.Portal><Menu.Positioner className="ui-positioner" sideOffset={4} alignOffset={-4}><Menu.Popup className="ui-menu-popup filter-options" aria-label={facet.label}>
            <FacetOptions facet={facet} onChange={onChange} />
          </Menu.Popup></Menu.Positioner></Menu.Portal>
        </Menu.SubmenuRoot>)}
      {active > 0 && <><Menu.Separator className="ui-menu-separator" /><Menu.Item className="ui-menu-item" onClick={onClear}><Icon name="close" size={16} /><span>Clear filters</span></Menu.Item></>}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

/** The library sort order, as a compact menu whose button names the current choice. */
function SortMenu({ value, options, onChange }: { value: string; options: readonly SortOption[]; onChange: (value: string) => void }) {
  const current = options.find(option => option.value === value) ?? options[0];
  return <Menu.Root>
    <Menu.Trigger render={<Button className="tool-button filter-sort" aria-label={`Sort by ${current.label}`} />}>
      <Icon name="sort" size={16} /><span>{current.label}</span><Icon name="down" size={14} />
    </Menu.Trigger>
    <Menu.Portal><Menu.Positioner className="ui-positioner" sideOffset={6} align="end"><Menu.Popup className="ui-menu-popup">
      <Menu.Group>
        <Menu.GroupLabel className="ui-menu-label">Sort by</Menu.GroupLabel>
        <Menu.RadioGroup value={current.value} onValueChange={next => onChange(String(next))}>
          {options.map(option => <Menu.RadioItem key={option.value} value={option.value} closeOnClick className="ui-menu-item">
            <span>{option.label}</span>
            <span className="ui-menu-check filter-option-check"><Menu.RadioItemIndicator><Icon name="check" size={14} /></Menu.RadioItemIndicator></span>
          </Menu.RadioItem>)}
        </Menu.RadioGroup>
      </Menu.Group>
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

/**
 * The shared library toolbar: search first, then the page's primary dimension as buttons, the
 * Filter menu with its active filters as removable chips, and, at the end, sort and the view.
 * Facets that would not narrow the list are left out; with none left, so is the Filter button.
 */
export function FilterBar({ search, primary, facets = [], onFacetChange, onClearFacets, sort, view, className = '' }: {
  search: { label: string; value: string; onChange: (value: string) => void };
  primary?: ReactNode;
  facets?: Facet[];
  onFacetChange?: (key: string, value: string) => void;
  onClearFacets?: () => void;
  sort: { value: string; options: readonly SortOption[]; onChange: (value: string) => void };
  view?: { value: DocumentView; onChange: (value: DocumentView) => void };
  className?: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string[] | null>(null);
  const shown = facets.filter(offered);
  const active = shown.filter(facet => facet.value);
  const change = (key: string, value: string) => onFacetChange?.(key, value);
  // A removed chip unmounts; focus moves to its neighbor, else the Filter button, else search.
  useEffect(() => {
    const targets = pendingFocus.current;
    if (!targets || !bar.current) return;
    for (const selector of targets) {
      const target = bar.current.querySelector<HTMLElement>(selector);
      if (target) { target.focus(); pendingFocus.current = null; return; }
    }
  });
  function remove(index: number) {
    const others = active.filter((_, position) => position !== index);
    const neighbor = others[Math.min(index, others.length - 1)];
    pendingFocus.current = [...(neighbor ? [`[data-filter-chip="${neighbor.key}"]`] : []), '[data-filter-trigger]', '.search-field input'];
    change(active[index].key, '');
  }
  function clear() {
    pendingFocus.current = ['[data-filter-trigger]', '.search-field input'];
    onClearFacets?.();
  }
  return <div ref={bar} className={`filter-bar${primary ? ' has-primary' : ''} ${className}`.trim()}>
    <div className="filter-bar-layout">
      <div className="filter-bar-search"><SearchField label={search.label} value={search.value} onValueChange={search.onChange} /></div>
      {(primary || shown.length > 0) && <div className="filter-bar-facets">
        {primary}
        {shown.length > 0 && <div className="filter-bar-filters">
          <FilterMenu facets={shown} active={active.length} onChange={change} onClear={clear} />
          {active.map((facet, index) => <Button key={facet.key} className="filter-chip" data-filter-chip={facet.key} onClick={() => remove(index)}
            aria-label={`Remove filter ${facet.label}: ${chosenLabel(facet)}`}>
            <span className="filter-chip-dimension">{facet.label}:</span>
            <bdi className="filter-chip-value" lang={textLang(chosenLabel(facet))}>{chosenLabel(facet)}</bdi>
            <Icon name="close" size={12} />
          </Button>)}
          {active.length > 1 && <Button className="text-button filter-clear" onClick={clear}>Clear</Button>}
        </div>}
      </div>}
      <div className="filter-bar-arrange">
        <SortMenu value={sort.value} options={sort.options} onChange={sort.onChange} />
        {view && <DocumentViewControl value={view.value} onChange={view.onChange} />}
      </div>
    </div>
  </div>;
}
