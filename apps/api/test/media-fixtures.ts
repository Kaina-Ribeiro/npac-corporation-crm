// Arquivos sintéticos para os testes de mídia (nenhum dado real).

const seg = (marker: number, payload: Buffer) => {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
};
export function jpegComExif(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'binary')),
    seg(0xe1, Buffer.from('Exif\0\0GPS-LAT-FICTICIA-23.5', 'binary')),
    seg(0xed, Buffer.from('Photoshop 3.0\0IPTC-FICTICIO', 'binary')),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from('dados-da-imagem', 'binary'),
    Buffer.from([0xff, 0xd9]),
  ]);
}
const chunk = (tipo: string, dados: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  return Buffer.concat([len, Buffer.from(tipo, 'ascii'), dados, Buffer.alloc(4)]);
};
export function pngComTexto(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13, 1)),
    chunk('eXIf', Buffer.from('GPS-FICTICIO')),
    chunk('tEXt', Buffer.from('Author\0Pessoa Ficticia')),
    chunk('IDAT', Buffer.from('pixels')),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const riff = (tipo: string, dados: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(dados.length);
  return Buffer.concat([
    Buffer.from(tipo, 'ascii'),
    len,
    dados,
    dados.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
  ]);
};
export function webpComExif(): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04; // EXIF e XMP presentes
  const corpo = Buffer.concat([
    Buffer.from('WEBP', 'ascii'),
    riff('VP8X', vp8x),
    riff('VP8 ', Buffer.from('quadro')),
    riff('EXIF', Buffer.from('GPS-FICTICIO')),
    riff('XMP ', Buffer.from('<x>Pessoa Ficticia</x>')),
  ]);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(corpo.length);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), len, corpo]);
}
