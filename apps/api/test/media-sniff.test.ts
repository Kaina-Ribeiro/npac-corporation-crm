import { describe, expect, it } from 'vitest';
import { farejar, semMetadados } from '../src/mentoria/media-sniff.js';
import { jpegComExif, pngComTexto, webpComExif } from './media-fixtures.js';

describe('farejar', () => {
  it('reconhece JPEG, PNG, WEBP, MP4, MOV e PDF pela assinatura', () => {
    expect(farejar(jpegComExif())).toEqual({ tipo: 'FOTO', mime: 'image/jpeg' });
    expect(farejar(pngComTexto())).toEqual({ tipo: 'FOTO', mime: 'image/png' });
    expect(farejar(webpComExif())).toEqual({ tipo: 'FOTO', mime: 'image/webp' });
    expect(farejar(Buffer.from('\0\0\0\x18ftypisom\0\0\0\0', 'binary'))).toEqual({
      tipo: 'VIDEO',
      mime: 'video/mp4',
    });
    expect(farejar(Buffer.from('\0\0\0\x14ftypqt  \0\0\0\0', 'binary'))).toEqual({
      tipo: 'VIDEO',
      mime: 'video/quicktime',
    });
    expect(farejar(Buffer.from('%PDF-1.7\n...'))).toEqual({ tipo: 'PDF', mime: 'application/pdf' });
  });

  it('SVG e HTML são recusados mesmo com extensão de imagem', () => {
    expect(
      farejar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')),
    ).toBeNull();
    expect(farejar(Buffer.from('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(farejar(Buffer.from('GIF89a...'))).toBeNull();
    expect(farejar(Buffer.alloc(0))).toBeNull();
  });
});

describe('semMetadados', () => {
  it('JPEG perde APP1 (EXIF/GPS) e APP13 e mantém o resto', () => {
    const limpo = semMetadados(jpegComExif(), 'image/jpeg');
    const txt = limpo.toString('binary');
    expect(txt).not.toContain('Exif');
    expect(txt).not.toContain('GPS');
    expect(txt).not.toContain('IPTC');
    expect(txt).toContain('JFIF');
    expect(txt).toContain('dados-da-imagem');
    expect(farejar(limpo)?.mime).toBe('image/jpeg');
  });

  it('PNG perde eXIf e textos e mantém IHDR, IDAT e IEND', () => {
    const txt = semMetadados(pngComTexto(), 'image/png').toString('binary');
    expect(txt).not.toContain('GPS');
    expect(txt).not.toContain('Pessoa');
    expect(txt).toContain('IHDR');
    expect(txt).toContain('IDAT');
    expect(txt).toContain('IEND');
  });

  it('WEBP perde EXIF e XMP, ajusta as flags do VP8X e o tamanho do RIFF', () => {
    const limpo = semMetadados(webpComExif(), 'image/webp');
    const txt = limpo.toString('binary');
    expect(txt).not.toContain('GPS');
    expect(txt).not.toContain('Pessoa');
    expect(txt).toContain('VP8 ');
    expect(limpo.readUInt32LE(4)).toBe(limpo.length - 8);
    expect(limpo[20]! & 0x0c).toBe(0);
  });

  it('vídeo e PDF passam sem mudança (D17: sem remoção no MVP)', () => {
    const pdf = Buffer.from('%PDF-1.7 Autor Ficticio');
    expect(semMetadados(pdf, 'application/pdf').equals(pdf)).toBe(true);
  });
});
