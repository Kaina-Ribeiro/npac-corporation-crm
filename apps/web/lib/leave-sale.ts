/**
 * Sair de Venda Fechada sem a venda registrada (NPAC-51): a venda feita deixa de contar para o SDR
 * e o produto informado é apagado. Um toque no "Mover para" fazia isso sem aviso; agora confirma.
 * Com venda registrada a API já recusa a troca (estorne antes), então não há o que perguntar.
 */
export function confirmLeaveSale(
  lead: { name: string; stageKey: string; saleToRegister: boolean },
  target: string,
) {
  if (lead.stageKey !== 'VENDA' || target === 'VENDA' || !lead.saleToRegister) return true;
  return window.confirm(
    `Tirar ${lead.name} de Venda Fechada?\n\nA venda feita deixa de contar e o produto informado é apagado.`,
  );
}
