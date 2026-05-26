import {
  STRATEGY_LABELS,
  SCENARIO_PRESETS,
  compareStrategies,
  runSimulation,
  generateInsights,
  computePortfolioYearMetrics,
  computePropertyInsightsAtMonth,
  currentPortfolioMetrics,
  comparisonAtHorizons,
  findBudgetForDebtFreeByMonth,
  findBudgetForEquityAtMonth,
  monthForPortfolioYear,
  maxPortfolioDashboardYear,
  snapshotAtMonth,
  normalizePortfolio,
  buildSellScenario,
  computeTaxPlannerResult,
} from './portfolio-analytics.mjs';

function resolveScenario(portfolio, scenarioId) {
  if (!scenarioId || scenarioId === 'base') {
    return SCENARIO_PRESETS[0];
  }
  const sell = portfolio.properties.find((p) => scenarioId === `sell-${p.name}`);
  if (sell) {
    return buildSellScenario(sell.name);
  }
  const preset = SCENARIO_PRESETS.find((s) => s.id === scenarioId);
  if (preset) return preset;
  throw new Error(
    `Unknown scenario "${scenarioId}". Use: ${SCENARIO_PRESETS.map((s) => s.id).join(', ')}, or sell-<property name>`,
  );
}

function summarizeSimulation(result, portfolio, includeHistory = false) {
  const years = [1, 5, 10, 15, 20].filter(
    (y) => monthForPortfolioYear(y) <= result.history.length,
  );
  const horizons = years.map((year) => {
    const metrics = computePortfolioYearMetrics(portfolio, result, year);
    return metrics
      ? {
          year,
          calendarYear: metrics.calendarYear,
          equity: metrics.equity,
          debt: metrics.debt,
          ltv: metrics.ltv,
          rentalCashflowAnnual: metrics.cashflowAnnual,
          portfolioDscr: metrics.portfolioDscr,
          capRate: metrics.capRate,
        }
      : null;
  }).filter(Boolean);

  const payload = {
    strategy: result.strategy,
    monthsToPayoff: result.monthsToPayoff,
    totalInterestPaid: result.totalInterestPaid,
    finalEquity: result.finalEquity,
    payoffOrder: result.order,
    horizons,
  };

  if (includeHistory) {
    payload.history = result.history.map((h) => ({
      month: h.month,
      totalEquity: h.totalEquity,
      totalLiabilities: h.totalLiabilities,
      totalPropertyValue: h.totalPropertyValue,
      monthlyCashflow: h.monthlyCashflow,
      monthlyPi: h.monthlyPi,
    }));
  }

  return payload;
}

export function listCapabilities() {
  return {
    strategies: Object.entries(STRATEGY_LABELS).map(([id, label]) => ({ id, label })),
    scenarios: SCENARIO_PRESETS.map((s) => ({ id: s.id, label: s.label })),
    tools: [
      'get_portfolio',
      'portfolio_current_metrics',
      'simulate_payoff_strategy',
      'compare_payoff_strategies',
      'portfolio_insights',
      'property_cashflow_breakdown',
      'tax_planner_summary',
      'solve_extra_budget_goal',
    ],
  };
}

export function analyzeFromPortfolio(rawPortfolio, body = {}) {
  const portfolio = normalizePortfolio(rawPortfolio);
  const action = body.action ?? 'insights';
  const strategyId = body.strategy ?? 'highestRate';
  const scenario = resolveScenario(portfolio, body.scenario ?? 'base');
  const portfolioYear = Math.max(1, Math.min(20, Number(body.portfolioYear ?? 1) || 1));

  switch (action) {
    case 'current_metrics': {
      return { metrics: currentPortfolioMetrics(portfolio.properties) };
    }
    case 'simulate': {
      const strategy = body.strategy === 'baseline' ? 'baseline' : strategyId;
      const result = runSimulation(portfolio, strategy, scenario);
      return summarizeSimulation(
        result,
        portfolio,
        Boolean(body.includeHistory),
      );
    }
    case 'compare_strategies': {
      const results = compareStrategies(portfolio.properties, {
        extraMonthlyBudget: portfolio.extraMonthlyBudget,
        includeBaseline: body.includeBaseline !== false,
      });
      return {
        extraMonthlyBudget: portfolio.extraMonthlyBudget,
        ranking: results.map((r) => ({
          strategy: r.strategy,
          label:
            r.strategy in STRATEGY_LABELS
              ? STRATEGY_LABELS[r.strategy]
              : r.strategy === 'baseline'
                ? 'Baseline'
                : r.strategy,
          monthsToPayoff: r.monthsToPayoff,
          totalInterestPaid: r.totalInterestPaid,
          finalEquity: r.finalEquity,
        })),
      };
    }
    case 'insights': {
      const activeStrategy = strategyId;
      const active = runSimulation(portfolio, activeStrategy, scenario);
      const baseline = runSimulation(portfolio, 'baseline', scenario);
      const baseCase = runSimulation(portfolio, activeStrategy, SCENARIO_PRESETS[0]);
      const narratives = generateInsights(portfolio, active, baseline, activeStrategy);
      const month = monthForPortfolioYear(portfolioYear);
      const propertyInsights = computePropertyInsightsAtMonth(
        portfolio,
        active,
        month,
        scenario,
      );
      const yearMetrics = computePortfolioYearMetrics(portfolio, active, portfolioYear);
      const horizonComparison = comparisonAtHorizons(active, [60, 120, 180, 240]);
      return {
        strategy: activeStrategy,
        scenario: scenario.id,
        portfolioYear,
        calendarYear: yearMetrics?.calendarYear,
        narratives,
        yearMetrics,
        propertyInsights,
        horizonComparison,
        simulation: summarizeSimulation(active, portfolio, false),
        vsBaseline: {
          monthsSaved: baseline.monthsToPayoff - active.monthsToPayoff,
          interestSaved: baseline.totalInterestPaid - active.totalInterestPaid,
        },
        baseCaseMonthsToPayoff: baseCase.monthsToPayoff,
      };
    }
    case 'property_breakdown': {
      const active = runSimulation(portfolio, strategyId, scenario);
      const month = monthForPortfolioYear(portfolioYear);
      return {
        strategy: strategyId,
        scenario: scenario.id,
        portfolioYear,
        properties: computePropertyInsightsAtMonth(portfolio, active, month, scenario),
      };
    }
    case 'tax': {
      const tax = computeTaxPlannerResult(portfolio);
      const mapLoss = (p) => ({
        name: p.name,
        category: p.category,
        netTaxableLoss: p.netTaxableLoss,
        depreciationTotal: p.depreciation.total,
      });
      return {
        taxYear: tax.taxYear,
        summary: {
          totalDepreciation: tax.totalDepreciation,
          totalTaxLoss: tax.totalTaxLoss,
          usableLoss: tax.usableLoss,
          carryforwardLoss: tax.carryforwardLoss,
          totalTaxSavings: tax.totalTaxSavings,
          federalTaxSavings: tax.federalTaxSavings,
          remainingBonusCarryover: tax.remainingBonusCarryover,
          withoutRepsUsableLoss: tax.withoutRepsUsableLoss,
        },
        heldProperties: tax.heldProperties.map(mapLoss),
        newAcquisitions: tax.newAcquisitions.map(mapLoss),
        excludedFuture: tax.excludedFuture,
      };
    }
    case 'solve_budget': {
      const goalType = body.goalType ?? 'debt_free_by_month';
      const goalMonth = Number(body.goalMonth ?? 120);
      if (goalType === 'equity_at_month') {
        const goalEquity = Number(body.goalEquity ?? 1_000_000);
        const budget = findBudgetForEquityAtMonth(
          portfolio,
          strategyId,
          goalMonth,
          goalEquity,
        );
        return { goalType, goalMonth, goalEquity, requiredExtraMonthlyBudget: budget };
      }
      const budget = findBudgetForDebtFreeByMonth(portfolio, strategyId, goalMonth);
      return { goalType: 'debt_free_by_month', goalMonth, requiredExtraMonthlyBudget: budget };
    }
    default:
      throw new Error(
        `Unknown action "${action}". Use: current_metrics, simulate, compare_strategies, insights, property_breakdown, tax, solve_budget`,
      );
  }
}

export function maxDashboardYearForPortfolio(rawPortfolio, strategyId = 'highestRate') {
  const portfolio = normalizePortfolio(rawPortfolio);
  const result = runSimulation(portfolio, strategyId, SCENARIO_PRESETS[0]);
  return maxPortfolioDashboardYear(result);
}
