(() => {
  const DEFAULTS = {
    enabled: true,
    sourceLang: 'es',
    targetLang: 'en',
    pauseOnHover: true,
    showLine: true,
  };
  let settings = { ...DEFAULTS };

  const PLAYER_SEL = '.html5-video-player';
  const WINDOW_SEL = '.caption-window';
  const SEGMENT_SEL = '.ytp-caption-segment';
  const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu;

  // ---- Translation -------------------------------------------------------

  const cache = new Map();

  function translate(text) {
    const { sourceLang: sl, targetLang: tl } = settings;
    const key = `${sl}|${tl}|${text}`;
    if (!cache.has(key)) {
      const pending = Promise.resolve()
        .then(() => chrome.runtime.sendMessage({ type: 'translate', text, sl, tl }))
        .then((res) => {
          if (!res?.ok) throw new Error(res?.error || 'Translation failed');
          return res.result;
        });
      pending.catch(() => cache.delete(key));
      cache.set(key, pending);
    }
    return cache.get(key);
  }

  // ---- Split caption text into hoverable words ---------------------------

  // segment -> { text, first }: lets us tell our own markup apart from a
  // fresh update by YouTube, so we don't re-wrap in an endless loop.
  const wrapped = new WeakMap();

  function wrapSegment(seg) {
    const text = seg.textContent;
    if (!text.trim()) return;
    const prev = wrapped.get(seg);
    if (prev && prev.text === text && prev.first === seg.firstChild) return;

    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(WORD_RE)) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const span = document.createElement('span');
      span.className = 'yht-word';
      span.textContent = m[0];
      frag.append(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));

    seg.replaceChildren(frag);
    wrapped.set(seg, { text, first: seg.firstChild });
  }

  function processCaptions() {
    if (currentWord && !currentWord.isConnected) hide();
    if (!settings.enabled) return;
    document.querySelectorAll(SEGMENT_SEL).forEach(wrapSegment);
  }

  let scheduled = false;
  function scheduleProcess() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      processCaptions();
    });
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
      if (el?.closest(PLAYER_SEL)) {
        scheduleProcess();
        return;
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // ---- Hovering the caption area -----------------------------------------

  let pausedByUs = false;
  let frozenPlayer = null;
  let leaveTimer;

  const getVideo = () => document.querySelector(`${PLAYER_SEL} video`);

  // YouTube lifts the captions above its controls when they show and drops
  // them when they auto-hide, which would move the words out from under the
  // cursor. Hold them where they are while the mouse is on them.
  function freezeCaptions(win) {
    const player = win.closest(PLAYER_SEL);
    if (!player || player === frozenPlayer) return;
    player.style.setProperty('--yht-caption-margin', getComputedStyle(win).marginBottom);
    player.classList.add('yht-frozen');
    frozenPlayer = player;
  }

  function unfreezeCaptions() {
    frozenPlayer?.classList.remove('yht-frozen');
    frozenPlayer = null;
  }

  function onEnterCaptions(win) {
    clearTimeout(leaveTimer);
    freezeCaptions(win);
    if (!settings.pauseOnHover) return;
    const video = getVideo();
    if (video && !video.paused) {
      video.pause();
      pausedByUs = true;
    }
  }

  function onLeaveCaptions() {
    clearTimeout(leaveTimer);
    // Small delay so brushing past the edge doesn't stutter playback.
    leaveTimer = setTimeout(() => {
      unfreezeCaptions();
      const video = getVideo();
      if (pausedByUs && video?.paused) video.play().catch(() => {});
      pausedByUs = false;
    }, 250);
  }

  // ---- Tooltip -----------------------------------------------------------

  let tooltip;
  let currentWord;
  let hideTimer;
  let hoverToken = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function lineText(wordEl) {
    const container = wordEl.closest(WINDOW_SEL) || wordEl.closest(SEGMENT_SEL);
    const segments = container.matches(SEGMENT_SEL)
      ? [container]
      : container.querySelectorAll(SEGMENT_SEL);
    return [...segments]
      .map((s) => s.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function render(state) {
    const head = el('div', 'yht-head');
    head.append(el('span', 'yht-src', state.word), el('span', 'yht-arrow', '→'));
    if (state.wordError) head.append(el('span', 'yht-error', state.wordError));
    else head.append(el('span', 'yht-trans', state.wordResult?.text ?? '…'));

    const parts = [head];

    const dict = state.wordResult?.dict || [];
    if (dict.length) {
      const list = el('div', 'yht-dict');
      for (const entry of dict.slice(0, 3)) {
        const row = el('div', 'yht-dict-row');
        if (entry.pos) row.append(el('span', 'yht-pos', entry.pos));
        row.append(document.createTextNode(entry.terms.join(', ')));
        list.append(row);
      }
      parts.push(list);
    }

    if (state.line) {
      const line = el('div', 'yht-line');
      if (state.lineError) line.append(el('span', 'yht-error', state.lineError));
      else line.textContent = state.lineResult?.text ?? '…';
      parts.push(line);
    }

    tooltip.replaceChildren(...parts);
    tooltip.classList.add('yht-visible');
  }

  function position(wordEl, player) {
    const pr = player.getBoundingClientRect();
    const wr = wordEl.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const margin = 8;

    let left = wr.left - pr.left + wr.width / 2 - tw / 2;
    left = Math.max(margin, Math.min(left, pr.width - tw - margin));
    let top = wr.top - pr.top - th - 10;
    if (top < margin) top = wr.bottom - pr.top + 10;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function showFor(wordEl) {
    clearTimeout(hideTimer);
    if (wordEl === currentWord) return;
    const player = wordEl.closest(PLAYER_SEL);
    if (!player) return;

    currentWord?.classList.remove('yht-active');
    currentWord = wordEl;
    wordEl.classList.add('yht-active');

    if (!tooltip) tooltip = el('div', 'yht-tooltip');
    if (tooltip.parentElement !== player) player.append(tooltip);

    const word = wordEl.textContent;
    const line = lineText(wordEl);
    const state = { word, line: settings.showLine && line !== word ? line : null };
    const token = ++hoverToken;
    const update = () => {
      if (token !== hoverToken) return;
      render(state);
      position(wordEl, player);
    };

    update();
    // Lowercase gives better dictionary hits for sentence-initial words.
    translate(word.toLowerCase()).then(
      (r) => { state.wordResult = r; update(); },
      (e) => { state.wordError = e.message; update(); },
    );
    if (state.line) {
      translate(state.line).then(
        (r) => { state.lineResult = r; update(); },
        (e) => { state.lineError = e.message; update(); },
      );
    }
  }

  function hide() {
    clearTimeout(hideTimer);
    hoverToken++;
    tooltip?.classList.remove('yht-visible');
    currentWord?.classList.remove('yht-active');
    currentWord = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 250);
  }

  // ---- Events ------------------------------------------------------------

  // Capture phase on window, so this runs before the player's own handlers
  // reveal the controls and start moving the captions.
  window.addEventListener('pointerover', (e) => {
    if (!settings.enabled) return;
    const word = e.target.closest?.('.yht-word');
    if (word) showFor(word);
    const win = e.target.closest?.(WINDOW_SEL);
    if (win && !e.relatedTarget?.closest?.(WINDOW_SEL)) onEnterCaptions(win);
  }, true);

  window.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('.yht-word') && !e.relatedTarget?.closest?.('.yht-word')) scheduleHide();
    if (e.target.closest?.(WINDOW_SEL) && !e.relatedTarget?.closest?.(WINDOW_SEL)) onLeaveCaptions();
  }, true);

  // ---- Settings ----------------------------------------------------------

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = stored;
    processCaptions();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
    hide();
    processCaptions();
  });
})();
