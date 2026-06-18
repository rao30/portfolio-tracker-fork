import { describe, expect, it } from 'vitest';
import { upsertRefinanceRadarPreferences } from './refinance-radar-store.js';

describe('refinance-radar-store validation', () => {
  it('rejects invalid analysisMode with 400', async () => {
    await expect(
      upsertRefinanceRadarPreferences('00000000-0000-4000-8000-000000000001', {
        analysisMode: 'invalid',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects out-of-range marketRate with 400', async () => {
    await expect(
      upsertRefinanceRadarPreferences('00000000-0000-4000-8000-000000000001', {
        marketRate: 0.5,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects empty pinnedProperty string with 400', async () => {
    await expect(
      upsertRefinanceRadarPreferences('00000000-0000-4000-8000-000000000001', {
        pinnedProperty: '   ',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
