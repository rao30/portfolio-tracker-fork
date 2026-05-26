import { useEffect, useState } from 'react';

interface NumericInputProps {
  id?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  className?: string;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  /** When true, clearing the field commits undefined instead of 0. */
  optional?: boolean;
  placeholder?: string;
}

/** Controlled numeric input that avoids leading-zero glitches from type="number". */
export function NumericInput({
  id,
  value,
  onChange,
  className,
  min,
  max,
  allowDecimal = false,
  optional = false,
  placeholder,
}: NumericInputProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const displayValue =
    value == null || (value === 0 && optional) ? '' : String(value);

  useEffect(() => {
    if (!focused) {
      setText(displayValue);
    }
  }, [displayValue, focused]);

  const pattern = allowDecimal ? /^\d*\.?\d*$/ : /^\d*$/;

  const commit = (raw: string) => {
    if (optional && (raw === '' || raw === '.')) {
      onChange(undefined);
      return;
    }
    let n = raw === '' || raw === '.' ? 0 : Number(raw);
    if (Number.isNaN(n)) n = 0;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    onChange(n);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={focused ? text : displayValue}
      placeholder={placeholder}
      onFocus={() => {
        setFocused(true);
        setText(displayValue);
      }}
      onChange={(e) => {
        const next = e.target.value;
        if (next !== '' && !pattern.test(next)) return;
        setText(next);
      }}
      onBlur={() => {
        setFocused(false);
        commit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}
