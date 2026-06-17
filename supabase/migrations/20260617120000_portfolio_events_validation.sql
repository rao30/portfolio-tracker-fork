-- Defensive validation for life-event timelines stored in portfolio JSONB.
-- Rejects malformed property events before they can corrupt simulation state.

CREATE OR REPLACE FUNCTION public.validate_portfolio_property_events(data jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  prop jsonb;
  ev jsonb;
  ev_type text;
  ev_month int;
  valid_types text[] := ARRAY[
    'rentChange', 'rateReset', 'capexSpike', 'refinance', 'acquisition', 'disposition'
  ];
BEGIN
  IF data IS NULL OR jsonb_typeof(data) <> 'object' THEN
    RETURN false;
  END IF;

  IF NOT (data ? 'properties') OR jsonb_typeof(data->'properties') <> 'array' THEN
    RETURN false;
  END IF;

  FOR prop IN SELECT jsonb_array_elements(data->'properties')
  LOOP
    IF prop ? 'events' AND jsonb_typeof(prop->'events') <> 'array' THEN
      RETURN false;
    END IF;

    IF NOT (prop ? 'events') THEN
      CONTINUE;
    END IF;

    FOR ev IN SELECT jsonb_array_elements(prop->'events')
    LOOP
      ev_type := ev->>'type';
      IF ev_type IS NULL OR NOT (ev_type = ANY (valid_types)) THEN
        RETURN false;
      END IF;

      ev_month := (ev->>'month')::int;
      IF ev_month IS NULL OR ev_month < 1 OR ev_month > 600 THEN
        RETURN false;
      END IF;

      CASE ev_type
        WHEN 'rentChange' THEN
          IF (ev->>'rent')::numeric IS NULL OR (ev->>'rent')::numeric < 0 THEN
            RETURN false;
          END IF;
        WHEN 'rateReset' THEN
          IF (ev->>'rate')::numeric IS NULL OR (ev->>'rate')::numeric < 0 OR (ev->>'rate')::numeric > 0.25 THEN
            RETURN false;
          END IF;
        WHEN 'capexSpike' THEN
          IF (ev->>'amount')::numeric IS NULL OR (ev->>'amount')::numeric <= 0 THEN
            RETURN false;
          END IF;
        WHEN 'refinance' THEN
          IF ev ? 'rate' AND ((ev->>'rate')::numeric < 0 OR (ev->>'rate')::numeric > 0.25) THEN
            RETURN false;
          END IF;
          IF ev ? 'payment' AND (ev->>'payment')::numeric < 0 THEN
            RETURN false;
          END IF;
          IF ev ? 'balance' AND (ev->>'balance')::numeric < 0 THEN
            RETURN false;
          END IF;
        WHEN 'acquisition' THEN
          IF NOT (ev ? 'property') OR jsonb_typeof(ev->'property') <> 'object' THEN
            RETURN false;
          END IF;
          IF COALESCE(trim(ev->'property'->>'name'), '') = '' THEN
            RETURN false;
          END IF;
        ELSE
          NULL;
      END CASE;
    END LOOP;
  END LOOP;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.validate_portfolio_property_events(jsonb) IS
  'Validates property life-event arrays inside portfolio_snapshots.data JSONB';

CREATE OR REPLACE FUNCTION public.portfolio_snapshots_validate_data()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.validate_portfolio_property_events(NEW.data) THEN
    RAISE EXCEPTION 'portfolio_snapshots.data contains invalid property life events'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portfolio_snapshots_validate_before_write ON public.portfolio_snapshots;

CREATE TRIGGER portfolio_snapshots_validate_before_write
  BEFORE INSERT OR UPDATE OF data ON public.portfolio_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.portfolio_snapshots_validate_data();
