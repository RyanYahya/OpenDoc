import { Icon } from './ui/Icon';

/**
 * The one loading state of a page preview, shared by template and theme specimens and document covers:
 * a page mark and a short line, centered in the frame the page will fill. `compact` keeps only the mark,
 * for list rows. A cover inside an aria-hidden card passes `announce={false}`.
 */
export function PreviewPlaceholder({ label = 'Preparing preview…', compact = false, announce = true, className }: {
  label?: string; compact?: boolean; announce?: boolean; className?: string;
}) {
  return <div className={`preview-placeholder${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`} role={announce ? 'status' : undefined}>
    <Icon name="document" size={compact ? 18 : 24} />
    {compact ? <span className="sr-only">{label}</span> : <p>{label}</p>}
  </div>;
}
