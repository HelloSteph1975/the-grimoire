// Client copy of the timing codes in server/services/timing.js (tests keep them equal).
export const MOON_PHASES = ['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent'];
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const PLANETS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
export const TIMING = { moon: MOON_PHASES, day: DAYS, planet: PLANETS };

// Client copy of SABBAT_KEYS in server/services/timing.js: the starter keys of the eight sabbats.
export const SABBAT_KEYS = ['samhain', 'yule', 'imbolc', 'ostara', 'beltane', 'litha', 'lughnasadh', 'mabon'].map(k => `corr.sabbats-feasts.${k}`);
