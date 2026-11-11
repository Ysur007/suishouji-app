import type { GlyphKey, ToneKey } from '../lib/types';
import { GLYPH_MAP } from './Icons';

export function FolderIcon({ tone, glyph }: { tone: ToneKey; glyph: GlyphKey }) {
  const Glyph = GLYPH_MAP[glyph] ?? GLYPH_MAP.book;
  return (
    <div className="folder-icon" data-tone={tone} aria-hidden>
      <div className="folder-icon__tab" />
      <div className="folder-icon__back" />
      <div className="folder-icon__paper" />
      <div className="folder-icon__front" />
      <div className="folder-icon__glyph">
        <Glyph width="100%" height="100%" />
      </div>
      <div className="folder-icon__dash" />
    </div>
  );
}
