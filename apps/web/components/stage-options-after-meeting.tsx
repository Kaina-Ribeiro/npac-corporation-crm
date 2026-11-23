import { StageOptions } from './crm-ui';

/**
 * NPAC-59 (Igor, 23/11/2026, "A"): Agendou Pagamento só depois da reunião realizada. Mesmas opções do
 * `StageOptions`, com essa etapa fechada enquanto não há reunião realizada (o cadastro nunca tem).
 * `saleHint` (NPAC-68): na ficha, o SDR não registra a venda; a dica da Venda aponta para o que ele
 * pode fazer ("Marcar venda") no lugar de "registre na ficha".
 * Fica fora de `crm-ui.tsx` para não pesar no JS de `/leads` (Pipeline e lista mostram o 409 da API).
 */
export function StageOptionsAfterMeeting({
  meetingDone,
  saleHint,
  ...props
}: Parameters<typeof StageOptions>[0] & { meetingDone: boolean; saleHint?: string }) {
  // Descobrindo renda já fecha as etapas com o próprio motivo; quem já está numa continua vendo-a.
  const hint = (key: string) =>
    props.incomeUnknown || props.current === key
      ? null
      : key === 'AGENDOU_PAGAMENTO' && !meetingDone
        ? '(depois da reunião realizada)'
        : key === 'VENDA' && !props.allowSale && saleHint
          ? saleHint
          : null;
  return props.stages.map((s) => {
    const h = hint(s.key);
    return h ? (
      <option key={s.key} value={s.key} disabled>
        {`${s.label} ${h}`}
      </option>
    ) : (
      <StageOptions key={s.key} {...props} stages={[s]} />
    );
  });
}
