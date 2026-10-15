import { NavLink } from 'react-router-dom';
import { Sun, BookOpen, Gem, CalendarDays, Flame, Feather, Trash2, Settings as Cog } from 'lucide-react';
import { useT } from '../i18n/I18nProvider.jsx';
import { useResource } from '../lib/useResource.js';

export const SECTIONS = [
  { to: '/', key: 'nav.today', icon: Sun, end: true },
  { to: '/spells', key: 'nav.spells', icon: BookOpen },
  { to: '/correspondences', key: 'nav.correspondences', icon: Gem },
  { to: '/calendar', key: 'nav.calendar', icon: CalendarDays },
  { to: '/rituals', key: 'nav.rituals', icon: Flame },
  { to: '/journal', key: 'nav.journal', icon: Feather },
];
const FOOT = [
  { to: '/trash', key: 'nav.trash', icon: Trash2 },
  { to: '/settings', key: 'nav.settings', icon: Cog },
];

export function Brand() {
  const { t } = useT();
  return <NavLink to="/" className="brand"><span className="brand-name">{t('app.name')}</span><span className="brand-mark" aria-hidden="true">☾ ✦ ☽</span></NavLink>;
}

export function Sidebar({ id, open }) {
  const { t } = useT();
  const { data: health } = useResource('/api/health');
  const link = s => (
    <li key={s.to}>
      <NavLink to={s.to} end={s.end} className="nav-link">
        <s.icon size={18} aria-hidden="true" /><span>{t(s.key)}</span>
      </NavLink>
    </li>
  );
  return (
    <aside id={id} className={`sidebar${open ? ' is-open' : ''}`}>
      {health?.demo && <div className="demo-ribbon" role="note">{t('demo.ribbon')}</div>}
      <Brand />
      <nav aria-label={t('nav.label')}>
        <ul className="nav-main">{SECTIONS.map(link)}</ul>
        <ul className="nav-foot">{FOOT.map(link)}</ul>
      </nav>
    </aside>
  );
}
