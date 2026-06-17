import { fetchRentCastValueEstimate, getRentCastApiKey } from './rentcast.js';

/**
 * Refresh market_value for portfolio properties that have an address field.
 * @param {Record<string, unknown>} portfolio Raw portfolio JSON (snake_case)
 * @param {{ apiKey?: string; dryRun?: boolean }} options
 */
export async function refreshPortfolioMarketValues(portfolio, options = {}) {
  const apiKey = options.apiKey ?? getRentCastApiKey();
  if (!apiKey) {
    throw new Error(
      'RENTCAST_API_KEY is not configured. Sign up at https://www.rentcast.io/api',
    );
  }

  if (!portfolio || !Array.isArray(portfolio.properties)) {
    throw new Error('Invalid portfolio: expected properties array');
  }

  const updatedAt = new Date().toISOString().slice(0, 10);
  const results = [];
  const errors = [];

  for (const prop of portfolio.properties) {
    const address = typeof prop.address === 'string' ? prop.address.trim() : '';
    if (!address) continue;

    try {
      const estimate = await fetchRentCastValueEstimate(address, apiKey);
      const previous = typeof prop.market_value === 'number' ? prop.market_value : null;

      if (!options.dryRun) {
        prop.market_value = estimate.value;
        prop.market_value_source = estimate.source;
        prop.market_value_updated_at = updatedAt;
      }

      results.push({
        name: prop.name,
        address: estimate.formattedAddress,
        previous,
        value: estimate.value,
        valueLow: estimate.valueLow,
        valueHigh: estimate.valueHigh,
        source: estimate.source,
        updatedAt,
      });
    } catch (err) {
      errors.push({
        name: prop.name,
        address,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { results, errors, updatedAt, dryRun: options.dryRun ?? false };
}
