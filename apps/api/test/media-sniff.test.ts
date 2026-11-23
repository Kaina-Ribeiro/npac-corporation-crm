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

  it('PDF passa sem mudança', () => {
    const pdf = Buffer.from('%PDF-1.7 Autor Ficticio');
    expect(semMetadados(pdf, 'application/pdf').equals(pdf)).toBe(true);
  });

  it('MP4/MOV perde localização e aparelho (udta, meta, uuid) e mantém o vídeo no lugar', () => {
    const video = mp4ComGps();
    const limpo = semMetadados(video, 'video/quicktime');
    const txt = limpo.toString('latin1');
    // Localização do iPhone (meta), do Android (udta ©xyz), da trilha (loci) e XMP (uuid).
    expect(txt).not.toContain('+23.5505-046.6333');
    expect(txt).not.toContain('+19.4326-099.1332');
    expect(txt).not.toContain('Loc Ficticia');
    expect(txt).not.toContain('GPSLatitude');
    expect(txt).not.toContain('iPhone Ficticio');
    // Mesmo tamanho e mesmas posições: os índices (stco) que apontam para o mdat continuam certos.
    expect(limpo.length).toBe(video.length);
    expect(limpo.indexOf('QUADROS-DO-VIDEO')).toBe(video.indexOf('QUADROS-DO-VIDEO'));
    expect(txt).toContain('mvhd');
    expect(txt).toContain('tkhd');
    expect(farejar(limpo)?.tipo).toBe('VIDEO');
    // O original não é alterado.
    expect(video.toString('latin1')).toContain('+23.5505-046.6333');
  });

  it('MP4 com caixa de tamanho 64 bits e caixa quebrada não lança', () => {
    const grande = caixa64('udta', Buffer.from('©xyz+10.0000-010.0000/'));
    const v = Buffer.concat([caixa('ftyp', Buffer.from('isom0000')), grande]);
    expect(semMetadados(v, 'video/mp4').toString('latin1')).not.toContain('+10.0000');
    const quebrado = Buffer.concat([
      caixa('ftyp', Buffer.from('isom0000')),
      Buffer.from([0, 0, 0, 99]),
    ]);
    expect(() => semMetadados(quebrado, 'video/mp4')).not.toThrow();
  });
});

function caixa(tipo: string, corpo: Buffer): Buffer {
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + corpo.length);
  h.write(tipo, 4, 'latin1');
  return Buffer.concat([h, corpo]);
}

function caixa64(tipo: string, corpo: Buffer): Buffer {
  const h = Buffer.alloc(16);
  h.writeUInt32BE(1);
  h.write(tipo, 4, 'latin1');
  h.writeBigUInt64BE(BigInt(16 + corpo.length), 8);
  return Buffer.concat([h, corpo]);
}

function mp4ComGps(): Buffer {
  const s = (t: string) => Buffer.from(t, 'latin1');
  const moov = caixa(
    'moov',
    Buffer.concat([
      caixa('mvhd', Buffer.alloc(20)),
      caixa('udta', caixa('©xyz', s('+19.4326-099.1332/'))),
      caixa('meta', s('com.apple.quicktime.location.ISO6709 +23.5505-046.6333/ iPhone Ficticio')),
      caixa(
        'trak',
        Buffer.concat([
          caixa('tkhd', Buffer.alloc(20)),
          caixa('udta', caixa('loci', s('Loc Ficticia'))),
        ]),
      ),
    ]),
  );
  return Buffer.concat([
    caixa('ftyp', s('qt  0000')),
    caixa('uuid', s('BE7ACFCB97A942E89C71999491E3AFAC<x:xmpmeta GPSLatitude="1"/>')),
    moov,
    caixa('mdat', s('QUADROS-DO-VIDEO')),
  ]);
}
