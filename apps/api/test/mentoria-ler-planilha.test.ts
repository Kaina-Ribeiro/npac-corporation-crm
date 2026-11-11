import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { lerPlanilha } from '../src/mentoria/importacao/ler-planilha.js';

type Linha = (string | number | Date | null)[];

async function arquivo(abas: Record<string, Linha[]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [nome, linhas] of Object.entries(abas)) {
    const ws = wb.addWorksheet(nome);
    for (const l of linhas) ws.addRow(l);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const CABECALHO = [
  'Carimbo de data/hora',
  'Nome completo',
  'Como gosta de ser chamado?',
  'Telefone',
  'E-mail',
  'Instagram',
  'CPF',
  'Endereço completo',
  'Nome do cônjuge',
  'Cônjuge participa?',
  'Maior sonho',
  'Maior medo',
  'Tamanho da pulseira',
  'Link da foto',
  'Motivação',
  'Camiseta',
  'Livros',
];

const linhaForm = (nome: string, cpf = '111.111.111-11') => [
  new Date(Date.UTC(2026, 0, 10, 14, 30)),
  nome,
  'Fic',
  '11900000001',
  'ficticio@exemplo.com',
  '@ficticio',
  cpf,
  'Rua Fictícia, 1',
  'Pessoa Fictícia',
  'Sim',
  'Sonho fictício',
  'Medo fictício',
  'M',
  'https://exemplo.com/foto',
  'Motivo fictício',
  'G',
  'Livro fictício',
];

describe('lerPlanilha', () => {
  it('lê as três abas', async () => {
    const lida = await lerPlanilha(
      await arquivo({
        RESPOSTASFORMS: [CABECALHO, linhaForm('Fictício Um')],
        'PROCESSOS 2M6M': [
          ['Nome', 'Mentoria', 'Data de início', 'Status'],
          ['Fictício Um', '6M CASAL', new Date(Date.UTC(2026, 1, 3)), 'verde'],
        ],
        CANCELAMENTOS: [['Nome'], ['Fictício Dois']],
        OUTRA: [['Nome'], ['Não deve entrar']],
      }),
    );
    expect(lida.respostas[0]).toMatchObject({
      carimbo: '2026-01-10T14:30:00.000Z',
      nome: 'Fictício Um',
      apelido: 'Fic',
      telefone: '11900000001',
      email: 'ficticio@exemplo.com',
      instagram: '@ficticio',
      endereco: 'Rua Fictícia, 1',
      conjuge: 'Pessoa Fictícia',
      conjugeParticipa: true,
      sonho: 'Sonho fictício',
      medo: 'Medo fictício',
      pulseira: 'M',
      foto: 'https://exemplo.com/foto',
      motivacao: 'Motivo fictício',
      camiseta: 'G',
      livros: 'Livro fictício',
    });
    expect(lida.processos).toEqual([
      { nome: 'Fictício Um', mentoria: '6M CASAL', dataInicio: '2026-02-03', status: 'verde' },
    ]);
    expect(lida.cancelamentos).toEqual([{ nome: 'Fictício Dois', mentoria: null }]);
  });

  it('CPF nunca aparece em PlanilhaLida', async () => {
    const cpf = '987.654.321-00';
    const lida = await lerPlanilha(
      await arquivo({ RESPOSTASFORMS: [CABECALHO, linhaForm('Fictício Um', cpf)] }),
    );
    const tudo = JSON.stringify(lida);
    expect(tudo).not.toContain(cpf);
    expect(tudo).not.toContain('987');
    expect(tudo.toLowerCase()).not.toContain('cpf');
  });

  it('coluna com CPF no título nunca é lida, mesmo citando outro campo', async () => {
    const lida = await lerPlanilha(
      await arquivo({
        RESPOSTASFORMS: [
          ['CPF e telefone', 'Nome completo'],
          ['987.654.321-00', 'Fictício Um'],
        ],
      }),
    );
    expect(lida.respostas[0]!.telefone).toBeNull();
    expect(JSON.stringify(lida)).not.toContain('987');
  });

  it('colunas fora de ordem são lidas pelo título', async () => {
    const lida = await lerPlanilha(
      await arquivo({
        RESPOSTASFORMS: [
          ['E-mail', 'Maior medo', 'Nome completo', 'Nome do cônjuge'],
          ['a@exemplo.com', 'Medo fictício', 'Fictício Um', 'Pessoa Fictícia'],
        ],
      }),
    );
    expect(lida.respostas[0]).toMatchObject({
      nome: 'Fictício Um',
      email: 'a@exemplo.com',
      medo: 'Medo fictício',
      conjuge: 'Pessoa Fictícia',
    });
  });

  it('título com acento, caixa e espaços diferentes ainda é achado', async () => {
    const lida = await lerPlanilha(
      await arquivo({
        ' respostasforms ': [
          ['  NOME COMPLETO ', 'ENDERECO'],
          ['Fictício Um', 'Rua Fictícia'],
        ],
      }),
    );
    expect(lida.respostas[0]).toMatchObject({ nome: 'Fictício Um', endereco: 'Rua Fictícia' });
  });

  it('"Endereço de e-mail" do Forms não é lido como endereço de entrega', async () => {
    const lida = await lerPlanilha(
      await arquivo({
        RESPOSTASFORMS: [
          ['Endereço de e-mail', 'Nome completo', 'Endereço completo'],
          ['a@exemplo.com', 'Fictício Um', 'Rua Fictícia, 1'],
        ],
      }),
    );
    expect(lida.respostas[0]).toMatchObject({
      email: 'a@exemplo.com',
      endereco: 'Rua Fictícia, 1',
    });
  });

  it('título mesclado acima dos cabeçalhos é pulado (CANCELAMENTOS da equipe)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('CANCELAMENTOS');
    ws.addRow(['Dados Mentorado']);
    ws.mergeCells('A1:E1');
    ws.addRow(['Data pedido de reembolso', 'Nome do mentorado', 'Data de entrada', 'Motivo']);
    ws.addRow([46111, 'Fictício Dois', 'Fevereiro', 'Motivo fictício']);
    ws.addRow([null, 'Fictício Três']);
    const lida = await lerPlanilha(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(lida.cancelamentos).toEqual([
      { nome: 'Fictício Dois', mentoria: null },
      { nome: 'Fictício Três', mentoria: null },
    ]);
  });

  it('linha sem nome é pulada', async () => {
    const lida = await lerPlanilha(
      await arquivo({
        RESPOSTASFORMS: [
          ['Nome completo', 'Telefone'],
          [null, '11900000001'],
          ['Fictício Um', null],
        ],
      }),
    );
    expect(lida.respostas).toHaveLength(1);
  });

  it('telefone numérico vira texto', async () => {
    const lida = await lerPlanilha(
      await arquivo({
        RESPOSTASFORMS: [
          ['Nome completo', 'Telefone'],
          ['Fictício Um', 11900000001],
        ],
      }),
    );
    expect(lida.respostas[0]!.telefone).toBe('11900000001');
  });

  it('planilha acima de 5.000 linhas é recusada', async () => {
    const linhas: Linha[] = [['Nome completo']];
    for (let i = 0; i < 5001; i += 1) linhas.push([`Fictício ${i}`]);
    await expect(lerPlanilha(await arquivo({ RESPOSTASFORMS: linhas }))).rejects.toThrow(
      /5\.000 linhas/,
    );
  });

  it('arquivo sem nenhuma das abas é recusado', async () => {
    await expect(lerPlanilha(await arquivo({ OUTRA: [['Nome'], ['x']] }))).rejects.toThrow(/abas/);
  });

  it('arquivo que não é planilha é recusado', async () => {
    await expect(lerPlanilha(Buffer.from('não é xlsx'))).rejects.toThrow(/planilha/);
  });
});
