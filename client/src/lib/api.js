export class ApiError extends Error {
  constructor(message, status, details, current, { code, vars, detailCodes } = {}) {
    super(message);
    this.status = status;
    this.details = details ?? {};
    this.current = current ?? null;
    this.code = code;
    this.vars = vars;
    this.detailCodes = detailCodes;
  }
}

// The server's data epoch as of this page load. It changes when a backup is restored; sending
// it with every write lets the server refuse writes from a page that predates the restore.
// A full page reload starts over, so the restoring window picks up the new one.
let epoch = null;
export const forgetEpoch = () => { epoch = null; }; // for tests

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (method !== 'GET' && epoch) opts.headers['X-Grimoire-Epoch'] = epoch;
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch {
    throw new ApiError("Can't reach The Grimoire. It may be closed for the night; start it and try again.", 0, undefined, undefined, { code: 'unreachable' });
  }
  epoch ??= res.headers?.get('X-Grimoire-Epoch') || null;
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 409 && data?.restored) {
    // No `current` copy, so forms show this as an error rather than the conflict dialog.
    const err = new ApiError(data.error, 409);
    err.restored = true;
    err.code = 'restored';
    throw err;
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details, data?.current,
    { code: data?.code, vars: data?.vars, detailCodes: data?.detailCodes });
  return data;
}

export const api = {
  get: url => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: url => request('DELETE', url),
};
