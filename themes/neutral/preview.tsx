import { ThemeSpecimen } from '../Specimen';
import { theme } from './index';
export const meta = { title: `${theme.name} design specimen`, description: theme.description, theme: theme.id };
export default function Preview() { return <ThemeSpecimen theme={theme} />; }
