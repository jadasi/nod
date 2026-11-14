import {
  answerBanner,
  createSseParser,
  defaultCountdown,
  formatAge,
  formatCountdown,
  safeUrl,
  sortInbox,
} from '/lib.js';
import { setPixelText } from '/pixel.js';

const TOKEN_KEY = 'nod.deviceToken';
const $ = (sel) => document.querySelector(sel);

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  tab: 'inbox',
  openId: null,
  inbox: [],
  repair: [],
  updates: [],
  status: null,
  skew: 0, // server clock minus local clock, ms
  error: '',
  busy: false,
  other: '',
  closed: null, // the open decision once it has left the lists (delivered, withdrawn, ...)
};

const now = () => Date.now() + state.skew;

/** Tiny hyperscript. Uses textContent only: decision text comes from agents and is untrusted. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ------------------------------------------------------------------ API

class AuthError extends Error {}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      authorization: `Bearer ${state.token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const date = res.headers.get('date');
  if (date) state.skew = new Date(date).getTime() - Date.now();
  if (res.status === 401) throw new AuthError('Invalid device token');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `Request failed (${res.status})`);
  return json;
}

async function refresh() {
  try {
    const [inbox, repair, updates, status] = await Promise.all([
      api('/v1/decisions?view=inbox'),
      api('/v1/decisions?view=repair'),
      api('/v1/updates?limit=50'),
      api('/v1/status'),
    ]);
    state.inbox = sortInbox(inbox.decisions);
    state.repair = repair.decisions;
    state.updates = updates.updates;
    state.status = status;
    state.error = '';
    state.closed = null;
    const id = state.openId;
    if (id && ![...state.inbox, ...state.repair].some((x) => x.id === id)) {
      state.closed = await api(`/v1/decisions/${id}`).catch(() => null);
    }
  } catch (e) {
    if (e instanceof AuthError) return signOut(e.message);
    state.error = e.message;
  }
  render();
}

async function act(path, body) {
  state.busy = true;
  state.error = '';
  render();
  try {
    await api(path, { method: 'POST', body: { surface: 'web', ...body } });
  } catch (e) {
    state.error = e.message;
  }
  state.busy = false;
  await refresh();
}

// ------------------------------------------------------------------ live updates

let sseAbort = null;
function setConn(live) {
  $('#conn').classList.toggle('live', live);
}

/** fetch-based SSE, because EventSource can't send an Authorization header. */
async function connect() {
  sseAbort?.abort();
  if (!state.token) return;
  const ctl = (sseAbort = new AbortController());
  let delay = 1000;
  while (!ctl.signal.aborted) {
    try {
      const res = await fetch('/v1/events', {
        headers: { authorization: `Bearer ${state.token}` },
        signal: ctl.signal,
      });
      if (res.status === 401) return signOut('Invalid device token');
      if (!res.ok || !res.body) throw new Error('stream failed');
      setConn(true);
      delay = 1000;
      await refresh(); // anything missed while disconnected
      const parse = createSseParser();
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (parse(value).some((e) => e.event !== 'ready')) void refresh();
      }
    } catch {
      /* fall through to reconnect */
    }
    setConn(false);
    if (ctl.signal.aborted) return;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 15000);
  }
}

function signOut(message = '') {
  sseAbort?.abort();
  localStorage.removeItem(TOKEN_KEY);
  state.token = '';
  state.error = message;
  setConn(false);
  render();
}

// ------------------------------------------------------------------ views

/** A pixel icon from tokens.css. Decorative: the text next to it carries the meaning. */
const icon = (name, size = '') =>
  h('span', { class: `icon icon-${name} ${size}`, 'aria-hidden': 'true' });

/** A small HUD label, e.g. "IMPACT". */
const label = (text, tag = 'h3') => h(tag, { class: 'label' }, text);

/** A pixel-font heading with the same words for screen readers. */
function pixelHeading(text, tag = 'h2') {
  const el = h(tag, { class: 'pixel-heading' });
  setPixelText(el, text, { scale: 2 });
  return el;
}

function tags(d) {
  return h(
    'div',
    { class: 'tags' },
    d.urgency === 'urgent' && h('span', { class: 'tag urgent' }, icon('alert', 'sm'), 'Urgent'),
    d.provenance.kind === 'external' &&
      h(
        'span',
        { class: 'tag external' },
        icon('mail', 'sm'),
        `From external: ${d.provenance.origin || 'unknown'}`,
      ),
    d.risk === 'write' &&
      h('span', { class: 'tag write' }, icon('write', 'sm'), 'Changes something'),
    d.answer && h('span', { class: 'tag sending' }, icon('check', 'sm'), 'Answered'),
    h(
      'span',
      { class: 'tag source' },
      icon('source', 'sm'),
      [d.source.system, d.source.agent].filter(Boolean).join(' · '),
    ),
  );
}

function card(d) {
  const open = () => {
    state.openId = d.id;
    state.other = '';
    render();
  };
  return h(
    'div',
    {
      class: `card link${d.urgency === 'urgent' ? ' urgent' : ''}`,
      'data-id': d.id,
      role: 'button',
      tabindex: '0',
      onclick: open,
      onkeydown: (e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        open();
      },
    },
    h(
      'div',
      { class: 'card-body' },
      tags(d),
      h('h2', {}, d.glance.title),
      h('p', { class: 'question' }, d.glance.question),
      h('div', { class: 'live-banner', 'data-decision': d.id }),
    ),
    icon('chevron-right', 'card-go'),
  );
}

function banner(d) {
  const b = answerBanner(d.answer, now());
  if (!b) return null;
  const icons = {
    undo: 'clock',
    sending: 'send',
    done: 'check',
    held: 'alert',
    stale: 'stale',
    failed: 'close',
  };
  // Draining bar for the undo window: starts at the fraction left now and empties when it ends.
  let meter = null;
  if (b.kind === 'undo') {
    const end = new Date(d.answer.deliver_after).getTime();
    const total = Math.max(1, end - new Date(d.answer.answered_at).getTime());
    const left = Math.max(0, end - now());
    meter = h(
      'div',
      { class: 'meter', 'aria-hidden': 'true' },
      h('div', {
        class: 'meter-fill',
        style: `--from: ${Math.min(1, left / total).toFixed(4)}; --left: ${left}ms`,
      }),
    );
  }
  return h(
    'div',
    { class: `banner ${b.kind}`, 'data-banner': b.kind },
    h('span', { class: 'banner-text' }, b.text),
    icon(icons[b.kind] ?? 'alert', 'banner-icon'),
    b.canUndo &&
      h(
        'button',
        {
          class: 'btn small',
          onclick: (e) => {
            e.stopPropagation();
            void act(`/v1/decisions/${d.id}/undo`);
          },
        },
        icon('undo', 'sm'),
        'Undo',
      ),
    meter,
  );
}

function evidence(d) {
  if (!d.evidence.length && !d.tried) return null;
  return h(
    'details',
    { class: 'evidence' },
    h(
      'summary',
      {},
      icon('evidence', 'sm'),
      h('span', {}, 'Technical evidence'),
      h('span', { class: 'evidence-count' }, String(d.evidence.length)),
      icon('chevron-down', 'sm disclosure'),
    ),
    h(
      'div',
      { class: 'evidence-body' },
      d.tried && h('p', {}, h('span', { class: 'label inline' }, 'Already tried'), d.tried),
      d.evidence.map((ev) => {
        const url = ev.url && safeUrl(ev.url);
        return h(
          'div',
          { class: 'evidence-item' },
          url
            ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, ev.label)
            : h('span', { class: 'evidence-label' }, ev.label),
          ev.text && h('pre', {}, ev.text),
        );
      }),
      h(
        'div',
        { class: 'meta' },
        `Resources: ${d.resources.join(', ') || 'none'} · fingerprint source: ${d.source.ref}`,
      ),
    ),
  );
}

function backButton() {
  return h(
    'button',
    {
      class: 'back',
      onclick: () => {
        state.openId = null;
        render();
      },
    },
    icon('back', 'sm'),
    'Back',
  );
}

function detail(d) {
  const canAnswer = d.status === 'open' && !d.answer;
  const left = defaultCountdown(d, now());
  const stale = d.freshness.stale;
  return h(
    'div',
    { class: 'detail' },
    backButton(),
    h(
      'article',
      { class: `panel decision${d.urgency === 'urgent' ? ' urgent' : ''}` },
      tags(d),
      h('h2', { class: 'detail-title' }, d.glance.title),
      label('Impact'),
      h('p', { class: 'impact' }, d.impact),
      banner(d),
      d.status_reason &&
        h('div', { class: 'banner stale' }, h('span', {}, d.status_reason), icon('stale')),
      canAnswer && label('Your call'),
      canAnswer &&
        h(
          'div',
          { class: 'options' },
          d.options.map((o) =>
            h(
              'button',
              {
                class: `btn option${o.id === d.recommended ? ' primary' : ''}`,
                disabled: state.busy,
                'data-option': o.id,
                onclick: () => act(`/v1/decisions/${d.id}/answer`, { option_id: o.id }),
              },
              icon('chevron-right', 'sm cursor'),
              h(
                'span',
                { class: 'option-text' },
                h(
                  'span',
                  { class: 'label' },
                  o.label,
                  o.id === d.recommended &&
                    h('span', { class: 'rec' }, icon('star', 'sm'), 'Recommended'),
                ),
                h(
                  'span',
                  { class: 'outcome' },
                  o.outcome + (o.writes ? ' (changes something)' : ''),
                ),
              ),
            ),
          ),
        ),
      canAnswer &&
        d.allow_other &&
        h(
          'div',
          { class: 'other' },
          h('label', { class: 'label', for: 'other-text' }, icon('other', 'sm'), 'Other'),
          h(
            'textarea',
            {
              id: 'other-text',
              rows: 2,
              placeholder: 'Other: tell the agent what to do instead',
              oninput: (e) => {
                state.other = e.target.value;
              },
            },
            state.other,
          ),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'btn small',
                disabled: state.busy,
                onclick: () =>
                  state.other.trim() &&
                  act(`/v1/decisions/${d.id}/answer`, { other_text: state.other.trim() }),
              },
              icon('send', 'sm'),
              'Send other answer',
            ),
          ),
        ),
      left != null &&
        d.status === 'open' &&
        h(
          'div',
          { class: 'meta default' },
          icon('clock', 'sm'),
          h(
            'span',
            { 'data-default': '' },
            `If you don't answer, "${d.options.find((o) => o.id === d.default.option)?.label ?? d.default.option}" happens in ${formatCountdown(left)}`,
          ),
        ),
      h(
        'div',
        { class: `meta fresh${stale ? ' stale' : ''}`, 'data-fresh': '' },
        icon(stale ? 'stale' : 'live', 'sm'),
        `checked ${formatAge(d.freshness.age_seconds)} ago`,
        h(
          'button',
          { class: 'btn small', onclick: () => act(`/v1/decisions/${d.id}/refresh`) },
          icon('refresh', 'sm'),
          'Refresh',
        ),
      ),
      ['stale', 'failed', 'queued'].includes(d.status) &&
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            { class: 'btn small', onclick: () => act(`/v1/decisions/${d.id}/reask`) },
            icon('agent', 'sm'),
            'Ask the agent again',
          ),
          h(
            'button',
            { class: 'btn small danger', onclick: () => act(`/v1/decisions/${d.id}/withdraw`) },
            icon('close', 'sm'),
            'Withdraw',
          ),
        ),
      evidence(d),
    ),
  );
}

function emptyState(iconName, title, text) {
  return h(
    'div',
    { class: 'empty' },
    icon(iconName, 'lg'),
    pixelHeading(title, 'p'),
    h('p', {}, text),
  );
}

function updatesView() {
  if (!state.updates.length) return emptyState('updates', 'Quiet', 'No updates yet.');
  return h(
    'ol',
    { class: 'updates' },
    state.updates.map((u) =>
      h(
        'li',
        { class: 'update' },
        icon('updates', 'sm'),
        h(
          'div',
          {},
          h('strong', {}, u.title),
          u.body && h('div', {}, u.body),
          h(
            'small',
            {},
            `${u.source_system} · ${u.project ? u.project + ' · ' : ''}${new Date(u.created_at).toLocaleString()}`,
          ),
        ),
      ),
    ),
  );
}

function loginView() {
  const input = h('input', {
    id: 'token',
    type: 'password',
    placeholder: 'Device token',
    autocomplete: 'current-password',
    'aria-describedby': 'token-help',
    'aria-invalid': state.error ? 'true' : false,
  });
  const go = () => {
    const t = input.value.trim();
    if (!t) return;
    state.token = t;
    localStorage.setItem(TOKEN_KEY, t);
    state.error = '';
    start();
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  return h(
    'div',
    { class: 'panel login' },
    h('div', { class: 'login-head' }, icon('key', 'lg'), pixelHeading('Sign in')),
    h('label', { class: 'label', for: 'token' }, 'Device token'),
    input,
    h(
      'p',
      { id: 'token-help', class: 'help' },
      'Enter your device token. It stays in this browser only.',
    ),
    state.error && h('p', { class: 'err', role: 'alert' }, icon('alert', 'sm'), state.error),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary small', onclick: go }, icon('key', 'sm'), 'Sign in'),
    ),
  );
}

const TAB_TITLES = { inbox: 'Inbox', repair: 'Stale & conflicts', updates: 'Updates' };

function render() {
  const view = $('#view');
  const signedIn = !!state.token;
  $('#tabs').hidden = !signedIn;
  const mode = $('#mode');
  mode.hidden = !(signedIn && state.status?.delivery_mode === 'dry_run');
  mode.textContent = 'Dry-run mode: answers are held and logged, not written to sources.';
  $('#count-inbox').textContent = state.inbox.length || '';
  $('#count-repair').textContent = state.repair.length || '';
  setPixelText($('#hud-count'), signedIn ? String(state.inbox.length).padStart(2, '0') : '--', {
    scale: 3,
  });
  document
    .querySelectorAll('#tabs button')
    .forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  document
    .querySelectorAll('#tabs button')
    .forEach((b) =>
      b.dataset.tab === state.tab
        ? b.setAttribute('aria-current', 'page')
        : b.removeAttribute('aria-current'),
    );

  let content;
  if (!signedIn) content = loginView();
  else if (state.openId) {
    const d = [...state.inbox, ...state.repair].find((x) => x.id === state.openId) ?? state.closed;
    content = d
      ? detail(d)
      : h(
          'div',
          { class: 'detail' },
          backButton(),
          emptyState('inbox', 'Closed', 'This decision is no longer waiting on you.'),
        );
  } else {
    const list =
      state.tab === 'repair' ? state.repair : state.tab === 'inbox' ? state.inbox : state.updates;
    const head = h(
      'div',
      { class: 'view-head' },
      pixelHeading(TAB_TITLES[state.tab]),
      h(
        'span',
        { class: 'label' },
        `${list.length} ${state.tab === 'updates' ? 'recent' : 'waiting'}`,
      ),
    );
    if (state.tab === 'updates') content = [head, updatesView()];
    else
      content = [
        head,
        list.length
          ? h('div', { class: 'list' }, list.map(card))
          : state.tab === 'repair'
            ? emptyState('stale', 'All fresh', 'Nothing stale or in conflict.')
            : emptyState('inbox', 'All clear', 'Nothing is waiting on you.'),
      ];
  }
  view.replaceChildren(
    ...[
      state.error && signedIn
        ? h('p', { class: 'err', role: 'alert' }, icon('alert', 'sm'), state.error)
        : null,
      content,
    ]
      .flat()
      .filter(Boolean),
  );
  tick();
}

/** HUD clock and date. Local time, display only. */
function clock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  setPixelText($('#clock'), `${hh}:${mm}`, { scale: 2 });
  setPixelText($('#hud-clock'), `${hh}:${mm}`, { scale: 7, dot: 0.78 });
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  setPixelText($('#hud-date'), `${day} ${d.getDate()} ${month}`, { scale: 2 });
}

/** Updates countdown text in place every second without rebuilding (and losing focus in) the page. */
function tick() {
  const t = now();
  const all = [...state.inbox, ...state.repair];
  document.querySelectorAll('.live-banner').forEach((el) => {
    const d = all.find((x) => x.id === el.dataset.decision);
    const b = d && answerBanner(d.answer, t);
    el.textContent = b && b.kind === 'undo' ? b.text : '';
  });
  const open = state.openId && all.find((x) => x.id === state.openId);
  if (open) {
    const bEl = document.querySelector('[data-banner]');
    const b = answerBanner(open.answer, t);
    if (bEl && b && b.kind === 'undo') bEl.firstChild.textContent = b.text;
    else if (bEl && b && b.canUndo === false && bEl.dataset.banner === 'undo') void refresh(); // window just ended
    const def = document.querySelector('[data-default]');
    const left = defaultCountdown(open, t);
    if (def && left != null) {
      def.textContent = def.textContent.replace(/in \d+:\d\d$/, `in ${formatCountdown(left)}`);
    }
  }
}

document.querySelectorAll('#tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    state.openId = null;
    render();
  }),
);

function start() {
  clock();
  render();
  if (state.token) {
    void refresh();
    void connect();
  }
}

setInterval(tick, 1000);
setInterval(clock, 1000);
setPixelText($('#wordmark'), 'NOD', { scale: 3 });
start();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
