import { describe, expect, it } from 'vitest';
import {
  clearSlot,
  emptyStrategyLabState,
  nextEmptySlot,
  normalizeStrategyLabState,
  pinToSlot,
} from './strategyLab';
import { SCENARIO_PRESETS } from './snowball';

describe('strategyLab', () => {
  it('normalizes invalid state to empty', () => {
    expect(normalizeStrategyLabState(null)).toEqual(emptyStrategyLabState());
    expect(normalizeStrategyLabState({ pins: 'bad' })).toEqual(emptyStrategyLabState());
  });

  it('pins and clears slots', () => {
    const base = emptyStrategyLabState();
    const scenario = SCENARIO_PRESETS[1];
    const pinned = pinToSlot(base, 2, {
      label: scenario.label,
      scenario,
      strategy: 'highestRate',
      extraBudget: 1500,
    });
    expect(pinned.pins).toHaveLength(1);
    expect(pinned.activeSlot).toBe(2);
    expect(nextEmptySlot(pinned)).toBe(1);
    const cleared = clearSlot(pinned, 2);
    expect(cleared.pins).toHaveLength(0);
    expect(cleared.activeSlot).toBeNull();
  });

  it('rejects out-of-range slots and bad scenario payloads', () => {
    const bad = normalizeStrategyLabState({
      pins: [
        {
          slot: 12,
          label: 'Bad',
          scenario: { id: 'x' },
          strategy: 'highestRate',
          extraBudget: -1,
          pinnedAt: 'now',
        },
      ],
      activeSlot: 12,
    });
    expect(bad.pins).toHaveLength(0);
  });
});
