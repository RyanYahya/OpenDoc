import { Input } from './ui';
import { Icon } from './ui/Icon';

export function SearchField({ label, value, onValueChange }: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return <label className="search-field">
    <Icon name="search" />
    <Input aria-label={label} placeholder={label} value={value} onChange={event => onValueChange(event.target.value)} />
  </label>;
}
