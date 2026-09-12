import { monthlyReportTemplate } from './index';
import { bindTemplate } from 'opendoc/template';
import { neutral } from '../../themes';
import { type DocTheme } from 'opendoc/themes';
import example from './examples/typical.json';

export const meta = { title: 'Monthly report specimen', description: 'A synthetic operational review showing the repeatable report template.', kind: 'report' as const, theme: neutral.id };

export function Specimen({ theme = neutral }: { theme?: DocTheme }) {
  const bound = bindTemplate(monthlyReportTemplate(theme), example);
  return <bound.Document />;
}

export default function Preview() { return <Specimen />; }
