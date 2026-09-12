import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import { invoiceTemplate, parseInvoice } from './index';
import typical from './examples/typical.json';
import sparse from './examples/sparse.json';
import long from './examples/long.json';
export const meta = invoiceTemplate(neutral).meta(parseInvoice(typical));
export function Specimen({ length = 'typical', theme = neutral }: { length?: 'sparse' | 'typical' | 'long'; theme?: DocTheme } = {}) {
  const template = invoiceTemplate(theme);
  return template.render(template.parse({ sparse, typical, long }[length]));
}
export default Specimen;
