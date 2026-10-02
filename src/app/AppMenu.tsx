import { useRef, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import type { Appearance } from './appearance';
import { AppearanceSubmenu } from './AppearanceControl';
import { SkillIndexPopup } from './SkillIndex';
import { IconButton } from './ui';
import { Icon } from './ui/Icon';

/**
 * The reader's app-wide menu: the agent skills reference and appearance, named for exactly those two,
 * as the sidebar footer's Skills and appearance buttons are. Document actions stay in the document's
 * own options menu.
 */
export function AppMenu({ appearance, onAppearanceChange }: { appearance: Appearance; onAppearanceChange: (value: Appearance) => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [skills, setSkills] = useState(false);
  const showSkills = useRef(false);
  return <>
    <Menu.Root onOpenChangeComplete={open => {
      // Open the reference once the menu has closed and returned focus to its button.
      if (!open && showSkills.current) { showSkills.current = false; setSkills(true); }
    }}>
      <Menu.Trigger ref={trigger} render={<IconButton label="Skills and appearance" className="reader-app-menu" />}><Icon name="gear" size={18} /></Menu.Trigger>
      <Menu.Portal><Menu.Positioner className="ui-positioner" align="end" sideOffset={8}>
        <Menu.Popup className="ui-menu-popup">
          <Menu.Item className="ui-menu-item" onClick={() => { showSkills.current = true; }}><Icon name="book" size={16} /><span>Agent skills</span></Menu.Item>
          <Menu.Separator className="ui-menu-separator" />
          <AppearanceSubmenu value={appearance} onChange={onAppearanceChange} />
        </Menu.Popup>
      </Menu.Positioner></Menu.Portal>
    </Menu.Root>
    <Popover.Root open={skills} onOpenChange={setSkills}>
      <SkillIndexPopup anchor={trigger} finalFocus={trigger} />
    </Popover.Root>
  </>;
}
