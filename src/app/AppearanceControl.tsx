import { Select } from '@base-ui/react/select';
import { Menu } from '@base-ui/react/menu';
import type { Appearance } from './appearance';
import { Button } from './ui';
import { Icon } from './ui/Icon';

const options = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
] as const;

/** Appearance inside an options menu, as one row that opens the three choices. */
export function AppearanceSubmenu({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void }) {
  const selected = options.find(option => option.value === value)!;
  return <Menu.SubmenuRoot>
    <Menu.SubmenuTrigger className="ui-menu-item"><Icon name={selected.icon} size={16} /><span>Appearance</span><span className="ui-menu-value">{selected.label}</span><Icon name="right" size={14} /></Menu.SubmenuTrigger>
    <Menu.Portal><Menu.Positioner className="ui-positioner" sideOffset={4} alignOffset={-4} collisionPadding={8}>
      <Menu.Popup className="ui-menu-popup" aria-label="Appearance">
        <Menu.RadioGroup value={value} onValueChange={onChange}>
          {options.map(option => <Menu.RadioItem key={option.value} value={option.value} closeOnClick className="ui-menu-item">
            <Icon name={option.icon} size={16} /><span>{option.label}</span>
            <Menu.RadioItemIndicator className="ui-menu-check"><Icon name="check" size={14} /></Menu.RadioItemIndicator>
          </Menu.RadioItem>)}
        </Menu.RadioGroup>
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.SubmenuRoot>;
}

export function AppearanceControl({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void }) {
  const selected = options.find(option => option.value === value)!;
  return <Select.Root value={value} onValueChange={next => { if (next) onChange(next); }}>
    <Select.Trigger render={<Button className="icon-button appearance-trigger" />} aria-label={`Appearance: ${selected.label}`} title={`Appearance: ${selected.label}`}>
      <Icon name={selected.icon} size={18} />
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner className="ui-positioner" sideOffset={8} align="end" alignItemWithTrigger={false}>
        <Select.Popup className="ui-select-popup" aria-label="Appearance">
          <Select.List>
            {options.map(option => <Select.Item className="ui-select-item" key={option.value} value={option.value}>
              <Select.ItemText><span className="appearance-option"><Icon name={option.icon} size={16} />{option.label}</span></Select.ItemText>
              <Select.ItemIndicator><Icon name="check" size={14} /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}
