import type { ReactNode } from 'react';
import * as F from '@formepdf/react';
import { Block, Heading, MediaFrame, Paragraph, Presentation, Slide, TextSlot, type ImageFrameOptions } from 'opendoc';
import { themePage, themeType, type DocTheme } from 'opendoc/themes';

export { Presentation as CompanyProfile };
export type ProfileImageSource = Pick<ImageFrameOptions, 'fit' | 'position' | 'radius'> & { item: string; alt?: string };
export type ProfileBox = { x: number; y: number; width: number; height: number };
const boxStyle = ({ x, y, width, height }: ProfileBox): F.Style => ({ position: 'absolute', left: x, top: y, width, height });

/** A bounded, deliberately placed region. Add a slide when the material outgrows it. */
export function ProfileRegion({ children, ...box }: ProfileBox & { children?: ReactNode }) {
  return <F.View style={{ ...boxStyle(box), overflow: 'hidden' }}>{children}</F.View>;
}

export function ProfileRule({ theme, x, y, width }: { theme: DocTheme; x: number; y: number; width: number }) {
  return <F.View style={{ position: 'absolute', left: x, top: y, width, height: 1, backgroundColor: theme.line }} />;
}

export function ProfileText({ id, theme, children, size = 19, muted = false, label = false, style }: {
  id: string; theme: DocTheme; children: ReactNode; size?: number; muted?: boolean; label?: boolean; style?: F.Style;
}) {
  return <Paragraph id={id} role={label ? 'label' : undefined} style={{
    ...(label ? themeType(theme, 'label') : { fontFamily: theme.body }),
    fontSize: size, color: muted ? theme.muted : theme.ink, lineHeight: 1.3, marginTop: 0, marginBottom: 10, ...style,
  }}><TextSlot slot="text" from="children">{children}</TextSlot></Paragraph>;
}

/** No image is a labelled placeholder; a supplied missing media item is a render error. */
export function ProfileImage({ id, theme, image, label = 'Image position', ...box }: ProfileBox & {
  id: string; theme: DocTheme; image?: ProfileImageSource; label?: string;
}) {
  return <Block id={id} style={boxStyle(box)}>
    {image ? <MediaFrame {...image} width={box.width} height={box.height} /> : <F.View style={{ width: box.width, height: box.height, backgroundColor: theme.line, padding: 20, justifyContent: 'flex-end' }}>
      <F.Text style={{ fontFamily: theme.body, fontSize: 13, color: theme.ink }}><TextSlot slot="label" from="label">{label}</TextSlot></F.Text>
    </F.View>}
  </Block>;
}

export function ProfileSlide({ id, theme, title, eyebrow, children, cover = false, titleSize, folio, footer = 'COMPANY PROFILE' }: {
  id: string; theme: DocTheme; title: ReactNode; eyebrow?: ReactNode; children?: ReactNode;
  cover?: boolean; titleSize?: number; folio?: string; footer?: string;
}) {
  return <Slide id={id} padding={0} style={{ ...themePage(theme).style, backgroundColor: theme.paper, lineBreaking: 'greedy' }}>
    <ProfileRegion x={40} y={30} width={cover ? 440 : 880} height={28}>
      {eyebrow && <ProfileText id={`${id}-eyebrow`} theme={theme} size={12} label><TextSlot slot="eyebrow" from="eyebrow">{eyebrow}</TextSlot></ProfileText>}
    </ProfileRegion>
    <ProfileRegion x={40} y={cover ? 142 : 72} width={cover ? 464 : 880} height={cover ? 202 : 116}>
      <Heading id={`${id}-title`} level={1} style={{ ...themeType(theme, 'h1'), fontFamily: theme.heading, fontSize: titleSize ?? (cover ? 52 : 36), lineHeight: 1.08, marginTop: 0, marginBottom: 0 }}><TextSlot slot="title" from="title">{title}</TextSlot></Heading>
    </ProfileRegion>
    {children}
    <ProfileRule theme={theme} x={40} y={cover ? 494 : 496} width={cover ? 464 : 880} />
    <ProfileRegion x={40} y={508} width={cover ? 410 : 820} height={20}>
      <ProfileText id={`${id}-footer`} theme={theme} size={9} muted><TextSlot slot="footer" from="footer">{footer}</TextSlot></ProfileText>
    </ProfileRegion>
    {folio && <ProfileRegion x={cover ? 478 : 888} y={508} width={32} height={20}>
      <ProfileText id={`${id}-folio`} theme={theme} size={9} muted><TextSlot slot="folio" from="folio">{folio}</TextSlot></ProfileText>
    </ProfileRegion>}
  </Slide>;
}

/** Reusable ledger row: the number is navigation, never an invented business metric. */
export function ProfileRow({ id, theme, number, title, detail }: { id: string; theme: DocTheme; number: string; title: ReactNode; detail: ReactNode }) {
  return <F.View style={{ height: 90, overflow: 'hidden', borderTopWidth: 1, borderColor: theme.line, flexDirection: 'row', paddingTop: 14 }}>
    <F.View style={{ width: 60 }}><ProfileText id={`${id}-number`} theme={theme} size={15} muted><TextSlot slot="number" from="number">{number}</TextSlot></ProfileText></F.View>
    <F.View style={{ width: 260, paddingRight: 20 }}><ProfileText id={`${id}-title`} theme={theme} size={22}><TextSlot slot="title" from="title">{title}</TextSlot></ProfileText></F.View>
    <F.View style={{ flex: 1 }}><ProfileText id={`${id}-detail`} theme={theme} size={18} muted><TextSlot slot="detail" from="detail">{detail}</TextSlot></ProfileText></F.View>
  </F.View>;
}
