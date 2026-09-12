import { useEffect, useState } from 'react';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { ToggleButton } from './ui';
import { Icon } from './ui/Icon';

export type DocumentView = 'gallery' | 'list';
const storageKey = 'opendoc-document-view';
function readView(): DocumentView {
  try { if (localStorage.getItem(storageKey) === 'list') return 'list'; } catch { /* Keep gallery available without browser storage. */ }
  return 'gallery';
}

export function useDocumentView() {
  const [view, setView] = useState<DocumentView>(readView);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) setView(readView()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return { view, changeView: (next: DocumentView) => {
    setView(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the selection for this session. */ }
  } };
}

export function DocumentViewControl({ value, onChange }: { value: DocumentView; onChange: (value: DocumentView) => void }) {
  return <ToggleGroup className="document-view-toggle" aria-label="Document view" value={[value]} onValueChange={values => { if (values[0]) onChange(values[0]); }}>
    <ToggleButton static label="Gallery view" value="gallery"><Icon name="grid" size={16} /><span>Gallery</span></ToggleButton>
    <ToggleButton static label="List view" value="list"><Icon name="list" size={16} /><span>List</span></ToggleButton>
  </ToggleGroup>;
}
