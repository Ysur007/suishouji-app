import type { ComponentType, SVGProps } from 'react';
import type { GlyphKey } from '../lib/types';

type P = SVGProps<SVGSVGElement>;

function svgProps(props: P): P {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  };
}

export function IconRecord(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4.5 6.8c0-1.3 1-2.3 2.3-2.3h10.4c1.3 0 2.3 1 2.3 2.3v7.2c0 1.3-1 2.3-2.3 2.3H10l-3.9 3v-3h-.1c-.8 0-1.5-.7-1.5-1.5z" />
      <path d="M8.4 8.6h7.2M8.4 12h4.6" />
    </svg>
  );
}

export function IconSpace(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4 7.6c0-1.1.9-2 2-2h3.3l1.6 2h6.9c1.1 0 2 .9 2 2v7.2c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2z" />
    </svg>
  );
}

export function IconFolder(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M3.6 8.2c0-1.2 1-2.2 2.2-2.2h2.9l1.7 2.1h7.8c1.2 0 2.2 1 2.2 2.2v6.3c0 1.2-1 2.2-2.2 2.2H5.8c-1.2 0-2.2-1-2.2-2.2z" />
    </svg>
  );
}

export function IconUser(p: P) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="12" cy="8.6" r="3.4" />
      <path d="M5.4 19.4c0-3.2 3-5.8 6.6-5.8s6.6 2.6 6.6 5.8" />
    </svg>
  );
}

export function IconUsers(p: P) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="9.4" cy="9" r="3.1" />
      <path d="M3.8 19.2c0-2.9 2.5-5.2 5.6-5.2s5.6 2.3 5.6 5.2" />
      <path d="M16 6.2a3 3 0 0 1 0 5.8M17.6 14.4c1.7.6 2.9 2.2 2.9 4.1" />
    </svg>
  );
}

export function IconShare(p: P) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="17.4" cy="6.4" r="2.4" />
      <circle cx="6.6" cy="12" r="2.4" />
      <circle cx="17.4" cy="17.6" r="2.4" />
      <path d="M8.8 10.8l6.4-3.2M8.8 13.2l6.4 3.2" />
    </svg>
  );
}

export function IconPlus(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 5.6v12.8M5.6 12h12.8" />
    </svg>
  );
}

export function IconSend(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 19V5.6M12 5.6 6.4 11.2M12 5.6l5.6 5.6" />
    </svg>
  );
}

export function IconTimeline(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M7.6 4.6v14.8" />
      <circle cx="7.6" cy="8" r="2.1" />
      <circle cx="7.6" cy="16" r="2.1" />
      <path d="M12.6 8h6.6M12.6 16h4.4" />
    </svg>
  );
}

export function IconArrowDown(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 5.4v13M6.8 13.2 12 18.4l5.2-5.2" />
    </svg>
  );
}

export function IconSearch(p: P) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.6 15.6 3.4 3.4" />
    </svg>
  );
}

export function IconGear(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4 8.4h5.2M13.6 8.4H20M4 15.6h4.2M12.6 15.6H20" />
      <circle cx="11.4" cy="8.4" r="2.1" />
      <circle cx="10.4" cy="15.6" r="2.1" />
    </svg>
  );
}

export function IconBack(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  );
}

export function IconCopy(p: P) {
  return (
    <svg {...svgProps(p)}>
      <rect x="9" y="9" width="10.5" height="10.5" rx="2.4" />
      <path d="M15 6.6V6a2 2 0 0 0-2-2H6.4a2 2 0 0 0-2 2v6.6a2 2 0 0 0 2 2h.6" />
    </svg>
  );
}

export function IconEdit(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4.6 19.4h3.1l9.4-9.4a2.2 2.2 0 0 0 0-3.1l-.9-.9a2.2 2.2 0 0 0-3.1 0l-9.4 9.4v3.1z" />
      <path d="m14 7.4 2.6 2.6" />
    </svg>
  );
}

export function IconPin(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 15.4V21M8.4 4.2h7.2l-.8 4.1 2.4 2.5H6.8l2.4-2.5z" />
    </svg>
  );
}

export function IconTrash(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4.8 7.2h14.4M9.6 7.2V5.4c0-.7.5-1.2 1.2-1.2h2.4c.7 0 1.2.5 1.2 1.2v1.8M6.6 7.2l.8 11c0 1 .8 1.8 1.8 1.8h5.6c1 0 1.8-.8 1.8-1.8l.8-11" />
    </svg>
  );
}

export function IconMore(p: P) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="5.4" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconClose(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6" />
    </svg>
  );
}

export function IconImage(p: P) {
  return (
    <svg {...svgProps(p)}>
      <rect x="3.8" y="5" width="16.4" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m4.4 16.6 4.4-4a2 2 0 0 1 2.7 0l3 2.9M14 14.6l1.8-1.6a2 2 0 0 1 2.6 0l1.6 1.4" />
    </svg>
  );
}

export function IconSpark(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 4.4l1.5 4.6 4.6 1.5-4.6 1.5-1.5 4.6-1.5-4.6L6 10.5l4.6-1.5z" />
      <path d="M18 16.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

export function IconDownload(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 4.6v10.2M8 11.2l4 3.6 4-3.6M5.4 18.6h13.2" />
    </svg>
  );
}

export function IconUpload(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 19V8.8M8 12.4 12 8.4l4 4M5.4 5.4h13.2" />
    </svg>
  );
}

export function IconCheck(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="m5.4 12.6 4.2 4.2L18.6 7.8" />
    </svg>
  );
}

export function IconDevice(p: P) {
  return (
    <svg {...svgProps(p)}>
      <rect x="7.4" y="3.4" width="9.2" height="17.2" rx="2.6" />
      <path d="M10.6 6.6h2.8" />
    </svg>
  );
}

/* ----------------------------- 文件夹字形 ----------------------------- */

export function GlyphBook(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M5 5.4h6v13H5a1 1 0 0 1-1-1V6.4a1 1 0 0 1 1-1zM19 5.4h-6v13h6a1 1 0 0 0 1-1V6.4a1 1 0 0 0-1-1z" />
      <path d="M11 5.4v13" />
    </svg>
  );
}

export function GlyphLines(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M5 6.6h14M5 10.2h14M5 13.8h9.4M5 17.4h6.4" />
    </svg>
  );
}

export function GlyphWave(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4 9.4c2.2 0 2.2 5.2 4.4 5.2S10.6 9.4 12.8 9.4s2.2 5.2 4.4 5.2" />
    </svg>
  );
}

export function GlyphRoute(p: P) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="6.4" cy="7" r="2.2" />
      <circle cx="17.6" cy="17" r="2.2" />
      <path d="M8.6 7h3.4a3 3 0 0 1 0 6H9.8a3 3 0 0 0 0 6h5.6" />
    </svg>
  );
}

export function GlyphCheck(p: P) {
  return (
    <svg {...svgProps(p)}>
      <rect x="4.6" y="4.6" width="14.8" height="14.8" rx="3.4" />
      <path d="m8.4 12.2 2.5 2.5 4.7-5" />
    </svg>
  );
}

export function GlyphCode(p: P) {
  return (
    <svg {...svgProps(p)}>
      <path d="m9.2 8.4-4 3.6 4 3.6M14.8 8.4l4 3.6-4 3.6" />
    </svg>
  );
}

export function GlyphCamera(p: P) {
  return (
    <svg {...svgProps(p)}>
      <rect x="3.6" y="7.2" width="16.8" height="11.4" rx="3" />
      <circle cx="12" cy="12.9" r="3.2" />
      <path d="M8.6 7.2 9.8 5h4.4l1.2 2.2" />
    </svg>
  );
}

export const GLYPH_MAP: Record<GlyphKey, ComponentType<P>> = {
  book: GlyphBook,
  lines: GlyphLines,
  spark: IconSpark,
  route: GlyphRoute,
  wave: GlyphWave,
  check: GlyphCheck,
  code: GlyphCode,
  camera: GlyphCamera,
};

/** 品牌 / 头像用的抽象记号：两条错落的便签线 */
export function BrandGlyph(p: P) {
  return (
    <svg {...svgProps(p)} strokeWidth={2}>
      <path d="M6 8.6h8.4M6 12.4h12M6 16.2h6.4" />
    </svg>
  );
}
