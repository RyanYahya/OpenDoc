import type { RefObject } from 'react';
import { Popover } from '@base-ui/react/popover';
import { skillIndex } from '../shared/skill-index';
import { Button } from './ui';
import { Icon } from './ui/Icon';
import './skills.css';

const skills = skillIndex(import.meta.glob<string>('../../.agents/skills/opendoc-*/agents/openai.yaml', {
  query: '?raw', import: 'default', eager: true,
}));

/** The skill list as a non-modal reference panel. The reader opens it from its app menu, anchored to that menu's button. */
export function SkillIndexPopup({ anchor, finalFocus }: { anchor?: RefObject<HTMLElement | null>; finalFocus?: RefObject<HTMLElement | null> }) {
  return <Popover.Portal>
    <Popover.Positioner className="ui-positioner" anchor={anchor} side={anchor ? 'bottom' : 'top'} align="end" sideOffset={8} collisionPadding={8}>
      <Popover.Popup className="ui-popover-popup skill-index" finalFocus={finalFocus}>
        <Popover.Title className="skill-index-title">Agent skills</Popover.Title>
        <Popover.Description className="skill-index-intro">Describe what you need; your agent follows the matching workflow. To pick one yourself, give your agent its skill name.</Popover.Description>
        <dl>{skills.map(skill => <div key={skill.name}>
          <dt>{skill.title} <code className="skill-index-name">{skill.name}</code></dt><dd>{skill.description}</dd>
        </div>)}</dl>
      </Popover.Popup>
    </Popover.Positioner>
  </Popover.Portal>;
}

/** The sidebar's labelled entry to the same reference. */
export function SkillIndex() {
  return <Popover.Root>
    <Popover.Trigger render={<Button className="tool-button skill-index-trigger" />}><Icon name="book" size={16} /><span>Skills</span></Popover.Trigger>
    <SkillIndexPopup />
  </Popover.Root>;
}
