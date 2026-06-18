import { useMemo, useState, useEffect, useCallback } from 'react';
import { BalanceChart } from './components/BalanceChart';
import { CashflowChart } from './components/CashflowChart';
import { ChartNavigator } from './components/ChartNavigator';
import { Controls } from './components/Controls';
import { DashboardNav, SectionHeader } from './components/DashboardNav';
import { GoalTracker } from './components/GoalTracker';
import { Header } from './components/Header';
import { IncomeVsExpenseChart } from './components/IncomeVsExpenseChart';
import { InterestChart } from './components/InterestChart';
import { MonteCarloChart } from './components/MonteCarloChart';
import { NetWorthChart } from './components/NetWorthChart';
import { PayoffTimeline } from './components/PayoffTimeline';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import { PropertyInsights } from './components/PropertyInsights';
import { PropertyDeck } from './components/PropertyDeck';
import { ScheduleOfRealEstateModal } from './components/ScheduleOfRealEstateModal';
import { StressLab } from './components/StressLab';
import { StrategyLab } from './components/StrategyLab';
import { PayoffPlaybook } from './components/PayoffPlaybook';
import { TimelineStudio } from './components/TimelineStudio';
import { StrategyComparison } from './components/StrategyComparison';
import { DecisionPulse } from './components/DecisionPulse';
import { BalloonSafety } from './components/BalloonSafety';
import { PayoffLandscape } from './components/PayoffLandscape';
import { PrincipalVelocity } from './components/PrincipalVelocity';
import { CapitalDeploy } from './components/CapitalDeploy';
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
import {
  chartsForViewport,
  DESKTOP_SECTIONS,
  type DashboardSection,
  type MobileTab,
} from './lib/dashboard-sections';
import { useIsMobile } from './lib/useMediaQuery';
import { usePortfolio } from './lib/usePortfolio';
import { useStrategyLab } from './lib/useStrategyLab';
import { usePayoffPlaybook } from './lib/usePayoffPlaybook';
import { useDecisionPulse } from './lib/useDecisionPulse';
import { useBalloonSafety } from './lib/useBalloonSafety';
import { usePayoffLandscape } from './lib/usePayoffLandscape';
import { usePropertyDeck } from './lib/usePropertyDeck';
import { usePropertyIntake } from './lib/usePropertyIntake';
import { useGoalCommand } from './lib/useGoalCommand';
import { useStressLab } from './lib/useStressLab';
import { usePrincipalVelocity } from './lib/usePrincipalVelocity';
import { useCapitalDeploy } from './lib/useCapitalDeploy';
import { useTimelinePreferences } from './lib/useTimelinePreferences';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';

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
    updatePropertyFinancing,
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
  const balloonSafetyHook = useBalloonSafety();
  const payoffLandscapeHook = usePayoffLandscape();
  const propertyDeckHook = usePropertyDeck();
  const propertyIntakeHook = usePropertyIntake();
  const goalCommandHook = useGoalCommand(portfolio, updateGoals);
  const stressLabHook = useStressLab();
  const principalVelocityHook = usePrincipalVelocity();
  const capitalDeployHook = useCapitalDeploy();
  const timelineHook = useTimelinePreferences();
  const { pushToast } = useToast();

  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>('overview');
  const [activeSection, setActiveSection] = useState<DashboardSection>('command');
  const [activeStrategy, setActiveStrategy] = useState<StrategyId>('highestRate');
  const [playbookOrder, setPlaybookOrder] = useState<string[] | null>(null);
  const [scenario, setScenario] = useState<ScenarioConfig>(SCENARIO_PRESETS[0]);
  const [portfolioYear, setPortfolioYear] = useState(1);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [marketValuesRefreshing, setMarketValuesRefreshing] = useState(false);

  const handleSectionChange = useCallback((section: DashboardSection) => {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleMobileTabChange = useCallback((tab: MobileTab) => {
    setMobileTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
      if (ok) {
        pushToast('Portfolio saved', 'success');
      } else if (cloudEnabled) {
        pushToast('Could not save your portfolio. Try again or export a backup.', 'error');
      }
    })();
  };

  const handleRefreshMarketValues = () => {
    void (async () => {
      setMarketValuesRefreshing(true);
      const result = await refreshMarketValues();
      setMarketValuesRefreshing(false);
      if (result.ok) {
        pushToast('Market values updated', 'success');
      } else {
        pushToast(result.message, 'error');
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

  const headerProps = {
    source,
    syncStatus,
    cloudEnabled,
    isDirty,
    saving,
    onSave: handleSave,
    onDiscard: discardChanges,
    onReset: () => void resetFromFile(),
    onExport: exportJson,
    onScheduleOfRealEstate: () => setScheduleOpen(true),
    onRefreshMarketValues: handleRefreshMarketValues,
    marketValuesRefreshing,
    onSignOut: () => void signOut(),
    userEmail: user?.email,
  };

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
    customOrder: playbookOrder,
    budgetMax,
    goalHook: goalCommandHook,
    scenarioDelta,
    onApplyBudget: setBudget,
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
    customOrder: playbookOrder,
    budgetMax,
    pulseHook: decisionPulseHook,
    onApplyBudget: setBudget,
    onStrategyChange: setActiveStrategy,
  };

  const payoffLandscapeProps = {
    portfolio,
    activeStrategy,
    activeBudget: portfolio.extraMonthlyBudget,
    landscapeHook: payoffLandscapeHook,
    onApply: ({ budget, strategy }: { budget: number; strategy: StrategyId }) => {
      setBudget(budget);
      setActiveStrategy(strategy);
    },
  };

  const balloonSafetyProps = {
    portfolio,
    activeStrategy,
    activeResult,
    customOrder: playbookOrder,
    safetyHook: balloonSafetyHook,
    onBudgetChange: setBudget,
    onPrioritizeInPlaybook: (order: string[]) => {
      setPlaybookOrder(order);
      void payoffPlaybookHook.savePlaybook({
        propertyOrder: order,
        baseStrategy: payoffPlaybookHook.playbook?.baseStrategy ?? activeStrategy,
        isActive: true,
      });
    },
    currentPlaybookOrder: playbookOrder ?? undefined,
  };

  const strategyLabProps = {
    portfolio,
    activeBudget: portfolio.extraMonthlyBudget,
    activeStrategy,
    activeScenario: scenario,
    activeScenarioId: scenario.id,
    customOrder: playbookOrder,
    lab: strategyLab,
    onApply: ({ budget, strategy, scenario: nextScenario }: {
      budget: number;
      strategy: StrategyId;
      scenario: ScenarioConfig;
    }) => {
      setBudget(budget);
      setActiveStrategy(strategy);
      setScenario(nextScenario);
    },
  };

  const stressLabProps = {
    portfolio,
    activeStrategy,
    committedScenario: scenario,
    customOrder: playbookOrder,
    stressHook: stressLabHook,
    onApplyScenario: setScenario,
  };

  const principalVelocityProps = {
    portfolio,
    activeStrategy,
    customOrder: playbookOrder,
    budgetMax,
    velocityHook: principalVelocityHook,
    onApplyBudget: setBudget,
  };

  const deployMax = useMemo(() => {
    if (!portfolio) return 5000;
    const surplus = portfolio.properties.reduce((sum, p) => {
      const gross = p.monthlyRent * (1 - portfolio.defaultVacancyRate);
      const capex =
        p.monthlyRent * (p.capexReserveRate ?? portfolio.defaultCapexReserveRate) +
        (p.capexReserveFlat ?? portfolio.defaultCapexReserveFlat);
      return sum + Math.max(0, gross - p.monthlyExpenses - p.monthlyPayment - capex);
    }, 0);
    return Math.max(2000, Math.round(Math.max(surplus, portfolio.extraMonthlyBudget) * 3));
  }, [portfolio]);

  const capitalDeployProps = {
    portfolio,
    activeStrategy,
    customOrder: playbookOrder,
    deployMax,
    deployHook: capitalDeployHook,
  };

  const yearLabel =
    portfolioYear === 1
      ? `${portfolio.simulationAnchorYear ?? 2026} (now)`
      : String((portfolio.simulationAnchorYear ?? 2026) + portfolioYear - 1);

  const chartPanels = chartsForViewport(isMobile).map((config) => {
    const wrap = (node: React.ReactNode) => (
      <ChartVariantContext.Provider value={isMobile ? 'flat' : 'card'}>
        {node}
      </ChartVariantContext.Provider>
    );

    switch (config.id) {
      case 'net-worth':
        return {
          ...config,
          content: wrap(
            <NetWorthChart
              result={activeResult}
              baseline={scenario.id !== 'base' ? baseCaseResult : null}
            />,
          ),
        };
      case 'wealth-composition':
        return { ...config, content: wrap(<WealthCompositionChart result={activeResult} />) };
      case 'income-expense':
        return { ...config, content: wrap(<IncomeVsExpenseChart result={activeResult} />) };
      case 'monte-carlo':
        return {
          ...config,
          content: wrap(
            <MonteCarloChart portfolio={portfolio} strategyId={activeStrategy} />,
          ),
        };
      case 'strategy-comparison':
        return {
          ...config,
          content: wrap(
            <StrategyComparison
              results={comparisons}
              activeStrategy={activeStrategy}
              onSelect={setActiveStrategy}
            />,
          ),
        };
      case 'payoff-timeline':
        return { ...config, content: wrap(<PayoffTimeline result={activeResult} />) };
      case 'balance':
        return {
          ...config,
          content: wrap(
            <BalanceChart result={activeResult} properties={portfolio.properties} />,
          ),
        };
      case 'interest':
        return {
          ...config,
          content: wrap(
            <InterestChart active={activeResult} baseline={baselineResult} />,
          ),
        };
      case 'cashflow':
        return { ...config, content: wrap(<CashflowChart result={activeResult} />) };
      default:
        return { ...config, content: null };
    }
  });

  const chartsSection = (
    <ChartNavigator charts={chartPanels} />
  );

  const scheduleModal = (
    <ScheduleOfRealEstateModal
      open={scheduleOpen}
      onClose={() => setScheduleOpen(false)}
      portfolio={portfolio}
      result={activeResult}
      scenario={scenario}
    />
  );

  const activeSectionMeta = DESKTOP_SECTIONS.find((s) => s.id === activeSection);

  if (isMobile) {
    return (
      <div className="mx-auto min-h-screen max-w-7xl p-3 pb-24">
        <div key={mobileTab} className="nav-section-enter space-y-3">
          {mobileTab === 'overview' && (
            <>
              <Header {...headerProps} compact />
              <CapitalDeploy {...capitalDeployProps} embedded />
              <DecisionPulse {...decisionPulseProps} embedded />
              <BalloonSafety {...balloonSafetyProps} embedded />
              <Controls {...controlProps} mode="advanced" embedded idPrefix="overview" />
              <PayoffLandscape {...payoffLandscapeProps} embedded />
              <div className="app-surface space-y-4 p-4">
                <Controls {...controlProps} mode="primary" embedded idPrefix="overview" />
                <StressLab {...stressLabProps} embedded />
                <div className="border-t border-white/10 pt-4">
                  <TimelineStudio
                    portfolio={portfolio}
                    strategyId={activeStrategy}
                    monthsToPayoff={activeResult.monthsToPayoff}
                    cloudEnabled={cloudEnabled}
                    userId={user?.id}
                    timelineHook={timelineHook}
                    onApplyEvents={applyTimelineEvents}
                    onClearEvents={clearTimelineEvents}
                    embedded
                  />
                </div>
              </div>
              <PrincipalVelocity {...principalVelocityProps} embedded />
              <PortfolioDashboard
                portfolio={portfolio}
                result={activeResult}
                year={portfolioYear}
                onYearChange={setPortfolioYear}
                compact
              />
              <PayoffPlaybook {...playbookProps} embedded />
              <StrategyLab {...strategyLabProps} embedded />
              <GoalTracker {...goalProps} section="insights" />
            </>
          )}

          {mobileTab === 'charts' && (
            <>
              <SectionHeader
                title="Charts"
                description="Swipe through projections — use arrows or tap a chart name."
              />
              <div className="app-surface overflow-hidden p-3">
                {chartsSection}
              </div>
            </>
          )}

          {mobileTab === 'portfolio' && (
            <>
              <SectionHeader
                title="Property Deck"
                description="Focus-mode editor with live health checks — swipe or tap to switch properties."
              />
              <PropertyDeck
                portfolio={portfolio}
                deckHook={propertyDeckHook}
                onUpdate={updateProperty}
                onUpdateAcquisitionDate={updateAcquisitionDate}
                onExpenseBreakdownChange={updateExpenseBreakdown}
                onFinancingChange={updatePropertyFinancing}
                onAdd={addProperty}
                onRemove={removeProperty}
                intakeHook={propertyIntakeHook}
                asOfMonth={insightMonth}
                isDirty={isDirty}
                saving={saving}
                onSave={handleSave}
                onDiscard={discardChanges}
                variant="mobile"
              />
              <PropertyInsights
                insights={propertyInsights}
                result={activeResult}
                stacked
                yearLabel={yearLabel}
                ownedCount={propertyInsights.length}
              />
            </>
          )}

          {mobileTab === 'settings' && (
            <>
              <SectionHeader title="Settings" description="Goals, tax, and portfolio controls." />
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
              <TaxPlanner portfolio={portfolio} onTaxProfileChange={updateTaxProfile} />
              <Controls {...controlProps} mode="advanced" idPrefix="settings" />
              <GoalTracker {...goalProps} section="goals" />
              <GoalTracker {...goalProps} section="milestones" />
            </>
          )}
        </div>

        <DashboardNav
          variant="bottom"
          activeMobileTab={mobileTab}
          onMobileTabChange={handleMobileTabChange}
        />
        {scheduleModal}
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[90rem] p-3 sm:p-6">
      <div className="mb-4">
        <Header {...headerProps} />
      </div>

      <div className="flex gap-8">
        <aside className="hidden w-56 shrink-0 lg:block">
          <DashboardNav
            variant="sidebar"
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
          />
        </aside>

        <main className="min-w-0 flex-1">
          <div key={activeSection} className="nav-section-enter space-y-4">
            {activeSectionMeta && (
              <SectionHeader
                title={activeSectionMeta.label}
                description={activeSectionMeta.description}
              />
            )}

            {activeSection === 'command' && (
              <>
                <CapitalDeploy {...capitalDeployProps} />
                <DecisionPulse {...decisionPulseProps} />
                <BalloonSafety {...balloonSafetyProps} />
                <Controls {...controlProps} mode="advanced" embedded idPrefix="command" />
                <PayoffLandscape {...payoffLandscapeProps} />
              </>
            )}

            {activeSection === 'strategy' && (
              <>
                <Controls {...controlProps} idPrefix="strategy" />
                <PayoffPlaybook {...playbookProps} />
                <StressLab {...stressLabProps} />
                <TimelineStudio
                  portfolio={portfolio}
                  strategyId={activeStrategy}
                  monthsToPayoff={activeResult.monthsToPayoff}
                  cloudEnabled={cloudEnabled}
                  userId={user?.id}
                  timelineHook={timelineHook}
                  onApplyEvents={applyTimelineEvents}
                  onClearEvents={clearTimelineEvents}
                />
                <StrategyLab {...strategyLabProps} />
              </>
            )}

            {activeSection === 'portfolio' && (
              <>
                <PrincipalVelocity {...principalVelocityProps} />
                <PortfolioDashboard
                  portfolio={portfolio}
                  result={activeResult}
                  year={portfolioYear}
                  onYearChange={setPortfolioYear}
                />
                <PropertyInsights
                  insights={propertyInsights}
                  result={activeResult}
                  yearLabel={yearLabel}
                  ownedCount={propertyInsights.length}
                />
                <GoalTracker {...goalProps} section="insights" />
              </>
            )}

            {activeSection === 'charts' && chartsSection}

            {activeSection === 'tax' && (
              <>
                <TaxPlanner portfolio={portfolio} onTaxProfileChange={updateTaxProfile} />
                <GoalTracker {...goalProps} />
              </>
            )}

            {activeSection === 'properties' && (
              <>
                <PropertyDeck
                  portfolio={portfolio}
                  deckHook={propertyDeckHook}
                  onUpdate={updateProperty}
                  onUpdateAcquisitionDate={updateAcquisitionDate}
                  onExpenseBreakdownChange={updateExpenseBreakdown}
                  onFinancingChange={updatePropertyFinancing}
                  onAdd={addProperty}
                  onRemove={removeProperty}
                  intakeHook={propertyIntakeHook}
                  asOfMonth={insightMonth}
                  isDirty={isDirty}
                  saving={saving}
                  onSave={handleSave}
                  onDiscard={discardChanges}
                />
              </>
            )}
          </div>
        </main>
      </div>

      {scheduleModal}
    </div>
  );
}

export default DashboardApp;
