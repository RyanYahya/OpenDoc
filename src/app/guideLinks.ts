export type GuideLocation = { file: string; fragment?: string };
type GuideLink = { kind: 'guide'; location: GuideLocation } | { kind: 'external'; href: string };

/** Resolve links against the guide file, never the app's URL or navigation hash. */
export function resolveGuideLink(file: string, href: string): GuideLink | undefined {
  href = href.trim();
  if (!href) return undefined;
  if (/^(https?:)?\/\//i.test(href)) return { kind: 'external', href };
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.includes('\\')) return undefined;
  try {
    const url = new URL(href, `https://guides.invalid/${file}`);
    if (url.origin !== 'https://guides.invalid') return undefined;
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!path.endsWith('.md')) return undefined;
    return { kind: 'guide', location: { file: path, ...(url.hash ? { fragment: decodeURIComponent(url.hash.slice(1)) } : {}) } };
  } catch { return undefined; }
}

export function guideHeadingSlug(text: string) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-');
}
