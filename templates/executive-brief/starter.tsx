import { ExecutiveBrief } from '../../templates/executive-brief';
import { Paragraph } from 'opendoc';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";
const title = "__OPENDOC_TITLE__";
const themeId = "__OPENDOC_THEME__";
export const meta = { title, description: 'An executive brief, ready for your content.', kind: 'report' as const, theme: themeId };
export const provenance = { template: 'templates/executive-brief/index.tsx' };
export default function Brief() {
  return <ExecutiveBrief title={title} theme={theme} takeaway="Replace this placeholder with a concise opening takeaway, or omit it when the brief does not need one."><Paragraph id="brief-opening">Your brief begins here. Add the prose, evidence, and exhibits your reader needs, in the order that makes the material clearest.</Paragraph></ExecutiveBrief>;
}
