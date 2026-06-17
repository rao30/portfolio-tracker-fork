import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyzeStressScenario,
  buildCustomScenario,
  computeStressImpact,
  computeStressPreviewDelta,
  resolveScenarioFromId,
  scenariosEqual,
} from './stressLab';
import { normalizePortfolio, SCENARIO_PRESETS } from './snowball';

const portfolio = normalizePortfolio({
  extra_monthly_budget: 2000,
  annual_rent_growth_rate: 0.025,
  annual_expense_inflation_rate: 0.02,
  reinvest_surplus: true,
  monthly_reserve_target: 0,
  default_vacancy_rate: 0.05,
  default_capex_reserve_rate: 0.05,
  simulation_anchor_year: 2026,
  simulation_anchor_month: 6,
  goals: [],
  properties: [
    {
      name: 'HighRate',
      balance: 100000,
      market_value: 160000,
      annual_interest_rate: 0.08,
      annual_appreciation_rate: 0.03,
      monthly_payment: 800,
      monthly_rent: 1500,
      monthly_expenses: 450,
    },
    {
      name: 'LowRate',
      balance: 50000,
      market_value: 90000,
      annual_interest_rate: 0.03,
      annual_appreciation_rate: 0.03,
      monthly_payment: 400,
      monthly_rent: 900,
      monthly_expenses: 270,
    },
  ],
});

describe('stressLab', () => {
  it('base scenario has zero deltas', () => {
    const impact = computeStressImpact(portfolio, 'highestRate', SCENARIO_PRESETS[0]);
    expect(impact.monthsDelta).toBe(0);
    expect(impact.interestDelta).toBe(0);
    expect(impact.equityDeltaAtYear15).toBe(0);
  });

  it('vacancy stress slows payoff', () => {
    const vacancy = SCENARIO_PRESETS.find((s) => s.id === 'vacancy15')!;
    const impact = computeStressImpact(portfolio, 'highestRate', vacancy);
    expect(impact.monthsDelta).toBeGreaterThan(0);
    expect(impact.interestDelta).toBeGreaterThan(0);
  });

  it('sell scenario accelerates payoff', () => {
    const sell = {
      id: 'sell-HighRate',
      label: 'Sell HighRate',
      sellProperty: 'HighRate',
    };
    const impact = computeStressImpact(portfolio, 'highestRate', sell);
    expect(impact.monthsDelta).toBeLessThan(0);
  });

  it('analyzeStressScenario assigns severity for long payment pause', () => {
    const analysis = analyzeStressScenario(
      portfolio,
      'highestRate',
      SCENARIO_PRESETS.find((s) => s.id === 'pauseExtra24')!,
    );
    expect(analysis.verdictTone).not.toBe('positive');
    expect(analysis.severityScore).toBeGreaterThan(0);
  });

  it('preview delta compares committed vs preview', () => {
    const delta = computeStressPreviewDelta(
      portfolio,
      'highestRate',
      SCENARIO_PRESETS[0],
      SCENARIO_PRESETS.find((s) => s.id === 'pauseExtra12')!,
    );
    expect(delta.monthsDelta).toBeGreaterThan(0);
    expect(delta.debtFreeLabelCommitted).toBeTruthy();
    expect(delta.debtFreeLabelPreview).toBeTruthy();
  });

  it('buildCustomScenario uses knobs', () => {
    const custom = buildCustomScenario({
      vacancy: 0.12,
      capex: 0.08,
      rateShock: 0.01,
      pauseMonths: 6,
    });
    expect(custom.vacancyRate).toBe(0.12);
    expect(custom.pauseExtraMonths).toBe(6);
  });

  it('resolveScenarioFromId falls back to base', () => {
    expect(resolveScenarioFromId('unknown').id).toBe('base');
  });

  it('scenariosEqual compares custom knobs', () => {
    const a = buildCustomScenario({ vacancy: 0.1, capex: 0.05, rateShock: 0, pauseMonths: 0 });
    const b = buildCustomScenario({ vacancy: 0.1, capex: 0.05, rateShock: 0, pauseMonths: 0 });
    const c = buildCustomScenario({ vacancy: 0.12, capex: 0.05, rateShock: 0, pauseMonths: 0 });
    expect(scenariosEqual(a, b)).toBe(true);
    expect(scenariosEqual(a, c)).toBe(false);
  });

  it('rate shock presets do not throw on seeded portfolio', () => {
    const seeded = normalizePortfolio(
      JSON.parse(
        readFileSync(join(process.cwd(), 'public/data/portfolio.json'), 'utf-8'),
      ),
    );
    for (const preset of SCENARIO_PRESETS) {
      expect(() =>
        analyzeStressScenario(seeded, 'highestRate', preset),
      ).not.toThrow();
    }
  });
});
