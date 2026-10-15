import { VersionConflict } from './db/repo.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (message = 'Not found') => new HttpError(404, message);

export function idParam(req, name = 'id') {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Bad id');
  return id;
}

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostnameOf = url => {
  try { return new URL(url).hostname; } catch { return null; }
};
// A Host header is "name:port" with no scheme, so give it one before parsing ("localhost:4209" is not a URL scheme).
const localHost = req => LOCAL_HOSTS.has(hostnameOf(`http://${req.headers.host ?? ''}`));
const localOrigin = req => req.headers.origin === undefined || LOCAL_HOSTS.has(hostnameOf(req.headers.origin));
const deny = res => res.status(403).json({ error: 'Only allowed from this computer.' });

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

// Express recognises an error handler by its four parameters, so `next` stays even though it is unused.
export function errorHandler(err, req, res, next) {
  if (err instanceof VersionConflict) {
    return res.status(409).json({ error: err.message, current: err.current });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on our side.' : err.message,
    details: err.details,
  });
}
