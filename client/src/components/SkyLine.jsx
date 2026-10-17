import { MoonIcon } from './MoonIcon.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

// The moon grows from new to full through these phases; the rest wane.
const WAXING = new Set(['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous']);
export const isWaxing = moon => WAXING.has(moon);

// About how much of the disc is lit in each phase, for places that know only the phase name.
const LIT = {
  new: 0, 'waxing-crescent': 0.25, 'first-quarter': 0.5, 'waxing-gibbous': 0.75, full: 1,
  'waning-gibbous': 0.75, 'last-quarter': 0.5, 'waning-crescent': 0.25,
};
export const litOf = moon => LIT[moon] ?? 0;

// A saved sky ({ moon, lit, weekday, planet }): the moon disc beside one line of words.
export function SkyLine({ sky, title }) {
  const { t } = useT();
  const phase = t(`timing.moon.${sky.moon}`);
  return (
    <section className="spell-section ritual-sky">
      <h2>{title}</h2>
      <div className="ritual-sky-body">
        <MoonIcon lit={sky.lit} waxing={isWaxing(sky.moon)} size={48} />
        <p>{t('rituals.skyLine', { phase, n: Math.round(sky.lit * 100), weekday: t(`timing.day.${sky.weekday}`), planet: t(`timing.planet.${sky.planet}`) })}</p>
      </div>
    </section>
  );
}
