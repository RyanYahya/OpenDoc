import { useEffect, useState, type RefObject } from 'react';

/** Whether an element is within a margin of its scrolling reader, page rail, or the window. */
export function useNearViewport(
  ref: RefObject<HTMLDivElement | null>,
  key: unknown,
  rootMargin: string,
  { once = true, enabled = true }: { once?: boolean; enabled?: boolean } = {},
) {
  const [visibility, setVisibility] = useState<{
    key: unknown;
    nearby: boolean;
  } | null>(null);
  const nearby =
    !enabled || (visibility !== null && visibility.key === key && visibility.nearby);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    if (!("IntersectionObserver" in window)) {
      setVisibility({ key, nearby: true });
      return;
    }
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active) return;
        const intersects = entries.some((entry) => entry.isIntersecting);
        if (intersects || !once) {
          setVisibility((current) =>
            current !== null && current.key === key && current.nearby === intersects
              ? current
              : { key, nearby: intersects },
          );
          if (once) observer.disconnect();
        }
      },
      {
        root: element.closest(".reader-scroll, .page-rail"),
        rootMargin,
      },
    );
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [enabled, key, once, ref, rootMargin]);
  return nearby;
}
