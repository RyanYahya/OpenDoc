import type { ReactNode, Ref } from 'react';
import { IconButton, Tabs } from './ui';
import { Icon } from './ui/Icon';
import type { PanelTab } from './readerPanel';
import './reader-panel.css';

/**
 * The reader's one side panel. Wide screens dock it beside the pages, which move over to make room; narrow
 * screens show it as a bottom sheet. Each tab owns its content and Escape handling; the shell owns placement,
 * the tabs, and closing.
 */
export function ReaderPanel({ tab, commentCount, sheet, onTabChange, onClose, closeRef, comments, history }: {
  tab: PanelTab;
  /** Open comments, shown on the Comments tab. */
  commentCount: number;
  sheet: boolean;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
  closeRef?: Ref<HTMLButtonElement>;
  comments: ReactNode;
  history: ReactNode;
}) {
  return <aside className="reader-panel" id="reader-panel" aria-label="Comments and history" data-layout={sheet ? 'sheet' : 'docked'}>
    <Tabs.Root value={tab} onValueChange={value => onTabChange(value as PanelTab)} className="reader-panel-tabs-root">
      <div className="reader-panel-header">
        <Tabs.List className="ui-tabs reader-panel-tabs" aria-label="Side panel">
          <Tabs.Tab className="ui-tab" value="comments">
            Comments<span className="reader-panel-count" aria-hidden="true">{commentCount}</span><span className="sr-only">, {commentCount} open</span>
          </Tabs.Tab>
          <Tabs.Tab className="ui-tab" value="history">History</Tabs.Tab>
        </Tabs.List>
        <IconButton ref={closeRef} className="reader-panel-close" label="Close panel" onClick={onClose}><Icon name="close" size={15} /></IconButton>
      </div>
      <Tabs.Panel className="reader-panel-content" value="comments">{comments}</Tabs.Panel>
      <Tabs.Panel className="reader-panel-content" value="history">{history}</Tabs.Panel>
    </Tabs.Root>
  </aside>;
}
