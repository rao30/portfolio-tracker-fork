import type { ScenarioConfig } from './types';
import type { StrategyId } from './snowball';

export const STRATEGY_LAB_SLOTS = 9;
export const STRATEGY_LAB_STORAGE_KEY = 'rental-snowball-strategy-lab';

export interface StrategyLabPin {
  slot: number;
  label: string;
  scenario: ScenarioConfig;
  strategy: StrategyId;
  extraBudget: number;
  pinnedAt: string;
}

export interface StrategyLabState {
  pins: StrategyLabPin[];
  activeSlot: number | null;
}

export function emptyStrategyLabState(): StrategyLabState {
  return { pins: [], activeSlot: null };
}

function isValidScenario(value: unknown): value is ScenarioConfig {
  if (!value || typeof value !== 'object') return false;
  const s = value as ScenarioConfig;
  return typeof s.id === 'string' && typeof s.label === 'string';
}

export function normalizeStrategyLabState(raw: unknown): StrategyLabState {
  if (!raw || typeof raw !== 'object') return emptyStrategyLabState();
  const { pins, activeSlot } = raw as StrategyLabState;
  const normalizedPins = Array.isArray(pins)
    ? pins
        .filter(
          (p): p is StrategyLabPin =>
            Boolean(p) &&
            typeof p.slot === 'number' &&
            p.slot >= 1 &&
            p.slot <= STRATEGY_LAB_SLOTS &&
            typeof p.label === 'string' &&
            isValidScenario(p.scenario) &&
            typeof p.strategy === 'string' &&
            typeof p.extraBudget === 'number' &&
            p.extraBudget >= 0,
        )
        .sort((a, b) => a.slot - b.slot)
    : [];
  const active =
    typeof activeSlot === 'number' &&
    normalizedPins.some((p) => p.slot === activeSlot)
      ? activeSlot
      : normalizedPins[0]?.slot ?? null;
  return { pins: normalizedPins, activeSlot: active };
}

export function readLocalStrategyLab(): StrategyLabState {
  try {
    const raw = localStorage.getItem(STRATEGY_LAB_STORAGE_KEY);
    if (!raw) return emptyStrategyLabState();
    return normalizeStrategyLabState(JSON.parse(raw));
  } catch {
    return emptyStrategyLabState();
  }
}

export function writeLocalStrategyLab(state: StrategyLabState) {
  localStorage.setItem(STRATEGY_LAB_STORAGE_KEY, JSON.stringify(state));
}

export function pinToSlot(
  state: StrategyLabState,
  slot: number,
  pin: Omit<StrategyLabPin, 'slot' | 'pinnedAt'> & { pinnedAt?: string },
): StrategyLabState {
  const nextPin: StrategyLabPin = {
    slot,
    label: pin.label,
    scenario: pin.scenario,
    strategy: pin.strategy,
    extraBudget: pin.extraBudget,
    pinnedAt: pin.pinnedAt ?? new Date().toISOString(),
  };
  const pins = [...state.pins.filter((p) => p.slot !== slot), nextPin].sort(
    (a, b) => a.slot - b.slot,
  );
  return { pins, activeSlot: slot };
}

export function clearSlot(state: StrategyLabState, slot: number): StrategyLabState {
  const pins = state.pins.filter((p) => p.slot !== slot);
  const activeSlot =
    state.activeSlot === slot ? (pins[0]?.slot ?? null) : state.activeSlot;
  return { pins, activeSlot };
}

export function nextEmptySlot(state: StrategyLabState): number {
  for (let slot = 1; slot <= STRATEGY_LAB_SLOTS; slot += 1) {
    if (!state.pins.some((p) => p.slot === slot)) return slot;
  }
  return state.activeSlot ?? 1;
}
