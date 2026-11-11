import { randomUUID } from 'node:crypto';
import { CAMPOS_SENSIVEIS } from '@npac/shared';
import { describe, expect, it } from 'vitest';
import { aad, MentoriaCrypto } from '../src/mentoria/mentoria-crypto.js';

const mc = new MentoriaCrypto(Buffer.alloc(32, 5));
const KB = 1024;

describe('cifra de texto da mentoria', () => {
  it('texto de 256 KB cabe; 256 KB + 1 é recusado antes de cifrar', () => {
    const id = randomUUID();
    const cabe = 'a'.repeat(256 * KB);
    const blob = mc.cifrarTexto(cabe, aad('mentoria_fichas', 'notas_momento_inicial', id));
    expect(mc.decifrarTexto(blob, aad('mentoria_fichas', 'notas_momento_inicial', id))).toBe(cabe);
    expect(() =>
      mc.cifrarTexto('a'.repeat(256 * KB + 1), aad('mentoria_fichas', 'notas_momento_inicial', id)),
    ).toThrow(/256 KB/);
  });

  it('limite conta bytes, não caracteres (acento ocupa 2 bytes)', () => {
    expect(() => mc.cifrarTexto('é'.repeat(128 * KB + 1), 'x')).toThrow(/256 KB/);
  });

  it('INSERT de linha cifrada usa id gerado no app e decifra com o mesmo AAD', () => {
    const id = randomUUID();
    const a = aad('mentoria_conquistas', 'descricao', id);
    expect(a).toBe(`mentoria_conquistas.descricao.${id}`);
    const blob = mc.cifrarTexto('Primeira viagem em família', a);
    expect(typeof blob).toBe('string');
    expect(blob).not.toContain('viagem');
    expect(mc.decifrarTexto(blob, a)).toBe('Primeira viagem em família');
    expect(() =>
      mc.decifrarTexto(blob, aad('mentoria_conquistas', 'descricao', randomUUID())),
    ).toThrow();
  });

  it('nulo e vazio passam como nulo (nada cifrado)', () => {
    expect(mc.cifrarOpcional(null, 'x')).toBeNull();
    expect(mc.decifrarOpcional(null, 'x')).toBeNull();
  });

  it('CAMPOS_SENSIVEIS cobre os textos sensíveis e deixa nome, datas e status em claro', () => {
    expect(CAMPOS_SENSIVEIS.mentoria_pessoas).toEqual(['whatsapp', 'email']);
    expect(CAMPOS_SENSIVEIS.mentoria_momento_inicial).toEqual(['dor', 'sonho', 'meta']);
    for (const cols of Object.values(CAMPOS_SENSIVEIS)) {
      for (const c of cols) expect(['nome', 'status', 'data', 'link_pasta']).not.toContain(c);
    }
  });

  it('índice cego é determinístico, não revela o valor e depende da chave', () => {
    const a = mc.indiceCego('+5511999990001');
    expect(a).toBe(mc.indiceCego('+5511999990001'));
    expect(a).not.toContain('999');
    expect(a).not.toBe(mc.indiceCego('+5511999990002'));
    expect(a).not.toBe(new MentoriaCrypto(Buffer.alloc(32, 6)).indiceCego('+5511999990001'));
  });
});
