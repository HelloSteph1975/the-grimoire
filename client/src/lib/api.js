export class ApiError extends Error {
  constructor(message, status, details, current) {
    super(message);
    this.status = status;
    this.details = details ?? {};
    this.current = current ?? null;
  }
}

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch {
    throw new ApiError("Can't reach The Grimoire. It may be closed for the night; start it and try again.", 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details, data?.current);
  return data;
}

export const api = {
  get: url => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: url => request('DELETE', url),
};
