import { StageOptions } from './crm-ui';

/**
 * NPAC-59 (Igor, 23/11/2026, "A"): Agendou Pagamento só depois da reunião realizada. Mesmas opções do
 * `StageOptions`, com essa etapa fechada enquanto não há reunião realizada (o cadastro nunca tem).
 * Fica fora de `crm-ui.tsx` para não pesar no JS de `/leads` (Pipeline e lista mostram o 409 da API).
 */
export function StageOptionsAfterMeeting({
  meetingDone,
  ...props
}: Parameters<typeof StageOptions>[0] & { meetingDone: boolean }) {
  const i = props.stages.findIndex((s) => s.key === 'AGENDOU_PAGAMENTO');
  const stage = props.stages[i];
  // Descobrindo renda já fecha a etapa com o próprio motivo; quem já está nela continua vendo-a.
  if (meetingDone || !stage || props.incomeUnknown || props.current === stage.key)
    return <StageOptions {...props} />;
  return (
    <>
      <StageOptions {...props} stages={props.stages.slice(0, i)} />
      <option value={stage.key} disabled>
        {`${stage.label} (depois da reunião realizada)`}
      </option>
      <StageOptions {...props} stages={props.stages.slice(i + 1)} />
    </>
  );
}
