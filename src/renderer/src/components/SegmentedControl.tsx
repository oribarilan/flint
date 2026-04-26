import styles from './SegmentedControl.module.css'

interface SegmentedOption<T extends string> {
  label: string
  value: T
  disabled?: boolean
  disabledLabel?: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className={styles.root} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`${styles.option} ${opt.value === value ? styles.active : ''}`}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          aria-disabled={opt.disabled || undefined}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          {opt.disabled && opt.disabledLabel && (
            <span className={styles.comingSoon}>{opt.disabledLabel}</span>
          )}
        </button>
      ))}
    </div>
  )
}
