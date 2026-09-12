import { Button } from "./ui";
import { Icon } from './ui/Icon';
import { InspectionLayer } from './InspectionLayer';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getBlock, type Fragment, type ArtifactSummary, type RenderArtifact } from "../shared/types";
import type { DocumentSelection } from "../shared/selection";
import { mapPdfTextSpans, pdfSpanRangeForSelection, type PdfSpanMapping } from "./pdfSelection";
import { loadPdfWithDeadline } from './pdfLoading';

let pdfJs: Promise<typeof import('pdfjs-dist')> | undefined;
function loadPdfJs() {
  pdfJs ??= import('pdfjs-dist').then(module => {
    module.GlobalWorkerOptions.workerSrc = worker;
    return module;
  }).catch(error => { pdfJs = undefined; throw error; });
  return pdfJs;
}

const spanMappings = new WeakMap<HTMLElement, PdfSpanMapping>();

function rangeWithinSpan(element: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let cursor = 0, began = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!began && start <= cursor + length) {
      range.setStart(node, Math.max(0, start - cursor));
      began = true;
    }
    if (began && end <= cursor + length) {
      range.setEnd(node, Math.max(0, end - cursor));
      return range;
    }
    cursor += length;
  }
  return null;
}

type CachedPdf = {
  loading: Promise<PDFDocumentLoadingTask>;
  ready: Promise<PDFDocumentProxy>;
  readers: number;
  release?: ReturnType<typeof setTimeout>;
};
const pdfs = new Map<string, CachedPdf>();

function acquirePdf(key: string) {
  let entry = pdfs.get(key);
  if (!entry) {
    const loading = loadPdfJs().then(module => module.getDocument({ url: key }));
    entry = { loading, ready: loadPdfWithDeadline(loading), readers: 0 };
    pdfs.set(key, entry);
  }
  clearTimeout(entry.release);
  entry.readers += 1;
  return entry;
}

function releasePdf(key: string, entry: CachedPdf) {
  entry.readers -= 1;
  if (entry.readers) return;
  // Keep the worker alive briefly when moving between a cover and its reader.
  entry.release = setTimeout(() => {
    if (entry.readers || pdfs.get(key) !== entry) return;
    pdfs.delete(key);
    void entry.loading.then(task => task.destroy()).catch(() => {});
  }, 5_000);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function usePdf(id: string, hash?: string, enabled = true, collection: 'documents' | 'templates' | 'themes' = 'documents', sourceUrl?: string) {
  const key =
    enabled && hash
      ? sourceUrl ?? `/api/${collection}/${encodeURIComponent(id)}/pdf?hash=${encodeURIComponent(hash)}`
      : "";
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const [state, setState] = useState<{
    key: string;
    pdf: PDFDocumentProxy | null;
    error: string;
  }>({ key: "", pdf: null, error: "" });
  useEffect(() => {
    if (!key) {
      setState({ key: "", pdf: null, error: "" });
      return;
    }
    let active = true;
    setState({ key, pdf: null, error: "" });
    const entry = acquirePdf(key);
    entry.ready
      .then((result) => {
        if (active) setState({ key, pdf: result, error: "" });
      })
      .catch((error) => {
        // A retry must acquire a fresh task rather than reuse a cached failure.
        if (pdfs.get(key) === entry) {
          pdfs.delete(key);
          void entry.loading.then(task => task.destroy()).catch(() => {});
        }
        if (active) setState({ key, pdf: null, error: errorMessage(error) });
      });
    return () => {
      active = false;
      releasePdf(key, entry);
    };
  }, [key, attempt]);
  return key && state.key === key
    ? { pdf: state.pdf, error: state.error, retry }
    : { pdf: null, error: "", retry };
}

function useNearViewport(
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

type PdfPageProps = {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  thumbnail?: boolean;
  artifact?: RenderArtifact;
  selected?: string | null;
  selection?: DocumentSelection | null;
  commented?: Set<string>;
  onSelect?: (id: string, page: number) => void;
  onComment?: (id: string, page: number) => void;
  onTextClick?: (selection: DocumentSelection, rect: { left: number; top: number; width: number; height: number }) => void;
  onNavigate?: (page: number) => void;
};
export const PdfPage = memo(function PdfPage({
  pdf,
  number,
  width,
  thumbnail,
  artifact,
  selected,
  selection,
  commented,
  onSelect,
  onComment,
  onTextClick,
  onNavigate,
}: PdfPageProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const pointerStart = useRef({ x: 0, y: 0 });
  const visibilityKey = useMemo(() => ({ pdf, number }), [pdf, number]);
  const activated = useNearViewport(
    container,
    visibilityKey,
    thumbnail ? "240px 0px" : "900px 0px",
  );
  const retained = useNearViewport(container, visibilityKey, "4000px 0px", {
    once: false,
    enabled: !thumbnail && pdf.numPages >= 25,
  });
  // Long documents retain several screens in each direction, without keeping
  // every full-resolution canvas and text layer alive after a complete read.
  const renderPage = activated && retained;
  const [links, setLinks] = useState<
    { rect: number[]; url?: string; dest?: unknown }[]
  >([]);
  const [pageSize, setPageSize] = useState<{
    pdf: PDFDocumentProxy;
    number: number;
    width: number;
    height: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [rendered, setRendered] = useState(false);
  const [textReady, setTextReady] = useState(false);
  const [highlightState, setHighlightState] = useState<{ key: string; rects: { left: number; top: number; width: number; height: number }[] }>({ key: '', rects: [] });
  const geometry =
    artifact?.pages[number - 1] ??
    (pageSize?.pdf === pdf && pageSize.number === number ? pageSize : null);
  const scale = width / (geometry?.width ?? 595.28);
  const height = scale * (geometry?.height ?? 841.89);
  const highlightKey = JSON.stringify([artifact?.hash, selection?.renderHash, selection?.blockId, selection?.targetId, selection?.start, selection?.end, width, number]);
  const preciseTarget = selection?.targetId && Number.isInteger(selection.start) && Number.isInteger(selection.end) && selection.end! > selection.start!
    ? artifact?.textTargets?.find(target => target.id === selection.targetId && target.blockId === selection.blockId) : undefined;
  const fullTargetSelection = !!preciseTarget && selection?.start === 0 && selection?.end === preciseTarget.text.length;
  const phraseHighlights = !fullTargetSelection && textReady && highlightState.key === highlightKey ? highlightState.rects : [];
  const phraseOnPage = preciseTarget?.lines.some(line => line.page === number && line.end > selection!.start! && line.start < selection!.end!);
  const showBlockSelection = !preciseTarget || (!fullTargetSelection && phraseOnPage && !phraseHighlights.length);
  useEffect(() => {
    let active = true,
      task: RenderTask | undefined,
      layer: TextLayer | undefined;
    setError("");
    setRendered(false);
    setTextReady(false);
    setLinks([]);
    text.current?.replaceChildren();
    if (!renderPage || width <= 0) {
      if (canvas.current) {
        canvas.current.width = 0;
        canvas.current.height = 0;
      }
      return;
    }
    void (async () => {
      const page = await pdf.getPage(number);
      if (!active || !canvas.current) return;
      const size = page.getViewport({ scale: 1 });
      setPageSize((current) =>
        current?.pdf === pdf &&
        current.number === number &&
        current.width === size.width &&
        current.height === size.height
          ? current
          : { pdf, number, width: size.width, height: size.height },
      );
      const viewport = page.getViewport({
        scale: width / size.width,
      });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const element = canvas.current;
      element.width = Math.floor(viewport.width * dpr);
      element.height = Math.floor(viewport.height * dpr);
      const context = element.getContext("2d");
      if (!context) throw new Error("The page canvas is unavailable.");
      task = page.render({
        canvasContext: context,
        canvas: element,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      });
      await task.promise;
      if (!active) return;
      setRendered(true);
      if (!thumbnail && text.current) {
        const textElement = text.current;
        const [content, annotations] = await Promise.all([
          page.getTextContent(),
          page.getAnnotations(),
        ]);
        const { TextLayer } = await loadPdfJs();
        if (!active) return;
        layer = new TextLayer({
          textContentSource: content,
          container: textElement,
          viewport,
        });
        await layer.render();
        if (active) {
          for (const span of layer.textDivs) {
            span.dataset.pdfText = '';
            span.dataset.pdfPage = String(number);
          }
          setTextReady(true);
        }
        if (active)
          setLinks(
            annotations
              .filter((a) => a.subtype === "Link")
              .map((a) => ({
                rect: [
                  ...viewport.convertToViewportPoint(a.rect[0], a.rect[1]),
                  ...viewport.convertToViewportPoint(a.rect[2], a.rect[3]),
                ],
                url: a.url,
                dest: a.dest,
              })),
          );
      }
    })().catch((error) => {
      if (active && error?.name !== "RenderingCancelledException")
        setError(`Could not display this page: ${errorMessage(error)}`);
    });
    return () => {
      active = false;
      task?.cancel();
      layer?.cancel();
    };
  }, [pdf, number, width, thumbnail, renderPage]);

  useEffect(() => {
    if (!textReady || !text.current || !container.current) return;
    const pageRect = container.current.getBoundingClientRect();
    const spans = Array.from(text.current.querySelectorAll<HTMLElement>('[data-pdf-text]'));
    const mappings = mapPdfTextSpans(spans.map(span => {
      const rect = span.getBoundingClientRect();
      return { text: span.textContent ?? '', page: number, x: (rect.left - pageRect.left) / scale,
        y: (rect.top - pageRect.top) / scale, width: rect.width / scale, height: rect.height / scale };
    }), artifact?.textTargets ?? []);
    spans.forEach((span, index) => {
      spanMappings.delete(span);
      if (mappings[index]) spanMappings.set(span, mappings[index]);
    });
  }, [artifact, number, scale, textReady]);

  useEffect(() => {
    const rects: { left: number; top: number; width: number; height: number }[] = [];
    if (textReady && text.current && container.current && selection?.targetId
      && (!selection.renderHash || selection.renderHash === artifact?.hash)) {
      const pageRect = container.current.getBoundingClientRect();
      for (const span of text.current.querySelectorAll<HTMLElement>('[data-pdf-text]')) {
        const offsets = pdfSpanRangeForSelection(spanMappings.get(span), selection);
        const range = offsets && rangeWithinSpan(span, offsets.start, offsets.end);
        if (!range) continue;
        for (const rect of range.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          rects.push({ left: rect.left - pageRect.left, top: rect.top - pageRect.top, width: rect.width, height: rect.height });
        }
      }
    }
    setHighlightState({ key: highlightKey, rects });
  }, [artifact, highlightKey, selection, textReady]);

  async function followDestination(dest: unknown) {
    try {
      const value =
        typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (Array.isArray(value)) {
        const index =
          typeof value[0] === "number"
            ? value[0]
            : await pdf.getPageIndex(value[0]);
        if (Number.isInteger(index) && index >= 0 && index < pdf.numPages) {
          onNavigate?.(index + 1);
          return;
        }
      }
      setError("This reference does not point to an available page.");
    } catch {
      setError("This reference could not be opened.");
    }
  }
  const fragments = useMemo(
    () =>
      renderPage && !thumbnail
        ? [...(artifact?.pages[number - 1]?.fragments ?? [])].sort(
            (a, b) => b.width * b.height - a.width * a.height,
          )
        : [],
    [artifact, number, renderPage, thumbnail],
  );
  const textComponents = useMemo(() => renderPage && !thumbnail ? (artifact?.textTargets ?? []).flatMap(target => {
    const lines = target.lines.filter(line => line.page === number && line.width > 0 && line.height > 0);
    if (!lines.length || !target.text) return [];
    const x = Math.min(...lines.map(line => line.x));
    const y = Math.min(...lines.map(line => line.y));
    return [{ target, x, y, width: Math.max(...lines.map(line => line.x + line.width)) - x,
      height: Math.max(...lines.map(line => line.y + line.height)) - y }];
  }) : [], [artifact, number, renderPage, thumbnail]);
  function rectStyle(f: Pick<Fragment, 'x' | 'y' | 'width' | 'height'>): CSSProperties {
    return {
      left: f.x * scale,
      top: f.y * scale,
      width: f.width * scale,
      height: f.height * scale,
    };
  }
  return (
    <div
      ref={container}
      className={`pdf-page ${thumbnail ? "thumbnail" : ""}`}
      data-page={number}
      data-render-hash={artifact?.hash}
      data-rendered={rendered}
      onPointerDownCapture={event => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
      onClickCapture={event => {
        if (event.detail > 0 && Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 4) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      style={
        {
          width,
          height,
          "--total-scale-factor": scale,
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as CSSProperties
      }
    >
      <canvas
        ref={canvas}
        aria-label={`Page ${number}`}
        style={{ width, height }}
      />
      {renderPage && !thumbnail && (
        <>
          <div ref={text} className="textLayer" />
          <div className="link-layer">
            {links.map((link, index) => {
              const [x1, y1, x2, y2] = link.rect;
              const style = {
                left: Math.min(x1, x2),
                top: Math.min(y1, y2),
                width: Math.abs(x2 - x1),
                height: Math.abs(y2 - y1),
              };
              return link.url && /^(https?:|mailto:)/i.test(link.url) ? (
                <a
                  key={index}
                  style={style}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open reference: ${link.url}`}
                />
              ) : link.dest ? (
                <Button
                  static
                  key={index}
                  style={style}
                  onClick={() => void followDestination(link.dest)}
                  aria-label="Go to reference"
                />
              ) : null;
            })}
          </div>
          <InspectionLayer key={`${artifact?.hash}:${width}`}>
            {phraseHighlights.map((rect, index) => <div key={index} className="text-selection-highlight" aria-hidden="true" style={{ ...rect, pointerEvents: 'none' }} />)}
            {fragments.map(fragment => {
              const block = getBlock(artifact, fragment.id);
              const hasText = textComponents.some(item => item.target.blockId === fragment.id);
              return <Button static key={fragment.id} className={`block-target component-target ${selected === fragment.id && showBlockSelection ? 'selected' : ''}`}
                data-block-id={fragment.id} style={rectStyle(fragment)} tabIndex={hasText ? -1 : 0}
                aria-label={`Select ${block?.kind ?? 'document'} component: ${block?.text.slice(0, 90) || fragment.id}`}
                onClick={() => onSelect?.(fragment.id, number)}>
                <span className="block-label" aria-hidden="true">{block?.kind ?? 'Component'}</span>
              </Button>;
            })}
            {textComponents.map(item => {
              const block = getBlock(artifact, item.target.blockId);
              const fullSelected = selection?.targetId === item.target.id && selection.start === 0 && selection.end === item.target.text.length;
              return <Button static key={item.target.id} className={`block-target component-target text-component ${fullSelected ? 'selected' : ''}`}
                data-text-target={item.target.id} style={rectStyle(item)}
                aria-label={`Select ${block?.kind ?? 'text'}: ${item.target.text.slice(0, 90)}`}
                onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onTextClick?.({ blockId: item.target.blockId, targetId: item.target.id, start: 0, end: item.target.text.length,
                    quote: item.target.text, page: number, renderHash: artifact?.hash },
                    { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
                }}>
                <span className="block-label" aria-hidden="true">{block?.kind ?? 'Text'}</span>
              </Button>;
            })}
            {fragments.filter(fragment => commented?.has(fragment.id)).map(fragment => {
              const block = getBlock(artifact, fragment.id);
              return <Button static key={fragment.id} className="comment-marker"
                aria-label={`View comments on ${block?.kind ?? 'block'}: ${block?.text.slice(0, 90) || fragment.id}`}
                style={{ left: (fragment.x + fragment.width) * scale + 4, top: fragment.y * scale - 6, pointerEvents: 'auto' }}
                onClick={() => (onComment ?? onSelect)?.(fragment.id, number)}><Icon name="comment" size={12} /></Button>;
            })}
          </InspectionLayer>
        </>
      )}
      {error && (
        <div className="page-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
});

export function CoverPreview({
  format = 'document',
  id,
  artifact,
  compact = false,
}: {
  id: string;
  artifact?: ArtifactSummary;
  format?: 'document' | 'presentation';
  compact?: boolean;
}) {
  const cover = useRef<HTMLDivElement>(null);
  const nearby = useNearViewport(cover, `${id}:${artifact?.hash}`, "320px 0px");
  const { pdf, error } = usePdf(id, artifact?.hash, nearby);
  const page = artifact?.pages[0] ?? (format === 'presentation' ? {width:960,height:540} : undefined);
  const [width, setWidth] = useState(compact ? 40 : 238);
  useEffect(() => {
    if (!cover.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(cover.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={cover}
      className="cover-preview"
      aria-hidden="true"
      style={{ '--cover-ratio': (page?.width ?? 595.28) / (page?.height ?? 841.89), aspectRatio: `${page?.width ?? 595.28} / ${page?.height ?? 841.89}`, width: compact ? Math.min(40, 56 * (page?.width ?? 595.28) / (page?.height ?? 841.89)) : undefined } as CSSProperties}
    >
      {pdf ? (
        <PdfPage pdf={pdf} number={1} width={width} thumbnail />
      ) : (
        <div className="cover-placeholder">
          {compact ? <Icon name="document" size={18} /> : error ? "Preview unavailable" : "Preparing preview…"}
        </div>
      )}
    </div>
  );
}
