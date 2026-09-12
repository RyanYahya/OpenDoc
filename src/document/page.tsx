import { deflateSync } from 'node:zlib';
import { Page as NativePage, parseColor, type PageProps as NativePageProps } from '@formepdf/react';
import { readyMedia, mediaUri, framedMedia, pageImage, type ImageFrameOptions } from '../media/render';

export interface PageProps extends NativePageProps {
  /** Document-owned media item; includes freshness checks and rendered usage tracking. */
  backgroundMedia?: string;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A tiny lossless image uses the renderer's actual full-page background layer. */
function solidBackground(input: string) {
  const color = ({ white: '#ffffff', black: '#000000', transparent: '#00000000' } as Record<string, string>)[input.toLowerCase()] ?? input;
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) && !/^rgba?\([\d.,\s]+\)$/i.test(color)) throw new Error('Page backgroundColor needs a hex or rgb/rgba color.');
  const { r, g, b, a } = parseColor(color);
  if ([r, g, b, a].some(channel => !Number.isFinite(channel) || channel < 0 || channel > 1)) throw new Error('Page backgroundColor contains an invalid color channel.');
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  const pixel = Buffer.from([0, ...[r, g, b, a].map(channel => Math.round(channel * 255))]);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixel)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Native flow and geometry, with backgroundColor painted behind every continuation page. */
export function Page({ style, backgroundImage, backgroundMedia, ...props }: PageProps) {
  if (backgroundMedia !== undefined && backgroundImage !== undefined) throw new Error('Page accepts either backgroundMedia or backgroundImage, not both.');
  const sizes = {A4: [595.28, 841.89], A3: [841.89, 1190.55], A5: [419.53, 595.28], Letter: [612, 792], Legal: [612, 1008], Tabloid: [792, 1224]} as const;
  const size = props.size ?? 'A4';
  const [width, height] = typeof size === 'string' ? sizes[size] : [size.width, size.height];
  const fit = props.backgroundSize ?? (backgroundMedia !== undefined ? 'cover' : 'fill');
  const positions = {'center': {x: .5, y: .5}, 'top-left': {x: 0, y: 0}, 'top-right': {x: 1, y: 0}, 'bottom-left': {x: 0, y: 1}, 'bottom-right': {x: 1, y: 1}};
  const frame: ImageFrameOptions | undefined = fit === 'fill' ? undefined : {width, height, fit, position: positions[props.backgroundPosition ?? 'center']};
  const asset = backgroundMedia !== undefined ? readyMedia(backgroundMedia) : undefined;
  // The native background layer stretches its bitmap. Prepare cover/contain at the page ratio first.
  const image = asset ? (frame ? framedMedia(asset, frame) : mediaUri(asset)) : backgroundImage !== undefined ? pageImage(backgroundImage, frame) : undefined;
  if (style?.backgroundColor === undefined || image !== undefined) return <NativePage {...props} backgroundImage={image} style={style} />;
  const { backgroundColor, ...contentStyle } = style;
  return <NativePage {...props} style={contentStyle} backgroundImage={solidBackground(backgroundColor)} backgroundSize="fill" backgroundPosition="center" />;
}
