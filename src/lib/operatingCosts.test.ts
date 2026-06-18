import { describe, expect, it } from 'vitest';
import type { Portfolio, Property } from './types';
import {
  analyzeOperatingCosts,
  breakdownsEqual,
  buildExpensePreset,
  buildResolvedExpenseLines,
  computeOperatingCostsDelta,
  validateExpenseBreakdown,
} from './operatingCosts';

const portfolio: Portfolio = {
  properties: [],
  extraMonthlyBudget: 0,
  defaultVacancyRate: 0.05,
  defaultCapexReserveRate: 0.1,
  simulationAnchorYear: 2026,
  simulationAnchorMonth: 1,
  taxProfile: { taxYear: 2026, w2Income: 0, carryoverLoss: 0 },
};

const baseProperty: Property = {
  name: 'Test Duplex',
  balance: 200_000,
  marketValue: 300_000,
  annualInterestRate: 0.065,
  annualAppreciationRate: 0.03,
  monthlyPayment: 1_200,
  monthlyRent: 2_500,
  monthlyExpenses: 800,
};

describe('operatingCosts', () => {
  it('resolves expense lines from breakdown', () => {
    const breakdown = {
      propertyTax: 200,
      insurance: 80,
      maintenance: 100,
    };
    const lines = buildResolvedExpenseLines(baseProperty, breakdown);
    const taxLine = lines.find((l) => l.key === 'propertyTax');
    expect(taxLine?.monthlyAmount).toBe(200);
    expect(taxLine?.annualAmount).toBe(2400);
  });

  it('builds typical preset from rent', () => {
    const preset = buildExpensePreset('typical', baseProperty, portfolio);
    expect(preset.propertyTax).toBeGreaterThan(0);
    expect(preset.maintenance).toBeGreaterThan(0);
  });

  it('detects invalid management percent', () => {
    const issues = validateExpenseBreakdown({ managementPercent: 1.5 }, baseProperty);
    expect(issues.some((i) => i.includes('Management %'))).toBe(true);
  });

  it('computes NOI delta when expenses increase', () => {
    const committed = { propertyTax: 100, insurance: 50, maintenance: 50 };
    const preview = { propertyTax: 200, insurance: 50, maintenance: 50 };
    const delta = computeOperatingCostsDelta(baseProperty, portfolio, committed, preview);
    expect(delta.monthlyOperatingDelta).toBe(100);
    expect(delta.monthlyNoiDelta).toBe(-100);
  });

  it('analyzes operating costs with schedule E totals', () => {
    const analysis = analyzeOperatingCosts(baseProperty, portfolio, {
      propertyTax: 150,
      insurance: 75,
      maintenance: 75,
    });
    expect(analysis.metrics.monthlyOperating).toBeGreaterThan(0);
    expect(analysis.scheduleETotals.length).toBeGreaterThan(0);
    expect(analysis.hasBreakdown).toBe(true);
  });

  it('compares breakdown equality', () => {
    expect(breakdownsEqual({ propertyTax: 100 }, { propertyTax: 100 })).toBe(true);
    expect(breakdownsEqual({ propertyTax: 100 }, { propertyTax: 101 })).toBe(false);
  });
});
