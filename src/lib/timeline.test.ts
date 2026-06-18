import { describe, expect, it } from 'vitest';
import type { Portfolio } from './types';
import {
  applyPropertyEventOverlays,
  collectPropertyEvents,
  computeTimelineCommandAnalysis,
  computeTimelineImpact,
  computeTimelinePreviewDelta,
  overlaysEqual,
  portfolioFromEventOverlays,
  validatePropertyEvent,
} from './timeline';

const basePortfolio: Portfolio = {
  extraMonthlyBudget: 5000,
  annualRentGrowthRate: 0.03,
  annualExpenseInflationRate: 0.02,
  reinvestSurplus: true,
  monthlyReserveTarget: 0,
  defaultVacancyRate: 0.05,
  defaultCapexReserveRate: 0.1,
  properties: [
    {
      name: 'Prop A',
      balance: 200_000,
      marketValue: 300_000,
      annualInterestRate: 0.065,
      annualAppreciationRate: 0.03,
      monthlyPayment: 1200,
      monthlyRent: 2000,
      monthlyExpenses: 400,
    },
  ],
  taxProfile: {
    annualW2Income: 150_000,
    spouseIsReps: false,
    marginalTaxRate: 0.24,
    taxYear: 2026,
    bonusDepreciationRate: 0,
    remainingBonusCarryover: 0,
  },
  goals: [],
} as Portfolio;

describe('validatePropertyEvent', () => {
  it('rejects invalid month', () => {
    const errors = validatePropertyEvent({ month: 0, type: 'rentChange', rent: 1800 });
    expect(errors.some((e) => e.field === 'month')).toBe(true);
  });

  it('requires rent for rentChange', () => {
    const errors = validatePropertyEvent({ month: 12, type: 'rentChange' });
    expect(errors.some((e) => e.field === 'rent')).toBe(true);
  });
});

describe('applyPropertyEventOverlays', () => {
  it('updates only properties included in overlays', () => {
    const next = applyPropertyEventOverlays(basePortfolio, [
      {
        propertyName: 'Prop A',
        events: [{ month: 24, type: 'rentChange', rent: 2200 }],
      },
    ]);
    expect(next.properties[0].events).toHaveLength(1);
  });
});

describe('overlaysEqual', () => {
  it('detects identical overlays', () => {
    const overlays = [
      {
        propertyName: 'Prop A',
        events: [{ month: 24, type: 'rentChange' as const, rent: 2200 }],
      },
    ];
    expect(overlaysEqual(overlays, overlays)).toBe(true);
  });

  it('detects different event counts', () => {
    const a = [
      {
        propertyName: 'Prop A',
        events: [{ month: 24, type: 'rentChange' as const, rent: 2200 }],
      },
    ];
    const b = [{ propertyName: 'Prop A', events: [] }];
    expect(overlaysEqual(a, b)).toBe(false);
  });
});

describe('computeTimelinePreviewDelta', () => {
  it('returns zero delta when preview matches committed', () => {
    const withRent = applyPropertyEventOverlays(basePortfolio, [
      {
        propertyName: 'Prop A',
        events: [{ month: 12, type: 'rentChange', rent: 3000 }],
      },
    ]);
    const overlays = collectPropertyEvents(withRent);
    const delta = computeTimelinePreviewDelta(withRent, overlays, 'highestRate');
    expect(delta.monthsDelta).toBe(0);
    expect(delta.eventCountDelta).toBe(0);
  });

  it('detects preview rent bump vs committed baseline', () => {
    const preview = [
      {
        propertyName: 'Prop A',
        events: [{ month: 12, type: 'rentChange' as const, rent: 3000 }],
      },
    ];
    const delta = computeTimelinePreviewDelta(basePortfolio, preview, 'highestRate');
    expect(delta.eventCountDelta).toBe(1);
    expect(delta.cashflowDelta).not.toBe(0);
  });
});

describe('portfolioFromEventOverlays', () => {
  it('replaces committed events with preview overlays only', () => {
    const committed = applyPropertyEventOverlays(basePortfolio, [
      {
        propertyName: 'Prop A',
        events: [{ month: 6, type: 'rentChange', rent: 2100 }],
      },
    ]);
    const preview = [
      {
        propertyName: 'Prop A',
        events: [{ month: 12, type: 'rentChange' as const, rent: 3000 }],
      },
    ];
    const next = portfolioFromEventOverlays(committed, preview);
    expect(next.properties[0].events).toHaveLength(1);
    expect(next.properties[0].events?.[0].rent).toBe(3000);
  });
});

describe('computeTimelineCommandAnalysis', () => {
  it('returns neutral verdict when preview matches committed', () => {
    const withRent = applyPropertyEventOverlays(basePortfolio, [
      {
        propertyName: 'Prop A',
        events: [{ month: 12, type: 'rentChange', rent: 3000 }],
      },
    ]);
    const overlays = collectPropertyEvents(withRent);
    const analysis = computeTimelineCommandAnalysis(withRent, overlays, 'highestRate');
    expect(analysis.previewEventCount).toBe(1);
    expect(analysis.committedEventCount).toBe(1);
    expect(analysis.verdictTone).toBe('neutral');
  });

  it('returns positive verdict for strong rent bump preview', () => {
    const preview = [
      {
        propertyName: 'Prop A',
        events: [{ month: 12, type: 'rentChange' as const, rent: 5000 }],
      },
    ];
    const analysis = computeTimelineCommandAnalysis(basePortfolio, preview, 'highestRate');
    expect(analysis.previewEventCount).toBe(1);
    expect(analysis.committedEventCount).toBe(0);
    expect(analysis.verdictTone).toBe('positive');
    expect(analysis.debtFreeLabel.length).toBeGreaterThan(0);
  });
});

describe('computeTimelineImpact', () => {
  it('returns zero delta when no events', () => {
    const impact = computeTimelineImpact(basePortfolio, 'highestRate');
    expect(impact.eventCount).toBe(0);
    expect(impact.monthsDelta).toBe(0);
  });

  it('detects rent increase impact', () => {
    const withRent = applyPropertyEventOverlays(basePortfolio, [
      {
        propertyName: 'Prop A',
        events: [{ month: 12, type: 'rentChange', rent: 3000 }],
      },
    ]);
    const impact = computeTimelineImpact(withRent, 'highestRate');
    expect(impact.eventCount).toBe(1);
    expect(impact.cashflowDelta).not.toBe(0);
  });
});
