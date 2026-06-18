import { describe, expect, it } from 'vitest';
import {
  MOBILE_MISSION_MODULES,
  MOBILE_MISSION_MODULE_META,
} from './mobileMissionControlTypes';

describe('mobile mission control module metadata', () => {
  it('lists every module id exactly once in metadata', () => {
    const metaIds = MOBILE_MISSION_MODULE_META.map((m) => m.id);
    expect(metaIds).toHaveLength(MOBILE_MISSION_MODULES.length);
    expect(new Set(metaIds).size).toBe(MOBILE_MISSION_MODULES.length);
    for (const id of MOBILE_MISSION_MODULES) {
      expect(metaIds).toContain(id);
    }
  });

  it('provides non-empty labels for each module', () => {
    for (const meta of MOBILE_MISSION_MODULE_META) {
      expect(meta.label.trim().length).toBeGreaterThan(0);
      expect(meta.shortLabel.trim().length).toBeGreaterThan(0);
      expect(meta.description.trim().length).toBeGreaterThan(0);
    }
  });
});
