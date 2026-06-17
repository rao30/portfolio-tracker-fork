import type { Property } from './types';
import {
  editPercentValue,
  parseCurrencyInput,
  parsePercentInput,
} from './format';

type EditableField = keyof Property;

const PERCENT_FIELDS = new Set<EditableField>([
  'annualInterestRate',
  'annualAppreciationRate',
  'annualRentGrowthRate',
  'annualExpenseInflationRate',
  'vacancyRate',
  'capexReserveRate',
  'landPercent',
  'costSegPercent',
]);

const CURRENCY_FIELDS = new Set<EditableField>([
  'balance',
  'marketValue',
  'monthlyPayment',
  'monthlyRent',
  'monthlyExpenses',
  'monthlyUtilities',
  'purchasePrice',
  'cashInvested',
]);

export interface FieldValidationResult {
  ok: boolean;
  value?: string;
  error?: string;
}

export function validateFieldInput(
  field: EditableField,
  raw: string,
): FieldValidationResult {
  if (field === 'name') {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: 'Property name is required' };
    if (trimmed.length > 120) return { ok: false, error: 'Name must be 120 characters or less' };
    return { ok: true, value: trimmed };
  }

  if (field === 'acquisitionDate') {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true, value: '' };
    if (!/^\d{4}-\d{1,2}$/.test(trimmed)) {
      return { ok: false, error: 'Use YYYY-M format (e.g. 2024-6)' };
    }
    const [year, month] = trimmed.split('-').map(Number);
    if (month < 1 || month > 12) return { ok: false, error: 'Month must be 1–12' };
    if (year < 1900 || year > 2100) return { ok: false, error: 'Year must be 1900–2100' };
    return { ok: true, value: trimmed };
  }

  if (PERCENT_FIELDS.has(field)) {
    const n = parsePercentInput(raw);
    if (n == null) return { ok: false, error: 'Enter a valid percentage' };
    if (n < 0 || n > 1) return { ok: false, error: 'Rate must be between 0% and 100%' };
    return { ok: true, value: String(n) };
  }

  if (CURRENCY_FIELDS.has(field)) {
    const n = parseCurrencyInput(raw);
    if (n == null) return { ok: false, error: 'Enter a valid dollar amount' };
    if (n < 0) return { ok: false, error: 'Amount cannot be negative' };
    if (n > 100_000_000) return { ok: false, error: 'Amount exceeds maximum' };
    return { ok: true, value: String(n) };
  }

  if (field === 'remainingTermMonths') {
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
    if (Number.isNaN(n)) return { ok: false, error: 'Enter whole months' };
    if (n < 0 || n > 600) return { ok: false, error: 'Term must be 0–600 months' };
    return { ok: true, value: String(n) };
  }

  const n = parseFloat(raw);
  if (Number.isNaN(n)) return { ok: false, error: 'Enter a valid number' };
  return { ok: true, value: String(n) };
}

export function rawFieldValue(p: Property, field: EditableField): string {
  if (field === 'name') return p.name;
  const val = p[field];
  if (val === undefined) return '';
  if (PERCENT_FIELDS.has(field)) return editPercentValue(val as number);
  if (CURRENCY_FIELDS.has(field)) return String(Math.round(val as number));
  return String(val);
}
