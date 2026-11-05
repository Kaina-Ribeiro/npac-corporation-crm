// Fixtures sintéticos do Acompanhamento para dev e demo. Nomes inventados ("Mentorado Fictício
// NN"): nenhum dado do protótipo nem de mentorado real entra aqui. Idempotente por nome_norm.
import { nomeNormalizado, parseData } from '@npac/shared';
import type { Db } from './client.js';
import { mentoriaMentorados } from './schema/index.js';

const STATUS = ['ENGAJADO', 'EM_ATENCAO', 'EM_RISCO'] as const;
const TIPOS_MENTORIA = ['Mentoria Fictícia A', 'Mentoria Fictícia B', 'Mentoria Fictícia C'];

export async function seedMentoria(db: Db): Promise<void> {
  const linhas = Array.from({ length: 16 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const nome = `Mentorado Fictício ${n}`;
    const entrada = parseData(`${String((i % 28) + 1).padStart(2, '0')}/0${(i % 9) + 1}/2026`);
    return {
      nome,
      nomeNorm: nomeNormalizado(nome),
      tipoCadastro: i % 5 === 0 ? 'Casal' : 'Individual',
      tipoMentoria: TIPOS_MENTORIA[i % TIPOS_MENTORIA.length]!,
      dataEntradaTexto: entrada.texto,
      dataEntrada: entrada.data,
      status: STATUS[i % 7 === 0 ? 2 : i % 4 === 0 ? 1 : 0],
    };
  });
  await db.insert(mentoriaMentorados).values(linhas).onConflictDoNothing({
    target: mentoriaMentorados.nomeNorm,
  });
}
