import { describe, expect, it } from 'vitest';
import { AVISO_GRAVACAO, idDoDrive, previewDoDrive } from '../src/mentoria/reunioes.js';
import { reuniaoPatchSchema } from '../src/schemas/mentoria.js';

const ID = '1AbC_dEf-GhIjKlMnOp';

describe('gravação da reunião (NPAC-78)', () => {
  it('acha o id nos links do Drive de arquivo', () => {
    expect(idDoDrive(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(idDoDrive(`https://drive.google.com/file/d/${ID}/view`)).toBe(ID);
    expect(idDoDrive(`https://drive.google.com/file/d/${ID}`)).toBe(ID);
    expect(idDoDrive(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(idDoDrive(`  https://drive.google.com/file/d/${ID}/view  `)).toBe(ID);
  });

  it('recusa o que não é arquivo do Drive', () => {
    for (const url of [
      `https://drive.google.com/drive/folders/${ID}`,
      `https://docs.google.com/document/d/${ID}/edit`,
      `http://drive.google.com/file/d/${ID}/view`,
      `https://drive.google.com.evil.com/file/d/${ID}/view`,
      `https://evil.com/drive.google.com/file/d/${ID}`,
      'https://drive.google.com/file/d/curto/view',
      'https://drive.google.com/open?id=',
      'não é link',
      '',
    ])
      expect(idDoDrive(url), url).toBeNull();
  });

  it('o player usa o endereço de prévia do Drive', () => {
    expect(previewDoDrive(ID)).toBe(`https://drive.google.com/file/d/${ID}/preview`);
  });

  it('o PATCH aceita link do Drive, apaga com vazio e recusa o resto', () => {
    const link = `https://drive.google.com/file/d/${ID}/view`;
    expect(reuniaoPatchSchema.parse({ version: 1, gravacao: link }).gravacao).toBe(link);
    expect(reuniaoPatchSchema.parse({ version: 1, gravacao: '' }).gravacao).toBeNull();
    expect(reuniaoPatchSchema.parse({ version: 1, gravacao: null }).gravacao).toBeNull();
    const r = reuniaoPatchSchema.safeParse({ version: 1, gravacao: 'https://youtube.com/x' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(AVISO_GRAVACAO);
  });
});
