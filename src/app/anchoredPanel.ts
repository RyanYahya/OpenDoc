import { useLayoutEffect, useRef, type RefObject } from 'react';

export interface Box { top: number; right: number; bottom: number; left: number }
export type Placement = 'below' | 'above' | 'cover' | 'sheet';
export interface PanelPlacement {
  top: number;
  left: number;
  placement: Placement;
  /** How far to scroll the page so the selection stays visible beside the panel; applied once per opening. */
  scroll: number;
}

const edge = 12;
const gap = 8;

/** The smallest box containing every box, such as the lines of a selected phrase. */
export function unionBox(boxes: Box[]): Box | undefined {
  if (!boxes.length) return undefined;
  return {
    top: Math.min(...boxes.map(box => box.top)), right: Math.max(...boxes.map(box => box.right)),
    bottom: Math.max(...boxes.map(box => box.bottom)), left: Math.min(...boxes.map(box => box.left)),
  };
}

/** A panel matches its component's width within readable limits; a sheet spans the available width. */
export function anchoredPanelWidth(target: Box | undefined, bounds: Box, sheet: boolean, min = 360, max = 560) {
  const available = Math.max(0, bounds.right - bounds.left - edge * 2);
  if (sheet) return available;
  return Math.min(available, Math.max(min, Math.min(max, target ? target.right - target.left : max)));
}

/**
 * Where a panel opened for a selection goes, in viewport coordinates. It sits just below the selected
 * component, or above it when only that side has room, and always stays inside `bounds`. When neither side
 * has room, the page scrolls the component's start near the top so the panel can follow below it. A sheet
 * sits at the bottom of `bounds`, and the page scrolls the component above it, as narrow screens need.
 */
export function placeAnchoredPanel({ target, width, height, bounds, sheet }: {
  target?: Box; width: number; height: number; bounds: Box; sheet: boolean;
}): PanelPlacement {
  const clampTop = (top: number) => Math.max(bounds.top + edge, Math.min(top, bounds.bottom - gap - height));
  if (sheet || !target) {
    const top = clampTop(bounds.bottom - gap - height);
    const scroll = target && target.bottom > top - 20 ? Math.min(target.bottom - top + 20, target.top - bounds.top - 32) : 0;
    return { top, left: bounds.left + edge, placement: 'sheet', scroll };
  }
  const left = Math.max(bounds.left + edge, Math.min(target.left, bounds.right - edge - width));
  const below = target.bottom + gap;
  const above = target.top - gap - height;
  if (below + height <= bounds.bottom - gap) return { top: clampTop(below), left, placement: 'below', scroll: 0 };
  if (above >= bounds.top + edge) return { top: clampTop(above), left, placement: 'above', scroll: 0 };
  const scroll = target.top - (bounds.top + 32);
  if (scroll > 0 && below - scroll + height <= bounds.bottom - gap) return { top: below - scroll, left, placement: 'below', scroll };
  return { top: clampTop(below), left, placement: 'cover', scroll: Math.max(0, scroll) };
}

/**
 * Keep a fixed panel beside the current selection while the page scrolls, resizes, or reflows. `anchorKey`
 * names the selection; the page scrolls to reveal it only once for each key.
 */
export function useAnchoredPanel({ panel, container, avoid, active, anchorKey, sheet, findAnchor }: {
  panel: RefObject<HTMLElement | null>;
  container: RefObject<HTMLElement | null>;
  /** Fixed controls along the bottom edge that the panel must stay above. */
  avoid: RefObject<HTMLElement | null>;
  active: boolean;
  anchorKey: string;
  sheet: boolean;
  findAnchor: () => Box | undefined;
}) {
  const anchor = useRef(findAnchor);
  anchor.current = findAnchor;
  const revealed = useRef<string | null>(null);
  const retry = useRef(0);
  const place = useRef<() => void>(() => {});
  place.current = () => {
    clearTimeout(retry.current);
    const element = panel.current, area = container.current;
    if (!active || !element || !area) return;
    const box = area.getBoundingClientRect();
    const barsTop = avoid.current?.getBoundingClientRect().top;
    const bounds = { top: box.top, right: box.right, bottom: Math.min(box.bottom, barsTop || box.bottom), left: box.left };
    const target = anchor.current();
    if (!target && !sheet) {
      // The page is still drawing its components: keep the last position, or wait at the bottom, and look again.
      retry.current = window.setTimeout(() => place.current(), 150);
      if (element.dataset.placement) return;
    }
    const width = anchoredPanelWidth(target, bounds, sheet);
    element.style.width = `${width}px`;
    const result = placeAnchoredPanel({ target, width, height: element.offsetHeight, bounds, sheet });
    if (target && revealed.current !== anchorKey) {
      revealed.current = anchorKey;
      if (Math.abs(result.scroll) >= 1) { area.scrollTop += result.scroll; place.current(); return; }
    }
    element.style.top = `${Math.round(result.top)}px`;
    element.style.left = `${Math.round(result.left)}px`;
    element.dataset.placement = result.placement;
  };
  // Every render can move the selection (a draft preview, zoom, or the side panel opening), so place again.
  useLayoutEffect(() => {
    if (!active) revealed.current = null;
    place.current();
  });
  useLayoutEffect(() => () => clearTimeout(retry.current), []);
  useLayoutEffect(() => {
    const element = panel.current, area = container.current;
    if (!active || !element || !area) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => place.current()); };
    const resized = new ResizeObserver(schedule);
    resized.observe(element);
    resized.observe(area);
    if (avoid.current) resized.observe(avoid.current);
    area.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); resized.disconnect(); area.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [active, anchorKey, sheet]);
}
