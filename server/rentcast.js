/**
 * RentCast AVM — Zillow-style market value estimates (no official Zestimate API).
 * https://developers.rentcast.io/reference/property-valuation
 */

const RENTCAST_BASE = 'https://api.rentcast.io/v1';

/**
 * @param {string} address Full address: Street, City, State Zip
 * @param {string} apiKey RentCast API key
 */
export async function fetchRentCastValueEstimate(address, apiKey) {
  if (!apiKey) {
    throw new Error('RENTCAST_API_KEY is not set');
  }

  const url = new URL(`${RENTCAST_BASE}/avm/value`);
  url.searchParams.set('address', address);
  url.searchParams.set('lookupSubjectAttributes', 'true');
  url.searchParams.set('compCount', '10');

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': apiKey,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`RentCast ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text);
  const value = data.price ?? data.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`RentCast returned no price for ${address}`);
  }

  return {
    value: Math.round(value),
    valueLow:
      typeof data.priceRangeLow === 'number' ? Math.round(data.priceRangeLow) : undefined,
    valueHigh:
      typeof data.priceRangeHigh === 'number' ? Math.round(data.priceRangeHigh) : undefined,
    source: 'rentcast_avm',
    formattedAddress: data.subjectProperty?.formattedAddress ?? address,
  };
}

export function getRentCastApiKey() {
  return process.env.RENTCAST_API_KEY?.trim() || '';
}
