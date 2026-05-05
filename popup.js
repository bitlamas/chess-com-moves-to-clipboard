'use strict';

const DEFAULTS = { format: 'pairs', notation: 'san' };

const fmtSel = document.getElementById('format');
const notSel = document.getElementById('notation');
const btn = document.getElementById('copy');
const statusEl = document.getElementById('status');

async function loadSettings() {
  // Clear any leftover badge from a prior popup session.
  // (We don't auto-clear via setTimeout: the popup closes on focus loss
  // and the timer dies with it. Next-open clear is the reliable path.)
  try { await browser.action.setBadgeText({ text: '' }); } catch (_) {}
  try {
    const stored = await browser.storage.local.get(DEFAULTS);
    fmtSel.value = stored.format ?? DEFAULTS.format;
    notSel.value = stored.notation ?? DEFAULTS.notation;
  } catch (_) {
    fmtSel.value = DEFAULTS.format;
    notSel.value = DEFAULTS.notation;
  }
}

async function saveSettings() {
  await browser.storage.local.set({
    format: fmtSel.value,
    notation: notSel.value,
  });
}

async function flashBadge(text, color) {
  try {
    await browser.action.setBadgeBackgroundColor({ color });
    await browser.action.setBadgeText({ text });
  } catch (_) { /* badge non-critical */ }
}

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = kind || '';
}

// Injected into the active tab. Pure function — receives all inputs as args.
// Must not reference any popup-scope identifier (runs in the page's isolated world).
function extractMoves({ format, notation }) {
  const root = document.querySelector('[data-cy="move-list"]');
  if (!root) return { ok: false, reason: 'no_moves' };

  // Prefer the data-attribute contract; fall back to the class for older DOMs.
  let rows = root.querySelectorAll('[data-whole-move-number]');
  if (!rows.length) rows = root.querySelectorAll('.main-line-row');
  // Include the result row by class — it has no whole-move-number attribute.
  const resultRow = root.querySelector('.result-row .game-result');

  if (!rows.length && !resultRow) return { ok: false, reason: 'no_moves' };

  const FIG = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };
  const FIG_RE = /^[KQRBNP]$/;

  // Strip control chars, bidi overrides, zero-width chars from page-derived text.
  // Defends the clipboard against paste-jacking via hostile DOM on any chess.com origin.
  const sanitize = (s) => (s == null ? s : String(s)
    .replace(/[\x00-\x1F\x7F]/g, '')              // C0 controls + DEL
    .replace(/[‪-‮⁦-⁩]/g, '') // bidi overrides + isolates
    .replace(/[​-‏﻿]/g, ''));      // zero-width + BOM

  const moveText = (node) => {
    if (!node) return null;
    const hl = node.querySelector('.node-highlight-content');
    if (!hl) return null;
    const figEl = hl.querySelector('[data-figurine]');
    const rawLetter = figEl?.dataset.figurine ?? '';
    const letter = FIG_RE.test(rawLetter) ? rawLetter : '';
    // Read text from non-figurine descendants only, then trim — don't
    // collapse internal whitespace (would mask future tokens like NAGs).
    const body = sanitize(
      Array.from(hl.childNodes)
        .filter((n) => n !== figEl)
        .map((n) => n.textContent)
        .join('')
        .trim()
    );
    if (!body) return null;
    if (!letter) return body;
    const prefix = notation === 'figurine' ? (FIG[letter] || letter) : letter;
    return prefix + body;
  };

  const clkText = (raw) => {
    const ds = Number(raw);
    if (!Number.isInteger(ds) || ds < 0) return null;
    const total = Math.round(ds / 10); // chess.com data-time is deciseconds
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  const moves = [];
  for (const row of rows) {
    const num = Number(row.dataset.wholeMoveNumber);
    if (!Number.isInteger(num) || num < 1) continue;
    const w = moveText(row.querySelector('.white-move'));
    const b = moveText(row.querySelector('.black-move'));
    if (!w && !b) continue;
    let wt = null;
    let bt = null;
    if (format === 'pgn-clk') {
      const wEl = row.querySelector('.time-white');
      const bEl = row.querySelector('.time-black');
      if (wEl?.dataset.time) wt = clkText(wEl.dataset.time);
      if (bEl?.dataset.time) bt = clkText(bEl.dataset.time);
    }
    moves.push({ num, w, b, wt, bt });
  }

  const result = resultRow ? sanitize(resultRow.textContent.trim()) : null;

  if (!moves.length && !result) return { ok: false, reason: 'no_moves' };

  // Token builder: yields ['1.', 'd4', 'd5'] or ['5...', 'e5'] etc.,
  // optionally interleaving '{[%clk ...]}' comments.
  const tokensFor = (m, withClk) => {
    const numStr = m.w ? m.num + '.' : m.num + '...';
    const out = [numStr];
    if (m.w) {
      out.push(m.w);
      if (withClk && m.wt) out.push('{[%clk ' + m.wt + ']}');
    }
    if (m.b) {
      out.push(m.b);
      if (withClk && m.bt) out.push('{[%clk ' + m.bt + ']}');
    }
    return out;
  };

  let text;
  if (format === 'pairs') {
    const lines = moves.map((m) => tokensFor(m, false).join(' '));
    if (result) lines.push(result);
    text = lines.join('\n');
  } else if (format === 'pgn-line') {
    const parts = [];
    for (const m of moves) parts.push(...tokensFor(m, false));
    if (result) parts.push(result);
    text = parts.join(' ');
  } else { // pgn-clk
    const parts = [];
    for (const m of moves) parts.push(...tokensFor(m, true));
    if (result) parts.push(result);
    text = parts.join(' ');
  }

  return { ok: true, text, count: moves.length };
}

function isChessComUrl(url) {
  let u;
  try { u = new URL(url || ''); } catch (_) { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  return host === 'chess.com' || host === 'www.chess.com' || host.endsWith('.chess.com');
  // Path-allow-listing is intentionally NOT done here: the user opted into
  // "all chess.com pages with a move list", and extractMoves no-ops cleanly
  // when no list is present, which is the second gate.
}

async function copyMoves() {
  setStatus('Working…', '');
  btn.disabled = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || !isChessComUrl(tab.url)) {
      setStatus('Not a Chess.com page.', 'err');
      flashBadge('✗', '#cc3333');
      return;
    }

    let results;
    try {
      results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractMoves,
        args: [{ format: fmtSel.value, notation: notSel.value }],
        world: 'ISOLATED',
      });
    } catch (injectErr) {
      console.error('[chess-moves-clipboard] inject failed', injectErr);
      setStatus('Cannot read this page (try reloading).', 'err');
      flashBadge('✗', '#cc3333');
      return;
    }

    const result = results?.[0]?.result;
    if (!result || !result.ok) {
      setStatus('No move list found on this page.', 'err');
      flashBadge('✗', '#cc3333');
      return;
    }

    await navigator.clipboard.writeText(result.text);
    const noun = result.count === 1 ? 'move' : 'moves';
    setStatus('Copied ' + result.count + ' ' + noun + '.', 'ok');
    flashBadge('✓', '#2d8f47');
  } catch (err) {
    console.error('[chess-moves-clipboard]', err);
    setStatus('Could not copy moves.', 'err');
    flashBadge('✗', '#cc3333');
  } finally {
    btn.disabled = false;
  }
}

loadSettings().catch((e) => console.error('[chess-moves-clipboard]', e));
fmtSel.addEventListener('change', saveSettings);
notSel.addEventListener('change', saveSettings);
btn.addEventListener('click', copyMoves);
