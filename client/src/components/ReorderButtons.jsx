import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from './Button.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function ReorderButtons({ index, count, onMove, label }) {
  const { t } = useT();
  return (
    <>
      <Button size="sm" variant="ghost" icon={ArrowUp} aria-label={t('reorder.up', { name: label })} disabled={index === 0} onClick={() => onMove(index, -1)} />
      <Button size="sm" variant="ghost" icon={ArrowDown} aria-label={t('reorder.down', { name: label })} disabled={index >= count - 1} onClick={() => onMove(index, 1)} />
    </>
  );
}
