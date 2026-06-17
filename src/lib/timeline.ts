import type { Portfolio, Property, PropertyEvent, PropertyEventType } from './types';
import { runSimulation, snapshotAtMonth, type StrategyId } from './snowball';
import { formatMonths, simMonthToCalendar } from './format';
import type {
  TimelineCommandAnalysis,
  TimelinePreviewDelta,
  TimelineVerdictTone,
} from './timelineTypes';

export const MAX_TIMELINE_MONTH = 600;

export interface PropertyEventOverlay {
  propertyName: string;
  events: PropertyEvent[];
}

export interface TimelineScenarioRecord {
  id: string;
  name: string;
  description?: string | null;
  propertyEvents: PropertyEventOverlay[];
  scenarioConfig?: Record<string, unknown> | null;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineImpact {
  baseMonthsToPayoff: number;
  eventMonthsToPayoff: number;
  monthsDelta: number;
  baseEquityAt10Yr: number;
  eventEquityAt10Yr: number;
  equityDelta: number;
  baseCashflowAt10Yr: number;
  eventCashflowAt10Yr: number;
  cashflowDelta: number;
  eventCount: number;
}

export const EVENT_META: Record<
  PropertyEventType,
  { label: string; shortLabel: string; color: string; description: string }
> = {
  rentChange: {
    label: 'Rent change',
    shortLabel: 'Rent',
    color: '#22d3ee',
    description: 'Set gross monthly rent from this month forward',
  },
  rateReset: {
    label: 'Rate reset',
    shortLabel: 'Rate',
    color: '#a78bfa',
    description: 'Change the annual interest rate',
  },
  capexSpike: {
    label: 'Capex spike',
    shortLabel: 'Capex',
    color: '#fbbf24',
    description: 'One-time capital expense cash outflow',
  },
  refinance: {
    label: 'Refinance',
    shortLabel: 'Refi',
    color: '#34d399',
    description: 'Replace loan terms (rate, payment, balance)',
  },
  acquisition: {
    label: 'Acquisition',
    shortLabel: 'Buy',
    color: '#60a5fa',
    description: 'Add a new property to the portfolio',
  },
  disposition: {
    label: 'Disposition',
    shortLabel: 'Sell',
    color: '#f87171',
    description: 'Remove property from the portfolio',
  },
};

export interface EventValidationError {
  field: string;
  message: string;
}

export function validatePropertyEvent(
  event: PropertyEvent,
  property?: Property,
): EventValidationError[] {
  const errors: EventValidationError[] = [];

  if (!Number.isInteger(event.month) || event.month < 1 || event.month > MAX_TIMELINE_MONTH) {
    errors.push({
      field: 'month',
      message: `Month must be between 1 and ${MAX_TIMELINE_MONTH}`,
    });
  }

  switch (event.type) {
    case 'rentChange':
      if (event.rent == null || event.rent < 0) {
        errors.push({ field: 'rent', message: 'Enter a valid monthly rent (≥ 0)' });
      }
      break;
    case 'rateReset':
      if (event.rate == null || event.rate < 0 || event.rate > 0.25) {
        errors.push({ field: 'rate', message: 'Rate must be between 0% and 25%' });
      }
      break;
    case 'capexSpike':
      if (event.amount == null || event.amount < 0) {
        errors.push({ field: 'amount', message: 'Enter a capex amount (≥ 0)' });
      }
      break;
    case 'refinance':
      if (event.rate != null && (event.rate < 0 || event.rate > 0.25)) {
        errors.push({ field: 'rate', message: 'Rate must be between 0% and 25%' });
      }
      if (event.payment != null && event.payment < 0) {
        errors.push({ field: 'payment', message: 'Payment must be ≥ 0' });
      }
      if (event.balance != null && event.balance < 0) {
        errors.push({ field: 'balance', message: 'Balance must be ≥ 0' });
      }
      if (event.rate == null && event.payment == null && event.balance == null) {
        errors.push({
          field: 'refinance',
          message: 'Set at least one of rate, payment, or balance',
        });
      }
      break;
    case 'disposition':
      if (property && property.balance > 0 && event.month < (property.closeMonth ?? 1)) {
        errors.push({
          field: 'month',
          message: 'Cannot sell before property close month',
        });
      }
      break;
    case 'acquisition':
      if (!event.property?.name?.trim()) {
        errors.push({ field: 'property', message: 'Acquisition requires a property name' });
      }
      break;
    default:
      errors.push({ field: 'type', message: 'Unknown event type' });
  }

  return errors;
}

export function countPortfolioEvents(portfolio: Portfolio): number {
  return portfolio.properties.reduce((sum, p) => sum + (p.events?.length ?? 0), 0);
}

export function collectPropertyEvents(portfolio: Portfolio): PropertyEventOverlay[] {
  return portfolio.properties
    .filter((p) => (p.events?.length ?? 0) > 0)
    .map((p) => ({
      propertyName: p.name,
      events: [...(p.events ?? [])].sort((a, b) => a.month - b.month),
    }));
}

export function portfolioWithoutEvents(portfolio: Portfolio): Portfolio {
  return {
    ...portfolio,
    properties: portfolio.properties.map((p) => {
      const { events: _events, ...rest } = p;
      return rest;
    }),
  };
}

export function applyPropertyEventOverlays(
  portfolio: Portfolio,
  overlays: PropertyEventOverlay[],
): Portfolio {
  const byName = new Map(overlays.map((o) => [o.propertyName, o.events]));
  return {
    ...portfolio,
    properties: portfolio.properties.map((p) => {
      if (!byName.has(p.name)) return p;
      return { ...p, events: byName.get(p.name) ?? [] };
    }),
  };
}

function eventsEqual(a: PropertyEvent, b: PropertyEvent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function overlaysEqual(
  a: PropertyEventOverlay[],
  b: PropertyEventOverlay[],
): boolean {
  if (a.length !== b.length) return false;
  const sortOverlay = (overlays: PropertyEventOverlay[]) =>
    [...overlays]
      .sort((x, y) => x.propertyName.localeCompare(y.propertyName))
      .map((overlay) => ({
        propertyName: overlay.propertyName,
        events: [...overlay.events].sort((x, y) => x.month - y.month || x.type.localeCompare(y.type)),
      }));

  const sortedA = sortOverlay(a);
  const sortedB = sortOverlay(b);
  if (sortedA.length !== sortedB.length) return false;

  return sortedA.every((overlay, index) => {
    const other = sortedB[index];
    if (overlay.propertyName !== other.propertyName) return false;
    if (overlay.events.length !== other.events.length) return false;
    return overlay.events.every((event, eventIndex) =>
      eventsEqual(event, other.events[eventIndex]),
    );
  });
}

export function portfolioFromEventOverlays(
  portfolio: Portfolio,
  overlays: PropertyEventOverlay[],
): Portfolio {
  return applyPropertyEventOverlays(portfolioWithoutEvents(portfolio), overlays);
}

export function computeTimelinePreviewDelta(
  portfolio: Portfolio,
  previewOverlays: PropertyEventOverlay[],
  strategyId: StrategyId,
): TimelinePreviewDelta {
  const committedResult = runSimulation(portfolio, strategyId);
  const previewPortfolio = portfolioFromEventOverlays(portfolio, previewOverlays);
  const previewResult = runSimulation(previewPortfolio, strategyId);
  const committedSnap = snapshotAtMonth(committedResult, 120);
  const previewSnap = snapshotAtMonth(previewResult, 120);
  const committedCount = countPortfolioEvents(portfolio);
  const previewCount = previewOverlays.reduce((sum, overlay) => sum + overlay.events.length, 0);

  return {
    monthsDelta: previewResult.monthsToPayoff - committedResult.monthsToPayoff,
    equityDelta: (previewSnap?.totalEquity ?? 0) - (committedSnap?.totalEquity ?? 0),
    cashflowDelta:
      (previewSnap?.monthlyCashflow ?? 0) - (committedSnap?.monthlyCashflow ?? 0),
    eventCountDelta: previewCount - committedCount,
  };
}

export function computeTimelineCommandAnalysis(
  portfolio: Portfolio,
  previewOverlays: PropertyEventOverlay[],
  strategyId: StrategyId,
): TimelineCommandAnalysis {
  const previewPortfolio = portfolioFromEventOverlays(portfolio, previewOverlays);
  const previewResult = runSimulation(previewPortfolio, strategyId);
  const previewCount = previewOverlays.reduce((sum, overlay) => sum + overlay.events.length, 0);
  const committedCount = countPortfolioEvents(portfolio);
  const delta = computeTimelinePreviewDelta(portfolio, previewOverlays, strategyId);

  let verdict: string;
  let verdictTone: TimelineVerdictTone = 'neutral';

  if (previewCount === 0) {
    verdict = 'No lifecycle events planned — add rent bumps, refis, or exits on the timeline.';
  } else if (delta.monthsDelta <= -6 && delta.equityDelta > 0) {
    verdict = `Strong plan — debt-free ${Math.abs(delta.monthsDelta)} months sooner with higher 10-year equity.`;
    verdictTone = 'positive';
  } else if (delta.monthsDelta <= -1) {
    verdict = `Accelerates payoff by ${Math.abs(delta.monthsDelta)} month${Math.abs(delta.monthsDelta) === 1 ? '' : 's'} vs your committed plan.`;
    verdictTone = 'positive';
  } else if (delta.monthsDelta >= 6) {
    verdict = `Adds ${delta.monthsDelta} months to debt-free — review refi costs or capex timing.`;
    verdictTone = 'caution';
  } else if (delta.cashflowDelta >= 500) {
    verdict = `Boosts 10-year cashflow by $${Math.round(delta.cashflowDelta).toLocaleString()}/mo vs committed.`;
    verdictTone = 'positive';
  } else if (delta.eventCountDelta > 0) {
    verdict = `${previewCount} event${previewCount === 1 ? '' : 's'} staged — apply when ready or keep exploring.`;
  } else {
    verdict = 'Preview matches your committed timeline — tweak events or load a saved plan.';
  }

  return {
    verdict,
    verdictTone,
    debtFreeLabel: formatMonths(previewResult.monthsToPayoff),
    previewEventCount: previewCount,
    committedEventCount: committedCount,
  };
}

export function computeTimelineImpact(
  portfolio: Portfolio,
  strategyId: StrategyId,
): TimelineImpact {
  const base = portfolioWithoutEvents(portfolio);
  const baseResult = runSimulation(base, strategyId);
  const eventResult = runSimulation(portfolio, strategyId);
  const baseSnap = snapshotAtMonth(baseResult, 120);
  const eventSnap = snapshotAtMonth(eventResult, 120);

  return {
    baseMonthsToPayoff: baseResult.monthsToPayoff,
    eventMonthsToPayoff: eventResult.monthsToPayoff,
    monthsDelta: eventResult.monthsToPayoff - baseResult.monthsToPayoff,
    baseEquityAt10Yr: baseSnap?.totalEquity ?? 0,
    eventEquityAt10Yr: eventSnap?.totalEquity ?? 0,
    equityDelta: (eventSnap?.totalEquity ?? 0) - (baseSnap?.totalEquity ?? 0),
    baseCashflowAt10Yr: baseSnap?.monthlyCashflow ?? 0,
    eventCashflowAt10Yr: eventSnap?.monthlyCashflow ?? 0,
    cashflowDelta: (eventSnap?.monthlyCashflow ?? 0) - (baseSnap?.monthlyCashflow ?? 0),
    eventCount: countPortfolioEvents(portfolio),
  };
}

export function formatEventSummary(
  event: PropertyEvent,
  anchorYear: number,
  anchorMonth = 1,
): string {
  const cal = simMonthToCalendar(event.month, anchorYear, anchorMonth);
  const when = `${cal.month}/${cal.year}`;
  switch (event.type) {
    case 'rentChange':
      return `${when}: Rent → $${event.rent?.toLocaleString() ?? '?'}`;
    case 'rateReset':
      return `${when}: Rate → ${((event.rate ?? 0) * 100).toFixed(2)}%`;
    case 'capexSpike':
      return `${when}: Capex $${event.amount?.toLocaleString() ?? '?'}`;
    case 'refinance':
      return `${when}: Refi${event.rate != null ? ` @ ${(event.rate * 100).toFixed(2)}%` : ''}`;
    case 'disposition':
      return `${when}: Sell property`;
    case 'acquisition':
      return `${when}: Buy ${event.property?.name ?? 'property'}`;
    default:
      return when;
  }
}

export function defaultEventForType(
  type: PropertyEventType,
  month: number,
  property?: Property,
): PropertyEvent {
  const base: PropertyEvent = { month, type };
  switch (type) {
    case 'rentChange':
      return { ...base, rent: property?.monthlyRent ?? 0 };
    case 'rateReset':
      return { ...base, rate: property?.annualInterestRate ?? 0.065 };
    case 'capexSpike':
      return { ...base, amount: 5000 };
    case 'refinance':
      return {
        ...base,
        rate: property?.annualInterestRate ?? 0.065,
        payment: property?.monthlyPayment,
        balance: property?.balance,
      };
    case 'disposition':
      return base;
    case 'acquisition':
      return {
        ...base,
        property: {
          name: 'New property',
          balance: 200_000,
          marketValue: 250_000,
          annualInterestRate: 0.065,
          annualAppreciationRate: 0.03,
          monthlyPayment: 1200,
          monthlyRent: 1800,
          monthlyExpenses: 300,
        },
      };
    default:
      return base;
  }
}
