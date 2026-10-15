export function PageHeader({ title, children }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
