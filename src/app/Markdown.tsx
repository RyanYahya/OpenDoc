import { Children, isValidElement, useEffect, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { guideHeadingSlug, resolveGuideLink, type GuideLocation } from './guideLinks';

function plainText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : '').join('');
}

export function Markdown({ children, file, onNavigate, onReady }: { children: string; file: string; onNavigate: (location: GuideLocation) => void; onReady?: () => void }) {
  useEffect(() => { onReady?.(); }, [children, file, onReady]);
  const headings = new Set<string>();
  function heading(level: 1 | 2 | 3 | 4 | 5 | 6, children: ReactNode) {
    const slug = guideHeadingSlug(plainText(children));
    let unique = slug;
    for (let count = 1; headings.has(unique); count += 1) unique = `${slug}-${count}`;
    headings.add(unique);
    const Tag = `h${level}` as const;
    return <Tag id={`guide-${unique}`} data-guide-heading={unique}>{children}</Tag>;
  }
  return <div className="markdown-body">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ node: _node, href, ...props }) => {
        const link = href && resolveGuideLink(file, href);
        return !link ? <span title={href}>{props.children}</span> : link.kind === 'external'
          ? <a {...props} href={link.href} target="_blank" rel="noopener noreferrer" />
          : <a {...props} href={`/api/guides?path=${encodeURIComponent(link.location.file)}${link.location.fragment ? `#${encodeURIComponent(link.location.fragment)}` : ''}`} onClick={event => { event.preventDefault(); onNavigate(link.location); }} />;
      },
      h1: ({ children }) => heading(1, children), h2: ({ children }) => heading(2, children), h3: ({ children }) => heading(3, children),
      h4: ({ children }) => heading(4, children), h5: ({ children }) => heading(5, children), h6: ({ children }) => heading(6, children),
      table: ({ node: _node, ...props }) => <div className="markdown-table"><table {...props} /></div>,
    }}>{children}</ReactMarkdown>
  </div>;
}
