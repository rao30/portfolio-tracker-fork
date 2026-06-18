import type { Portfolio, Property } from './types';
import {
  applyFinancingPatch,
  buildFinancingPreview,
  deriveTermsFromPayoffCap,
  resolveFinancingType,
  validatePropertyFinancing,
  type FinancingPreview,
  type PropertyFinancingPatch,
} from './propertyFinancing';
import { formatCurrency, formatMonths } from './format';
import type {
  SellerFinancingAnalysis,
  SellerFinancingPreset,
  SellerFinancingPresetId,
  SellerFinancingPreviewDelta,
  SellerFinancingStatusTone,
} from './sellerFinancingTypes';

export const SELLER_FINANCING_PRESETS: SellerFinancingPreset[] = [
  {
    id: 'yield_maintenance_5yr',
    label: '5-yr yield maintenance',
    description: '60-mo balloon · 20-yr amortization — common seller note structure',
    balloonMonths: 60,
    sellerAmortizationMonths: 240,
  },
  {
    id: 'yield_maintenance_7yr',
    label: '7-yr yield maintenance',
    description: '84-mo balloon · 30-yr amortization — longer runway before refi',
    balloonMonths: 84,
    sellerAmortizationMonths: 360,
  },
  {
    id: 'short_balloon_3yr',
    label: '3-yr short balloon',
    description: '36-mo balloon · 15-yr amortization — aggressive refi timeline',
    balloonMonths: 36,
    sellerAmortizationMonths: 180,
  },
  {
    id: 'long_balloon_10yr',
    label: '10-yr long balloon',
    description: '120-mo balloon · 30-yr amortization — maximum seller carry period',
    balloonMonths: 120,
    sellerAmortizationMonths: 360,
  },
];

export function presetById(id: SellerFinancingPresetId): SellerFinancingPreset {
  return SELLER_FINANCING_PRESETS.find((p) => p.id === id) ?? SELLER_FINANCING_PRESETS[0];
}

export function buildPreviewProperty(
  committed: Property,
  patch: PropertyFinancingPatch,
): Property {
  return applyFinancingPatch(committed, patch);
}

export function financingPatchIsDirty(
  committed: Property,
  preview: Property,
): boolean {
  const fields: (keyof PropertyFinancingPatch)[] = [
    'financingType',
    'balloonMonths',
    'sellerAmortizationMonths',
    'sellerPayoffCap',
    'balloonRefiAnnualRate',
    'balloonRefiTermMonths',
    'sellerCredit',
    'balance',
    'monthlyPayment',
    'refiYear',
    'refiMonthCalendar',
  ];
  for (const field of fields) {
    if ((preview[field] ?? undefined) !== (committed[field] ?? undefined)) {
      return true;
    }
  }
  return false;
}

export function extractDirtyFinancingPatch(
  committed: Property,
  preview: Property,
): PropertyFinancingPatch {
  const patch: PropertyFinancingPatch = {};
  const fields: (keyof PropertyFinancingPatch)[] = [
    'financingType',
    'balloonMonths',
    'sellerAmortizationMonths',
    'sellerPayoffCap',
    'balloonRefiAnnualRate',
    'balloonRefiTermMonths',
    'sellerCredit',
    'balance',
    'monthlyPayment',
    'refiYear',
    'refiMonthCalendar',
  ];
  for (const field of fields) {
    if ((preview[field] ?? undefined) !== (committed[field] ?? undefined)) {
      (patch as Record<string, unknown>)[field] = preview[field];
    }
  }
  return patch;
}

function statusTone(
  preview: FinancingPreview,
  errorCount: number,
): SellerFinancingStatusTone {
  if (errorCount > 0) return 'caution';
  if (preview.urgency === 'critical') return 'caution';
  if (preview.urgency === 'warning') return 'caution';
  if (preview.financingType === 'seller' && preview.monthsUntilBalloon != null) {
    return 'neutral';
  }
  return 'positive';
}

export function computeSellerFinancingAnalysis(
  property: Property,
  portfolio: Portfolio,
  asOfMonth: number,
): SellerFinancingAnalysis {
  const financingType = resolveFinancingType(property);
  const preview = buildFinancingPreview(property, portfolio, asOfMonth);
  const issues = validatePropertyFinancing(property);
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  let statusHeadline: string;
  let statusDetail: string;

  if (financingType === 'conventional') {
    statusHeadline = 'Conventional amortizing loan';
    statusDetail = `${formatCurrency(property.balance)} balance · ${formatCurrency(property.monthlyPayment)}/mo P&I`;
  } else if (errorCount > 0) {
    statusHeadline = 'Seller note needs attention';
    statusDetail = issues.find((i) => i.severity === 'error')?.message ?? 'Fix validation errors before applying.';
  } else if (preview.urgency === 'critical') {
    statusHeadline = `Balloon due in ${preview.monthsUntilBalloon} months`;
    statusDetail = preview.balloonBalanceEstimate != null
      ? `Plan refi for ~${formatCurrency(preview.balloonBalanceEstimate)} · est. ${formatCurrency(preview.refiPaymentEstimate ?? 0)}/mo post-refi`
      : 'Confirm payoff cap and post-refi terms before the balloon date.';
  } else if (preview.urgency === 'warning') {
    statusHeadline = `Balloon in ${formatMonths(preview.monthsUntilBalloon ?? 0)}`;
    statusDetail = preview.refiPaymentEstimate != null
      ? `Post-refi payment est. ${formatCurrency(preview.refiPaymentEstimate)}/mo — compare to current ${formatCurrency(property.monthlyPayment)}/mo`
      : 'Model post-balloon refi rate and term to see payment impact.';
  } else if (preview.monthsUntilBalloon != null) {
    statusHeadline = `Seller note · balloon in ${formatMonths(preview.monthsUntilBalloon)}`;
    statusDetail =
      property.sellerPayoffCap != null && property.sellerPayoffCap > 0
        ? `Yield-maintenance cap ${formatCurrency(property.sellerPayoffCap)} · ${formatCurrency(property.monthlyPayment)}/mo`
        : `${formatCurrency(property.balance)} balance · ${formatCurrency(property.monthlyPayment)}/mo`;
  } else {
    statusHeadline = 'Seller note — balloon passed or not scheduled';
    statusDetail = 'Verify refi terms or switch to conventional if note is paid off.';
  }

  return {
    financingType,
    statusHeadline,
    statusDetail,
    statusTone: statusTone(preview, errorCount),
    monthsUntilBalloon: preview.monthsUntilBalloon,
    balloonBalanceEstimate: preview.balloonBalanceEstimate,
    refiPaymentEstimate: preview.refiPaymentEstimate,
    aggregatePiAtBalloon: preview.aggregatePiAtBalloon,
    monthlyPayment: property.monthlyPayment,
    balance: property.balance,
    issueCount: issues.length,
    errorCount,
  };
}

export function computeSellerFinancingPreviewDelta(
  committed: Property,
  preview: Property,
  portfolio: Portfolio,
  asOfMonth: number,
): SellerFinancingPreviewDelta {
  const committedPreview = buildFinancingPreview(committed, portfolio, asOfMonth);
  const previewFinancing = buildFinancingPreview(preview, portfolio, asOfMonth);

  return {
    balloonBalanceDelta:
      committedPreview.balloonBalanceEstimate != null &&
      previewFinancing.balloonBalanceEstimate != null
        ? previewFinancing.balloonBalanceEstimate - committedPreview.balloonBalanceEstimate
        : null,
    refiPaymentDelta:
      committedPreview.refiPaymentEstimate != null &&
      previewFinancing.refiPaymentEstimate != null
        ? previewFinancing.refiPaymentEstimate - committedPreview.refiPaymentEstimate
        : null,
    monthlyPaymentDelta: preview.monthlyPayment - committed.monthlyPayment,
    balanceDelta: preview.balance - committed.balance,
    monthsUntilBalloonDelta:
      committedPreview.monthsUntilBalloon != null &&
      previewFinancing.monthsUntilBalloon != null
        ? previewFinancing.monthsUntilBalloon - committedPreview.monthsUntilBalloon
        : previewFinancing.monthsUntilBalloon != null
          ? previewFinancing.monthsUntilBalloon
          : null,
  };
}

export function applyPresetPatch(
  presetId: SellerFinancingPresetId,
  property: Property,
): PropertyFinancingPatch {
  const preset = presetById(presetId);
  const patch: PropertyFinancingPatch = {
    financingType: 'seller',
    balloonMonths: preset.balloonMonths,
    sellerAmortizationMonths: preset.sellerAmortizationMonths,
  };
  if (property.sellerPayoffCap != null && property.sellerPayoffCap > 0) {
    const derived = deriveTermsFromPayoffCap(
      applyFinancingPatch(property, patch),
    );
    if (derived) {
      patch.balance = derived.balance;
      patch.monthlyPayment = derived.monthlyPayment;
    }
  }
  return patch;
}

export function buildAmortizationWaterfall(
  property: Property,
  months: number,
): { month: number; balance: number; principal: number; interest: number }[] {
  const points: { month: number; balance: number; principal: number; interest: number }[] = [];
  let balance = property.balance;
  const r = property.annualInterestRate / 12;
  const payment = property.monthlyPayment;
  const span = Math.min(months, property.balloonMonths ?? months);

  for (let m = 1; m <= span && balance > 0; m += 1) {
    const interest = balance * r;
    const principal = Math.min(balance, payment - interest);
    balance = Math.max(0, balance - principal);
    points.push({ month: m, balance, principal, interest });
  }
  return points;
}
