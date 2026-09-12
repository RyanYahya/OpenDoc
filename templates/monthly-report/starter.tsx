import { bindTemplate } from 'opendoc/template';
import { monthlyReportTemplate } from '../../templates/monthly-report';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";
import data from './data.json';

const documentId = "__OPENDOC_DOCUMENT_ID__";
const themeId = "__OPENDOC_THEME__";
// This copied dataset is illustrative. Replace it with verified information before sharing.
const bound = bindTemplate(monthlyReportTemplate(theme), data);
export const meta = { ...bound.meta, theme: themeId };
export const provenance = { template: 'templates/monthly-report/index.tsx', dataFile: `documents/${documentId}/data.json` };
export default bound.Document;
