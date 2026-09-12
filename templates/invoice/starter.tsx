import { bindTemplate } from 'opendoc/template';
import { invoiceTemplate } from '../../templates/invoice';
// @ts-ignore The selected local theme module is inserted when this starter becomes a document.
import { theme } from "__OPENDOC_THEME_MODULE__";
import data from './data.json';
const documentId = "__OPENDOC_DOCUMENT_ID__";
const themeId = "__OPENDOC_THEME__";
// Bind a shared logo, pass <Logo slot="primary" /> through the logo option, or pass null to omit it.
const bound = bindTemplate(invoiceTemplate(theme), data);
export const meta = { ...bound.meta, theme: themeId };
export const provenance = { template: 'templates/invoice/index.tsx', dataFile: `documents/${documentId}/data.json` };
export default bound.Document;
