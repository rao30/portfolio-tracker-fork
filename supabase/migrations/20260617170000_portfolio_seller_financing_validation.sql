-- Defensive validation for seller financing fields inside portfolio JSONB.
-- Rejects corrupt payoff caps, balloon terms, and amortization before they reach simulation.

CREATE OR REPLACE FUNCTION public.validate_portfolio_seller_financing(data jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  prop jsonb;
  financing text;
  balloon_months numeric;
  amort_months numeric;
  payoff_cap numeric;
BEGIN
  IF data IS NULL OR jsonb_typeof(data) <> 'object' THEN
    RETURN false;
  END IF;

  IF NOT (data ? 'properties') OR jsonb_typeof(data -> 'properties') <> 'array' THEN
    RETURN true;
  END IF;

  FOR prop IN SELECT value FROM jsonb_array_elements(data -> 'properties')
  LOOP
    financing := prop ->> 'financing_type';

    IF financing IS NOT NULL AND financing NOT IN ('conventional', 'seller') THEN
      RETURN false;
    END IF;

    IF prop ? 'balloon_months' AND prop -> 'balloon_months' IS NOT NULL THEN
      balloon_months := (prop ->> 'balloon_months')::numeric;
      IF balloon_months <= 0 OR balloon_months > 600 THEN
        RETURN false;
      END IF;
    END IF;

    IF prop ? 'seller_amortization_months' AND prop -> 'seller_amortization_months' IS NOT NULL THEN
      amort_months := (prop ->> 'seller_amortization_months')::numeric;
      IF amort_months <= 0 OR amort_months > 600 THEN
        RETURN false;
      END IF;
    END IF;

    IF prop ? 'seller_payoff_cap' AND prop -> 'seller_payoff_cap' IS NOT NULL THEN
      payoff_cap := (prop ->> 'seller_payoff_cap')::numeric;
      IF payoff_cap < 0 OR payoff_cap > 100000000 THEN
        RETURN false;
      END IF;
    END IF;

    IF financing = 'seller' OR prop ? 'balloon_months' OR prop ? 'seller_payoff_cap' THEN
      IF prop ? 'balloon_refi_term_months' AND (prop ->> 'balloon_refi_term_months')::numeric <= 0 THEN
        RETURN false;
      END IF;
      IF prop ? 'balloon_refi_annual_rate' AND (prop ->> 'balloon_refi_annual_rate')::numeric < 0 THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.validate_portfolio_seller_financing IS
  'Validates seller financing fields (balloon, payoff cap, refi terms) in portfolio_snapshots.data JSONB';

ALTER TABLE public.portfolio_snapshots
  DROP CONSTRAINT IF EXISTS portfolio_seller_financing_valid;

ALTER TABLE public.portfolio_snapshots
  ADD CONSTRAINT portfolio_seller_financing_valid
  CHECK (validate_portfolio_seller_financing(data));
