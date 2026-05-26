import type {
  AcquisitionTemplate,
  AcquisitionTemplateFile,
  Portfolio,
  Property,
  TaxProfile,
  TaxProfileFile,
} from './types';

const DEFAULT_LAND_PERCENT = 0.2;
const DEFAULT_COST_SEG_PERCENT = 0.25;
const RESIDENTIAL_LIFE_YEARS = 27.5;

/** MACRS year-1 depreciation rates for 5-, 7-, and 15-year property. */
const MACRS_Y1 = { yr5: 0.2, yr7: 0.1429, yr15: 0.05 };

/** Cost seg pool split across asset classes. */
const COST_SEG_SPLIT = { yr5: 0.4, yr7: 0.25, yr15: 0.35 };

export function bonusDepreciationForYear(taxYear: number): number {
  if (taxYear <= 2022) return 1;
  if (taxYear === 2023) return 0.8;
  if (taxYear === 2024) return 0.6;
  if (taxYear === 2025) return 0.4;
  if (taxYear === 2026) return 0.2;
  return 0;
}

export function defaultTaxProfile(taxYear = new Date().getFullYear()): TaxProfile {
  return {
    annualW2Income: 0,
    spouseIsReps: true,
    marginalTaxRate: 0.32,
    taxYear,
    bonusDepreciationRate: bonusDepreciationForYear(taxYear),
    filingStatus: 'mfj',
    otherPassiveIncome: 0,
    stateTaxRate: 0,
  };
}

export interface DepreciationBreakdown {
  straightLine: number;
  bonus: number;
  acceleratedMacrs: number;
  total: number;
  buildingBasis: number;
  costSegPortion: number;
}

export interface PropertyTaxLoss {
  name: string;
  grossRent: number;
  operatingExpenses: number;
  mortgageInterest: number;
  depreciation: DepreciationBreakdown;
  netTaxableLoss: number;
}

export interface TaxPlannerResult {
  existingLosses: PropertyTaxLoss[];
  totalExistingLoss: number;
  templateLossPerProperty: number;
  usableLoss: number;
  carryforwardLoss: number;
  remainingTaxableIncome: number;
  federalTaxSavings: number;
  stateTaxSavings: number;
  totalTaxSavings: number;
  gapToWipeW2: number;
  purchaseVolumeNeeded: number;
  propertiesToBuy: number;
  withoutRepsUsableLoss: number;
  withoutRepsCarryforward: number;
  strategies: {
    id: string;
    label: string;
    lossPerProperty: number;
    propertiesNeeded: number;
    purchaseVolume: number;
    taxSavings: number;
  }[];
}

function resolvePurchasePrice(p: Property): number {
  return p.purchasePrice ?? p.marketValue;
}

function resolveLandPercent(p: Property): number {
  return p.landPercent ?? DEFAULT_LAND_PERCENT;
}

function resolveCostSegPercent(p: Property): number {
  if (p.useCostSeg === false) return 0;
  return p.costSegPercent ?? DEFAULT_COST_SEG_PERCENT;
}

export function computeFirstYearDepreciation(
  p: Property,
  taxProfile: TaxProfile,
): DepreciationBreakdown {
  const purchasePrice = resolvePurchasePrice(p);
  const buildingBasis = purchasePrice * (1 - resolveLandPercent(p));
  const costSegPortion = buildingBasis * resolveCostSegPercent(p);
  const straightLineBasis = buildingBasis - costSegPortion;
  const straightLine = (straightLineBasis / RESIDENTIAL_LIFE_YEARS) * (11.5 / 12);

  const bonusRate =
    taxProfile.bonusDepreciationRate * (p.bonusEligiblePercent ?? 1);
  const bonus = costSegPortion * bonusRate;

  const remainingCostSeg = costSegPortion - bonus;
  const acceleratedMacrs =
    remainingCostSeg * COST_SEG_SPLIT.yr5 * MACRS_Y1.yr5 +
    remainingCostSeg * COST_SEG_SPLIT.yr7 * MACRS_Y1.yr7 +
    remainingCostSeg * COST_SEG_SPLIT.yr15 * MACRS_Y1.yr15;

  return {
    straightLine,
    bonus,
    acceleratedMacrs,
    total: straightLine + bonus + acceleratedMacrs,
    buildingBasis,
    costSegPortion,
  };
}

export function computePropertyTaxLoss(
  p: Property,
  taxProfile: TaxProfile,
): PropertyTaxLoss {
  const grossRent = p.monthlyRent * 12;
  const operatingExpenses = p.monthlyExpenses * 12;
  const mortgageInterest = p.balance * p.annualInterestRate;
  const depreciation = computeFirstYearDepreciation(p, taxProfile);
  const netTaxableLoss =
    depreciation.total + mortgageInterest + operatingExpenses - grossRent;

  return {
    name: p.name,
    grossRent,
    operatingExpenses,
    mortgageInterest,
    depreciation,
    netTaxableLoss,
  };
}

export function passiveLossAllowance(agi: number): number {
  const base = 25000;
  if (agi <= 100000) return base;
  if (agi >= 150000) return 0;
  return base * (1 - (agi - 100000) / 50000);
}

export function computeUsableLoss(
  totalLoss: number,
  taxProfile: TaxProfile,
): { usable: number; carryforward: number } {
  const income = taxProfile.annualW2Income + (taxProfile.otherPassiveIncome ?? 0);
  if (totalLoss <= 0) {
    return { usable: 0, carryforward: 0 };
  }

  if (taxProfile.spouseIsReps) {
    const usable = Math.min(totalLoss, income);
    return { usable, carryforward: Math.max(0, totalLoss - income) };
  }

  const allowance = passiveLossAllowance(income);
  const usable = Math.min(totalLoss, allowance, income);
  return { usable, carryforward: Math.max(0, totalLoss - usable) };
}

export function templateToProperty(
  template: AcquisitionTemplate,
  index: number,
  taxProfile: TaxProfile,
): Property {
  const loanAmount = template.purchasePrice * (1 - template.downPaymentPercent);
  const monthlyPayment = computeMonthlyPayment(
    loanAmount,
    template.annualInterestRate,
    template.loanTermMonths,
  );

  return {
    name: `${template.label} #${index + 1}`,
    balance: loanAmount,
    marketValue: template.purchasePrice,
    annualInterestRate: template.annualInterestRate,
    annualAppreciationRate: 0.03,
    monthlyPayment,
    monthlyRent: template.monthlyRent,
    monthlyExpenses: template.monthlyExpenses,
    purchasePrice: template.purchasePrice,
    landPercent: template.landPercent,
    placedInServiceYear: taxProfile.taxYear,
    useCostSeg: template.useCostSeg,
    costSegPercent: template.costSegPercent,
    cashInvested: template.purchasePrice * template.downPaymentPercent,
  };
}

export function computeMonthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (termMonths <= 0) return principal;
  if (annualRate <= 0) return principal / termMonths;
  const r = annualRate / 12;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

function computeTemplateLoss(
  template: AcquisitionTemplate,
  taxProfile: TaxProfile,
  useCostSeg: boolean,
  costSegPercent: number,
): number {
  const prop = templateToProperty(template, 0, taxProfile);
  prop.useCostSeg = useCostSeg;
  prop.costSegPercent = costSegPercent;
  return computePropertyTaxLoss(prop, taxProfile).netTaxableLoss;
}

export function buildAcquisitionTemplateFromPortfolio(
  portfolio: Portfolio,
): AcquisitionTemplate {
  const props = portfolio.properties;
  if (props.length === 0) {
    return {
      label: 'Typical acquisition',
      purchasePrice: 550000,
      downPaymentPercent: 0.2,
      annualInterestRate: 0.065,
      loanTermMonths: 360,
      monthlyRent: 5500,
      monthlyExpenses: 1650,
      landPercent: DEFAULT_LAND_PERCENT,
      costSegPercent: DEFAULT_COST_SEG_PERCENT,
      useCostSeg: true,
    };
  }

  const median = (vals: number[]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const prices = props.map((p) => p.marketValue);
  const rentRatios = props.map((p) => p.monthlyRent / p.marketValue);
  const expenseRatios = props.map((p) => p.monthlyExpenses / p.monthlyRent);
  const rates = props.map((p) => p.annualInterestRate).filter((r) => r > 0);

  const purchasePrice = median(prices);
  const rentRatio = median(rentRatios);
  const expenseRatio = median(expenseRatios);

  return {
    label: 'Typical acquisition',
    purchasePrice: Math.round(purchasePrice / 1000) * 1000,
    downPaymentPercent: 0.2,
    annualInterestRate: rates.length ? median(rates) : 0.065,
    loanTermMonths: 360,
    monthlyRent: Math.round(purchasePrice * rentRatio),
    monthlyExpenses: Math.round(purchasePrice * rentRatio * expenseRatio),
    landPercent: DEFAULT_LAND_PERCENT,
    costSegPercent: DEFAULT_COST_SEG_PERCENT,
    useCostSeg: true,
  };
}

export function computeTaxPlannerResult(
  portfolio: Portfolio,
  templateOverride?: Partial<AcquisitionTemplate>,
): TaxPlannerResult {
  const taxProfile = portfolio.taxProfile;
  const template = { ...portfolio.acquisitionTemplate, ...templateOverride };

  const existingLosses = portfolio.properties.map((p) =>
    computePropertyTaxLoss(p, taxProfile),
  );
  const totalExistingLoss = existingLosses.reduce(
    (s, l) => s + Math.max(0, l.netTaxableLoss),
    0,
  );

  const templateLossPerProperty = computeTemplateLoss(
    template,
    taxProfile,
    template.useCostSeg,
    template.costSegPercent,
  );

  const { usable, carryforward } = computeUsableLoss(totalExistingLoss, taxProfile);

  const income = taxProfile.annualW2Income + (taxProfile.otherPassiveIncome ?? 0);
  const remainingTaxableIncome = Math.max(0, income - usable);
  const gapToWipeW2 = Math.max(0, remainingTaxableIncome);

  let propertiesToBuy = 0;
  let purchaseVolumeNeeded = 0;
  if (templateLossPerProperty > 0 && gapToWipeW2 > 0) {
    propertiesToBuy = Math.ceil(gapToWipeW2 / templateLossPerProperty);
    purchaseVolumeNeeded = propertiesToBuy * template.purchasePrice;
  }

  const fullUsable = computeUsableLoss(
    totalExistingLoss + propertiesToBuy * templateLossPerProperty,
    taxProfile,
  );
  const federalTaxSavings = fullUsable.usable * taxProfile.marginalTaxRate;
  const stateTaxSavings = fullUsable.usable * (taxProfile.stateTaxRate ?? 0);

  const withoutRepsProfile = { ...taxProfile, spouseIsReps: false };
  const withoutReps = computeUsableLoss(totalExistingLoss, withoutRepsProfile);

  const strategies = [
    {
      id: 'conservative',
      label: 'Conservative (straight-line only)',
      costSeg: false,
      costSegPercent: 0,
    },
    {
      id: 'moderate',
      label: 'Moderate (cost seg + bonus)',
      costSeg: true,
      costSegPercent: template.costSegPercent,
    },
    {
      id: 'aggressive',
      label: 'Aggressive (30% cost seg pool)',
      costSeg: true,
      costSegPercent: 0.3,
    },
  ].map(({ id, label, costSeg, costSegPercent }) => {
    const lossPerProperty = computeTemplateLoss(
      template,
      taxProfile,
      costSeg,
      costSegPercent,
    );
    const propsNeeded =
      lossPerProperty > 0 && gapToWipeW2 > 0
        ? Math.ceil(gapToWipeW2 / lossPerProperty)
        : 0;
    const combinedLoss = totalExistingLoss + propsNeeded * lossPerProperty;
    const stratUsable = computeUsableLoss(combinedLoss, taxProfile);
    return {
      id,
      label,
      lossPerProperty,
      propertiesNeeded: propsNeeded,
      purchaseVolume: propsNeeded * template.purchasePrice,
      taxSavings:
        stratUsable.usable * taxProfile.marginalTaxRate +
        stratUsable.usable * (taxProfile.stateTaxRate ?? 0),
    };
  });

  return {
    existingLosses,
    totalExistingLoss,
    templateLossPerProperty,
    usableLoss: usable,
    carryforwardLoss: carryforward,
    remainingTaxableIncome,
    federalTaxSavings,
    stateTaxSavings,
    totalTaxSavings: federalTaxSavings + stateTaxSavings,
    gapToWipeW2,
    purchaseVolumeNeeded,
    propertiesToBuy,
    withoutRepsUsableLoss: withoutReps.usable,
    withoutRepsCarryforward: withoutReps.carryforward,
    strategies,
  };
}

/** Inject N template acquisitions into a portfolio copy for simulation. */
export function addTemplateAcquisitions(
  portfolio: Portfolio,
  count: number,
): Portfolio {
  if (count <= 0) return portfolio;
  const additions = Array.from({ length: count }, (_, i) =>
    templateToProperty(portfolio.acquisitionTemplate, i, portfolio.taxProfile),
  );
  return {
    ...portfolio,
    properties: [...portfolio.properties, ...additions],
  };
}

export function normalizeTaxProfile(raw?: TaxProfileFile, taxYear?: number): TaxProfile {
  const year = raw?.tax_year ?? taxYear ?? new Date().getFullYear();
  const defaults = defaultTaxProfile(year);
  return {
    annualW2Income: raw?.annual_w2_income ?? defaults.annualW2Income,
    spouseIsReps: raw?.spouse_is_reps !== false,
    marginalTaxRate: raw?.marginal_tax_rate ?? defaults.marginalTaxRate,
    taxYear: year,
    bonusDepreciationRate:
      raw?.bonus_depreciation_rate ?? bonusDepreciationForYear(year),
    filingStatus: raw?.filing_status ?? defaults.filingStatus,
    otherPassiveIncome: raw?.other_passive_income ?? 0,
    stateTaxRate: raw?.state_tax_rate ?? 0,
  };
}

export function denormalizeTaxProfile(profile: TaxProfile): TaxProfileFile {
  return {
    annual_w2_income: profile.annualW2Income,
    spouse_is_reps: profile.spouseIsReps,
    marginal_tax_rate: profile.marginalTaxRate,
    tax_year: profile.taxYear,
    bonus_depreciation_rate: profile.bonusDepreciationRate,
    filing_status: profile.filingStatus,
    other_passive_income: profile.otherPassiveIncome,
    state_tax_rate: profile.stateTaxRate,
  };
}

export function normalizeAcquisitionTemplate(
  raw: AcquisitionTemplateFile | undefined,
  portfolio?: Portfolio,
): AcquisitionTemplate {
  const fromPortfolio = portfolio
    ? buildAcquisitionTemplateFromPortfolio(portfolio)
    : buildAcquisitionTemplateFromPortfolio({
        extraMonthlyBudget: 0,
        annualRentGrowthRate: 0.025,
        annualExpenseInflationRate: 0.02,
        reinvestSurplus: false,
        monthlyReserveTarget: 0,
        defaultVacancyRate: 0,
        defaultCapexReserveRate: 0.1,
        defaultCapexReserveFlat: 0,
        taxProfile: defaultTaxProfile(),
        acquisitionTemplate: {} as AcquisitionTemplate,
        goals: [],
        properties: [],
      });

  return {
    label: raw?.label ?? fromPortfolio.label,
    purchasePrice: raw?.purchase_price ?? fromPortfolio.purchasePrice,
    downPaymentPercent: raw?.down_payment_percent ?? fromPortfolio.downPaymentPercent,
    annualInterestRate: raw?.annual_interest_rate ?? fromPortfolio.annualInterestRate,
    loanTermMonths: raw?.loan_term_months ?? fromPortfolio.loanTermMonths,
    monthlyRent: raw?.monthly_rent ?? fromPortfolio.monthlyRent,
    monthlyExpenses: raw?.monthly_expenses ?? fromPortfolio.monthlyExpenses,
    landPercent: raw?.land_percent ?? fromPortfolio.landPercent,
    costSegPercent: raw?.cost_seg_percent ?? fromPortfolio.costSegPercent,
    useCostSeg: raw?.use_cost_seg !== false,
  };
}

export function denormalizeAcquisitionTemplate(
  template: AcquisitionTemplate,
): AcquisitionTemplateFile {
  return {
    label: template.label,
    purchase_price: template.purchasePrice,
    down_payment_percent: template.downPaymentPercent,
    annual_interest_rate: template.annualInterestRate,
    loan_term_months: template.loanTermMonths,
    monthly_rent: template.monthlyRent,
    monthly_expenses: template.monthlyExpenses,
    land_percent: template.landPercent,
    cost_seg_percent: template.costSegPercent,
    use_cost_seg: template.useCostSeg,
  };
}
