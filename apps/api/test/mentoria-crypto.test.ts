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

  it('AAD de mentoria_ficha_campos usa ficha_id e chave', () => {
    const ficha = randomUUID();
    expect(aad('mentoria_ficha_campos', 'antes', ficha, 'FE')).toBe(
      `mentoria_ficha_campos.antes.${ficha}.FE`,
    );
  });

  it('nulo e vazio passam como nulo (nada cifrado)', () => {
    expect(mc.cifrarOpcional(null, 'x')).toBeNull();
    expect(mc.decifrarOpcional(null, 'x')).toBeNull();
  });

  it('CAMPOS_SENSIVEIS cobre os textos sensíveis e deixa nome, datas e status em claro', () => {
    expect(CAMPOS_SENSIVEIS.mentoria_fichas).toEqual(
      expect.arrayContaining(['notas_momento_inicial', 'notas_momento_atual']),
    );
    expect(CAMPOS_SENSIVEIS.mentoria_rdv_diagnostico).toHaveLength(9);
    for (const cols of Object.values(CAMPOS_SENSIVEIS)) {
      for (const c of cols) expect(['nome', 'status', 'data', 'pasta_url']).not.toContain(c);
    }
  });
});
