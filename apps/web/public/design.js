// The Phosphor design system reference page (/design.html). Static demo content only: no API
// calls, no token, no decision data. Everything is drawn from tokens.js / tokens.css and the same
// classes the inbox uses, so this page shows what ships.
import { ICONS, TOKENS } from '/tokens.js';
import { pixelSvg, setPixelText } from '/pixel.js';

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
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function heading(text, note) {
  const title = h('h2', { class: 'pixel-heading' });
  setPixelText(title, text, { scale: 2 });
  return h('div', { class: 'view-head' }, title, note && h('span', { class: 'label' }, note));
}
const section = (title, note, ...body) => h('section', {}, heading(title, note), ...body);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (name) => TOKENS.color[name].value;

// ---------------------------------------------------------------- sections

function intro() {
  const mark = h('h1', { class: 'wordmark' });
  setPixelText(mark, 'NOD PHOSPHOR', { scale: 4 });
  return h(
    'header',
    { class: 'ds-intro' },
    mark,
    h(
      'p',
      {},
      'The design system for Nod: phosphor green on near-black, thin outlined panels, a dot-matrix display face for short labels and a legible monospace for everything you read. Inspired by monochrome smart-glasses HUDs. Source of truth: packages/design-tokens/tokens.json.',
    ),
  );
}

function colors() {
  const swatches = Object.entries(TOKENS.color).map(([name, { value, use }]) =>
    h(
      'div',
      { class: 'ds-swatch' },
      h('span', { class: 'ds-chip', style: `background:${value}` }),
      h('b', {}, `--color-${kebab(name)}`),
      h('span', {}, value),
      h('span', { class: 'dim' }, use),
    ),
  );
  const row = ([fg, bg], min) => {
    const r = ratio(hex(fg), hex(bg));
    return h(
      'tr',
      {},
      h(
        'td',
        {},
        h('span', { style: `color:${hex(fg)};background:${hex(bg)};padding:2px 6px` }, 'Aa 09'),
      ),
      h('td', {}, `${fg} on ${bg}`),
      h('td', {}, `${r.toFixed(2)}:1`),
      h(
        'td',
        { class: r >= min ? 'ds-pass' : 'ds-fail' },
        r >= min ? `pass ${min}:1` : `FAIL ${min}:1`,
      ),
    );
  };
  const table = h(
    'table',
    { class: 'ds-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}, 'Sample'),
        h('th', {}, 'Pair'),
        h('th', {}, 'Ratio'),
        h('th', {}, 'WCAG'),
      ),
    ),
    h(
      'tbody',
      {},
      TOKENS.contrast.text.map((p) => row(p, 4.5)),
      TOKENS.contrast.nonText.map((p) => row(p, 3)),
    ),
  );
  return section(
    'Color',
    'contrast checked in CI',
    h('div', { class: 'ds-grid' }, swatches),
    h('h3', { class: 'label ds-caption', style: 'margin-top:24px' }, 'Contrast pairs'),
    table,
  );
}

function type() {
  const rows = Object.entries(TOKENS.type).map(([name, t]) =>
    h(
      'div',
      {},
      h('span', { class: 'label' }, `${name} ${t.size}/${t.lineHeight}`),
      h(
        'span',
        {
          style: `font-size:${t.size}px;line-height:${t.lineHeight}px;font-weight:${t.weight};letter-spacing:${t.tracking}em;${t.case === 'upper' ? 'text-transform:uppercase;' : ''}${name === 'title' ? 'color:var(--color-phosphor)' : ''}`,
        },
        name === 'label'
          ? 'Changes something'
          : 'Customers see the new job board tomorrow morning.',
      ),
    ),
  );
  const pixels = h(
    'div',
    { class: 'ds-pixels' },
    h(
      'div',
      {},
      h('p', { class: 'label ds-caption' }, 'display x7 · matrix'),
      pixelSvg('09:41', { scale: 7, dot: 0.78 }),
    ),
    h('div', {}, h('p', { class: 'label ds-caption' }, 'count x3'), pixelSvg('03', { scale: 3 })),
    h(
      'div',
      {},
      h('p', { class: 'label ds-caption' }, 'heading x2'),
      pixelSvg('ABCDEFGHIJKLMNOPQRSTUVWXYZ', { scale: 2 }),
    ),
    h(
      'div',
      {},
      h('p', { class: 'label ds-caption' }, 'heading x2'),
      pixelSvg('0123456789 : . - / & ! ? >', { scale: 2 }),
    ),
  );
  return section(
    'Type',
    'monospace body · pixel 5x7 display',
    h('p', { class: 'help ds-caption' }, `Body: ${TOKENS.font.body.value}`),
    h('div', { class: 'ds-type' }, rows),
    h(
      'h3',
      { class: 'label ds-caption', style: 'margin-top:24px' },
      'Nod Pixel 5x7 (original, display only)',
    ),
    pixels,
  );
}

function space() {
  return section(
    'Space',
    '4px grid · radius 0',
    h(
      'div',
      { class: 'ds-space' },
      Object.entries(TOKENS.space)
        .filter(([, n]) => n > 0)
        .map(([k, n]) =>
          h(
            'div',
            {},
            h('span', { class: 'label' }, `space-${k} ${n}`),
            h('div', { class: 'ds-bar', style: `width:${n}px` }),
          ),
        ),
    ),
    h(
      'p',
      { class: 'help', style: 'margin-top:16px' },
      `Borders ${TOKENS.border.hairline}px hairline, ${TOKENS.border.focus}px focus ring at ${TOKENS.border.focusOffset}px offset. Controls ${TOKENS.size.control}px tall (small ${TOKENS.size.controlSmall}px). Motion ${TOKENS.motion.fast}/${TOKENS.motion.base}/${TOKENS.motion.slow}ms, cosmetic only, removed under reduced motion.`,
    ),
  );
}

function icons() {
  return section(
    'Icons',
    `${Object.keys(ICONS).length} icons · 12x12 grid · 12/24/48px`,
    h(
      'div',
      { class: 'ds-icons' },
      Object.entries(ICONS).map(([name, use]) =>
        h(
          'div',
          { class: 'ds-icon' },
          h('div', { class: 'sizes' }, icon(name, 'sm'), icon(name), icon(name, 'lg')),
          h('b', {}, name),
          h('small', {}, use),
        ),
      ),
    ),
  );
}

function buttons() {
  const states = ['', 'is-hover', 'is-pressed', 'is-focus'];
  const names = ['default', 'hover', 'pressed', 'focus'];
  const variant = (cls, text, ic) =>
    h(
      'div',
      { class: 'ds-row' },
      states.map((s, i) =>
        h(
          'button',
          { class: `btn ${cls} ${s}`, type: 'button', title: names[i] },
          icon(ic, 'sm'),
          text,
        ),
      ),
      h('button', { class: `btn ${cls}`, type: 'button', disabled: true }, icon(ic, 'sm'), text),
    );
  return section(
    'Buttons',
    'default · hover · pressed · focus · disabled',
    h(
      'div',
      { class: 'ds-stack' },
      variant('primary', 'Approve', 'check'),
      variant('', 'Hold', 'close'),
      variant('danger', 'Withdraw', 'close'),
      variant('small', 'Undo', 'undo'),
    ),
  );
}

function demoCard({ urgent, title, question, tagList, live, hover }) {
  return h(
    'div',
    {
      class: `card link${urgent ? ' urgent' : ''}${hover ? ' is-hover' : ''}`,
      tabindex: '0',
      role: 'button',
    },
    h(
      'div',
      { class: 'card-body' },
      h('div', { class: 'tags' }, tagList),
      h('h2', {}, title),
      h('p', { class: 'question' }, question),
      h('div', { class: 'live-banner' }, live || ''),
    ),
    icon('chevron-right', 'card-go'),
  );
}

function cardsAndTags() {
  const tag = (cls, ic, text) => h('span', { class: `tag ${cls}` }, icon(ic, 'sm'), text);
  return section(
    'Decision cards & tags',
    'list item',
    h(
      'div',
      { class: 'ds-row', style: 'margin-bottom:16px' },
      tag('urgent', 'alert', 'Urgent'),
      tag('external', 'mail', 'From external: x@example.com'),
      tag('write', 'write', 'Changes something'),
      tag('sending', 'check', 'Answered'),
      tag('source', 'source', 'paperclip · cto'),
    ),
    h(
      'div',
      { class: 'list' },
      demoCard({
        urgent: true,
        title: 'Reply to vendor quote',
        question: 'Send the drafted reply accepting the new price?',
        tagList: [
          tag('urgent', 'alert', 'Urgent'),
          tag('external', 'mail', 'From external: x@example.com'),
          tag('source', 'source', 'email_triage · hermes'),
        ],
      }),
      demoCard({
        title: 'Ship the new job board?',
        question: 'Publish the new job board to all customers?',
        tagList: [
          tag('write', 'write', 'Changes something'),
          tag('source', 'source', 'paperclip · cto'),
        ],
        hover: true,
      }),
      demoCard({
        title: 'Merge the billing fix',
        question: 'Merge PR #412 so refunds stop double-charging?',
        tagList: [tag('sending', 'check', 'Answered'), tag('source', 'source', 'github')],
        live: 'Sending in 1:12',
      }),
    ),
  );
}

function banners() {
  const b = (kind, text, ic, extra) =>
    h('div', { class: `banner ${kind}` }, h('span', {}, text), icon(ic), extra);
  return section(
    'Status & undo bar',
    'toast with countdown',
    h(
      'div',
      { class: 'ds-stack' },
      b('undo', 'Sending in 1:12', 'clock', [
        h('button', { class: 'btn small', type: 'button' }, icon('undo', 'sm'), 'Undo'),
        h(
          'div',
          { class: 'meter', 'aria-hidden': 'true' },
          h('div', { class: 'meter-fill', style: '--from: 0.6; --left: 0ms' }),
        ),
      ]),
      b('sending', 'Sending…', 'send'),
      b('done', 'Sent', 'check'),
      b(
        'held',
        'Held: the service is in dry-run mode, so nothing was written to the source',
        'alert',
      ),
      b('stale', 'Changed since you looked. Not sent.', 'stale'),
      b('failed', 'Could not be delivered', 'close'),
      h(
        'div',
        { class: 'mode' },
        'Dry-run mode: answers are held and logged, not written to sources.',
      ),
      h('p', { class: 'err' }, icon('alert', 'sm'), 'Request failed (503)'),
    ),
  );
}

function hud() {
  const bar = (live) => {
    const clock = h('span', { class: 'clock' });
    setPixelText(clock, '09:41', { scale: 2 });
    const mark = h('span', { class: 'wordmark' });
    setPixelText(mark, 'NOD', { scale: 3 });
    return h(
      'div',
      { class: 'hud-bar ds-hud' },
      mark,
      h(
        'div',
        { class: 'hud-status' },
        h(
          'span',
          { class: `conn${live ? ' live' : ''}` },
          h('span', { class: 'conn-on' }, icon('live', 'sm'), 'Live'),
          h('span', { class: 'conn-off' }, icon('offline', 'sm'), 'Offline'),
        ),
        clock,
      ),
    );
  };
  return section(
    'Status bar',
    'HUD · live and offline',
    h('div', { class: 'ds-stack' }, bar(true), bar(false)),
  );
}

function inputsAndMore() {
  const evidence = h(
    'details',
    { class: 'evidence', open: true },
    h(
      'summary',
      {},
      icon('evidence', 'sm'),
      h('span', {}, 'Technical evidence'),
      h('span', { class: 'evidence-count' }, '2'),
      icon('chevron-down', 'sm disclosure'),
    ),
    h(
      'div',
      { class: 'evidence-body' },
      h('div', { class: 'evidence-item' }, h('a', { href: '#' }, 'Pull request #412')),
      h(
        'div',
        { class: 'evidence-item' },
        h('span', { class: 'evidence-label' }, 'Diff summary'),
        h('pre', {}, 'refunds.ts: guard against a second capture\n+12 −3 lines'),
      ),
    ),
  );
  const empty = h(
    'div',
    { class: 'empty' },
    icon('inbox', 'lg'),
    h('p', { class: 'pixel-heading' }),
    h('p', {}, 'Nothing is waiting on you.'),
  );
  setPixelText(empty.children[1], 'All clear', { scale: 2 });
  return section(
    'Inputs, disclosure, empty state',
    '',
    h(
      'div',
      { class: 'ds-cols' },
      h(
        'div',
        { class: 'ds-stack' },
        h('label', { class: 'label', for: 'ds-token' }, 'Device token'),
        h('input', { id: 'ds-token', type: 'password', placeholder: 'Device token' }),
        h('label', { class: 'label', for: 'ds-bad' }, 'Invalid'),
        h('input', { id: 'ds-bad', type: 'text', value: 'not-a-token', 'aria-invalid': 'true' }),
        h('label', { class: 'label', for: 'ds-other' }, icon('other', 'sm'), 'Other'),
        h('textarea', {
          id: 'ds-other',
          rows: 2,
          placeholder: 'Other: tell the agent what to do instead',
        }),
        h('div', { class: 'panel' }, evidence),
      ),
      empty,
    ),
  );
}

function glasses() {
  const levels = Object.entries(TOKENS.glasses.level);
  return section(
    'Glasses mapping',
    `${TOKENS.glasses.display.width}x${TOKENS.glasses.display.height} ${TOKENS.glasses.display.color}`,
    h('p', { class: 'help ds-caption' }, TOKENS.glasses.note),
    h(
      'table',
      { class: 'ds-table' },
      h(
        'thead',
        {},
        h('tr', {}, h('th', {}, 'Token'), h('th', {}, 'Web'), h('th', {}, 'Glasses level 0-15')),
      ),
      h(
        'tbody',
        {},
        levels.map(([name, level]) =>
          h(
            'tr',
            {},
            h('td', {}, name),
            h(
              'td',
              {},
              h('span', {
                class: 'ds-chip',
                style: `display:inline-block;width:16px;height:16px;vertical-align:middle;background:${hex(name)}`,
              }),
              ` ${hex(name)}`,
            ),
            h(
              'td',
              {},
              h('span', {
                class: 'ds-chip',
                style: `display:inline-block;width:16px;height:16px;vertical-align:middle;background:rgb(93 255 138 / ${(level / 15).toFixed(2)})`,
              }),
              ` ${level}`,
            ),
          ),
        ),
      ),
    ),
    h(
      'ul',
      { class: 'help', style: 'margin-top:16px' },
      Object.entries(TOKENS.glasses.semantics).map(([k, v]) =>
        h('li', {}, h('b', {}, k), `: ${v}`),
      ),
    ),
  );
}

document
  .getElementById('ds')
  .replaceChildren(
    intro(),
    colors(),
    type(),
    space(),
    icons(),
    hud(),
    buttons(),
    cardsAndTags(),
    banners(),
    inputsAndMore(),
    glasses(),
  );
