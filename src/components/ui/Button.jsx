import './ui.css';

/**
 * @param {{
 *  variant?: 'primary'|'ghost'|'subtle'|'danger'|'default',
 *  size?: 'sm'|'md'|'lg',
 *  block?: boolean, loading?: boolean, icon?: React.ReactNode,
 * }} props
 */
export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  loading = false,
  icon = null,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}) {
  const classes = [
    'g-btn',
    variant !== 'default' && `g-btn--${variant}`,
    size !== 'md' && `g-btn--${size}`,
    block && 'g-btn--block',
    !children && 'g-btn--icon',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="g-btn__spinner" /> : icon}
      {children}
    </button>
  );
}
