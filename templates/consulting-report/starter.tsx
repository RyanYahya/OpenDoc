import { ConsultingReport } from '../../templates/consulting-report';
import { Paragraph } from 'opendoc';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";

const title = "__OPENDOC_TITLE__";
const themeId = "__OPENDOC_THEME__";
export const meta = { title, description: 'A consulting report, ready for your material.', kind: 'report' as const, theme: themeId };
export const provenance = { template: 'templates/consulting-report/index.tsx' };

export default function Report() {
  return <ConsultingReport title={title} theme={theme} label="REPORT" subtitle="Replace this placeholder with your report's purpose." author="Author or team name">
    <Paragraph id="report-opening">Your report begins here. Replace this placeholder with your own material, and choose the sections and exhibits that serve the reader.</Paragraph>
  </ConsultingReport>;
}
