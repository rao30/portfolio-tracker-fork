import { useMemo, useState } from 'react';
import { BalanceChart } from './components/BalanceChart';
import { CashflowChart } from './components/CashflowChart';
import { Controls } from './components/Controls';
import { Header } from './components/Header';
import { InterestChart } from './components/InterestChart';
import { KpiCards } from './components/KpiCards';
import { PayoffTimeline } from './components/PayoffTimeline';
import { PropertyTable } from './components/PropertyTable';
import { StrategyComparison } from './components/StrategyComparison';
import {
  compareStrategies,
  simulateSnowball,
  STRATEGIES,
  type StrategyId,
} from './lib/snowball';
import { usePortfolio } from './lib/usePortfolio';

function App() {
  const {
    portfolio,
    loading,
    error,
    source,
    setBudget,
    updateProperty,
    addProperty,
    removeProperty,
    resetFromFile,
    exportJson,
  } = usePortfolio();

  const [activeStrategy, setActiveStrategy] = useState<StrategyId>('highestRate');

  const budgetMax = useMemo(() => {
    if (!portfolio) return 20000;
    const piSum = portfolio.properties.reduce((s, p) => s + p.monthlyPayment, 0);
    return Math.max(20000, Math.round(piSum * 2));
  }, [portfolio]);

  const { comparisons, activeResult, baselineResult } = useMemo(() => {
    if (!portfolio) {
      return {
        comparisons: [],
        activeResult: null,
        baselineResult: null,
      };
    }

    const comparisons = compareStrategies(portfolio.properties, {
      extraMonthlyBudget: portfolio.extraMonthlyBudget,
      includeBaseline: true,
    });

    const baseline =
      comparisons.find((r) => r.strategy === 'baseline') ??
      simulateSnowball(portfolio.properties, {
        payoffOrder: portfolio.properties.map((p) => p.name),
        extraMonthlyBudget: 0,
        snowballCashflow: false,
        strategyName: 'baseline',
      });

    const active =
      comparisons.find((r) => r.strategy === activeStrategy) ??
      simulateSnowball(portfolio.properties, {
        payoffOrder: STRATEGIES[activeStrategy](portfolio.properties),
        extraMonthlyBudget: portfolio.extraMonthlyBudget,
        strategyName: activeStrategy,
      });

    return {
      comparisons,
      activeResult: active,
      baselineResult: baseline,
    };
  }, [portfolio, activeStrategy]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Loading portfolio…
      </div>
    );
  }

  if (error || !portfolio || !activeResult || !baselineResult) {
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
        onBudgetChange={setBudget}
        onStrategyChange={setActiveStrategy}
      />

      <KpiCards active={activeResult} baseline={baselineResult} />

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

      <PropertyTable
        properties={portfolio.properties}
        onUpdate={updateProperty}
        onAdd={addProperty}
        onRemove={removeProperty}
      />
    </div>
  );
}

export default App;
