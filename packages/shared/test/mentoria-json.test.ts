import { describe, expect, it } from 'vitest';
import { backupSchema, nomeArquivoBackup } from '../src/mentoria/json-backup.js';

const ID = '11111111-1111-4111-8111-111111111111';
const valido = {
  formato: 'npac-acompanhamento',
  versao: 1,
  modulo: 'dashboard',
  exportadoEm: '2026-11-04T12:00:00.000Z',
  registros: [{ id: ID, nome: 'Mentorado Fictício 01', status: 'ENGAJADO' }],
};

describe('backup .json', () => {
  it('aceita o formato do CRM', () => {
    expect(backupSchema.safeParse(valido).success).toBe(true);
  });
  it('.json com cabeçalho diferente é recusado', () => {
    expect(backupSchema.safeParse({ ...valido, formato: 'outro' }).success).toBe(false);
    expect(backupSchema.safeParse({ ...valido, versao: 2 }).success).toBe(false);
    expect(backupSchema.safeParse({ registros: [] }).success).toBe(false);
  });
  it('campo desconhecido no registro é recusado', () => {
    const r = { ...valido, registros: [{ ...valido.registros[0], cpf: 'x' }] };
    expect(backupSchema.safeParse(r).success).toBe(false);
  });
  it('nome do arquivo leva só módulo e data', () => {
    expect(nomeArquivoBackup('rdv', '2026-11-04T12:00:00.000Z')).toBe(
      'acompanhamento-rdv-2026-11-04.json',
    );
  });
});
