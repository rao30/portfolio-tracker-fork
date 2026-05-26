import { describe, expect, it } from 'vitest';
import {
  extractPortfolioToken,
  getPortfolioApiKey,
  isPortfolioApiAuthorized,
} from './auth.js';

describe('portfolio API auth', () => {
  it('allows requests when no key is configured', () => {
    const prev = process.env.PORTFOLIO_API_KEY;
    const prevWrite = process.env.PORTFOLIO_WRITE_KEY;
    delete process.env.PORTFOLIO_API_KEY;
    delete process.env.PORTFOLIO_WRITE_KEY;
    expect(getPortfolioApiKey()).toBeNull();
    expect(isPortfolioApiAuthorized({ headers: {} })).toBe(true);
    process.env.PORTFOLIO_API_KEY = prev;
    process.env.PORTFOLIO_WRITE_KEY = prevWrite;
  });

  it('reads bearer and x-portfolio-key headers', () => {
    expect(
      extractPortfolioToken({
        headers: { authorization: 'Bearer secret-token' },
      }),
    ).toBe('secret-token');
    expect(
      extractPortfolioToken({
        headers: { 'x-portfolio-key': 'header-token' },
      }),
    ).toBe('header-token');
  });

  it('rejects wrong token when key is set', () => {
    process.env.PORTFOLIO_API_KEY = 'expected';
    expect(isPortfolioApiAuthorized({ headers: {} })).toBe(false);
    expect(
      isPortfolioApiAuthorized({
        headers: { authorization: 'Bearer expected' },
      }),
    ).toBe(true);
    delete process.env.PORTFOLIO_API_KEY;
  });
});
