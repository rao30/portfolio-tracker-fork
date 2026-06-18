import { describe, expect, it } from 'vitest';
import {
  buildExitCompassAnalysis,
  computeExitTaxBreakdown,
  computeExitCompassPreviewDelta,
  preferencesToAssumptions,
} from './exitCompass';
import type { Portfolio } from './types';
import type { ExitCompassPreferences } from './exitCompassTypes';

const basePortfolio: Portfolio = {
  extraMonthlyBudget: 500,
  annualRentGrowthRate: 0.02,
  annualExpenseInflationRate: 0.015,
  reinvestSurplus: false,
  monthlyReserveTarget: 200,
  defaultVacancyRate: 0.05,
  defaultCapexReserveRate: 0.05,
  defaultCapexReserveFlat: 0,
  taxProfile: {
    taxYear: 2026,
    annualW2Income: 200000,
    spouseIsReps: true,
    marginalTaxRate: 0.32,
    bonusDepreciationRate: 0.8,
    remainingBonusCarryover: 0,
    stateTaxRate: 0.05,
  },
  acquisitionTemplate: {
    label: 'Next duplex',
    purchasePrice: 250000,
    downPaymentPercent: 0.25,
    annualInterestRate: 0.07,
    loanTermMonths: 360,
    monthlyRent: 2800,
    monthlyExpenses: 600,
    landPercent: 0.2,
    costSegPercent: 0.3,
    useCostSeg: false,
  },
  goals: [],
  simulationAnchorYear: 2026,
  simulationAnchorMonth: 1,
  defaultRefiAnnualRate: 0.07,
  defaultRefiTermMonths: 360,
  properties: [
    {
      name: 'Low ROE Property',
      balance: 180000,
      marketValue: 280000,
      annualInterestRate: 0.065,
      annualAppreciationRate: 0.03,
      monthlyPayment: 1400,
      monthlyRent: 1800,
      monthlyExpenses: 400,
      purchasePrice: 250000,
      placedInServiceYear: 2019,
      landPercent: 0.2,
      costSegPercent: 0.3,
      useCostSeg: false,
      financingType: 'conventional',
      balloonMonths: 0,
      events: [],
    },
    {
      name: 'Strong Cashflow',
      balance: 95000,
      marketValue: 160000,
      annualInterestRate: 0.055,
      annualAppreciationRate: 0.03,
      monthlyPayment: 650,
      monthlyRent: 1400,
      monthlyExpenses: 250,
      purchasePrice: 140000,
      placedInServiceYear: 2020,
      landPercent: 0.2,
      costSegPercent: 0.3,
      useCostSeg: false,
      financingType: 'conventional',
      balloonMonths: 0,
      events: [],
    },
  ],
};

const defaultPrefs: ExitCompassPreferences = {
  isCollapsed: false,
  pinnedProperty: null,
  analysisMode: 'all',
  sellAtMonth: 12,
  closingCostPct: 0.06,
  capitalGainsRate: 0.15,
  recaptureRate: 0.25,
  holdHorizonMonths: 120,
  proceedsToDebtPct: 1,
  showTaxBreakdown: true,
  updatedAt: new Date(0).toISOString(),
};

describe('computeExitTaxBreakdown', () => {
  it('computes depreciation recapture and capital gains tax', () => {
    const p = basePortfolio.properties[0];
    const tax = computeExitTaxBreakdown(p, basePortfolio.taxProfile, {
      closingCostPct: 0.06,
      capitalGainsRate: 0.15,
      recaptureRate: 0.25,
    });

    expect(tax.grossSalePrice).toBe(280000);
    expect(tax.sellingCosts).toBeCloseTo(16800);
    expect(tax.accumulatedDepreciation).toBeGreaterThan(0);
    expect(tax.totalTax).toBeGreaterThan(0);
    expect(tax.adjustedBasis).toBeLessThan(p.purchasePrice!);
  });
});

describe('buildExitCompassAnalysis', () => {
  it('ranks properties and returns three paths per property', () => {
    const assumptions = preferencesToAssumptions(defaultPrefs);
    const analysis = buildExitCompassAnalysis(
      basePortfolio,
      'highestRate',
      null,
      assumptions,
    );

    expect(analysis.properties).toHaveLength(2);
    for (const row of analysis.properties) {
      expect(row.paths).toHaveLength(3);
      expect(row.paths.map((p) => p.path)).toEqual(['hold', 'sell', 'exchange']);
    }
    expect(analysis.topExitCandidate).toBeTruthy();
    expect(analysis.totalTaxExposure).toBeGreaterThan(0);
  });

  it('exchange path has zero tax liability', () => {
    const assumptions = preferencesToAssumptions(defaultPrefs);
    const analysis = buildExitCompassAnalysis(
      basePortfolio,
      'highestRate',
      null,
      assumptions,
    );
    const row = analysis.properties[0];
    const exchange = row.paths.find((p) => p.path === 'exchange')!;
    expect(exchange.taxLiability).toBe(0);
    expect(exchange.trueNetEquity).toBeGreaterThan(
      row.paths.find((p) => p.path === 'sell')!.trueNetEquity,
    );
  });
});

describe('computeExitCompassPreviewDelta', () => {
  it('returns snowball impact for a property sell', () => {
    const assumptions = preferencesToAssumptions(defaultPrefs);
    const delta = computeExitCompassPreviewDelta(
      basePortfolio,
      'highestRate',
      null,
      'Low ROE Property',
      assumptions,
    );

    expect(delta).not.toBeNull();
    expect(delta!.afterTaxProceeds).toBeGreaterThan(0);
    expect(delta!.exchangeProceeds).toBeGreaterThan(delta!.afterTaxProceeds);
  });
});
