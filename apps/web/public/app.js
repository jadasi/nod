import {
  answerBanner,
  createSseParser,
  defaultCountdown,
  formatAge,
  formatCountdown,
  safeUrl,
  sortInbox,
} from '/lib.js';

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

function tags(d) {
  return h(
    'div',
    { class: 'tags' },
    d.urgency === 'urgent' && h('span', { class: 'tag urgent' }, 'Urgent'),
    d.provenance.kind === 'external' &&
      h('span', { class: 'tag external' }, `From external: ${d.provenance.origin || 'unknown'}`),
    d.risk === 'write' && h('span', { class: 'tag write' }, 'Changes something'),
    d.answer && h('span', { class: 'tag sending' }, 'Answered'),
    h('span', { class: 'tag' }, d.source.system),
  );
}

function card(d) {
  return h(
    'div',
    {
      class: `card link${d.urgency === 'urgent' ? ' urgent' : ''}`,
      'data-id': d.id,
      onclick: () => {
        state.openId = d.id;
        state.other = '';
        render();
      },
    },
    h('h2', {}, d.glance.title),
    h('p', { class: 'question' }, d.glance.question),
    tags(d),
    h('div', { class: 'live-banner', 'data-decision': d.id }),
  );
}

function banner(d) {
  const b = answerBanner(d.answer, now());
  if (!b) return null;
  return h(
    'div',
    { class: `banner ${b.kind}`, 'data-banner': b.kind },
    h('span', {}, b.text),
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
        'Undo',
      ),
  );
}

function evidence(d) {
  if (!d.evidence.length && !d.tried) return null;
  return h(
    'details',
    {},
    h('summary', {}, 'Technical evidence'),
    d.tried && h('p', {}, `Already tried: ${d.tried}`),
    d.evidence.map((ev) => {
      const url = ev.url && safeUrl(ev.url);
      return h(
        'div',
        {},
        url
          ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, ev.label)
          : ev.label,
        ev.text && h('pre', {}, ev.text),
      );
    }),
    h(
      'div',
      { class: 'meta' },
      `Resources: ${d.resources.join(', ') || 'none'} · fingerprint source: ${d.source.ref}`,
    ),
  );
}

function detail(d) {
  const canAnswer = d.status === 'open' && !d.answer;
  const left = defaultCountdown(d, now());
  const stale = d.freshness.stale;
  return h(
    'div',
    {},
    h(
      'button',
      {
        class: 'back',
        onclick: () => {
          state.openId = null;
          render();
        },
      },
      '← Back',
    ),
    h('h2', {}, d.glance.title),
    tags(d),
    h('p', { class: 'impact' }, d.impact),
    banner(d),
    d.status_reason && h('div', { class: 'banner stale' }, d.status_reason),
    canAnswer &&
      d.options.map((o) =>
        h(
          'button',
          {
            class: `btn option${o.id === d.recommended ? ' primary' : ''}`,
            disabled: state.busy,
            'data-option': o.id,
            onclick: () => act(`/v1/decisions/${d.id}/answer`, { option_id: o.id }),
          },
          h(
            'span',
            { class: 'label' },
            o.label,
            o.id === d.recommended && h('span', { class: 'rec' }, 'Recommended'),
          ),
          h('span', { class: 'outcome' }, o.outcome + (o.writes ? ' (changes something)' : '')),
        ),
      ),
    canAnswer &&
      d.allow_other &&
      h(
        'div',
        {},
        h(
          'textarea',
          {
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
            'Send other answer',
          ),
        ),
      ),
    left != null &&
      d.status === 'open' &&
      h(
        'div',
        { class: 'meta', 'data-default': '' },
        `If you don't answer, "${d.options.find((o) => o.id === d.default.option)?.label ?? d.default.option}" happens in ${formatCountdown(left)}`,
      ),
    h(
      'div',
      { class: `meta${stale ? ' stale' : ''}`, 'data-fresh': '' },
      `checked ${formatAge(d.freshness.age_seconds)} ago`,
      h(
        'button',
        { class: 'btn small', onclick: () => act(`/v1/decisions/${d.id}/refresh`) },
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
          'Ask the agent again',
        ),
        h(
          'button',
          { class: 'btn small', onclick: () => act(`/v1/decisions/${d.id}/withdraw`) },
          'Withdraw',
        ),
      ),
    evidence(d),
  );
}

function updatesView() {
  if (!state.updates.length) return h('p', { class: 'empty' }, 'No updates yet.');
  return state.updates.map((u) =>
    h(
      'div',
      { class: 'update' },
      h('strong', {}, u.title),
      u.body && h('div', {}, u.body),
      h(
        'small',
        {},
        `${u.source_system} · ${u.project ? u.project + ' · ' : ''}${new Date(u.created_at).toLocaleString()}`,
      ),
    ),
  );
}

function loginView() {
  const input = h('input', {
    type: 'password',
    placeholder: 'Device token',
    autocomplete: 'current-password',
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
    {},
    h('p', {}, 'Enter your device token. It stays in this browser only.'),
    input,
    state.error && h('p', { class: 'err' }, state.error),
    h('div', { class: 'row' }, h('button', { class: 'btn primary small', onclick: go }, 'Sign in')),
  );
}

function render() {
  const view = $('#view');
  const signedIn = !!state.token;
  $('#tabs').hidden = !signedIn;
  const mode = $('#mode');
  mode.hidden = !(signedIn && state.status?.delivery_mode === 'dry_run');
  mode.textContent = 'Dry-run mode: answers are held and logged, not written to sources.';
  $('#count-inbox').textContent = state.inbox.length || '';
  $('#count-repair').textContent = state.repair.length || '';
  document
    .querySelectorAll('#tabs button')
    .forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));

  let content;
  if (!signedIn) content = loginView();
  else if (state.openId) {
    const d = [...state.inbox, ...state.repair].find((x) => x.id === state.openId) ?? state.closed;
    content = d
      ? detail(d)
      : h(
          'div',
          {},
          h(
            'button',
            {
              class: 'back',
              onclick: () => {
                state.openId = null;
                render();
              },
            },
            '← Back',
          ),
          h('p', { class: 'empty' }, 'This decision is no longer waiting on you.'),
        );
  } else if (state.tab === 'updates') content = updatesView();
  else {
    const list = state.tab === 'repair' ? state.repair : state.inbox;
    content = list.length
      ? list.map(card)
      : h(
          'p',
          { class: 'empty' },
          state.tab === 'repair' ? 'Nothing stale or in conflict.' : 'Nothing is waiting on you.',
        );
  }
  view.replaceChildren(
    ...[state.error && signedIn ? h('p', { class: 'err' }, state.error) : null, content]
      .flat()
      .filter(Boolean),
  );
  tick();
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
  render();
  if (state.token) {
    void refresh();
    void connect();
  }
}

setInterval(tick, 1000);
start();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
