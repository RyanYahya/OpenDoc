import { useEffect, useState } from 'react';

export type Appearance = 'system' | 'light' | 'dark';
const storageKey = 'opendoc-appearance';

export function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* System appearance remains available without browser storage. */ }
  return 'system';
}

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = appearance === 'system' ? system.matches ? 'dark' : 'light' : appearance;
      document.documentElement.dataset.appearance = resolved;
      document.documentElement.style.colorScheme = resolved;
      // Browser chrome follows the app background token, including its higher-contrast values.
      const background = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
      if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
    };
    apply();
    system.addEventListener('change', apply);
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) setAppearance(readAppearance()); };
    window.addEventListener('storage', sync);
    return () => { system.removeEventListener('change', apply); window.removeEventListener('storage', sync); };
  }, [appearance]);
  const changeAppearance = (next: Appearance) => {
    setAppearance(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the selection for this session. */ }
  };
  return { appearance, changeAppearance };
}
