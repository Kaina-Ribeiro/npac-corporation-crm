import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, type ReadStream } from 'node:fs';
import { rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Armazenamento de mídia do Acompanhamento (regra 7, D16): o registro guarda só a chave; o
 * arquivo fica fora do banco. A interface deixa trocar o volume por um object store depois.
 */
export interface MediaStore {
  put(dados: Buffer): Promise<string>;
  get(chave: string): ReadStream;
  delete(chave: string): Promise<void>;
  size(chave: string): Promise<number>;
}

const CHAVE = /^[0-9a-f-]{36}$/;
const segura = (chave: string) => {
  if (!CHAVE.test(chave)) throw new Error('Chave de mídia inválida');
  return chave;
};

/** Volume do servidor em MEDIA_DIR. Nome do arquivo = UUID do servidor (nunca o nome original). */
export class VolumeMediaStore implements MediaStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  async put(dados: Buffer): Promise<string> {
    const chave = randomUUID();
    await writeFile(join(this.dir, chave), dados, { flag: 'wx', mode: 0o600 });
    return chave;
  }
  get(chave: string): ReadStream {
    return createReadStream(join(this.dir, segura(chave)));
  }
  async delete(chave: string): Promise<void> {
    await rm(join(this.dir, segura(chave)), { force: true });
  }
  async size(chave: string): Promise<number> {
    return (await stat(join(this.dir, segura(chave)))).size;
  }
}

export const MEDIA_STORE = Symbol('MEDIA_STORE');
