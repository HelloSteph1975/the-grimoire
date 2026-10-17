// Case and accents don't matter when matching words, as on the server.
export const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
