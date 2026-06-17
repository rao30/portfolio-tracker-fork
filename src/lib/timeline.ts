import type { Portfolio, PropertyEvent, PropertyEventType, SimulationResult } from './types';
import { formatCurrency, formatMonths, formatSimulationMonthShort } from './format';
import { runSimulation, snapshotAtMonth, type StrategyId } from './snowball';

export const EVENT_TYPE_META: Record<
  PropertyEventType,
  { label: string; color: string; description: string }
> = {
  rentChange: {
    label: 'Rent change',
    color: '#34d399',
    description: 'New monthly gross rent',
  },
  rateReset: {
    label: 'Rate reset',
    color: '#fbbf24',
    description: 'New annual interest rate',
  },
  refinance: {
    label: 'Refinance',
    color: '#22d3ee',
    description: 'New rate, payment, and/or balance',
  },
  capexSpike: {
    label: 'Capex spike',
    color: '#f87171',
    description: 'One-time capital expense',
  },
  acquisition: {
    label: 'Acquisition',
    color: '#a78bfa',
    description: 'Add a property mid-simulation',
  },
  disposition: {
    label: 'Sell property',
    color: '#fb923c',
    description: 'Remove property from portfolio',
  },
};

export interface TimelineEventRow {
  id: string;
  propertyIndex: number;
  propertyName: string;
  eventIndex: number;
  simMonth: number;
  type: PropertyEventType;
  event: PropertyEvent;
  summary: string;
}

export interface EventsImpact {
  withEvents: SimulationResult;
  withoutEvents: SimulationResult;
  monthsDelta: number;
  interestDelta: number;
  equityAt15Delta: number;
  cashflowAtMonthDelta: number;
  hasEvents: boolean;
}

const VALID_EVENT_TYPES = new Set<PropertyEventType>([
  'rentChange',
  'rateReset',
  'capexSpike',
  'refinance',
  'acquisition',
  'disposition',
]);

const MAX_SIM_MONTH = 600;

/** Strip user-defined life events for baseline comparison. */
export function portfolioWithoutLifeEvents(portfolio: Portfolio): Portfolio {
  return {
    ...portfolio,
    properties: portfolio.properties.map((p) => ({ ...p, events: [] })),
  };
}

export function countLifeEvents(portfolio: Portfolio): number {
  return portfolio.properties.reduce((n, p) => n + (p.events?.length ?? 0), 0);
}

export function summarizeEvent(
  event: PropertyEvent,
  anchorYear: number,
  anchorMonth = 1,
): string {
  const when = formatSimulationMonthShort(event.month, anchorYear, anchorMonth);
  switch (event.type) {
    case 'rentChange':
      return event.rent != null ? `${when}: rent → ${formatCurrency(event.rent)}/mo` : `${when}: rent change`;
    case 'rateReset':
      return event.rate != null
        ? `${when}: rate → ${(event.rate * 100).toFixed(2)}%`
        : `${when}: rate reset`;
    case 'refinance': {
      const parts: string[] = [when, 'refi'];
      if (event.rate != null) parts.push(`${(event.rate * 100).toFixed(2)}%`);
      if (event.payment != null) parts.push(formatCurrency(event.payment));
      return parts.join(' · ');
    }
    case 'capexSpike':
      return event.amount != null
        ? `${when}: capex ${formatCurrency(event.amount)}`
        : `${when}: capex`;
    case 'disposition':
      return `${when}: sell`;
    case 'acquisition':
      return event.property?.name
        ? `${when}: buy ${event.property.name}`
        : `${when}: acquisition`;
    default:
      return when;
  }
}

/** Flatten property events into sortable timeline rows. */
export function collectTimelineEvents(portfolio: Portfolio): TimelineEventRow[] {
  const anchorYear = portfolio.simulationAnchorYear ?? 2026;
  const anchorMonth = portfolio.simulationAnchorMonth ?? 1;
  const rows: TimelineEventRow[] = [];

  portfolio.properties.forEach((property, propertyIndex) => {
    (property.events ?? []).forEach((event, eventIndex) => {
      rows.push({
        id: `${propertyIndex}-${eventIndex}-${event.month}-${event.type}`,
        propertyIndex,
        propertyName: property.name,
        eventIndex,
        simMonth: event.month,
        type: event.type,
        event,
        summary: summarizeEvent(event, anchorYear, anchorMonth),
      });
    });
  });

  return rows.sort((a, b) => a.simMonth - b.simMonth || a.propertyName.localeCompare(b.propertyName));
}

export function computeEventsImpact(
  portfolio: Portfolio,
  strategyId: StrategyId,
): EventsImpact {
  const withEvents = runSimulation(portfolio, strategyId);
  const withoutEvents = runSimulation(portfolioWithoutLifeEvents(portfolio), strategyId);
  const at15With = snapshotAtMonth(withEvents, 180);
  const at15Without = snapshotAtMonth(withoutEvents, 180);
  const at60With = snapshotAtMonth(withEvents, 60);
  const at60Without = snapshotAtMonth(withoutEvents, 60);

  return {
    withEvents,
    withoutEvents,
    monthsDelta: withEvents.monthsToPayoff - withoutEvents.monthsToPayoff,
    interestDelta: withEvents.totalInterestPaid - withoutEvents.totalInterestPaid,
    equityAt15Delta: (at15With?.totalEquity ?? 0) - (at15Without?.totalEquity ?? 0),
    cashflowAtMonthDelta:
      (at60With?.monthlyCashflow ?? 0) - (at60Without?.monthlyCashflow ?? 0),
    hasEvents: countLifeEvents(portfolio) > 0,
  };
}

export function validatePropertyEvent(event: PropertyEvent): string | null {
  if (!Number.isInteger(event.month) || event.month < 1 || event.month > MAX_SIM_MONTH) {
    return `Month must be between 1 and ${MAX_SIM_MONTH}`;
  }
  if (!VALID_EVENT_TYPES.has(event.type)) {
    return 'Invalid event type';
  }
  switch (event.type) {
    case 'rentChange':
      if (event.rent == null || event.rent < 0) return 'Rent must be a positive amount';
      break;
    case 'rateReset':
      if (event.rate == null || event.rate < 0 || event.rate > 0.25) {
        return 'Rate must be between 0% and 25%';
      }
      break;
    case 'refinance':
      if (event.rate != null && (event.rate < 0 || event.rate > 0.25)) {
        return 'Rate must be between 0% and 25%';
      }
      if (event.payment != null && event.payment < 0) return 'Payment must be positive';
      if (event.balance != null && event.balance < 0) return 'Balance must be positive';
      break;
    case 'capexSpike':
      if (event.amount == null || event.amount <= 0) return 'Capex amount must be positive';
      break;
    case 'disposition':
      break;
    case 'acquisition':
      if (!event.property?.name?.trim()) return 'Acquisition requires a property name';
      break;
    default:
      break;
  }
  return null;
}

export function createDefaultEvent(
  type: PropertyEventType,
  simMonth: number,
): PropertyEvent {
  const base = { month: simMonth, type };
  switch (type) {
    case 'rentChange':
      return { ...base, rent: 2000 };
    case 'rateReset':
      return { ...base, rate: 0.065 };
    case 'refinance':
      return { ...base, rate: 0.065, payment: 1500, balance: 200_000 };
    case 'capexSpike':
      return { ...base, amount: 10_000 };
    case 'disposition':
      return base;
    case 'acquisition':
      return {
        ...base,
        property: {
          name: 'New property',
          balance: 180_000,
          marketValue: 250_000,
          annualInterestRate: 0.065,
          annualAppreciationRate: 0.03,
          monthlyPayment: 1200,
          monthlyRent: 2200,
          monthlyExpenses: 400,
        },
      };
    default:
      return base;
  }
}
