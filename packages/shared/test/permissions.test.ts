import { describe, expect, it } from 'vitest';
import { ACTIONS, can } from '../src/permissions.js';

const SDR_ALLOWED = [
  'lead:create',
  'lead:update',
  'lead:move',
  'meeting:schedule',
  'meeting:reschedule',
  'meeting:outcome',
  'note:write',
  'task:write',
  'report:view',
  'export:whatsapp',
  'chat:use',
];
const CLOSER_ALLOWED = [
  'lead:move',
  'meeting:reschedule',
  'meeting:outcome',
  'sale:register',
  'note:write',
  'task:write',
  'report:view',
  'export:whatsapp',
  'chat:use',
];

describe('can', () => {
  it.each(ACTIONS)('HEAD e %s', (a) =>
    expect(can({ role: 'HEAD' }, a)).toBe(!a.startsWith('mentoria:')),
  );
  it.each(ACTIONS)('SDR e %s', (a) =>
    expect(can({ role: 'SDR' }, a)).toBe(SDR_ALLOWED.includes(a)),
  );
  it.each(ACTIONS)('CLOSER e %s', (a) =>
    expect(can({ role: 'CLOSER' }, a)).toBe(CLOSER_ALLOWED.includes(a)),
  );
});

describe('acompanhamento (mentoria)', () => {
  const MENTORIA = ['mentoria:view', 'mentoria:edit', 'mentoria:export'] as const;

  it('existem as três ações mentoria (controle)', () => {
    expect(ACTIONS.filter((a) => a.startsWith('mentoria:'))).toEqual([...MENTORIA]);
  });
  it('HEAD não tem nenhuma ação mentoria:*', () => {
    for (const a of MENTORIA) expect(can({ role: 'HEAD' }, a)).toBe(false);
  });
  it('DIRETOR e ACOMPANHAMENTO têm as três ações mentoria', () => {
    for (const a of MENTORIA) {
      expect(can({ role: 'DIRETOR' }, a)).toBe(true);
      expect(can({ role: 'ACOMPANHAMENTO' }, a)).toBe(true);
    }
  });
  it('SDR e CLOSER não têm ação mentoria', () => {
    for (const a of MENTORIA) {
      expect(can({ role: 'SDR' }, a)).toBe(false);
      expect(can({ role: 'CLOSER' }, a)).toBe(false);
    }
  });
  it('ACOMPANHAMENTO não tem lead:*, admin:manage nem audit:view', () => {
    for (const a of ACTIONS.filter((x) => !x.startsWith('mentoria:')))
      expect(can({ role: 'ACOMPANHAMENTO' }, a)).toBe(false);
  });
});
