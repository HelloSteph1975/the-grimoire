export function Button({ as: Comp = 'button', variant = 'primary', size = 'md', icon: Icon, className = '', children, ...props }) {
  const extra = Comp === 'button' && props.type === undefined ? { type: 'button' } : {};
  const iconOnly = Icon && !children;
  return (
    <Comp className={`btn btn-${variant} btn-${size}${iconOnly ? ' btn-icon' : ''} ${className}`.trim()} {...extra} {...props}>
      {Icon && <Icon size={size === 'sm' ? 16 : 18} aria-hidden="true" />}
      {children && <span>{children}</span>}
    </Comp>
  );
}
