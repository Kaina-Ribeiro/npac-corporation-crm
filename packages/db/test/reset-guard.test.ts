import { describe, expect, it } from 'vitest';
import { resetTestDb } from '../src/testing.js';

describe('resetTestDb guard', () => {
  it.each(['npac', 'postgres', 'npac_prod', 'template1', 'npac_test; drop'])(
    'rejeita %s sem tocar o banco',
    async (name) => {
      await expect(resetTestDb(name)).rejects.toThrow(/bancos de teste/);
    },
  );
});
