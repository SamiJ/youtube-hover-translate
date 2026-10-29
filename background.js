// Translation runs here (not in the content script) so the request isn't
// subject to youtube.com's CORS rules.

const cache = new Map();
const MAX_CACHE = 2000;

async function translate(text, sl, tl) {
  const key = `${sl}|${tl}|${text}`;
  if (cache.has(key)) return cache.get(key);

  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sl);
  url.searchParams.set('tl', tl);
  url.searchParams.set('dj', '1');
  url.searchParams.append('dt', 't'); // translation
  url.searchParams.append('dt', 'bd'); // dictionary entries (for single words)
  url.searchParams.set('q', text);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation request failed (${res.status})`);
  const data = await res.json();

  const result = {
    text: (data.sentences || []).map((s) => s.trans || '').join('').trim(),
    source: data.src || sl,
    dict: (data.dict || []).map((d) => ({ pos: d.pos, terms: (d.terms || []).slice(0, 6) })),
  };

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'translate') return;
  translate(msg.text, msg.sl, msg.tl)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // keep the channel open for the async response
});
