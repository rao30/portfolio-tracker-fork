import { useMemo, useState } from 'react';
import { BalanceChart } from './components/BalanceChart';
import { CashflowChart } from './components/CashflowChart';
import { Controls } from './components/Controls';
import { GoalTracker } from './components/GoalTracker';
import { Header } from './components/Header';
import { IncomeVsExpenseChart } from './components/IncomeVsExpenseChart';
import { InterestChart } from './components/InterestChart';
import { KpiCards } from './components/KpiCards';
import { MonteCarloChart } from './components/MonteCarloChart';
import { NetWorthChart } from './components/NetWorthChart';
import { PayoffTimeline } from './components/PayoffTimeline';
import { PropertyInsights } from './components/PropertyInsights';
import { PropertyTable } from './components/PropertyTable';
import { ScenarioControls } from './components/ScenarioControls';
import { StrategyComparison } from './components/StrategyComparison';
import { TaxPlanner } from './components/TaxPlanner';
import { WealthCompositionChart } from './components/WealthCompositionChart';
import {
  compareStrategies,
  computePropertyInsights,
  runSimulation,
  SCENARIO_PRESETS,
  snapshotAtMonth,
  type StrategyId,
} from './lib/snowball';
import type { ScenarioConfig } from './lib/types';
import { usePortfolio } from './lib/usePortfolio';

function App() {
  const {
    portfolio,
    loading,
    error,
    source,
    setBudget,
    updatePortfolioSetting,
    updateTaxProfile,
    updateAcquisitionTemplate,
    updateGoals,
    updateProperty,
    updateExpenseBreakdown,
    addProperty,
    removeProperty,
    resetFromFile,
    exportJson,
  } = usePortfolio();

  const [activeStrategy, setActiveStrategy] = useState<StrategyId>('highestRate');
  const [scenario, setScenario] = useState<ScenarioConfig>(SCENARIO_PRESETS[0]);
  const [equityHorizon, setEquityHorizon] = useState(120);

  const budgetMax = useMemo(() => {
    if (!portfolio) return 20000;
    const piSum = portfolio.properties.reduce((s, p) => s + p.monthlyPayment, 0);
    return Math.max(20000, Math.round(piSum * 2));
  }, [portfolio]);

  const { comparisons, activeResult, baselineResult, baseCaseResult, propertyInsights, scenarioDelta } =
    useMemo(() => {
      if (!portfolio) {
        return {
          comparisons: [],
          activeResult: null,
          baselineResult: null,
          baseCaseResult: null,
          propertyInsights: [],
          scenarioDelta: null,
        };
      }

      const comparisons = compareStrategies(portfolio.properties, {
        extraMonthlyBudget: portfolio.extraMonthlyBudget,
        includeBaseline: true,
        simulationOptions: {
          annualRentGrowthRate: portfolio.annualRentGrowthRate,
          annualExpenseInflationRate: portfolio.annualExpenseInflationRate,
          reinvestSurplus: portfolio.reinvestSurplus,
          monthlyReserveTarget: portfolio.monthlyReserveTarget,
          defaultVacancyRate: portfolio.defaultVacancyRate,
          defaultCapexReserveRate: portfolio.defaultCapexReserveRate,
          defaultCapexReserveFlat: portfolio.defaultCapexReserveFlat,
        },
      });

      const baseCaseResult = runSimulation(portfolio, activeStrategy, SCENARIO_PRESETS[0]);
      const activeResult = runSimulation(portfolio, activeStrategy, scenario);
      const baselineResult = runSimulation(portfolio, 'baseline', scenario);

      const propertyInsights = computePropertyInsights(
        portfolio,
        activeResult.order,
        scenario,
      );

      let scenarioDelta: { monthsDelta: number; equityDelta: number } | null = null;
      if (scenario.id !== 'base') {
        const baseAt180 = snapshotAtMonth(baseCaseResult, 180);
        const scenarioAt180 = snapshotAtMonth(activeResult, 180);
        scenarioDelta = {
          monthsDelta: activeResult.monthsToPayoff - baseCaseResult.monthsToPayoff,
          equityDelta:
            (scenarioAt180?.totalEquity ?? 0) - (baseAt180?.totalEquity ?? 0),
        };
      }

      return {
        comparisons,
        activeResult,
        baselineResult,
        baseCaseResult,
        propertyInsights,
        scenarioDelta,
      };
    }, [portfolio, activeStrategy, scenario]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Loading portfolio…
      </div>
    );
  }

  if (error || !portfolio || !activeResult || !baselineResult || !baseCaseResult) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-red-400">
        {error ?? 'Failed to load portfolio'}
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-4 p-3 sm:p-6">
      <Header
        source={source}
        onReset={() => void resetFromFile()}
        onExport={exportJson}
      />

      <Controls
        budget={portfolio.extraMonthlyBudget}
        budgetMax={budgetMax}
        strategy={activeStrategy}
        annualRentGrowthRate={portfolio.annualRentGrowthRate}
        annualExpenseInflationRate={portfolio.annualExpenseInflationRate}
        reinvestSurplus={portfolio.reinvestSurplus}
        monthlyReserveTarget={portfolio.monthlyReserveTarget}
        defaultVacancyRate={portfolio.defaultVacancyRate}
        defaultCapexReserveRate={portfolio.defaultCapexReserveRate}
        onBudgetChange={setBudget}
        onStrategyChange={setActiveStrategy}
        onPortfolioSettingChange={updatePortfolioSetting}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ScenarioControls
            portfolio={portfolio}
            scenarioId={scenario.id}
            onScenarioChange={setScenario}
          />
        </div>
        <div className="glass-card flex items-center gap-3 p-4">
          <label htmlFor="equity-horizon" className="text-sm text-slate-300">
            Equity KPI horizon
          </label>
          <select
            id="equity-horizon"
            value={equityHorizon}
            onChange={(e) => setEquityHorizon(Number(e.target.value))}
            className="flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 text-sm text-slate-100"
          >
            <option value={60}>5 years</option>
            <option value={120}>10 years</option>
            <option value={180}>15 years</option>
          </select>
        </div>
      </div>

      <KpiCards
        active={activeResult}
        baseline={baselineResult}
        portfolio={portfolio}
        equityHorizon={equityHorizon}
      />

      <TaxPlanner
        portfolio={portfolio}
        strategyId={activeStrategy}
        onTaxProfileChange={updateTaxProfile}
        onAcquisitionTemplateChange={updateAcquisitionTemplate}
      />

      <NetWorthChart
        result={activeResult}
        baseline={scenario.id !== 'base' ? baseCaseResult : null}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <WealthCompositionChart result={activeResult} />
        <IncomeVsExpenseChart result={activeResult} />
      </div>

      <MonteCarloChart portfolio={portfolio} strategyId={activeStrategy} />

      <GoalTracker
        portfolio={portfolio}
        active={activeResult}
        baseline={baselineResult}
        strategyId={activeStrategy}
        scenarioDelta={scenarioDelta}
        onGoalsChange={updateGoals}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <StrategyComparison
          results={comparisons}
          activeStrategy={activeStrategy}
          onSelect={setActiveStrategy}
        />
        <PayoffTimeline result={activeResult} />
      </div>

      <BalanceChart result={activeResult} properties={portfolio.properties} />

      <div className="grid gap-4 lg:grid-cols-2">
        <InterestChart active={activeResult} baseline={baselineResult} />
        <CashflowChart result={activeResult} />
      </div>

      <PropertyInsights insights={propertyInsights} result={activeResult} />

      <PropertyTable
        portfolio={portfolio}
        onUpdate={updateProperty}
        onExpenseBreakdownChange={updateExpenseBreakdown}
        onAdd={addProperty}
        onRemove={removeProperty}
      />
    </div>
  );
}

export default App;
