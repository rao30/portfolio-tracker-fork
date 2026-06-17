import { useMemo, useState, useEffect } from 'react';
import { BalanceChart } from './components/BalanceChart';
import { CashflowChart } from './components/CashflowChart';
import { Controls } from './components/Controls';
import { GoalTracker } from './components/GoalTracker';
import { Header } from './components/Header';
import { IncomeVsExpenseChart } from './components/IncomeVsExpenseChart';
import { InterestChart } from './components/InterestChart';
import { MonteCarloChart } from './components/MonteCarloChart';
import { MobileNav, type MobileTab } from './components/MobileNav';
import { NetWorthChart } from './components/NetWorthChart';
import { PayoffTimeline } from './components/PayoffTimeline';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import { PropertyInsights } from './components/PropertyInsights';
import { PropertyTable } from './components/PropertyTable';
import { ScheduleOfRealEstateModal } from './components/ScheduleOfRealEstateModal';
import { ScenarioControls } from './components/ScenarioControls';
import { StrategyLab } from './components/StrategyLab';
import { PayoffPlaybook } from './components/PayoffPlaybook';
import { TimelineStudio } from './components/TimelineStudio';
import { StrategyComparison } from './components/StrategyComparison';
import { DecisionPulse } from './components/DecisionPulse';
import { PayoffLandscape } from './components/PayoffLandscape';
import { TaxPlanner } from './components/TaxPlanner';
import { WealthCompositionChart } from './components/WealthCompositionChart';
import { ChartVariantContext } from './components/chart-theme';
import {
  compareStrategies,
  computePropertyInsightsAtMonth,
  monthForPortfolioYear,
  runSimulation,
  runSimulationWithPayoffOrder,
  SCENARIO_PRESETS,
  snapshotAtMonth,
  type StrategyId,
} from './lib/snowball';
import type { ScenarioConfig } from './lib/types';
import { useIsMobile } from './lib/useMediaQuery';
import { usePortfolio } from './lib/usePortfolio';
import { useStrategyLab } from './lib/useStrategyLab';
import { usePayoffPlaybook } from './lib/usePayoffPlaybook';
import { useDecisionPulse } from './lib/useDecisionPulse';
import { usePayoffLandscape } from './lib/usePayoffLandscape';
import { useAuth } from './context/AuthContext';

function DashboardApp() {
  const {
    portfolio,
    loading,
    error,
    source,
    syncStatus,
    cloudEnabled,
    isDirty,
    saving,
    save,
    discardChanges,
    setBudget,
    updatePortfolioSetting,
    updateTaxProfile,
    updateAcquisitionTemplate,
    updateGoals,
    updateProperty,
    updateAcquisitionDate,
    updateExpenseBreakdown,
    addProperty,
    removeProperty,
    resetFromFile,
    exportJson,
    refreshMarketValues,
    applyTimelineEvents,
    clearTimelineEvents,
  } = usePortfolio();
  const { user, signOut } = useAuth();
  const strategyLab = useStrategyLab();
  const payoffPlaybookHook = usePayoffPlaybook();
  const decisionPulseHook = useDecisionPulse();
  const payoffLandscapeHook = usePayoffLandscape();

  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>('overview');
  const [activeStrategy, setActiveStrategy] = useState<StrategyId>('highestRate');
  const [playbookOrder, setPlaybookOrder] = useState<string[] | null>(null);
  const [scenario, setScenario] = useState<ScenarioConfig>(SCENARIO_PRESETS[0]);
  const [portfolioYear, setPortfolioYear] = useState(1);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [marketValuesRefreshing, setMarketValuesRefreshing] = useState(false);

  useEffect(() => {
    if (payoffPlaybookHook.loading) return;
    const saved = payoffPlaybookHook.playbook;
    if (saved?.isActive && saved.propertyOrder.length > 0) {
      setPlaybookOrder(saved.propertyOrder);
    }
  }, [payoffPlaybookHook.loading, payoffPlaybookHook.playbook]);

  const handleSave = () => {
    void (async () => {
      const ok = await save();
      if (!ok && cloudEnabled) {
        window.alert('Could not save your portfolio. Try again or export a backup.');
      }
    })();
  };

  const handleRefreshMarketValues = () => {
    void (async () => {
      setMarketValuesRefreshing(true);
      const result = await refreshMarketValues();
      setMarketValuesRefreshing(false);
      if (!result.ok) {
        window.alert(result.message);
      }
    })();
  };

  const budgetMax = useMemo(() => {
    if (!portfolio) return 20000;
    const piSum = portfolio.properties.reduce((s, p) => s + p.monthlyPayment, 0);
    return Math.max(20000, Math.round(piSum * 2));
  }, [portfolio]);

  const {
    comparisons,
    activeResult,
    baselineResult,
    baseCaseResult,
    propertyInsights,
    scenarioDelta,
    insightMonth,
  } =
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
      const activeResult = playbookOrder
        ? runSimulationWithPayoffOrder(portfolio, playbookOrder, scenario)
        : runSimulation(portfolio, activeStrategy, scenario);
      const baselineResult = runSimulation(portfolio, 'baseline', scenario);

      const insightMonth = monthForPortfolioYear(portfolioYear);
      const propertyInsights = computePropertyInsightsAtMonth(
        portfolio,
        activeResult,
        insightMonth,
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
        insightMonth,
      };
    }, [portfolio, activeStrategy, scenario, portfolioYear, playbookOrder]);

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

  const controlProps = {
    budget: portfolio.extraMonthlyBudget,
    budgetMax,
    strategy: activeStrategy,
    annualRentGrowthRate: portfolio.annualRentGrowthRate,
    annualExpenseInflationRate: portfolio.annualExpenseInflationRate,
    reinvestSurplus: portfolio.reinvestSurplus,
    monthlyReserveTarget: portfolio.monthlyReserveTarget,
    defaultVacancyRate: portfolio.defaultVacancyRate,
    defaultCapexReserveRate: portfolio.defaultCapexReserveRate,
    onBudgetChange: setBudget,
    onStrategyChange: setActiveStrategy,
    onPortfolioSettingChange: updatePortfolioSetting,
  };

  const goalProps = {
    portfolio,
    active: activeResult,
    baseline: baselineResult,
    strategyId: activeStrategy,
    scenarioDelta,
    onGoalsChange: updateGoals,
  };

  const playbookProps = {
    portfolio,
    activeStrategy,
    scenario,
    playbookHook: payoffPlaybookHook,
    playbookActive: playbookOrder != null,
    onApply: (order: string[]) => setPlaybookOrder(order),
    onDeactivate: () => {
      setPlaybookOrder(null);
      void payoffPlaybookHook.savePlaybook({
        propertyOrder: payoffPlaybookHook.playbook?.propertyOrder ?? [],
        baseStrategy: payoffPlaybookHook.playbook?.baseStrategy ?? null,
        isActive: false,
      });
    },
  };

  const decisionPulseProps = {
    portfolio,
    activeStrategy,
    activeResult,
    comparisons,
    customOrder: playbookOrder,
    budgetMax,
    pulseHook: decisionPulseHook,
    onBudgetChange: setBudget,
    onStrategyChange: setActiveStrategy,
  };

  const payoffLandscapeProps = {
    portfolio,
    activeStrategy,
    budgetMax,
    landscapeHook: payoffLandscapeHook,
    onApply: (strategy: StrategyId, budget: number) => {
      setActiveStrategy(strategy);
      setBudget(budget);
    },
  };

  if (isMobile) {
    return (
      <div className="mx-auto min-h-screen max-w-7xl space-y-3 p-3 pb-24">
        {mobileTab === 'overview' && (
          <div className="space-y-3">
            <Header
              source={source}
              syncStatus={syncStatus}
              cloudEnabled={cloudEnabled}
              isDirty={isDirty}
              saving={saving}
              onSave={handleSave}
              onDiscard={discardChanges}
              onReset={() => void resetFromFile()}
              onExport={exportJson}
              onScheduleOfRealEstate={() => setScheduleOpen(true)}
              onRefreshMarketValues={handleRefreshMarketValues}
              marketValuesRefreshing={marketValuesRefreshing}
              onSignOut={() => void signOut()}
              userEmail={user?.email}
              compact
            />
            <DecisionPulse {...decisionPulseProps} embedded />
            <PayoffLandscape {...payoffLandscapeProps} embedded />
            <div className="app-surface space-y-4 p-4">
              <Controls {...controlProps} mode="primary" embedded />
              <div className="border-t border-white/10 pt-4">
                <ScenarioControls
                  portfolio={portfolio}
                  scenarioId={scenario.id}
                  onScenarioChange={setScenario}
                  embedded
                />
              </div>
              <div className="border-t border-white/10 pt-4">
                <TimelineStudio
                  portfolio={portfolio}
                  strategyId={activeStrategy}
                  monthsToPayoff={activeResult.monthsToPayoff}
                  cloudEnabled={cloudEnabled}
                  userId={user?.id}
                  onApplyEvents={applyTimelineEvents}
                  onClearEvents={clearTimelineEvents}
                  embedded
                />
              </div>
            </div>
            <PortfolioDashboard
              portfolio={portfolio}
              result={activeResult}
              year={portfolioYear}
              onYearChange={setPortfolioYear}
              compact
            />
            <PayoffPlaybook {...playbookProps} embedded />
            <StrategyLab
              portfolio={portfolio}
              activeBudget={portfolio.extraMonthlyBudget}
              activeStrategy={activeStrategy}
              activeScenario={scenario}
              activeScenarioId={scenario.id}
              lab={strategyLab}
              onApply={({ budget, strategy, scenario: nextScenario }) => {
                setBudget(budget);
                setActiveStrategy(strategy);
                setScenario(nextScenario);
              }}
              embedded
            />
            <div className="app-surface overflow-hidden">
              <ChartVariantContext.Provider value="flat">
                <NetWorthChart
                  result={activeResult}
                  baseline={scenario.id !== 'base' ? baseCaseResult : null}
                />
                <StrategyComparison
                  results={comparisons}
                  activeStrategy={activeStrategy}
                  onSelect={setActiveStrategy}
                />
              </ChartVariantContext.Provider>
            </div>
            <GoalTracker {...goalProps} section="insights" />
          </div>
        )}

        {mobileTab === 'charts' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Charts</h2>
            <div className="app-surface overflow-hidden">
              <ChartVariantContext.Provider value="flat">
                <WealthCompositionChart result={activeResult} />
                <IncomeVsExpenseChart result={activeResult} />
                <PayoffTimeline result={activeResult} />
                <BalanceChart
                  result={activeResult}
                  properties={portfolio.properties}
                />
                <InterestChart active={activeResult} baseline={baselineResult} />
                <CashflowChart result={activeResult} />
              </ChartVariantContext.Provider>
            </div>
          </div>
        )}

        {mobileTab === 'portfolio' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Portfolio</h2>
            <PropertyTable
              portfolio={portfolio}
              onUpdate={updateProperty}
              onUpdateAcquisitionDate={updateAcquisitionDate}
              onAdd={addProperty}
              onRemove={removeProperty}
              mobileCards
              asOfMonth={insightMonth}
              isDirty={isDirty}
              saving={saving}
              onSave={handleSave}
              onDiscard={discardChanges}
            />
            <PropertyInsights
              insights={propertyInsights}
              result={activeResult}
              stacked
              yearLabel={
                portfolioYear === 1
                  ? `${portfolio.simulationAnchorYear ?? 2026} (now)`
                  : String((portfolio.simulationAnchorYear ?? 2026) + portfolioYear - 1)
              }
              ownedCount={propertyInsights.length}
            />
          </div>
        )}

        {mobileTab === 'settings' && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Settings</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void resetFromFile()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
              >
                Reset data
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
              >
                Schedule of Real Estate
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white"
              >
                Export
              </button>
            </div>
            <Controls {...controlProps} mode="advanced" />
            <GoalTracker {...goalProps} section="goals" />
            <GoalTracker {...goalProps} section="milestones" />
          </div>
        )}

        <MobileNav active={mobileTab} onChange={setMobileTab} />

        <ScheduleOfRealEstateModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          portfolio={portfolio}
          result={activeResult}
          scenario={scenario}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-4 p-3 sm:p-6">
      <Header
        source={source}
        syncStatus={syncStatus}
        cloudEnabled={cloudEnabled}
        isDirty={isDirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={discardChanges}
        onReset={() => void resetFromFile()}
        onExport={exportJson}
        onScheduleOfRealEstate={() => setScheduleOpen(true)}
        onRefreshMarketValues={handleRefreshMarketValues}
        marketValuesRefreshing={marketValuesRefreshing}
        onSignOut={() => void signOut()}
        userEmail={user?.email}
      />

      <ScheduleOfRealEstateModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        portfolio={portfolio}
        result={activeResult}
        scenario={scenario}
      />

      <DecisionPulse {...decisionPulseProps} />

      <PayoffLandscape {...payoffLandscapeProps} />

      <Controls {...controlProps} />

      <PayoffPlaybook {...playbookProps} />

      <PortfolioDashboard
        portfolio={portfolio}
        result={activeResult}
        year={portfolioYear}
        onYearChange={setPortfolioYear}
      />

      <ScenarioControls
        portfolio={portfolio}
        scenarioId={scenario.id}
        onScenarioChange={setScenario}
      />

      <TimelineStudio
        portfolio={portfolio}
        strategyId={activeStrategy}
        monthsToPayoff={activeResult.monthsToPayoff}
        cloudEnabled={cloudEnabled}
        userId={user?.id}
        onApplyEvents={applyTimelineEvents}
        onClearEvents={clearTimelineEvents}
      />

      <StrategyLab
        portfolio={portfolio}
        activeBudget={portfolio.extraMonthlyBudget}
        activeStrategy={activeStrategy}
        activeScenario={scenario}
        activeScenarioId={scenario.id}
        lab={strategyLab}
        onApply={({ budget, strategy, scenario: nextScenario }) => {
          setBudget(budget);
          setActiveStrategy(strategy);
          setScenario(nextScenario);
        }}
      />

      <TaxPlanner
        portfolio={portfolio}
        onTaxProfileChange={updateTaxProfile}
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

      <GoalTracker {...goalProps} />

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

      <PropertyInsights
        insights={propertyInsights}
        result={activeResult}
        yearLabel={
          portfolioYear === 1
            ? `${portfolio.simulationAnchorYear ?? 2026} (now)`
            : String((portfolio.simulationAnchorYear ?? 2026) + portfolioYear - 1)
        }
        ownedCount={propertyInsights.length}
      />

      <PropertyTable
        portfolio={portfolio}
        onUpdate={updateProperty}
        onUpdateAcquisitionDate={updateAcquisitionDate}
        onExpenseBreakdownChange={updateExpenseBreakdown}
        onAdd={addProperty}
        onRemove={removeProperty}
        asOfMonth={insightMonth}
        isDirty={isDirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={discardChanges}
      />
    </div>
  );
}

export default DashboardApp;
