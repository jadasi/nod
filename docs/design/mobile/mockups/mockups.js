// Static mockups of the Nod Android app. Design reference only: nothing here ships, and no data is
// real. Components come from apps/web/public/style.css, so the mockups use the real design system.
// screen.html?s=<id>&t=dark|light renders one phone; index.html renders every screen (contact sheet).
/* global document, location, Node, URLSearchParams */
import { pixelSvg } from '../../../../apps/web/public/pixel.js';

/** Tiny hyperscript, same shape as app.js. Text only, never innerHTML. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const icon = (name, size = '') =>
  h('span', { class: `icon icon-${name} ${size}`, 'aria-hidden': 'true' });
const illo = (name) => h('span', { class: `illo illo-${name}`, 'aria-hidden': 'true' });
const label = (text, tag = 'h3') => h(tag, { class: 'label' }, text);
function pixel(text, scale = 2, cls = 'pixel-heading', tag = 'h2') {
  const el = h(tag, { class: cls });
  el.append(pixelSvg(text, { scale }), h('span', { class: 'sr-only' }, text));
  return el;
}

// ------------------------------------------------------------------ sample data (fictional)

const D = {
  refund: {
    title: 'Run the refund migration now?',
    question: 'Fixes 212 double refunds. Run it now at peak traffic, or tonight at 11 pm?',
    impact:
      '212 customers were refunded twice last week. Running now fixes their balances in about 4 minutes but slows checkout for everyone while it runs. Tonight nobody notices, but those customers wait about 13 hours.',
    urgent: true,
    source: 'claude_code · billing-worktree',
    options: [
      ['Run tonight', 'Runs at 11:00 pm. Checkout unaffected; 212 customers wait ~13 h.', true],
      ['Run now', 'Balances fixed in ~4 min. Checkout ~200 ms slower meanwhile.'],
      ['Skip', 'Nothing runs. The agent writes up a manual fix instead.'],
    ],
  },
  acme: {
    title: "Reply to Acme Print's quote",
    question: 'They quoted $4,180 for 2,000 brochures by Friday. Accept, counter at $3,700, or pass?',
    impact:
      'The spring mailer goes out on time only if someone prints it by Friday. Acme is $480 over budget; the last two vendors came in at $3,600–3,900.',
    urgent: true,
    external: 'sales@acme-print.com',
    source: 'email_triage · hermes',
    options: [
      ['Counter at $3,700', 'Emails Acme a counter-offer. Delivery date unchanged.', true],
      ['Accept $4,180', 'Emails Acme to confirm. $480 over the mailer budget.'],
      ['Pass', 'Emails a polite no. Hermes asks two other printers.'],
    ],
  },
  jobs: {
    title: 'Ship the new job board?',
    question: 'QA passed 46 of 47 checks; one flaky Safari test. Ship today or hold a day?',
    source: 'paperclip · cto',
  },
  pricing: {
    title: 'Merge the pricing page copy',
    question: 'Docs bot rewrote three pricing paragraphs in PR #482. Merge or ask for changes?',
    source: 'github · docs-bot',
  },
  writer: {
    title: 'Hire a contract technical writer?',
    question: '$6k a month for three months. Post the role now or wait for Q1 budget?',
    source: 'paperclip · ceo',
  },
};

// ------------------------------------------------------------------ chrome

function sysbar(time = '9:41', { dim = false } = {}) {
  return h(
    'div',
    { class: `sysbar${dim ? ' on-wall' : ''}` },
    h('span', {}, time),
    h(
      'span',
      { class: 'sys-icons' },
      h('span', { class: 'signal' }),
      h('span', {}, '5G'),
      h('span', { class: 'battery' }),
    ),
  );
}
const gesture = () => h('div', { class: 'gesture' });

function appbar({ live = true, glasses = true, title, back = false } = {}) {
  return h(
    'header',
    { class: 'appbar' },
    back && h('span', { class: 'iconbtn ghost' }, icon('back')),
    title
      ? h('h1', { class: 'title' }, title)
      : h('h1', { class: 'wordmark' }, pixelSvg('NOD', { scale: 3 }), h('span', { class: 'sr-only' }, 'Nod')),
    !back &&
      h(
        'span',
        { class: `conn${live ? ' live' : ''}` },
        h('span', { class: 'conn-on' }, icon('live', 'sm'), 'Live'),
        h('span', { class: 'conn-off' }, icon('offline', 'sm'), 'Offline'),
      ),
    glasses && h('span', { class: 'iconbtn ghost', title: 'Glasses connected' }, icon('glasses')),
    h('span', { class: 'iconbtn', title: 'Call Me' }, icon('call')),
  );
}

// Three tabs. Inbox carries two badges: green = decisions that need you, amber = items that need
// attention (changed since you looked, failed delivery, queued behind a lock, agent stopped).
function bottomnav(active = 'inbox', { inbox = 4, attn = 3 } = {}) {
  const tab = (id, name, ic, badges = []) =>
    h(
      'a',
      { class: id === active ? 'active' : '' },
      icon(ic),
      name,
      badges.length > 0 &&
        h(
          'span',
          { class: 'navbadges' },
          badges.map(([n, warn]) => h('span', { class: `navbadge${warn ? ' warn' : ''}` }, String(n))),
        ),
    );
  const ib = [];
  if (inbox) ib.push([inbox, false]);
  if (attn) ib.push([attn, true]);
  return h(
    'nav',
    { class: 'bottomnav' },
    tab('inbox', 'Inbox', 'inbox', ib),
    tab('updates', 'Updates', 'updates'),
    tab('settings', 'Settings', 'gear'),
  );
}

/** Filter chips at the top of Inbox. */
function chips(active = 'all', { all = 8, you = 4, attn = 3 } = {}) {
  const chip = (id, text, n, warn) =>
    h(
      'span',
      { class: `chip${id === active ? ' on' : ''}${warn ? ' warn' : ''}` },
      warn && icon('stale', 'sm'),
      text,
      h('span', { class: 'chip-n' }, String(n)),
    );
  return h(
    'div',
    { class: 'chips' },
    chip('all', 'All', all),
    chip('you', 'Needs you', you),
    attn > 0 && chip('attn', 'Attention', attn, true),
  );
}

/** One amber row above the decisions: what needs repair, one tap to the Attention filter. */
function attentionStrip() {
  return h(
    'div',
    { class: 'attn-strip' },
    icon('stale', 'sm'),
    h(
      'div',
      { class: 'grow' },
      h('b', {}, '3 need attention'),
      h('small', {}, 'Changed since you looked · delivery failed · queued'),
    ),
    h('span', { class: 'attn-go' }, 'Review', icon('chevron-right', 'sm')),
  );
}

function tags(d, { answered = false } = {}) {
  return h(
    'div',
    { class: 'tags' },
    d.urgent && h('span', { class: 'tag urgent' }, icon('alert', 'sm'), 'Urgent'),
    d.external && h('span', { class: 'tag external' }, icon('mail', 'sm'), `From ${d.external}`),
    answered && h('span', { class: 'tag sending' }, icon('check', 'sm'), 'Answered'),
    h('span', { class: 'tag source' }, icon('source', 'sm'), d.source),
  );
}

function card(d, { answered = false, live = null, hover = false } = {}) {
  return h(
    'div',
    {
      class: `card${d.urgent ? ' urgent' : ''}${answered ? '' : ' needs-you'}${hover ? ' is-hover' : ''}`,
    },
    h(
      'div',
      { class: 'card-body' },
      tags(d, { answered }),
      h('h2', {}, d.title),
      h('p', { class: 'question' }, d.question),
      live && h('div', { class: 'live-banner' }, live),
    ),
  );
}

function meter(from) {
  return h(
    'div',
    { class: 'meter', 'aria-hidden': 'true' },
    h('div', { class: 'meter-fill static', style: `--from: ${from}` }),
  );
}

function undoBanner(text, from) {
  return h(
    'div',
    { class: 'banner undo' },
    h('span', { class: 'banner-text' }, text),
    icon('clock', 'banner-icon'),
    h('span', { class: 'btn small' }, icon('undo', 'sm'), 'Undo'),
    meter(from),
  );
}

function option([name, outcome, rec], { primary = rec, writes = false } = {}) {
  return h(
    'span',
    { class: `btn option${primary ? ' primary' : ''}` },
    icon('chevron-right', 'sm cursor'),
    h(
      'span',
      { class: 'option-text' },
      h(
        'span',
        { class: 'label' },
        name,
        rec && h('span', { class: 'rec' }, icon('star', 'sm'), 'Recommended'),
      ),
      h('span', { class: 'outcome' }, outcome + (writes ? ' (sends email)' : '')),
    ),
  );
}

function evidenceSummary(n) {
  return h(
    'div',
    { class: 'evidence' },
    h(
      'div',
      { class: 'summary' },
      icon('evidence', 'sm'),
      h('span', {}, 'Technical evidence'),
      h('span', { class: 'evidence-count' }, String(n)),
      icon('chevron-down', 'sm disclosure'),
    ),
  );
}

function phone(theme, ...kids) {
  return h('div', { class: 'phone', 'data-theme': theme }, ...kids);
}

// ------------------------------------------------------------------ app screens

function inbox(theme) {
  return phone(
    theme,
    sysbar(),
    appbar(),
    h(
      'main',
      { class: 'screen' },
      h(
        'div',
        { class: 'sec' },
        pixel('INBOX'),
        h('span', { class: 'label' }, '4 need you · 1 sending'),
      ),
      chips('all'),
      attentionStrip(),
      card(D.refund),
      card(D.acme),
      card(D.jobs),
      card(D.pricing, { answered: true, live: 'Sending "Merge" in 1:47' }),
      card(D.writer),
    ),
    bottomnav('inbox'),
    gesture(),
  );
}

function detailBody(d, { answered = null } = {}) {
  return [
    tags(d, { answered: !!answered }),
    h('h2', { class: 'detail-title' }, d.title),
    label('Impact'),
    h('p', { class: 'impact' }, d.impact),
  ];
}

function detail(theme) {
  const d = D.refund;
  return phone(
    theme,
    sysbar(),
    appbar({ back: true, title: 'Decision' }),
    h(
      'main',
      { class: 'screen' },
      h(
        'article',
        { class: 'panel decision urgent emph needs-you' },
        ...detailBody(d),
        label('Your call'),
        h(
          'div',
          { class: 'options' },
          d.options.map((o) => option(o)),
        ),
        h(
          'div',
          { class: 'meta default' },
          icon('clock', 'sm'),
          'If you say nothing: Run tonight, in 18 min',
        ),
        h(
          'div',
          { class: 'meta fresh' },
          icon('refresh', 'sm'),
          'Checked 40s ago',
          h('span', { class: 'btn small' }, 'Refresh'),
        ),
        evidenceSummary(3),
      ),
    ),
    h(
      'div',
      { class: 'bottom-dock split' },
      h('span', { class: 'btn' }, icon('other', 'sm'), 'Other answer'),
      h('span', { class: 'btn' }, icon('call', 'sm'), 'Talk it through'),
    ),
    gesture(),
  );
}

function undo(theme) {
  const d = D.refund;
  return phone(
    theme,
    sysbar(),
    appbar({ back: true, title: 'Decision' }),
    h(
      'main',
      { class: 'screen' },
      h(
        'article',
        { class: 'panel decision' },
        ...detailBody(d, { answered: true }),
        label('Your answer'),
        h(
          'div',
          { class: 'answer-row' },
          icon('check'),
          h(
            'div',
            {},
            h('b', {}, 'Run tonight'),
            h('small', {}, 'Runs at 11:00 pm. Checkout unaffected.'),
          ),
        ),
        h(
          'p',
          { class: 'help' },
          'Nod re-checks the source when the bar empties, then tells claude_code. If the migration plan changed in the meantime, it comes back to you instead.',
        ),
      ),
    ),
    h(
      'div',
      { class: 'bottom-dock' },
      undoBanner('Sending in 1:47', 0.89),
    ),
    gesture(),
  );
}

function external(theme) {
  const d = D.acme;
  return phone(
    theme,
    sysbar(),
    appbar({ back: true, title: 'Decision' }),
    h(
      'main',
      { class: 'screen' },
      h(
        'article',
        { class: 'panel decision urgent emph needs-you' },
        ...detailBody(d),
        h(
          'div',
          { class: 'callout' },
          h('b', {}, icon('mail', 'sm'), 'From outside: sales@acme-print.com'),
          h(
            'span',
            {},
            'Every option sends an email. Nod never answers this for you: no default, no rules, no one-tap answer from a notification.',
          ),
        ),
        label('Your call'),
        h(
          'div',
          { class: 'options' },
          d.options.map((o) => option(o, { primary: false, writes: true })),
        ),
        h('div', { class: 'meta' }, icon('clock', 'sm'), 'No default. This waits for you.'),
      ),
    ),
    h('div', { class: 'scrim' }),
    h(
      'section',
      { class: 'sheet emph' },
      h('span', { class: 'grab' }),
      label('Confirm before it sends', 'p'),
      h('h2', {}, 'Counter at $3,700'),
      h(
        'p',
        { class: 'help' },
        'To sales@acme-print.com, from your work address. You still get the 2-minute undo after this.',
      ),
      h(
        'pre',
        {},
        'Hi Dana, thanks for the quick quote. We can do $3,700 for the 2,000 brochures with Friday delivery. If that works, send the proof and we will approve it today.',
      ),
      h(
        'div',
        { class: 'sheet-actions' },
        h('span', { class: 'btn' }, 'Cancel'),
        h('span', { class: 'btn primary' }, icon('send', 'sm'), 'Send reply'),
      ),
    ),
    gesture(),
  );
}

function staleCard(d, kind, text, ic, actions, extra) {
  return h(
    'div',
    { class: 'card stale-card' },
    h(
      'div',
      { class: 'card-body' },
      tags(d),
      h('h2', {}, d.title),
      h('div', { class: `banner ${kind}` }, h('span', {}, text), icon(ic)),
      extra && h('div', { class: 'meta' }, extra),
      h(
        'div',
        { class: 'row' },
        actions.map(([t, i, cls = '']) => h('span', { class: `btn small ${cls}` }, icon(i, 'sm'), t)),
      ),
    ),
  );
}

// Inbox filtered to Attention (was the Stale tab before 2026-11-14).
function attention(theme) {
  return phone(
    theme,
    sysbar(),
    appbar(),
    h(
      'main',
      { class: 'screen' },
      h(
        'div',
        { class: 'sec' },
        pixel('INBOX'),
        h('span', { class: 'label' }, 'Showing attention · 3'),
      ),
      chips('attn'),
      staleCard(
        D.jobs,
        'stale',
        'Changed since you looked: QA now 47/47',
        'stale',
        [
          ['Re-ask', 'refresh'],
          ['Withdraw', 'close', 'danger'],
        ],
        'Your answer "Hold a day" was not sent.',
      ),
      staleCard(
        D.pricing,
        'failed',
        'Delivery failed: branch moved (409)',
        'close',
        [
          ['Retry', 'send'],
          ['Force refresh', 'refresh'],
        ],
        'Tried 3 times · last 9:36 am',
      ),
      staleCard(
        { title: 'Rotate the Stripe webhook secret?', source: 'claude_code · billing-worktree' },
        'held',
        'Queued behind the refund migration',
        'clock',
        [['Open', 'chevron-right']],
        'Both act on env:billing. Opens when that one is done.',
      ),
    ),
    bottomnav('inbox'),
    gesture(),
  );
}

function updates(theme) {
  const item = (ic, title, body, meta) =>
    h(
      'li',
      { class: 'update' },
      icon(ic, 'sm'),
      h('div', {}, h('strong', {}, title), body && h('div', {}, body), h('small', {}, meta)),
    );
  return phone(
    theme,
    sysbar('2:04'),
    appbar(),
    h(
      'main',
      { class: 'screen' },
      h('div', { class: 'sec' }, pixel('UPDATES'), h('span', { class: 'label' }, 'Next sweep 4:00 pm')),
      h(
        'div',
        { class: 'panel digest' },
        h('span', { class: 'label' }, icon('updates', 'sm'), '2:00 pm sweep · 6 areas'),
        h(
          'p',
          {},
          'Two things moved, nothing is blocked. The refund fix is scheduled for tonight and the job board shipped.',
        ),
      ),
      h(
        'ul',
        { class: 'updates' },
        item('check', 'Job board shipped', 'Live for all visitors since 1:12 pm.', 'paperclip · cto · 1:14 pm'),
        item('send', 'Pricing page copy merged', null, 'github · docs-bot · 12:40 pm'),
        item('clock', 'Refund migration scheduled for 11:00 pm', 'You chose Run tonight.', 'claude_code · 9:51 am'),
        item('agent', 'Hermes filed 4 invoices to Drive', null, 'email_triage · 9:02 am'),
        item('evidence', 'Overnight digest', '3 decisions waited overnight; 1 ran its default.', 'Nod · 8:00 am'),
      ),
    ),
    bottomnav('updates', { inbox: 2, attn: 0 }),
    gesture(),
  );
}

function settings(theme) {
  const row = (ic, title, sub, right) =>
    h(
      'div',
      { class: 'list-row' },
      icon(ic, 'sm'),
      h('div', { class: 'grow' }, h('span', {}, title), sub && h('small', {}, sub)),
      right,
    );
  const sw = (on = true) => h('span', { class: `switch${on ? ' on' : ''}` });
  const val = (t, ok) => h('span', { class: `value${ok ? ' ok' : ''}` }, t);
  return phone(
    theme,
    sysbar(),
    appbar({ title: 'Settings' }),
    h(
      'main',
      { class: 'screen settings' },
      label('This phone'),
      h(
        'div',
        { class: 'list-group' },
        row('key', 'Paired with nod-core', 'Pixel 9 · token ends 0001', val('Connected', true)),
        row(
          'auto',
          'Theme',
          null,
          h('span', { class: 'seg' }, h('span', { class: 'on' }, 'System'), h('span', {}, 'Light'), h('span', {}, 'Dark')),
        ),
      ),
      label('Notifications'),
      h(
        'div',
        { class: 'list-group' },
        row('alert', 'Urgent', 'Heads-up, sound, any hour', sw()),
        row('inbox', 'Decisions', 'Quiet after the first; batched', sw()),
        row('updates', 'Updates & digest', 'Silent', sw()),
        row('clock', 'Open hours', '8:00 am – 8:00 pm Phoenix · set on server', val('Now open')),
      ),
      label('Devices & voice'),
      h(
        'div',
        { class: 'list-group' },
        row('glasses', 'Even G2 glasses', 'Connected · R1 ring paired', val('On', true)),
        row('call', 'Call Me', 'Open hours only · $3.20 of $20 this month', sw()),
        row('power', 'Delivery mode', 'Server kill switch · read-only here', val('Live')),
      ),
    ),
    bottomnav('settings'),
    gesture(),
  );
}

function qr() {
  // A fake, decorative code: three finder squares and a seeded pattern. It encodes nothing.
  const n = 21;
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const finder = (x, y) => {
    for (const [fx, fy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      const dx = x - fx;
      const dy = y - fy;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
        const edge = dx === 0 || dy === 0 || dx === 6 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return edge || core ? 1 : 0;
      }
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) return 0;
    }
    return null;
  };
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const f = finder(x, y);
      const on = f == null ? rnd() > 0.52 : f === 1;
      cells.push(h('i', { class: on ? '' : 'o' }));
    }
  return h('div', { class: 'scanframe emph' }, h('div', { class: 'qr' }, cells));
}

function onboarding(theme) {
  return phone(
    theme,
    sysbar(),
    h(
      'main',
      { class: 'screen flush' },
      h(
        'div',
        { class: 'onboard' },
        h('div', { class: 'wordmark big' }, pixelSvg('NOD', { scale: 5 })),
        pixel('PAIR THIS PHONE'),
        h(
          'p',
          { class: 'help' },
          'Nod runs on your own server. Pair once and this phone gets its own device token.',
        ),
        h(
          'ol',
          { class: 'steps' },
          h('li', {}, 'On your desk, open Nod → Settings → Pair a phone.'),
          h('li', {}, 'Point this camera at the code it shows.'),
        ),
        qr(),
        h('span', { class: 'btn primary' }, icon('key', 'sm'), 'Scan pairing code'),
        h('span', { class: 'btn' }, 'No camera? Paste a device token'),
      ),
    ),
    gesture(),
  );
}

function empty(theme) {
  return phone(
    theme,
    sysbar('9:12'),
    appbar(),
    h(
      'main',
      { class: 'screen' },
      h(
        'div',
        { class: 'quiet' },
        icon('moon', 'sm'),
        'Quiet hours until 8:00 am. Only urgent decisions alert you.',
      ),
      h(
        'div',
        { class: 'empty' },
        illo('empty'),
        pixel('ALL CLEAR', 2, 'pixel-heading', 'p'),
        h('p', {}, 'Nothing needs you. 2 low-priority decisions wait for the 8:00 am digest.'),
        h('span', { class: 'btn small' }, icon('updates', 'sm'), 'See today’s updates'),
      ),
    ),
    bottomnav('inbox', { inbox: 0, attn: 0 }),
    gesture(),
  );
}

function offline(theme) {
  return phone(
    theme,
    sysbar(),
    appbar({ live: false }),
    h(
      'main',
      { class: 'screen' },
      h(
        'div',
        { class: 'banner failed' },
        h('span', {}, 'Offline since 9:38. Showing what you had then.'),
        icon('offline'),
        h(
          'small',
          { class: 'banner-sub' },
          'Answers need a connection: the undo clock and the source check run on the server.',
        ),
      ),
      h('div', { class: 'dimmed' }, card(D.refund), card(D.acme), card(D.jobs)),
    ),
    bottomnav('inbox'),
    gesture(),
  );
}

// ------------------------------------------------------------------ system surfaces

function notif({ title, text, chan, urgent, actions = [], headsup = false, time = 'now', extra }) {
  return h(
    'div',
    { class: `notif${headsup ? ' headsup' : ''}` },
    h(
      'div',
      { class: 'notif-head' },
      h('span', { class: 'appglyph' }, icon('check')),
      h('b', {}, 'Nod'),
      h('span', {}, `· ${time}`),
      h('span', { class: `chan${urgent ? ' urgent' : ''}` }, chan),
    ),
    h('div', { class: 'notif-title' }, title),
    text && h('div', { class: 'notif-text' }, text),
    extra,
    actions.length > 0 &&
      h(
        'div',
        { class: 'notif-actions' },
        actions.map((a) => h('span', { class: a.startsWith('~') ? 'muted' : '' }, a.replace('~', ''))),
      ),
  );
}

const nRefund = (headsup = false) =>
  notif({
    title: D.refund.title,
    text: '212 double refunds. If you say nothing: Run tonight, in 18 min.',
    chan: 'Urgent',
    urgent: true,
    headsup,
    actions: ['Run tonight', 'Run now', '~Open'],
  });

function shade(theme) {
  return phone(
    theme,
    h('div', { class: 'wallpaper' }),
    h(
      'div',
      { class: 'shade' },
      h('div', { class: 'shade-top' }, h('span', { class: 'shade-time' }, '9:41'), h('span', {}, 'Thu, Nov 14')),
      h('div', { class: 'qs' }, h('span'), h('span'), h('span'), h('span')),
      nRefund(),
      notif({
        title: D.pricing.title,
        text: 'You chose Merge. Sending in 1:58.',
        chan: 'Sending',
        time: '1m',
        extra: meter(0.98),
        actions: ['Undo'],
      }),
      notif({
        title: D.acme.title,
        text: 'From outside: sales@acme-print.com. Every option sends an email, so answer it in Nod.',
        chan: 'Decisions',
        time: '3m',
        actions: ['Review in Nod'],
      }),
      notif({
        title: '2 more decisions',
        text: 'Ship the new job board? · Hire a contract technical writer?',
        chan: 'Batched',
        time: '6m',
      }),
      h('div', { class: 'shade-foot' }, h('span', {}, 'Manage'), h('span', {}, 'Clear all')),
    ),
    gesture(),
  );
}

function headsup(theme) {
  return phone(
    theme,
    h(
      'div',
      { class: 'otherapp' },
      ...[90, 60, 75, 40, 85, 55, 70, 30, 80, 65].map((w) => h('i', { style: `width:${w}%` })),
    ),
    sysbar(),
    h('div', { class: 'headsup-wrap' }, nRefund(true)),
    gesture(),
  );
}

function lock(theme) {
  return phone(
    theme,
    h('div', { class: 'wallpaper' }),
    sysbar(),
    h(
      'div',
      { class: 'lock' },
      h('div', { class: 'bigtime' }, '9:41'),
      h('div', { class: 'date' }, 'Thursday, November 14'),
      notif({
        title: D.refund.title,
        text: '212 double refunds. If you say nothing: Run tonight, in 18 min.',
        chan: 'Urgent',
        urgent: true,
        actions: ['Run tonight', 'Run now'],
        extra: h('div', { class: 'notif-lock' }, icon('key', 'sm'), 'Unlock to answer'),
      }),
      notif({
        title: D.acme.title,
        text: 'From outside: sales@acme-print.com',
        chan: 'Decisions',
        time: '3m',
      }),
      h('div', { class: 'unlock' }, h('span', { class: 'fp' }), 'Touch to unlock'),
    ),
    gesture(),
  );
}

function g2Screen(sel = 0) {
  return h(
    'div',
    { class: 'g2-screen' },
    h(
      'div',
      {},
      h('div', { class: 'g2-title' }, 'Run the refund migration now?'),
      h('div', {}, 'Fixes 212 double refunds.'),
      ['Run tonight', 'Run now', 'Skip'].map((o, i) =>
        h('div', { class: `g2-opt${i === sel ? ' sel' : ''}` }, (i === 0 ? '* ' : '') + o),
      ),
    ),
    h('div', { class: 'ring', 'data-t': '0:42' }),
  );
}

function glasses(theme) {
  return phone(
    theme,
    sysbar(),
    appbar({ back: true, title: 'Decision' }),
    h(
      'main',
      { class: 'screen' },
      h(
        'div',
        { class: 'panel glasses-panel emph' },
        h('span', { class: 'label' }, icon('glasses', 'sm'), 'On your glasses now'),
        h('div', { class: 'g2' }, g2Screen(0)),
        h(
          'p',
          { class: 'help' },
          'The default (Run tonight) is highlighted; the ring drains to its deadline. R1 ring: swipe to move, tap to choose, double tap to skip, long press to call.',
        ),
      ),
      h(
        'article',
        { class: 'panel decision compact' },
        tags(D.refund),
        h('h2', { class: 'detail-title' }, D.refund.title),
        h('p', { class: 'question' }, D.refund.question),
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'btn small' }, 'Answer here instead'),
          h('span', { class: 'btn small' }, icon('close', 'sm'), 'Dismiss on glasses'),
        ),
      ),
      h(
        'div',
        { class: 'banner done handoff' },
        h('span', {}, 'Answered on glasses: Run tonight'),
        icon('glasses', 'banner-icon'),
        h('small', { class: 'banner-sub' }, 'Example of the next state: the undo bar follows on both.'),
      ),
    ),
    gesture(),
  );
}

function call(theme) {
  const bars = [10, 22, 34, 18, 40, 28, 14, 36, 24, 12, 30, 20, 8];
  return phone(
    theme,
    sysbar(),
    h(
      'div',
      { class: 'call' },
      h(
        'div',
        { class: 'call-top' },
        h('span', { class: 'label' }, icon('call', 'sm'), 'Call Me · 2:14'),
        h('div', { class: 'wave' }, bars.map((b) => h('i', { style: `height:${b}px` }))),
        h('span', { class: 'help' }, 'About: ' + D.refund.title),
      ),
      h(
        'div',
        { class: 'transcript' },
        h('p', {}, h('b', {}, 'You'), 'What breaks if we run it now?'),
        h(
          'p',
          {},
          h('b', {}, 'Nod'),
          'Nothing breaks. Checkout gets about 200 ms slower for four minutes, during your busiest hour.',
        ),
        h('p', {}, h('b', {}, 'You'), 'Then do it tonight.'),
      ),
      h(
        'div',
        { class: 'panel confirm emph' },
        h('span', { class: 'label' }, 'I heard'),
        h('h2', {}, 'Run tonight. Confirm?'),
        h('p', { class: 'help' }, 'Nothing is sent until you tap. Then the 2-minute undo applies.'),
        h(
          'div',
          { class: 'sheet-actions' },
          h('span', { class: 'btn' }, 'Not that'),
          h('span', { class: 'btn primary' }, icon('check', 'sm'), 'Confirm'),
        ),
      ),
      h(
        'div',
        { class: 'call-actions' },
        h('span', { class: 'round' }, icon('mic')),
        h('span', { class: 'round end' }, icon('call')),
      ),
    ),
    gesture(),
  );
}

// ------------------------------------------------------------------ registry

export const SCREENS = [
  ['inbox', 'Inbox', 'Filter chips and an amber attention row; urgent first.', inbox, ['dark', 'light']],
  ['detail', 'Decision detail', 'Impact first; green is the recommended option.', detail, ['dark', 'light']],
  ['undo', 'Undo window', 'Answer held 2 min; the bar drains, Undo stays in reach.', undo, ['dark', 'light']],
  ['external', 'External: explicit approval', 'Outside provenance: no default, confirm sheet before it sends.', external, ['dark']],
  ['attention', 'Inbox: attention filter', 'Changed since you looked, failed delivery, queued behind a lock.', attention, ['dark']],
  ['updates', 'Updates', '2-hour sweep summary and history.', updates, ['dark']],
  ['settings', 'Settings', 'Pairing, theme, channels, hours, glasses, Call Me.', settings, ['dark']],
  ['onboarding', 'Pairing', 'Scan the QR from desk Settings; token paste as fallback.', onboarding, ['dark']],
  ['empty', 'Empty + quiet hours', 'All clear at night; the digest waits for 8 am.', empty, ['dark']],
  ['offline', 'Offline', 'Read-only cache; answering waits for the server.', offline, ['dark']],
  ['shade', 'Notification shade', 'Urgent with option actions, Undo, external opens only.', shade, ['dark', 'light']],
  ['headsup', 'Heads-up (urgent)', 'Urgent bypasses cooldown and pops over other apps.', headsup, ['dark']],
  ['lock', 'Lock screen', 'Title visible; answering needs unlock.', lock, ['dark']],
  ['glasses', 'Glasses handoff', 'The phone mirrors what the G2 shows.', glasses, ['dark']],
  ['call', 'Call Me', 'Voice never commits: "I heard … Confirm?"', call, ['dark']],
];

export function render(id, theme) {
  const s = SCREENS.find(([sid]) => sid === id) ?? SCREENS[0];
  return s[3](theme);
}

function boot() {
  const page = document.body.dataset.page;
  if (page === 'gallery') {
    const grid = document.getElementById('grid');
    let n = 0;
    for (const [id, name, note, , themes] of SCREENS)
      for (const t of themes) {
        n += 1;
        grid.append(
          h(
            'figure',
            {},
            render(id, t),
            h(
              'figcaption',
              {},
              h('b', {}, `${String(n).padStart(2, '0')} ${name}`),
              `${t} · ${note}`,
            ),
          ),
        );
      }
  } else {
    const q = new URLSearchParams(location.search);
    const t = q.get('t') === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    document.getElementById('app').replaceChildren(render(q.get('s') || 'inbox', t));
  }
  document.body.dataset.ready = '1';
}

boot();
