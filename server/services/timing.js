// The codes a spell's timing uses, and the keys of the eight sabbat entries.
export const MOON_PHASES = ['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent'];
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const PLANETS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
export const TIMING = { moon: MOON_PHASES, day: DAYS, planet: PLANETS };
export const SABBAT_KEYS = ['samhain', 'yule', 'imbolc', 'ostara', 'beltane', 'litha', 'lughnasadh', 'mabon'].map(k => `corr.sabbats-feasts.${k}`);
