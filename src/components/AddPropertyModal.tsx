import type { Portfolio, Property, PropertyDraft } from '../lib/types';
import type { UsePropertyIntakeResult } from '../lib/usePropertyIntake';
import { PropertyIntakeCommandCenter } from './PropertyIntakeCommandCenter';

interface AddPropertyModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (property: PropertyDraft) => number;
  portfolio: Portfolio;
  template?: Property;
  intakeHook: UsePropertyIntakeResult;
  onFocusNewProperty?: (index: number) => void;
}

/** Guided property intake wizard (replaces the legacy minimal modal). */
export function AddPropertyModal(props: AddPropertyModalProps) {
  return <PropertyIntakeCommandCenter {...props} />;
}
