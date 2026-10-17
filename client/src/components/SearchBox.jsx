import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useT } from '../i18n/I18nProvider.jsx';

// The search box in the side bar. On the search page it shows that page's words, and a new
// search there replaces the history entry so Back doesn't walk through every try.
export function SearchBox() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onSearch = pathname === '/search';
  const q = onSearch ? (params.get('q') ?? '').trim() : '';
  const [text, setText] = useState(q);
  useEffect(() => { if (onSearch) setText(q); }, [onSearch, q]);

  const submit = e => {
    e.preventDefault();
    const words = text.trim();
    if (!words || (onSearch && words === q)) return;
    navigate(`/search?q=${encodeURIComponent(words)}`, { replace: onSearch });
  };
  return (
    <form role="search" className="search-box" onSubmit={submit}>
      <input type="search" className="input" aria-label={t('search.label')} placeholder={t('search.label')}
        maxLength={200} value={text} onChange={e => setText(e.target.value)} />
      <button type="submit" className="search-go" aria-label={t('search.button')}><Search size={18} aria-hidden="true" /></button>
    </form>
  );
}
