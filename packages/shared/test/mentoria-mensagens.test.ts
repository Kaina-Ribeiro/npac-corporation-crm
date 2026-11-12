import { describe, expect, it } from 'vitest';
import { itemEhMeu, itemVisivel, type FilaItemBase } from '../src/mentoria/fila.js';
import {
  linkGrupoValido,
  linkWhatsApp,
  momentoDoItem,
  renderMensagem,
  textoPronto,
} from '../src/mentoria/mensagens.js';

describe('renderMensagem', () => {
  it('{nome} usa o apelido', () => {
    expect(renderMensagem('Oi {nome}!', [{ nome: 'Ana Lima', apelido: 'Aninha' }])).toBe(
      'Oi Aninha!',
    );
  });
  it('{nomes} junta o casal', () => {
    expect(
      renderMensagem('Oi {nomes}!', [
        { nome: 'Ana', apelido: null },
        { nome: 'Bia', apelido: null },
      ]),
    ).toBe('Oi Ana e Bia!');
  });
  it('sem apelido, o primeiro nome', () => {
    expect(renderMensagem('{nome}, tudo bem?', [{ nome: 'Ana Lima', apelido: '  ' }])).toBe(
      'Ana, tudo bem?',
    );
  });
});

describe('textoPronto', () => {
  const modelo = { textoIndividual: 'Oi {nome}', textoCasal: 'Oi {nomes}' };
  const casal = [
    { nome: 'Ana', apelido: null },
    { nome: 'Bia', apelido: null },
  ];
  it('casal usa a versão casal', () => {
    expect(textoPronto(modelo, 'CASAL', casal)).toBe('Oi Ana e Bia');
  });
  it('casal sem versão casal cai na individual', () => {
    expect(textoPronto({ ...modelo, textoCasal: '' }, 'CASAL', casal)).toBe('Oi Ana');
  });
  it('modelo vazio não oferece mensagem', () => {
    expect(textoPronto({ textoIndividual: ' ', textoCasal: '' }, 'INDIVIDUAL', casal)).toBeNull();
    expect(textoPronto(undefined, 'INDIVIDUAL', casal)).toBeNull();
  });
});

describe('WhatsApp', () => {
  it('o link da conversa leva só o número, sem texto', () => {
    expect(linkWhatsApp('+5511987654321')).toBe('https://wa.me/5511987654321');
  });
  it('sem número, sem botão', () => {
    expect(linkWhatsApp(null)).toBeNull();
    expect(linkWhatsApp('')).toBeNull();
  });
  it('grupo só com convite do WhatsApp', () => {
    expect(linkGrupoValido('https://chat.whatsapp.com/AbC')).toBe('https://chat.whatsapp.com/AbC');
    expect(linkGrupoValido('https://exemplo.com/x')).toBeNull();
    expect(linkGrupoValido(null)).toBeNull();
  });
  it('cada passo do onboarding tem a sua mensagem', () => {
    expect(momentoDoItem('BOAS_VINDAS', 'BOAS_VINDAS')).toBe('BOAS_VINDAS');
    expect(momentoDoItem('PASSO_DEVIDO', 'GRUPOS')).toBe('PASSO_1');
    expect(momentoDoItem('PARADO', 'AQUECIMENTO')).toBe('PASSO_2');
    expect(momentoDoItem('PASSO_DEVIDO', 'PME_AQUECIMENTO')).toBe('PASSO_3');
    expect(momentoDoItem('LEMBRETE_IDR', null)).toBe('LEMBRETE_IDR');
    expect(momentoDoItem('ACAO', null)).toBeNull();
  });
});

describe('quem vê o item da Fila', () => {
  const base: FilaItemBase = {
    chave: 'x:2026-12',
    tipo: 'ACAO',
    inscricaoId: null,
    referenciaId: null,
    responsavelPerfil: 'OPERACAO',
    responsavelId: null,
    venceEm: '2026-12-10T03:00:00.000Z',
    atrasado: false,
  };
  const op = { id: 'op', perfil: 'OPERACAO' as const, admin: false };
  const duda = { id: 'duda', perfil: 'ACOMPANHAMENTO' as const, admin: true };
  const diretor = { id: 'dir', perfil: null, admin: true };
  it('item do perfil sem pessoa é de todos do perfil', () => {
    expect(itemEhMeu(base, op)).toBe(true);
    expect(itemEhMeu(base, duda)).toBe(false);
  });
  it('item com pessoa é só dela na "minha fila"', () => {
    const dela = { ...base, responsavelPerfil: 'ACOMPANHAMENTO' as const, responsavelId: 'outra' };
    expect(itemEhMeu(dela, duda)).toBe(false);
    expect(itemVisivel(dela, duda, 'EQUIPE')).toBe(true);
  });
  it('reunião de hoje: Operação e quem conduz', () => {
    const reuniao = { ...base, tipo: 'REUNIAO_HOJE' as const, responsavelId: 'duda' };
    expect(itemEhMeu(reuniao, op)).toBe(true);
    expect(itemEhMeu(reuniao, duda)).toBe(true);
  });
  it('Diretoria sem perfil: nada na "minha", tudo na equipe', () => {
    expect(itemVisivel(base, diretor, 'MINHA')).toBe(false);
    expect(itemVisivel(base, diretor, 'EQUIPE')).toBe(true);
  });
  it('fora do perfil, nem na equipe', () => {
    const manu = { id: 'manu', perfil: 'ESPECIALISTA' as const, admin: false };
    expect(itemVisivel(base, manu, 'EQUIPE')).toBe(false);
  });
});
