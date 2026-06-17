import { describe, expect, it } from 'vitest';
import { validateFieldInput } from './propertyFieldValidation';

describe('validateFieldInput', () => {
  it('rejects empty property names', () => {
    const result = validateFieldInput('name', '   ');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it('accepts valid acquisition dates', () => {
    const result = validateFieldInput('acquisitionDate', '2024-6');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('2024-6');
  });

  it('rejects invalid acquisition dates', () => {
    const result = validateFieldInput('acquisitionDate', '06/2024');
    expect(result.ok).toBe(false);
  });

  it('rejects negative currency amounts', () => {
    const result = validateFieldInput('balance', '-100');
    expect(result.ok).toBe(false);
  });

  it('accepts percent decimals', () => {
    const result = validateFieldInput('annualInterestRate', '6.5%');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('0.065');
  });
});
