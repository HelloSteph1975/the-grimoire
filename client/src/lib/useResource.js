import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

let counter = 0;
const nextTicket = () => ++counter;

// All loading and saving goes through here. Each read gets a ticket; its reply is used
// only if it still holds the newest ticket. A save takes a new ticket when it starts and
// again when it finishes, so no read that was in flight can paint over the saved record.
// `gen` changes with the url, so a save started under an old url never paints the new one.
// `saveSeq` makes the newest save win when replies arrive out of order.
export function useResource(url) {
  const [state, setState] = useState({ url, data: null, error: null, loading: Boolean(url) });
  const ticket = useRef(0);
  const gen = useRef(0);
  const saveSeq = useRef(0);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const reload = useCallback(() => {
    if (!url) {
      ticket.current = nextTicket();
      setState({ url, data: null, error: null, loading: false });
      return Promise.resolve();
    }
    const mine = nextTicket();
    ticket.current = mine;
    const keep = s => (s.url === url ? s : { data: null, error: null });
    setState(s => ({ url, data: keep(s).data, error: keep(s).error, loading: true }));
    const current = () => live.current && ticket.current === mine;
    return api.get(url).then(
      data => { if (current()) setState({ url, data, error: null, loading: false }); },
      error => { if (current()) setState(s => ({ url, data: keep(s).data, error, loading: false })); },
    );
  }, [url]);

  useEffect(() => {
    gen.current += 1;
    setState({ url, data: null, error: null, loading: Boolean(url) });
    reload();
  }, [url, reload]);

  const save = useCallback(async (body, { method = 'patch', to = url } = {}) => {
    const startGen = gen.current;
    const mySeq = ++saveSeq.current;
    const myTicket = nextTicket();
    ticket.current = myTicket;
    let data;
    try {
      data = await api[method](to, body);
    } catch (err) {
      // Nothing newer has started, so a dropped read may have left us loading: settle with a fresh load.
      if (live.current && gen.current === startGen && ticket.current === myTicket) reload();
      throw err;
    }
    if (live.current && gen.current === startGen && saveSeq.current === mySeq) {
      ticket.current = nextTicket();
      setState({ url, data, error: null, loading: false });
    }
    return data;
  }, [url, reload]);

  const act = useCallback(async fn => {
    const out = await fn();
    await reload();
    return out;
  }, [reload]);

  const fresh = state.url === url;
  return {
    data: fresh ? state.data : null,
    error: fresh ? state.error : null,
    loading: fresh ? state.loading : Boolean(url),
    reload, save, act,
  };
}
