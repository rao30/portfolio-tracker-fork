import { describe, expect, it } from 'vitest';
import {
  buildPlaybookSteps,
  computeBalloonAlerts,
  defaultPlaybookOrder,
  moveInOrder,
  orderFromStrategy,
} from './payoffPlaybook';
import { normalizePayoffOrder, runSimulationWithPayoffOrder } from './snowball';
import type { Portfolio, Property } from './types';

function property(overrides: Partial<Property> & Pick<Property, 'name'>): Property {
  return {
    balance: 200_000,
    marketValue: 300_000,
    annualInterestRate: 0.06,
    monthlyPayment: 1_200,
    monthlyRent: 2_000,
    monthlyExpenses: 400,
    closeMonth: 1,
    ...overrides,
  };
}

function miniPortfolio(properties: Property[]): Portfolio {
  return {
    properties,
    extraMonthlyBudget: 1_000,
    annualRentGrowthRate: 0.03,
    annualExpenseInflationRate: 0.03,
    reinvestSurplus: true,
    monthlyReserveTarget: 0,
    defaultVacancyRate: 0.05,
    defaultCapexReserveRate: 0.05,
    goals: [],
  };
}

describe('payoffPlaybook', () => {
  it('normalizes order when properties are added or removed', () => {
    const portfolio = miniPortfolio([
      property({ name: 'A' }),
      property({ name: 'B' }),
    ]);
    expect(normalizePayoffOrder(portfolio, ['B', 'Ghost', 'A'])).toEqual(['B', 'A']);
  });

  it('orders from strategy preset', () => {
    const portfolio = miniPortfolio([
      property({ name: 'Low', balance: 50_000, annualInterestRate: 0.04 }),
      property({ name: 'High', balance: 400_000, annualInterestRate: 0.09 }),
    ]);
    expect(orderFromStrategy(portfolio, 'highestRate')).toEqual(['High', 'Low']);
    expect(orderFromStrategy(portfolio, 'lowestBalance')).toEqual(['Low', 'High']);
  });

  it('detects imminent seller balloon alerts', () => {
    const portfolio = miniPortfolio([
      property({
        name: 'Seller Duplex',
        financingType: 'seller',
        balloonMonths: 60,
        closeMonth: 1,
        balance: 250_000,
      }),
    ]);
    const alerts = computeBalloonAlerts(portfolio, 50);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].monthsUntilBalloon).toBe(11);
    expect(alerts[0].severity).toBe('critical');
  });

  it('builds rationale-rich playbook steps', () => {
    const portfolio = miniPortfolio([
      property({ name: 'Small', balance: 40_000, annualInterestRate: 0.05 }),
      property({ name: 'Big', balance: 500_000, annualInterestRate: 0.08, monthlyPayment: 3_500 }),
    ]);
    const order = defaultPlaybookOrder(portfolio);
    const steps = buildPlaybookSteps(portfolio, order);
    expect(steps[0].propertyName).toBe('Big');
    expect(steps[0].rationale.some((t) => t.kind === 'rate')).toBe(true);
  });

  it('custom order changes payoff timeline vs preset', () => {
    const portfolio = miniPortfolio([
      property({ name: 'Small', balance: 40_000, annualInterestRate: 0.05, monthlyPayment: 400 }),
      property({ name: 'Big', balance: 500_000, annualInterestRate: 0.08, monthlyPayment: 3_500 }),
    ]);
    const avalanche = runSimulationWithPayoffOrder(
      portfolio,
      orderFromStrategy(portfolio, 'highestRate'),
    );
    const snowball = runSimulationWithPayoffOrder(
      portfolio,
      orderFromStrategy(portfolio, 'lowestBalance'),
    );
    expect(snowball.order[0]).toBe('Small');
    expect(avalanche.order[0]).toBe('Big');
    expect(snowball.monthsToPayoff).not.toBe(avalanche.monthsToPayoff);
  });

  it('moveInOrder reorders without duplicates', () => {
    expect(moveInOrder(['A', 'B', 'C'], 2, 0)).toEqual(['C', 'A', 'B']);
  });
});
