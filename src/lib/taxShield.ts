import type { Portfolio, TaxProfile } from './types';
import { computeTaxPlannerResult } from './tax';
import { formatCurrency } from './format';
import type {
  TaxShieldAnalysis,
  TaxShieldPreviewDelta,
  TaxShieldPreviewPatch,
  TaxShieldStatusTone,
} from './taxShieldTypes';

function mergeTaxProfile(base: TaxProfile, patch: TaxShieldPreviewPatch): TaxProfile {
  return {
    ...base,
    ...patch,
    stateTaxRate: patch.stateTaxRate ?? base.stateTaxRate ?? 0,
  };
}

function portfolioWithTaxProfile(portfolio: Portfolio, taxProfile: TaxProfile): Portfolio {
  return { ...portfolio, taxProfile };
}

function shieldTone(usable: number, carryforward: number, spouseIsReps: boolean): TaxShieldStatusTone {
  if (carryforward > 0 && !spouseIsReps) return 'caution';
  if (usable <= 0) return 'neutral';
  if (usable > 0) return 'positive';
  return 'neutral';
}

export function computeTaxShieldAnalysis(
  portfolio: Portfolio,
  taxProfile: TaxProfile = portfolio.taxProfile,
): TaxShieldAnalysis {
  const result = computeTaxPlannerResult(portfolioWithTaxProfile(portfolio, taxProfile));
  const income = taxProfile.annualW2Income + (taxProfile.otherPassiveIncome ?? 0);
  const shieldPercentOfW2 = income > 0 ? (result.usableLoss / income) * 100 : 0;

  const withoutRepsProfile = { ...taxProfile, spouseIsReps: false };
  const withoutRepsResult = computeTaxPlannerResult(
    portfolioWithTaxProfile(portfolio, withoutRepsProfile),
  );
  const repsDeltaSavings = result.totalTaxSavings - withoutRepsResult.totalTaxSavings;

  let statusHeadline: string;
  let statusDetail: string;

  if (result.totalTaxLoss <= 0) {
    statusHeadline = 'No rental tax shield this year';
    statusDetail = 'Portfolio shows net taxable income or break-even for the selected tax year.';
  } else if (taxProfile.spouseIsReps) {
    statusHeadline = `REPS unlocks ${formatCurrency(result.usableLoss)} W2 offset`;
    statusDetail =
      result.carryforwardLoss > 0
        ? `${formatCurrency(result.carryforwardLoss)} loss carries forward beyond W2 income.`
        : `Full shield applied — saves ${formatCurrency(result.totalTaxSavings)} at your marginal rate.`;
  } else {
    const allowance = result.withoutRepsUsableLoss;
    statusHeadline =
      allowance > 0
        ? `Passive allowance shields ${formatCurrency(allowance)}`
        : 'Passive loss rules limit your deduction';
    statusDetail =
      result.withoutRepsCarryforward > 0
        ? `${formatCurrency(result.withoutRepsCarryforward)} suspended — toggle REPS preview to compare.`
        : `Without REPS, only ${formatCurrency(allowance)} offsets W2 this year.`;
  }

  return {
    taxYear: result.taxYear,
    statusHeadline,
    statusDetail,
    statusTone: shieldTone(result.usableLoss, result.carryforwardLoss, taxProfile.spouseIsReps),
    totalTaxShield: result.totalTaxLoss,
    totalTaxSavings: result.totalTaxSavings,
    usableLoss: result.usableLoss,
    carryforwardLoss: result.carryforwardLoss,
    remainingTaxableIncome: result.remainingTaxableIncome,
    shieldPercentOfW2,
    repsDeltaSavings,
    withoutRepsUsableLoss: result.withoutRepsUsableLoss,
    withoutRepsCarryforward: result.withoutRepsCarryforward,
    propertyCount: result.heldProperties.length + result.newAcquisitions.length,
    newAcquisitionCount: result.newAcquisitions.length,
  };
}

export function computeTaxShieldPreviewDelta(
  portfolio: Portfolio,
  committed: TaxProfile,
  preview: TaxProfile,
): TaxShieldPreviewDelta {
  const committedResult = computeTaxPlannerResult(
    portfolioWithTaxProfile(portfolio, committed),
  );
  const previewResult = computeTaxPlannerResult(
    portfolioWithTaxProfile(portfolio, preview),
  );

  return {
    shieldDelta: previewResult.totalTaxLoss - committedResult.totalTaxLoss,
    savingsDelta: previewResult.totalTaxSavings - committedResult.totalTaxSavings,
    usableDelta: previewResult.usableLoss - committedResult.usableLoss,
    carryforwardDelta: previewResult.carryforwardLoss - committedResult.carryforwardLoss,
    remainingIncomeDelta:
      previewResult.remainingTaxableIncome - committedResult.remainingTaxableIncome,
    w2LabelCommitted: formatCurrency(committed.annualW2Income),
    w2LabelPreview: formatCurrency(preview.annualW2Income),
  };
}

export function buildPreviewTaxProfile(
  committed: TaxProfile,
  patch: TaxShieldPreviewPatch,
): TaxProfile {
  return mergeTaxProfile(committed, patch);
}

export function taxProfilePatchIsDirty(
  committed: TaxProfile,
  preview: TaxProfile,
): boolean {
  return (
    preview.annualW2Income !== committed.annualW2Income ||
    preview.remainingBonusCarryover !== committed.remainingBonusCarryover ||
    preview.marginalTaxRate !== committed.marginalTaxRate ||
    preview.spouseIsReps !== committed.spouseIsReps ||
    (preview.stateTaxRate ?? 0) !== (committed.stateTaxRate ?? 0)
  );
}

export function extractDirtyPatch(
  committed: TaxProfile,
  preview: TaxProfile,
): TaxShieldPreviewPatch {
  const patch: TaxShieldPreviewPatch = {};
  if (preview.annualW2Income !== committed.annualW2Income) {
    patch.annualW2Income = preview.annualW2Income;
  }
  if (preview.remainingBonusCarryover !== committed.remainingBonusCarryover) {
    patch.remainingBonusCarryover = preview.remainingBonusCarryover;
  }
  if (preview.marginalTaxRate !== committed.marginalTaxRate) {
    patch.marginalTaxRate = preview.marginalTaxRate;
  }
  if (preview.spouseIsReps !== committed.spouseIsReps) {
    patch.spouseIsReps = preview.spouseIsReps;
  }
  if ((preview.stateTaxRate ?? 0) !== (committed.stateTaxRate ?? 0)) {
    patch.stateTaxRate = preview.stateTaxRate ?? 0;
  }
  return patch;
}
