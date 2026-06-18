import { describe, expect, it } from 'vitest';
import { upsertMobileMissionControlPreferences } from './mobile-mission-control-store.js';

describe('mobile-mission-control-store validation', () => {
  it('rejects invalid activeModule with 400', async () => {
    await expect(
      upsertMobileMissionControlPreferences('00000000-0000-4000-8000-000000000001', {
        activeModule: 'invalid',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects non-array collapsedModules with 400', async () => {
    await expect(
      upsertMobileMissionControlPreferences('00000000-0000-4000-8000-000000000001', {
        collapsedModules: 'pulse',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects invalid collapsed module id with 400', async () => {
    await expect(
      upsertMobileMissionControlPreferences('00000000-0000-4000-8000-000000000001', {
        collapsedModules: ['not-a-module'],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects non-boolean showHeroStrip with 400', async () => {
    await expect(
      upsertMobileMissionControlPreferences('00000000-0000-4000-8000-000000000001', {
        showHeroStrip: 'yes',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
