/*
 * Dictionary overlay for Odia Phonetic — Sanskrit (Appv2 single-file build).
 *
 * Layered on top of the built app WITHOUT touching the bundle: it watches the
 * DOM the app renders (the caret candidate bar, the alternatives picker, the
 * output words) and augments each suggestion with an English gloss from the
 * embedded Purnnachandra Odia Bhashakosha (G. C. Praharaj, 1931-40), plus a
 * side panel with the full entries.
 *
 * Everything is defensive: if any of this fails, the app underneath keeps
 * working exactly as before. No network calls, ever.
 *
 * Odia characters appear ONLY as \u escapes, following the repo convention:
 * canonical and precomposed nukta spellings are visually identical, so a
 * literal cannot be reviewed.
 */
(function () {
  'use strict';

  var SEP = '';

  /* ------------------------------------------------------------ *
   * Normalisation — mirrors core/src/normalize.ts canonical(),
   * plus the 1930s-orthography fold used when the payload was built.
   * ------------------------------------------------------------ */

  var PRECOMPOSED_DDA = 'ଡ଼';            /* ଡ଼ precomposed */
  var DDA_NUKTA = 'ଡ଼';            /* ଡ + ନୁକ୍ତା */
  var PRECOMPOSED_DDHA = 'ଢ଼';           /* ଢ଼ precomposed */
  var DDHA_NUKTA = 'ଢ଼';           /* ଢ + ନୁକ୍ତା */

  function canonical(s) {
    var out = s.normalize('NFC');
    if (out.indexOf(PRECOMPOSED_DDA) !== -1) out = out.split(PRECOMPOSED_DDA).join(DDA_NUKTA);
    if (out.indexOf(PRECOMPOSED_DDHA) !== -1) out = out.split(PRECOMPOSED_DDHA).join(DDHA_NUKTA);
    return out;
  }

  /* ୟ(0B5F)->ଯ(0B2F), ୱ(0B71)->ବ(0B2C), ଵ(0B35)->ବ : Praharaj-era spellings. */
  function fold(w) {
    return w
      .split('ୟ').join('ଯ')
      .split('ୱ').join('ବ')
      .split('ଵ').join('ବ');
  }

  /* Inflectional suffixes tried (longest first) when the exact form is not a
   * headword. Kept in sync with the payload builder; folded forms. */
  var SUFFIXES = [
    'ମାନଙ୍କର',                 /* -maananjkara */
    'ମାନଙ୍କୁ',                 /* -maananjku */
    'ଗୁଡ଼ିକୁ',                 /* -gudiku */
    'ଗୁଡ଼ିକର',                 /* -gudikara */
    'ମାନଙ୍କ',                       /* -maananjka */
    'ଗୁଡ଼ିକ',                       /* -gudika */
    'ଗୁଡ଼ାଏ',                       /* -gudaae */
    'ମାନେ',                                   /* -maane */
    'ଙ୍କର',                                   /* -njkara */
    'ଙ୍କୁ',                                   /* -njku */
    'ଟିକୁ',                                   /* -tiku */
    'ଟିରେ',                                   /* -tire */
    'ଙ୍କ',                                         /* -njka */
    'ଟିର',                                         /* -tira */
    'ରେ',                                               /* -re */
    'ରୁ',                                               /* -ru */
    'କୁ',                                               /* -ku */
    'ଟି',                                               /* -ti */
    'ଟା',                                               /* -taa */
    'ର',                                                     /* -ra */
    'ଁ',                                                     /* candrabindu */
    'ଂ',                                                     /* anusvara */
    'ଃ'                                                      /* visarga */
  ];

  /* ------------------------------------------------------------ *
   * Data: base64(gzip(payload)) in #dict-data, inflated lazily.
   * payload = N SEP keys(\n-joined, sorted) SEP lens(,-joined) SEP defs(concat)
   * ------------------------------------------------------------ */

  var P = null;   // Praharaj dictionary {keys, offsets, lens, defs}
  var M = null;   // modern layer, same container format
  var state = 'idle'; /* idle | loading | ready | failed */

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var n = bin.length;
    var bytes = new Uint8Array(n);
    for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function parsePayload(elementId) {
    var el = document.getElementById(elementId);
    if (!el) return null;
    var b64 = (el.textContent || '').replace(/\s+/g, '');
    var bytes = b64ToBytes(b64);
    var inflated = window.__dictInflate(bytes);
    var text = new TextDecoder('utf-8').decode(inflated);
    var a = text.indexOf(SEP);
    var b = text.indexOf(SEP, a + 1);
    var c = text.indexOf(SEP, b + 1);
    var count = parseInt(text.slice(0, a), 10);
    var keys = text.slice(a + 1, b).split('\n');
    var lenParts = text.slice(b + 1, c).split(',');
    var lens = new Uint32Array(count);
    var offsets = new Float64Array(count);
    var off = 0;
    for (var i = 0; i < count; i++) {
      lens[i] = +lenParts[i];
      offsets[i] = off;
      off += lens[i];
    }
    if (keys.length !== count) throw new Error('key count mismatch');
    return { keys: keys, offsets: offsets, lens: lens, defs: text.slice(c + 1) };
  }

  function loadData() {
    if (state !== 'idle') return;
    state = 'loading';
    panelStatus('Unpacking dictionaries…');
    setTimeout(function () {
      try {
        P = parsePayload('dict-data');
        try {
          M = parsePayload('dict-data-modern');
        } catch (err2) {
          M = null; /* modern layer is optional */
        }
        state = 'ready';
        lookupCache = Object.create(null);
        modernCache = Object.create(null);
        panelStatus('');
        refreshAll();
      } catch (err) {
        state = 'failed';
        panelStatus('Dictionary failed to unpack — the app itself is unaffected.');
      }
    }, 30);
  }

  function bsearch(dict, key) {
    if (!dict) return -1;
    var keys = dict.keys;
    var lo = 0, hi = keys.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var k = keys[mid];
      if (k === key) return mid;
      if (k < key) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }

  function defAt(dict, i) {
    return dict.defs.slice(dict.offsets[i], dict.offsets[i] + dict.lens[i]);
  }

  var lookupCache = Object.create(null);
  var modernCache = Object.create(null);

  /*
   * Praharaj lookup with fallbacks:
   *   exact / stem (one suffix removed) / prefix (longest headword the word
   *   begins with, for sandhi compounds) — each marked in the UI.
   */
  function lookup(word) {
    var q = fold(canonical(word));
    if (q.length === 0) return null;
    var hit = lookupCache[q];
    if (hit !== undefined) return hit;
    var res = null;
    var i = bsearch(P, q);
    if (i >= 0) {
      res = { how: 'exact', head: P.keys[i], index: i };
    } else if (P) {
      for (var s = 0; s < SUFFIXES.length && !res; s++) {
        var suf = SUFFIXES[s];
        if (q.length - suf.length >= 2 && q.slice(-suf.length) === suf) {
          var j = bsearch(P, q.slice(0, q.length - suf.length));
          if (j >= 0) res = { how: 'stem', head: P.keys[j], index: j };
        }
      }
      if (!res) {
        var lo = 0, hi = P.keys.length;
        while (lo < hi) {
          var mid = (lo + hi) >> 1;
          if (P.keys[mid] < q) lo = mid + 1; else hi = mid;
        }
        var best = -1, bestLen = 2;
        for (var back = lo - 1; back >= 0 && back > lo - 400; back--) {
          var k = P.keys[back];
          if (k.length > bestLen && q.length > k.length && q.lastIndexOf(k, 0) === 0) {
            best = back; bestLen = k.length;
          }
          if (k.charAt(0) !== q.charAt(0)) break;
        }
        if (best >= 0) res = { how: 'prefix', head: P.keys[best], index: best };
      }
    }
    lookupCache[q] = res;
    return res;
  }

  /*
   * Modern-layer lookup (loanwords, community MT glosses, CLDR names).
   * Returns { how, lines: [{tag, gloss}] } or null. Exact and stem only —
   * a prefix fallback on this data would invent loans.
   */
  function lookupModern(word) {
    if (!M) return null;
    var q = fold(canonical(word));
    if (q.length === 0) return null;
    var hit = modernCache[q];
    if (hit !== undefined) return hit;
    var res = null;
    var i = bsearch(M, q);
    var how = 'exact';
    if (i < 0) {
      for (var s = 0; s < SUFFIXES.length && i < 0; s++) {
        var suf = SUFFIXES[s];
        if (q.length - suf.length >= 2 && q.slice(-suf.length) === suf) {
          i = bsearch(M, q.slice(0, q.length - suf.length));
        }
      }
      how = 'stem';
    }
    if (i >= 0) {
      var lines = defAt(M, i).split('\n').map(function (line) {
        var t = line.indexOf('\t');
        return { tag: line.slice(0, t), gloss: line.slice(t + 1) };
      });
      res = { how: how, lines: lines };
    }
    modernCache[q] = res;
    return res;
  }

  var MODERN_LABEL = {
    loan: 'English loan (auto-detected)',
    mt: 'modern usage — community translation data, approximate',
    cldr: 'standard modern name (CLDR)'
  };

  /* The chip line for a word: modern gloss first (today's usage), the
   * Praharaj gloss after it, separated by a middle dot. Either may be
   * missing; approximate matches carry a leading ≈. */
  function chipFor(word) {
    var entry = lookup(word);
    var mo = lookupModern(word);
    var parts = [];
    var m = modernChip(mo);
    if (m) parts.push(m);
    var g = entry ? prefixed(entry, shortGloss(entry)) : null;
    if (g) parts.push(g);
    if (!parts.length) return null;
    var chip = parts.join('  ·  ');
    if (chip.length > 72) chip = chip.slice(0, 72).replace(/\s+\S*$/, '') + '…';
    return chip;
  }

  function prefixed(entry, gloss) {
    if (!gloss) return null;
    return (entry.how !== 'exact' ? '≈ ' : '') + gloss;
  }

  function modernChip(mo) {
    if (!mo || !mo.lines.length) return null;
    var line = mo.lines[0];
    var g = line.tag === 'loan' ? 'English: ' + line.gloss : line.gloss.split(';')[0];
    if (g.length > 44) g = g.slice(0, 44).replace(/\s+\S*$/, '') + '…';
    return (mo.how !== 'exact' ? '≈ ' : '') + g;
  }

  /* Short English gloss for the inline chip.
   *
   * Entries open "ହେଡ — Translit …", so the FIRST Latin run is the
   * romanisation, not the meaning. Skip that, then prefer the English text of
   * sense 1 ("1. Trouble; distress"), then any Latin run after a dash. */
  var glossCache = Object.create(null);
  function shortGloss(entry) {
    if (!entry) return null;
    var cached = glossCache[entry.head];
    if (cached !== undefined) return cached;
    var def = defAt(P, entry.index).slice(0, 4000);
    /* drop "head — Translit" prefix (translit = Latin with diacritics) */
    var body = def.replace(/^[^—–\n]{0,50}[—–]\s*[A-Za-zĀ-ʯḀ-ỿ']+[.,]?\s*/, '');
    var g = null;
    var m = body.match(/\b\d\.\s*([A-Za-z][^।॥\n]{2,90})/);
    if (!m) m = body.match(/[—–]\s*(?:\d+\s*)?([A-Z][a-z][^।॥\n]{2,90})/);
    if (!m) m = body.match(/\b([A-Z][a-z][^।॥\n]{2,90})/);
    if (m) {
      g = m[1];
      /* chip is English-only: stop at the first Odia character, the next
       * numbered sense, or an opening bracket of a commentary note */
      g = g.split(/[଀-୿]/)[0];
      g = g.split(/\s\d\.?\s|\s*[—–]\s*\d|\s*\[/)[0];
      g = g.replace(/\s+/g, ' ').replace(/[\s;,([—–-]+$/, '').trim();
      if (g.length > 56) g = g.slice(0, 56).replace(/\s+\S*$/, '') + '…';
      if (g.length < 2) g = null;
    }
    glossCache[entry.head] = g;
    return g;
  }

  /* ------------------------------------------------------------ *
   * Panel
   * ------------------------------------------------------------ */

  var panel, panelBody, panelState, searchInput, toggleBtn;
  var lastCandidates = [];

  function buildPanel() {
    panel = document.createElement('aside');
    panel.id = 'dict-panel';
    panel.setAttribute('aria-label', 'Odia dictionary');

    var head = document.createElement('div');
    head.className = 'dict-head';
    var title = document.createElement('h2');
    var tOdia = document.createElement('span');
    tOdia.className = 'odia';
    tOdia.textContent = 'ଅଭିଧାନ';   /* ଅଭିଧାନ */
    title.appendChild(tOdia);
    title.appendChild(document.createTextNode(' Dictionary'));
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'dict-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close dictionary panel');
    close.addEventListener('click', function () { setPanelOpen(false); });
    head.appendChild(title);
    head.appendChild(close);

    var sub = document.createElement('p');
    sub.className = 'dict-sub';
    sub.textContent = 'Purṇṇachandra Oḍiā Bhāshakosha — G. C. Praharaj (1931–40)';

    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'dict-search odia';
    searchInput.placeholder = 'ଖୋଜନ୍ତୁ…  (search any Odia word)';
    searchInput.setAttribute('aria-label', 'Search the dictionary');
    searchInput.addEventListener('input', debounce(onSearch, 160));

    panelState = document.createElement('p');
    panelState.className = 'dict-state';
    panelState.hidden = true;

    panelBody = document.createElement('div');
    panelBody.className = 'dict-body';

    panel.appendChild(head);
    panel.appendChild(sub);
    panel.appendChild(searchInput);
    panel.appendChild(panelState);
    panel.appendChild(panelBody);
    document.body.appendChild(panel);

    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = 'dict-toggle';
    var bOdia = document.createElement('span');
    bOdia.className = 'odia';
    bOdia.textContent = 'ଅ';                                  /* ଅ */
    toggleBtn.appendChild(bOdia);
    toggleBtn.appendChild(document.createTextNode('→A'));
    toggleBtn.setAttribute('aria-label', 'Toggle dictionary panel');
    toggleBtn.addEventListener('click', function () {
      setPanelOpen(!document.body.classList.contains('dict-open'));
    });
    document.body.appendChild(toggleBtn);

    setPanelOpen(window.innerWidth >= 1100);
    renderEmpty();
  }

  function setPanelOpen(open) {
    document.body.classList.toggle('dict-open', open);
    if (open && state === 'idle') loadData();
  }

  function panelStatus(text) {
    if (panelState) {
      panelState.textContent = text;
      panelState.hidden = text.length === 0;
    }
  }

  function renderEmpty() {
    panelBody.textContent = '';
    var p = document.createElement('p');
    p.className = 'dict-hint';
    p.textContent = 'Type in the roman box — meanings for each suggestion appear here as you go. Suggestions the dictionary does not know are marked, so you can still judge them by ear.';
    panelBody.appendChild(p);
  }

  function entryBlock(word, num, entry, modern) {
    var block = document.createElement('section');
    block.className = 'dict-entry';

    var h = document.createElement('div');
    h.className = 'dict-entry-head';
    if (num !== null) {
      var badge = document.createElement('span');
      badge.className = 'dict-num';
      badge.textContent = String(num);
      h.appendChild(badge);
    }
    var w = document.createElement('span');
    w.className = 'dict-word odia';
    w.textContent = word;
    h.appendChild(w);

    var tag = document.createElement('span');
    tag.className = 'dict-tag';
    if (!entry && !modern) {
      tag.textContent = 'no entry';
      tag.classList.add('dict-tag-none');
    } else if (entry && entry.how === 'stem') {
      tag.textContent = '≈ stem';
    } else if (entry && entry.how === 'prefix') {
      tag.textContent = '≈ begins with';
    }
    if (tag.textContent) h.appendChild(tag);
    block.appendChild(h);

    if (modern && modern.lines.length) {
      var mbox = document.createElement('div');
      mbox.className = 'dict-modern';
      for (var i = 0; i < modern.lines.length; i++) {
        var line = modern.lines[i];
        var row = document.createElement('div');
        row.className = 'dict-modern-row';
        var lab = document.createElement('span');
        lab.className = 'dict-modern-tag dict-modern-tag-' + line.tag;
        lab.textContent = line.tag === 'loan' ? 'loan'
          : line.tag === 'cldr' ? 'name' : 'modern';
        lab.title = MODERN_LABEL[line.tag] || line.tag;
        var val = document.createElement('span');
        val.className = 'dict-modern-gloss';
        val.textContent = (modern.how !== 'exact' ? '≈ ' : '') + line.gloss;
        row.appendChild(lab);
        row.appendChild(val);
        mbox.appendChild(row);
      }
      block.appendChild(mbox);
    }

    if (entry) {
      var def = document.createElement('div');
      def.className = 'dict-def odia';
      def.textContent = defAt(P, entry.index);
      block.appendChild(def);
    }
    return block;
  }

  function renderCandidates() {
    if (!panelBody) return;
    if (state !== 'ready') { if (state === 'idle') loadData(); return; }
    if (lastCandidates.length === 0) { renderEmpty(); return; }
    panelBody.textContent = '';
    var label = document.createElement('p');
    label.className = 'dict-hint';
    label.textContent = 'Suggestions under the caret:';
    panelBody.appendChild(label);
    for (var i = 0; i < lastCandidates.length; i++) {
      var c = lastCandidates[i];
      panelBody.appendChild(entryBlock(c.text, c.num, lookup(c.text), lookupModern(c.text)));
    }
  }

  function onSearch() {
    var q = searchInput.value.trim();
    if (state !== 'ready') { loadData(); return; }
    if (q.length === 0) { renderCandidates(); return; }
    panelBody.textContent = '';
    var entry = lookup(q);
    var modern = lookupModern(q);
    var label = document.createElement('p');
    label.className = 'dict-hint';
    label.textContent = (entry || modern) ? 'Search result:' : 'Nothing found for that spelling.';
    panelBody.appendChild(label);
    if (entry || modern) panelBody.appendChild(entryBlock(q, null, entry, modern));
  }

  function refreshAll() {
    if (searchInput && searchInput.value.trim().length > 0) onSearch();
    else renderCandidates();
    reglossInline();
    augmentPicker();
  }

  /* ------------------------------------------------------------ *
   * DOM augmentation — candidate bar, picker, output words.
   * ------------------------------------------------------------ */

  var inlineBox = null;
  var augmenting = false;

  function reglossInline() {
    /* After the data becomes ready, glosses may already be missing from the
     * currently-shown bar; strip our marks and redo. */
    if (!inlineBox) return;
    var old = inlineBox.querySelectorAll('.dict-gloss');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    augmentInlineBar();
  }

  function augmentInlineBar() {
    if (!inlineBox || inlineBox.hidden || augmenting) return;
    augmenting = true;
    try {
      var buttons = inlineBox.querySelectorAll('button.inline-candidate');
      var next = [];
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var textEl = btn.querySelector('.inline-text');
        if (!textEl) continue;
        var word = textEl.textContent || '';
        next.push({ text: word, num: i + 1 });
        if (btn.querySelector('.dict-gloss')) continue;
        var g = state === 'ready' ? chipFor(word) : null;
        var span = document.createElement('span');
        span.className = 'dict-gloss' + (g ? '' : ' dict-gloss-none');
        span.textContent = g ? g : '·';
        btn.appendChild(span);
      }
      lastCandidates = next;
    } finally {
      augmenting = false;
    }
    if (!searchInput || searchInput.value.trim().length === 0) renderCandidates();
    if (state === 'idle') loadData();
  }

  var pickerAugmenting = false;
  function augmentPicker() {
    var list = document.getElementById('picker-list');
    if (!list || pickerAugmenting) return;
    pickerAugmenting = true;
    try {
      var rows = list.querySelectorAll('button.candidate');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.querySelector('.dict-gloss')) continue;
        var textEl = row.querySelector('.text');
        if (!textEl) continue;
        var g = state === 'ready' ? chipFor(textEl.textContent || '') : null;
        if (!g) continue;
        var span = document.createElement('span');
        span.className = 'dict-gloss dict-gloss-picker';
        span.textContent = g;
        row.appendChild(span);
      }
    } finally {
      pickerAugmenting = false;
    }
  }

  var outputTimer = null;
  function augmentOutput() {
    if (state !== 'ready') return;
    if (outputTimer) return;
    outputTimer = setTimeout(function () {
      outputTimer = null;
      var out = document.getElementById('output');
      if (!out) return;
      var words = out.querySelectorAll('.word');
      for (var i = 0; i < words.length; i++) {
        var el = words[i];
        if (el.getAttribute('data-glossed') === '1') continue;
        el.setAttribute('data-glossed', '1');
        var g = chipFor(el.textContent || '');
        if (g) el.title = g;
      }
    }, 120);
  }

  /* ------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------ */

  function debounce(fn, ms) {
    var t = null;
    return function () {
      if (t) clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function attachInlineBox() {
    if (inlineBox) return true;
    var box = document.querySelector('div.inline-candidates');
    if (!box) return false;
    inlineBox = box;
    new MutationObserver(function () { augmentInlineBar(); })
      .observe(box, { childList: true, attributes: true, attributeFilter: ['hidden'] });
    augmentInlineBar();
    return true;
  }

  function observe() {
    /* The candidate bar is appended to <body> by the app's module script.
     * Depending on load order it may already exist — check now, and also
     * watch <body> in case it appears later. */
    if (!attachInlineBox()) {
      var bodyObserver = new MutationObserver(function () {
        if (attachInlineBox()) bodyObserver.disconnect();
      });
      bodyObserver.observe(document.body, { childList: true });
    }

    var picker = document.getElementById('picker-list');
    if (picker) {
      new MutationObserver(function () { augmentPicker(); })
        .observe(picker, { childList: true });
    }

    var out = document.getElementById('output');
    if (out) {
      new MutationObserver(function () { augmentOutput(); })
        .observe(out, { childList: true, subtree: true });
    }
  }

  function boot() {
    try {
      buildPanel();
      observe();
      setTimeout(loadData, 400);
    } catch (err) {
      /* The dictionary must never take the app down. */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
