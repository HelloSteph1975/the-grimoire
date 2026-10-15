import { Gem, Palette, CalendarDays, Orbit, Flame, Moon, Sparkles, Cross, Sun, Leaf, BookOpen, Star } from 'lucide-react';

const MAP = {
  gem: Gem,
  palette: Palette,
  'calendar-days': CalendarDays,
  orbit: Orbit,
  flame: Flame,
  moon: Moon,
  sparkles: Sparkles,
  cross: Cross,
  sun: Sun,
  leaf: Leaf,
  'book-open': BookOpen,
  star: Star,
};

export const ICONS = Object.keys(MAP);

export function CategoryIcon({ name, size = 18 }) {
  const Icon = Object.hasOwn(MAP, name) ? MAP[name] : Star;
  return <Icon size={size} aria-hidden="true" />;
}
