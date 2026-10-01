import { useEffect } from 'react';

/** Floating controls along the reader's bottom edge that notifications must not cover. */
const bottomControls = '.edit-workbench, .comment-dock-trigger, .comment-dock-panel';
type Box = { top: number; bottom: number; left: number; right: number };

/**
 * How far above the window's bottom edge notifications must start to clear every bottom control
 * that shares their horizontal band, leaving a gap. Zero when nothing is in the way.
 */
export function notificationClearance(viewportHeight: number, band: Pick<Box, 'left' | 'right'> | undefined, controls: Box[], gap = 12) {
  const blocking = controls.filter(control => control.bottom > control.top && (!band || (control.left < band.right && control.right > band.left)));
  return blocking.length ? Math.max(0, Math.ceil(viewportHeight - Math.min(...blocking.map(control => control.top)) + gap)) : 0;
}

/**
 * Keep notifications above the selection bar, its panels, and the comments button while they are
 * shown. `layout` changes when a control appears or disappears; size changes are observed.
 */
export function useNotificationClearance(layout: readonly unknown[]) {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = document.querySelector('.ui-notifications')?.getBoundingClientRect();
        const controls = [...document.querySelectorAll(bottomControls)].map(control => control.getBoundingClientRect());
        root.style.setProperty('--notification-clearance', `${notificationClearance(window.innerHeight, viewport?.width ? viewport : undefined, controls)}px`);
      });
    };
    const resized = new ResizeObserver(update);
    document.querySelectorAll(bottomControls).forEach(control => resized.observe(control));
    window.addEventListener('resize', update);
    update();
    return () => { cancelAnimationFrame(frame); resized.disconnect(); window.removeEventListener('resize', update); root.style.removeProperty('--notification-clearance'); };
  }, layout);
}
