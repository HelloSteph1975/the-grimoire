// True when something already answers /api/health on this port (most likely another copy of
// The Grimoire). Used at startup so a second start exits before it opens the database.
export async function alreadyRunning(port, timeoutMs = 1000) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}
