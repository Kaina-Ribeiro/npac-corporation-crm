/**
 * Tipo do arquivo pela assinatura dos primeiros bytes (nunca pela extensão nem pelo cabeçalho
 * do cliente). Só JPEG, PNG, WEBP, MP4, MOV e PDF; SVG, HTML e o resto são recusados.
 */
export type TipoMidia = 'FOTO' | 'VIDEO' | 'PDF';
export type Farejado = { tipo: TipoMidia; mime: string };

const ascii = (b: Buffer, ini: number, fim: number) => b.subarray(ini, fim).toString('latin1');

export function farejar(b: Buffer): Farejado | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { tipo: 'FOTO', mime: 'image/jpeg' };
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { tipo: 'FOTO', mime: 'image/png' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP')
    return { tipo: 'FOTO', mime: 'image/webp' };
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp')
    return { tipo: 'VIDEO', mime: ascii(b, 8, 10) === 'qt' ? 'video/quicktime' : 'video/mp4' };
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-') return { tipo: 'PDF', mime: 'application/pdf' };
  return null;
}

/** JPEG: tira APP1 (EXIF, GPS, XMP), APP13 (IPTC) e comentários; o resto vai igual. */
function jpegLimpo(b: Buffer): Buffer {
  const partes: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1]!;
    if (marker === 0xda) break; // início da imagem: daqui em diante copia tudo
    const len = b.readUInt16BE(i + 2);
    const fim = i + 2 + len;
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) partes.push(b.subarray(i, fim));
    i = fim;
  }
  partes.push(b.subarray(i));
  return Buffer.concat(partes);
}

/** PNG: tira eXIf, tEXt, iTXt, zTXt e tIME. */
function pngLimpo(b: Buffer): Buffer {
  const fora = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
  const partes: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const fim = i + 12 + len;
    if (!fora.has(ascii(b, i + 4, i + 8))) partes.push(b.subarray(i, fim));
    i = fim;
  }
  return Buffer.concat(partes);
}

/** WEBP: tira os chunks EXIF e XMP, zera as flags no VP8X e corrige o tamanho do RIFF. */
function webpLimpo(b: Buffer): Buffer {
  const partes: Buffer[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const tipo = ascii(b, i, i + 4);
    const len = b.readUInt32LE(i + 4);
    const fim = i + 8 + len + (len % 2);
    if (tipo !== 'EXIF' && tipo !== 'XMP ') {
      const c = Buffer.from(b.subarray(i, fim));
      if (tipo === 'VP8X') c[8] = c[8]! & ~0x0c;
      partes.push(c);
    }
    i = fim;
  }
  const corpo = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...partes]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32LE(corpo.length);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), tam, corpo]);
}

/**
 * Imagem sem EXIF/GPS (D17). Vídeo e PDF passam como vieram (aceite do dono no MVP). Sem
 * biblioteca nova: o corte é por estrutura do arquivo, sem decodificar pixels.
 */
export function semMetadados(b: Buffer, mime: string): Buffer {
  if (mime === 'image/jpeg') return jpegLimpo(b);
  if (mime === 'image/png') return pngLimpo(b);
  if (mime === 'image/webp') return webpLimpo(b);
  return b;
}
