import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar, Brand } from './Sidebar.jsx';
import { CornerFlourish, MarigoldCorner, PapelPicado } from './Ornaments.jsx';
import { useSettings } from './SettingsProvider.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const { t } = useT();
  const mainRef = useRef(null);
  const menuRef = useRef(null);
  const lastPath = useRef(pathname);
  const folk = settings?.theme === 'book-folk';

  useEffect(() => {
    setOpen(false);
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);
  const closeMenu = () => { setOpen(false); menuRef.current?.focus(); };
  useEffect(() => {
    if (open) document.getElementById('sidebar')?.querySelector('a.nav-link')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const Corner = folk ? MarigoldCorner : CornerFlourish;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">{t('nav.skip')}</a>
      <header className="topbar">
        <Brand />
        <button className="icon-btn" aria-expanded={open} aria-controls="sidebar" ref={menuRef}
          aria-label={open ? t('nav.close') : t('nav.open')} onClick={() => setOpen(o => !o)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      <Sidebar id="sidebar" open={open} />
      {open && <div className="scrim" onClick={closeMenu} aria-hidden="true" />}
      <main id="main" className="main" tabIndex={-1} ref={mainRef}>
        <div className="page">
          {folk && <PapelPicado />}
          {['tl', 'tr', 'bl', 'br'].map(c => <Corner key={c} className={`page-corner ${c}`} />)}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
