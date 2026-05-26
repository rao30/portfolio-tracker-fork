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
const DEFAULT_BONUS_CARRYOVER = 250_000;

const MACRS_5 = [0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576];
const MACRS_7 = [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446];
const MACRS_15 = [
  0.05, 0.095, 0.0855, 0.077, 0.0693, 0.0623, 0.059, 0.059, 0.0591, 0.059, 0.0591,
  0.059, 0.0591, 0.059, 0.0591, 0.0295,
];

export function bonusDepreciationForYear(taxYear: number): number {
  // Restored to 100% under renewed bonus depreciation (2025+).
  if (taxYear >= 2025) return 1;
  if (taxYear === 2024) return 0.6;
  if (taxYear === 2023) return 0.8;
  if (taxYear <= 2022) return 1;
  return 1;
}

export function defaultTaxProfile(taxYear = new Date().getFullYear()): TaxProfile {
  return {
    annualW2Income: 350_000,
    spouseIsReps: true,
    marginalTaxRate: 0.32,
    taxYear,
    bonusDepreciationRate: bonusDepreciationForYear(taxYear),
    remainingBonusCarryover: DEFAULT_BONUS_CARRYOVER,
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

export type PropertyTaxCategory = 'held' | 'newAcquisition' | 'future';

export interface PropertyTaxLoss {
  name: string;
  category: PropertyTaxCategory;
  serviceYear: number;
  yearsInService: number;
  grossRent: number;
  operatingExpenses: number;
  mortgageInterest: number;
  depreciation: DepreciationBreakdown;
  netTaxableLoss: number;
}

export interface TaxPlannerResult {
  taxYear: number;
  heldProperties: PropertyTaxLoss[];
  newAcquisitions: PropertyTaxLoss[];
  excludedFuture: string[];
  remainingBonusCarryover: number;
  totalDepreciation: number;
  totalHeldLoss: number;
  totalNewAcquisitionLoss: number;
  totalTaxLoss: number;
  usableLoss: number;
  carryforwardLoss: number;
  remainingTaxableIncome: number;
  federalTaxSavings: number;
  stateTaxSavings: number;
  totalTaxSavings: number;
  withoutRepsUsableLoss: number;
  withoutRepsCarryforward: number;
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

function resolveServiceYear(p: Property, taxYear: number): number {
  return p.placedInServiceYear ?? p.closeYear ?? taxYear - 3;
}

export function classifyPropertyForTaxYear(
  p: Property,
  taxYear: number,
): PropertyTaxCategory {
  const serviceYear = p.placedInServiceYear ?? p.closeYear;
  if (serviceYear == null) return 'held';
  if (serviceYear > taxYear) return 'future';
  if (serviceYear === taxYear) return 'newAcquisition';
  return 'held';
}

function macrsForYear(schedule: number[], yearIndex: number): number {
  if (yearIndex < 0 || yearIndex >= schedule.length) return 0;
  return schedule[yearIndex];
}

function buildingComponents(p: Property) {
  const purchasePrice = resolvePurchasePrice(p);
  const buildingBasis = purchasePrice * (1 - resolveLandPercent(p));
  const costSegPortion = buildingBasis * resolveCostSegPercent(p);
  const straightLineBasis = buildingBasis - costSegPortion;
  return { buildingBasis, costSegPortion, straightLineBasis };
}

/** First-year depreciation for a property placed in service this tax year. */
export function computeFirstYearDepreciation(
  p: Property,
  taxProfile: TaxProfile,
): DepreciationBreakdown {
  const { buildingBasis, costSegPortion, straightLineBasis } = buildingComponents(p);
  const straightLine = (straightLineBasis / RESIDENTIAL_LIFE_YEARS) * (11.5 / 12);

  const bonusRate =
    taxProfile.bonusDepreciationRate * (p.bonusEligiblePercent ?? 1);
  const bonus = costSegPortion * bonusRate;

  const remainingCostSeg = costSegPortion - bonus;
  const acceleratedMacrs =
    remainingCostSeg * 0.4 * MACRS_5[0] +
    remainingCostSeg * 0.25 * MACRS_7[0] +
    remainingCostSeg * 0.35 * MACRS_15[0];

  return {
    straightLine,
    bonus,
    acceleratedMacrs,
    total: straightLine + bonus + acceleratedMacrs,
    buildingBasis,
    costSegPortion,
  };
}

/** Ongoing annual depreciation — bonus already taken in a prior year. */
export function computeOngoingAnnualDepreciation(
  p: Property,
  taxYear: number,
): DepreciationBreakdown {
  const { buildingBasis, costSegPortion, straightLineBasis } = buildingComponents(p);
  const straightLine = straightLineBasis / RESIDENTIAL_LIFE_YEARS;

  const serviceYear = resolveServiceYear(p, taxYear);
  const yearsInService = Math.max(1, taxYear - serviceYear + 1);
  const yearIndex = yearsInService - 1;

  const bonusTakenInServiceYear =
    costSegPortion * bonusDepreciationForYear(serviceYear) * (p.bonusEligiblePercent ?? 1);
  const remainingCostSeg = Math.max(0, costSegPortion - bonusTakenInServiceYear);

  const acceleratedMacrs =
    remainingCostSeg * 0.4 * macrsForYear(MACRS_5, yearIndex) +
    remainingCostSeg * 0.25 * macrsForYear(MACRS_7, yearIndex) +
    remainingCostSeg * 0.35 * macrsForYear(MACRS_15, yearIndex);

  return {
    straightLine,
    bonus: 0,
    acceleratedMacrs,
    total: straightLine + acceleratedMacrs,
    buildingBasis,
    costSegPortion,
  };
}

export function computePropertyTaxLossForYear(
  p: Property,
  taxProfile: TaxProfile,
): PropertyTaxLoss | null {
  const category = classifyPropertyForTaxYear(p, taxProfile.taxYear);
  if (category === 'future') return null;

  const serviceYear = resolveServiceYear(p, taxProfile.taxYear);
  const yearsInService = Math.max(1, taxProfile.taxYear - serviceYear + 1);
  const grossRent = p.monthlyRent * 12;
  const operatingExpenses = p.monthlyExpenses * 12;
  const mortgageInterest = p.balance * p.annualInterestRate;

  const depreciation =
    category === 'newAcquisition'
      ? computeFirstYearDepreciation(p, taxProfile)
      : computeOngoingAnnualDepreciation(p, taxProfile.taxYear);

  const netTaxableLoss =
    depreciation.total + mortgageInterest + operatingExpenses - grossRent;

  return {
    name: p.name,
    category,
    serviceYear,
    yearsInService,
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

/** @deprecated Use computePropertyTaxLossForYear */
export function computePropertyTaxLoss(
  p: Property,
  taxProfile: TaxProfile,
): PropertyTaxLoss {
  return (
    computePropertyTaxLossForYear(p, taxProfile) ?? {
      name: p.name,
      category: 'future',
      serviceYear: taxProfile.taxYear,
      yearsInService: 0,
      grossRent: 0,
      operatingExpenses: 0,
      mortgageInterest: 0,
      depreciation: {
        straightLine: 0,
        bonus: 0,
        acceleratedMacrs: 0,
        total: 0,
        buildingBasis: 0,
        costSegPortion: 0,
      },
      netTaxableLoss: 0,
    }
  );
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

export function buildAcquisitionTemplateFromPortfolio(
  portfolio: Portfolio,
): AcquisitionTemplate {
  const props = portfolio.properties.filter(
    (p) => classifyPropertyForTaxYear(p, portfolio.taxProfile.taxYear) !== 'future',
  );
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

export function computeTaxPlannerResult(portfolio: Portfolio): TaxPlannerResult {
  const taxProfile = portfolio.taxProfile;
  const taxYear = taxProfile.taxYear;

  const heldProperties: PropertyTaxLoss[] = [];
  const newAcquisitions: PropertyTaxLoss[] = [];
  const excludedFuture: string[] = [];

  for (const p of portfolio.properties) {
    const loss = computePropertyTaxLossForYear(p, taxProfile);
    if (!loss) {
      excludedFuture.push(p.name);
      continue;
    }
    if (loss.category === 'held') heldProperties.push(loss);
    else newAcquisitions.push(loss);
  }

  const propertyDepreciation =
    [...heldProperties, ...newAcquisitions].reduce(
      (s, l) => s + l.depreciation.total,
      0,
    );
  const remainingBonusCarryover = taxProfile.remainingBonusCarryover;
  const totalDepreciation = propertyDepreciation + remainingBonusCarryover;

  const sumLoss = (items: PropertyTaxLoss[]) =>
    items.reduce((s, l) => s + Math.max(0, l.netTaxableLoss), 0);

  const totalHeldLoss = sumLoss(heldProperties);
  const totalNewAcquisitionLoss = sumLoss(newAcquisitions);

  const propertyTaxLoss = sumLoss([...heldProperties, ...newAcquisitions]);
  const totalTaxLoss = propertyTaxLoss + remainingBonusCarryover;

  const { usable, carryforward } = computeUsableLoss(totalTaxLoss, taxProfile);
  const income = taxProfile.annualW2Income + (taxProfile.otherPassiveIncome ?? 0);
  const remainingTaxableIncome = Math.max(0, income - usable);
  const federalTaxSavings = usable * taxProfile.marginalTaxRate;
  const stateTaxSavings = usable * (taxProfile.stateTaxRate ?? 0);

  const withoutRepsProfile = { ...taxProfile, spouseIsReps: false };
  const withoutReps = computeUsableLoss(totalTaxLoss, withoutRepsProfile);

  return {
    taxYear,
    heldProperties,
    newAcquisitions,
    excludedFuture,
    remainingBonusCarryover,
    totalDepreciation,
    totalHeldLoss,
    totalNewAcquisitionLoss,
    totalTaxLoss,
    usableLoss: usable,
    carryforwardLoss: carryforward,
    remainingTaxableIncome,
    federalTaxSavings,
    stateTaxSavings,
    totalTaxSavings: federalTaxSavings + stateTaxSavings,
    withoutRepsUsableLoss: withoutReps.usable,
    withoutRepsCarryforward: withoutReps.carryforward,
  };
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
    closeYear: taxProfile.taxYear,
    useCostSeg: template.useCostSeg,
    costSegPercent: template.costSegPercent,
    cashInvested: template.purchasePrice * template.downPaymentPercent,
  };
}

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
    remainingBonusCarryover:
      raw?.remaining_bonus_carryover ?? defaults.remainingBonusCarryover,
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
    remaining_bonus_carryover: profile.remainingBonusCarryover,
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
        simulationAnchorYear: 2026,
        simulationAnchorMonth: 1,
        defaultRefiAnnualRate: 0.0675,
        defaultRefiTermMonths: 360,
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
