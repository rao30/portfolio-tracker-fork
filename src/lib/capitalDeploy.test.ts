import { describe, expect, it } from 'vitest';
import {
  computeAcquisitionMetrics,
  computeCapitalDeployAnalysis,
  computeCapitalDeployPreviewDelta,
} from './capitalDeploy';
import type { Portfolio } from './types';

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
      name: 'Property A',
      balance: 180000,
      marketValue: 280000,
      annualInterestRate: 0.065,
      annualAppreciationRate: 0.03,
      monthlyPayment: 1400,
      monthlyRent: 2200,
      monthlyExpenses: 400,
      purchasePrice: 250000,
      landPercent: 0.2,
      costSegPercent: 0.3,
      useCostSeg: false,
      financingType: 'conventional',
      balloonMonths: 0,
      events: [],
    },
    {
      name: 'Property B',
      balance: 95000,
      marketValue: 160000,
      annualInterestRate: 0.055,
      annualAppreciationRate: 0.03,
      monthlyPayment: 650,
      monthlyRent: 1400,
      monthlyExpenses: 250,
      purchasePrice: 140000,
      landPercent: 0.2,
      costSegPercent: 0.3,
      useCostSeg: false,
      financingType: 'conventional',
      balloonMonths: 0,
      events: [],
    },
  ],
};

describe('computeAcquisitionMetrics', () => {
  it('computes positive cash-on-cash for viable template', () => {
    const m = computeAcquisitionMetrics(basePortfolio.acquisitionTemplate);
    expect(m.downPayment).toBe(62500);
    expect(m.cashOnCash).toBeGreaterThan(0);
    expect(m.monthlyNet).toBeLessThan(basePortfolio.acquisitionTemplate.monthlyRent);
  });
});

describe('computeCapitalDeployAnalysis', () => {
  it('returns three lanes with a winner', () => {
    const analysis = computeCapitalDeployAnalysis(
      basePortfolio,
      'highestRate',
      null,
      {
        targetReserveMonths: 6,
        acquisitionCocHurdle: 0.08,
        deployAmount: 200,
      },
    );
    expect(analysis.lanes).toHaveLength(3);
    expect(analysis.winner).toMatch(/paydown|reserve|acquisition/);
    expect(analysis.verdict.length).toBeGreaterThan(10);
    expect(analysis.liquidity.weightedAvgMortgageRate).toBeGreaterThan(0);
  });

  it('prioritizes reserve when runway is critically low', () => {
    const thinReserve: Portfolio = {
      ...basePortfolio,
      monthlyReserveTarget: 5000,
      reinvestSurplus: false,
    };
    const analysis = computeCapitalDeployAnalysis(
      thinReserve,
      'highestRate',
      null,
      {
        targetReserveMonths: 12,
        acquisitionCocHurdle: 0.08,
        deployAmount: 100,
      },
    );
    expect(analysis.liquidity.reserveGapMonths).toBeGreaterThan(0);
  });

  it('preview delta tracks deploy amount changes', () => {
    const delta = computeCapitalDeployPreviewDelta(
      basePortfolio,
      'highestRate',
      null,
      100,
      300,
      { targetReserveMonths: 6, acquisitionCocHurdle: 0.08 },
    );
    expect(delta.deployAmountPreview).toBe(300);
    expect(delta.reserveRunwayDelta).toBeGreaterThan(0);
  });

  it('honors pinned lane over automatic winner', () => {
    const analysis = computeCapitalDeployAnalysis(
      basePortfolio,
      'highestRate',
      null,
      {
        targetReserveMonths: 6,
        acquisitionCocHurdle: 0.08,
        deployAmount: 200,
        pinnedLane: 'acquisition',
      },
    );
    expect(analysis.winner).toBe('acquisition');
    expect(analysis.verdict).toContain('Pinned');
  });
});
