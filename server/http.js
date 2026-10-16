import { VersionConflict } from './db/repo.js';

export class HttpError extends Error {
  constructor(status, message, details, { code, vars, detailCodes } = {}) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
    this.vars = vars;
    this.detailCodes = detailCodes;
  }
}

export const notFound = (message = 'Not found', code = 'not_found') => new HttpError(404, message, undefined, { code });
export const notInTrash = () => new HttpError(404, 'That is not in the Trash.', undefined, { code: 'not_in_trash' });
const DEFAULT_CODES = { 400: 'invalid', 403: 'forbidden', 404: 'not_found', 409: 'conflict' };

export function idParam(req, name = 'id') {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Bad id', undefined, { code: 'bad_id' });
  return id;
}

// An optional id in the query string: absent or empty means no filter.
export function queryId(v) {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (typeof v !== 'string' || !Number.isInteger(n) || n < 1) throw new HttpError(400, 'Bad id', undefined, { code: 'bad_id' });
  return n;
}

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostnameOf = url => {
  try { return new URL(url).hostname; } catch { return null; }
};
// A Host header is "name:port" with no scheme, so give it one before parsing ("localhost:4209" is not a URL scheme).
const localHost = req => LOCAL_HOSTS.has(hostnameOf(`http://${req.headers.host ?? ''}`));
const localOrigin = req => req.headers.origin === undefined || LOCAL_HOSTS.has(hostnameOf(req.headers.origin));
const deny = res => res.status(403).json({ error: 'Only allowed from this computer.', code: 'forbidden' });

// Every API and photo request must name this computer in Host (blocks DNS rebinding), and
// anything that changes data must not come from another site's page (blocks cross-site posts).
export function hostGuard(req, res, next) {
  if (!localHost(req)) return deny(res);
  if (req.method !== 'GET' && req.method !== 'HEAD' && !localOrigin(req)) return deny(res);
  next();
}

// System routes (backups, restore, shutdown) also need the connection itself to be local.
export function localOnly(req, res, next) {
  if (!LOCAL.has(req.socket.remoteAddress) || !localOrigin(req) || !localHost(req)) return deny(res);
  next();
}

export const RESTORED = 'Your data was restored from a backup in another window. Reload the page to continue.';

// Every API response names the current data epoch. A write that names an older one comes
// from a page loaded before a restore, whose ids and versions may now point at other records.
// Writes without the header (scripts, stop.js, tests) are allowed.
export function epochGuard(ctx) {
  return (req, res, next) => {
    res.set('X-Grimoire-Epoch', ctx.epoch);
    const sent = req.get('X-Grimoire-Epoch');
    if (req.method !== 'GET' && req.method !== 'HEAD' && sent !== undefined && sent !== ctx.epoch) {
      return res.status(409).json({ error: RESTORED, code: 'restored', restored: true });
    }
    next();
  };
}

// Express recognises an error handler by its four parameters, so `next` stays even though it is unused.
export function errorHandler(err, req, res, next) {
  if (err instanceof VersionConflict) {
    return res.status(409).json({ error: err.message, code: 'conflict', current: err.current });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  // A 5xx raised on purpose (an HttpError with a code) keeps its own message and code; anything
  // else is unexpected, so the details stay in the log.
  const planned = err instanceof HttpError && err.code;
  const hidden = status >= 500 && !planned;
  res.status(status).json({
    error: hidden ? 'Something went wrong on our side.' : err.message,
    code: hidden ? 'server_error' : (err.code ?? DEFAULT_CODES[status] ?? 'invalid'),
    vars: err.vars,
    details: err.details,
    detailCodes: err.detailCodes,
  });
}
