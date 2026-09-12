import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

type HoverTarget = { left: number; top: number; width: number; height: number; label: string };

// Keep one full-size rectangle alive. Enlarging one-pixel strips magnifies
// raster rounding at fractional display scales and separates the frame edges.
export function InspectionLayer({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HoverTarget | null>(null);
  const [visible, setVisible] = useState(false);
  const [morph, setMorph] = useState(false);
  const hovered = useRef<HTMLElement | null>(null);
  const hiddenAt = useRef(-Infinity);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = box.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => element?.getAnimations().forEach(animation => animation.cancel());
    const onChange = () => { if (reduced.matches) cancel(); };
    reduced.addEventListener('change', onChange);
    return () => { reduced.removeEventListener('change', onChange); cancel(); };
  }, []);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element || !target) return;
    // Read the in-flight visual bounds before retargeting, then animate back
    // from those bounds to the new geometry using a single transform.
    const previous = element.getBoundingClientRect();
    element.getAnimations().forEach(animation => animation.cancel());
    Object.assign(element.style, {
      left: `${target.left}px`, top: `${target.top}px`,
      width: `${target.width}px`, height: `${target.height}px`,
    });
    const next = element.getBoundingClientRect();
    if (!morph || !previous.width || !previous.height || !next.width || !next.height ||
      !window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
    element.animate([
      { transform: `translate(${(previous.left - next.left) * target.width / next.width}px, ${(previous.top - next.top) * target.height / next.height}px) scale(${previous.width / next.width}, ${previous.height / next.height})` },
      { transform: 'none' },
    ], { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }, [target, morph]);

  function hide() {
    if (!hovered.current) return;
    hovered.current = null;
    hiddenAt.current = performance.now();
    setVisible(false);
  }

  function hover(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('.component-target') : null;
    if (!element || element.classList.contains('selected')) { hide(); return; }
    if (hovered.current === element) return;
    setMorph(!!hovered.current || performance.now() - hiddenAt.current < 150);
    hovered.current = element;
    setTarget({
      left: parseFloat(element.style.left), top: parseFloat(element.style.top),
      width: parseFloat(element.style.width), height: parseFloat(element.style.height),
      label: element.querySelector('.block-label')?.textContent ?? 'Component',
    });
    setVisible(true);
  }

  const { left: x, top: y } = target ?? { left: 0, top: 0 };
  return <div className="inspection-layer" onPointerOver={hover} onPointerLeave={hide}
    onPointerOut={event => {
      if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest('.component-target')) hide();
    }} onPointerDownCapture={hide} onKeyDownCapture={hide}>
    {children}
    <div className="inspection-hover-frame" aria-hidden="true" data-visible={visible} data-morph={morph}>
      <div ref={box} className="inspection-hover-box" />
      <span className="block-label" style={{ transform: `translate(${x}px, ${y}px)` }}>{target?.label}</span>
    </div>
  </div>;
}
