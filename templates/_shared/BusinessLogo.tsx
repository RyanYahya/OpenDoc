import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { Block } from 'opendoc';
import type { DocTheme } from 'opendoc/themes';

/** Replace the placeholder with supplied artwork, or pass null to omit the slot. */
export function BusinessLogo({ id, theme, children }: { id: string; theme: DocTheme; children?: ReactNode }) {
  if (children === null || children === false) return null;
  return <Block id={id} style={{ width: 88, alignItems: 'flex-end' }}>
    {children === undefined ? <F.View wrap={false} style={{ width: 88, height: 28, borderWidth: 0.6, borderColor: theme.line, alignItems: 'center', justifyContent: 'center' }}>
      <F.Text style={{ fontSize: 8, letterSpacing: 1.2, color: theme.muted }}>YOUR LOGO</F.Text>
    </F.View> : children}
  </Block>;
}
