import { useState } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import { skillIndex } from '../shared/skill-index';
import { Button } from './ui';
import { Icon } from './ui/Icon';
import './skills.css';

const skills = skillIndex(import.meta.glob<string>('../../.agents/skills/opendoc-*/agents/openai.yaml', {
  query: '?raw', import: 'default', eager: true,
}));

export function SkillIndex() {
  const [open, setOpen] = useState(false);
  return <Tooltip.Root open={open} onOpenChange={setOpen}>
    <Tooltip.Trigger render={<Button className="icon-button" aria-label="OpenDoc skills" onClick={() => setOpen(true)} />}>
      <Icon name="book" size={17} />
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner className="ui-positioner" side="top" align="end" sideOffset={8}>
        <Tooltip.Popup className="ui-menu-popup skill-index">
          <p className="skill-index-title">OpenDoc skills</p>
          <p className="skill-index-intro">Describe what you need; your agent follows the matching workflow. You can also name a skill.</p>
          <dl>{skills.map(skill => <div key={skill.name}>
            <dt>{skill.name}</dt><dd>{skill.description}</dd>
          </div>)}</dl>
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
