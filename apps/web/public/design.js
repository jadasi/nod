// The Phosphor design system reference page (/design.html). Static demo content only: no API
// calls, no token, no decision data. Everything is drawn from tokens.js / tokens.css and the same
// classes the inbox uses, so this page shows what ships.
import { ICONS, ILLUSTRATIONS, TOKENS } from '/tokens.js';
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
const illo = (name) => h('span', { class: `illo illo-${name}`, 'aria-hidden': 'true' });
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const THEMES = Object.keys(TOKENS.themes);

function pixel(tag, text, opts = { scale: 2 }, cls = 'pixel-heading') {
  const el = h(tag, { class: cls });
  setPixelText(el, text, opts);
  return el;
}
function heading(text, note) {
  return h(
    'div',
    { class: 'view-head' },
    pixel('h2', text),
    note && h('span', { class: 'label' }, note),
  );
}
const section = (title, note, ...body) => h('section', {}, heading(title, note), ...body);
const caption = (text) => h('h3', { class: 'label ds-caption' }, text);

/** Renders `build()` once per theme, side by side, each pane forcing its theme. */
const both = (build) =>
  h(
    'div',
    { class: 'ds-themes' },
    THEMES.map((t) =>
      h(
        'div',
        { class: 'ds-pane', 'data-theme': t },
        h('p', { class: 'label' }, `${t} theme`),
        build(),
      ),
    ),
  );

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
const hex = (name, theme) => TOKENS.themes[theme].color[name];
const chip = (color) => h('span', { class: 'ds-chip', style: `background:${color}` });

// ---------------------------------------------------------------- sections

function intro() {
  return h(
    'header',
    { class: 'ds-intro' },
    h(
      'div',
      { class: 'ds-intro-top' },
      pixel('h1', 'NOD PHOSPHOR', { scale: 4 }, 'wordmark'),
      h(
        'button',
        { id: 'theme', class: 'theme-toggle', type: 'button', 'data-mode': 'system' },
        icon('auto', 'sm'),
        icon('sun', 'sm'),
        icon('moon', 'sm'),
      ),
    ),
    h(
      'p',
      {},
      'The design system for Nod. Gray monochrome in a dark and a light theme, with phosphor green kept for what must stand out: the logo, primary actions, live status, the waiting count and the undo countdown. Pixel effects (corner brackets, scanlines, glow) mark action items and interaction, never everything. Space Grotesk for reading, an original dot-matrix face for the clock and headings, pixel art for icons and illustrations. Source of truth: packages/design-tokens/tokens.json.',
    ),
  );
}

function colors() {
  const rows = Object.entries(TOKENS.color).map(([name, { use }]) =>
    h(
      'tr',
      {},
      h('td', {}, h('b', {}, `--color-${kebab(name)}`)),
      THEMES.map((t) => h('td', { class: 'ds-nowrap' }, chip(hex(name, t)), ` ${hex(name, t)}`)),
      h('td', { class: 'ds-dim' }, use),
    ),
  );
  const pair = ([fg, bg], min) =>
    h(
      'tr',
      {},
      h('td', {}, `${fg} on ${bg}`),
      THEMES.map((t) => {
        const r = ratio(hex(fg, t), hex(bg, t));
        return h(
          'td',
          { class: 'ds-nowrap' },
          h(
            'span',
            { class: 'ds-sample', style: `color:${hex(fg, t)};background:${hex(bg, t)}` },
            'Aa 09',
          ),
          ` ${r.toFixed(2)}:1 `,
          h('span', { class: r >= min ? 'ds-pass' : 'ds-fail' }, r >= min ? 'pass' : 'FAIL'),
        );
      }),
      h('td', { class: 'ds-dim' }, `${min}:1`),
    );
  const head = (...cols) =>
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        cols.map((c) => h('th', {}, c)),
      ),
    );
  return section(
    'Color',
    'two themes · contrast checked in CI',
    h('table', { class: 'ds-table' }, head('Token', ...THEMES, 'Use'), h('tbody', {}, rows)),
    caption('Contrast pairs'),
    h(
      'table',
      { class: 'ds-table' },
      head('Pair', ...THEMES, 'Needs'),
      h(
        'tbody',
        {},
        TOKENS.contrast.text.map((p) => pair(p, 4.5)),
        TOKENS.contrast.nonText.map((p) => pair(p, 3)),
      ),
    ),
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
          style: `font-size:${t.size}px;line-height:${t.lineHeight}px;font-weight:${t.weight};letter-spacing:${t.tracking}em;${t.case === 'upper' ? 'text-transform:uppercase;' : ''}`,
        },
        name === 'label'
          ? 'Changes something'
          : 'All 1,240 customers see the new job board tomorrow morning.',
      ),
    ),
  );
  const sample = (label, text, opts) =>
    h('div', {}, h('p', { class: 'label ds-caption' }, label), pixelSvg(text, opts));
  return section(
    'Type',
    'Space Grotesk · Nod Pixel 5x7',
    h('p', { class: 'help ds-caption' }, `${TOKENS.font.body.use} ${TOKENS.font.body.license}.`),
    h('div', { class: 'ds-type' }, rows),
    caption('Nod Pixel 5x7 (original, display only)'),
    h(
      'div',
      { class: 'ds-pixels' },
      sample('clock x7 · dot matrix', '09:41', { scale: 7, dot: 0.78 }),
      sample('count x3', '03', { scale: 3 }),
      sample('heading x2', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', { scale: 2 }),
      sample('heading x2', '0123456789 : . , - / & ! ? # >', { scale: 2 }),
    ),
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
      `Borders ${TOKENS.border.hairline}px hairline, ${TOKENS.border.focus}px focus ring at ${TOKENS.border.focusOffset}px offset. Controls ${TOKENS.size.control}px tall (small ${TOKENS.size.controlSmall}px). Motion ${TOKENS.motion.fast}/${TOKENS.motion.base}/${TOKENS.motion.slow}ms, cosmetic only.`,
    ),
  );
}

function icons() {
  return section(
    'Pixel art',
    `${Object.keys(ICONS).length} icons on a 12x12 grid · two-ink illustrations`,
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
    caption('Illustrations'),
    both(() =>
      h(
        'div',
        { class: 'ds-row ds-illos' },
        Object.entries(ILLUSTRATIONS).map(([name, { use, width }]) =>
          h(
            'figure',
            {},
            h('span', {
              class: `illo illo-${name}`,
              style: `width:${width * 4}px`,
              'aria-hidden': 'true',
            }),
            h('figcaption', { class: 'help' }, use),
          ),
        ),
      ),
    ),
  );
}

function hudBar(live) {
  const clock = h('span', { class: 'clock' });
  setPixelText(clock, '09:41', { scale: 2 });
  return h(
    'div',
    { class: 'hud-bar ds-hud' },
    pixel('span', 'NOD', { scale: 3 }, 'wordmark'),
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
}

const tag = (cls, ic, text) => h('span', { class: `tag ${cls}` }, icon(ic, 'sm'), text);

function demoCard({ urgent, needs, title, question, tagList, live, state = '' }) {
  return h(
    'div',
    {
      class: `card link${urgent ? ' urgent' : ''}${needs ? ' needs-you' : ''} ${state}`,
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

function emphasis() {
  const rule = (title, text) => h('li', {}, h('b', {}, title), ` ${text}`);
  return section(
    'Emphasis',
    'effects mark action, not everything',
    h(
      'ul',
      { class: 'help ds-rules' },
      rule(
        'Gray by default.',
        'Informational panels, tags and secondary buttons are clean gray outlines.',
      ),
      rule(
        'Green is for what must stand out:',
        'logo, primary actions, live status, the waiting count, the undo countdown and the focus ring.',
      ),
      rule(
        'Action items get corner brackets:',
        'decisions that need an answer, the undo bar, sign-in. Primary buttons are the green fill.',
      ),
      rule(
        'Interaction adds texture:',
        'hover and keyboard focus add scanlines and brackets instead of a solid fill.',
      ),
      rule(
        'Reduced motion or more contrast:',
        'scanlines and glow switch off; hover falls back to a plain fill.',
      ),
    ),
    both(() =>
      h(
        'div',
        { class: 'ds-stack' },
        h(
          'div',
          { class: 'panel' },
          h('p', { class: 'label' }, 'Plain panel'),
          h('p', {}, 'Information only. No brackets, no green.'),
        ),
        h(
          'div',
          { class: 'panel emph' },
          h('p', { class: 'label' }, 'Action panel'),
          h('p', {}, 'Needs an answer: accent corner brackets.'),
        ),
        demoCard({
          title: 'Answered: merge the billing fix',
          question: 'Waiting on the undo window. Plain card.',
          tagList: [tag('sending', 'check', 'Answered'), tag('source', 'source', 'github')],
          live: 'Sending in 1:12',
        }),
        demoCard({
          needs: true,
          title: 'Ship the new job board?',
          question: 'Needs you: brackets.',
          tagList: [
            tag('write', 'write', 'Changes something'),
            tag('source', 'source', 'paperclip · cto'),
          ],
        }),
        demoCard({
          needs: true,
          state: 'is-hover',
          title: 'Ship the new job board?',
          question: 'Hover or focus: scanlines.',
          tagList: [tag('source', 'source', 'paperclip · cto')],
        }),
        demoCard({
          needs: true,
          urgent: true,
          title: 'Reply to Acme Print quote',
          question: 'Urgent and needs you: red brackets and edge.',
          tagList: [
            tag('urgent', 'alert', 'Urgent'),
            tag('external', 'mail', 'From external: x@example.com'),
          ],
        }),
      ),
    ),
  );
}

function components() {
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
          h('span', {}, text),
        ),
      ),
      h(
        'button',
        { class: `btn ${cls}`, type: 'button', disabled: true },
        icon(ic, 'sm'),
        h('span', {}, text),
      ),
    );
  const banner = (kind, text, ic, extra) =>
    h('div', { class: `banner ${kind}` }, h('span', {}, text), icon(ic), extra);
  return [
    section(
      'Status bar',
      'HUD · live and offline',
      both(() => h('div', { class: 'ds-stack' }, hudBar(true), hudBar(false))),
    ),
    section(
      'Buttons',
      'default · hover · pressed · focus · disabled',
      both(() =>
        h(
          'div',
          { class: 'ds-stack' },
          variant('primary', 'Approve', 'check'),
          variant('', 'Hold', 'close'),
          variant('danger', 'Withdraw', 'close'),
          variant('small', 'Undo', 'undo'),
        ),
      ),
    ),
    section(
      'Tags',
      'badges',
      both(() =>
        h(
          'div',
          { class: 'ds-row' },
          tag('urgent', 'alert', 'Urgent'),
          tag('external', 'mail', 'From external: x@example.com'),
          tag('write', 'write', 'Changes something'),
          tag('sending', 'check', 'Answered'),
          tag('source', 'source', 'paperclip · cto'),
        ),
      ),
    ),
    section(
      'Status & undo bar',
      'the undo bar is an action item',
      both(() =>
        h(
          'div',
          { class: 'ds-stack' },
          banner('undo', 'Sending in 1:12', 'clock', [
            h(
              'button',
              { class: 'btn small', type: 'button' },
              icon('undo', 'sm'),
              h('span', {}, 'Undo'),
            ),
            h(
              'div',
              { class: 'meter', 'aria-hidden': 'true' },
              h('div', { class: 'meter-fill', style: '--from: 0.6; --left: 0ms' }),
            ),
          ]),
          banner('sending', 'Sending…', 'send'),
          banner('done', 'Sent', 'check'),
          banner(
            'held',
            'Held: the service is in dry-run mode, so nothing was written to the source',
            'alert',
          ),
          banner('stale', 'Changed since you looked. Not sent.', 'stale'),
          banner('failed', 'Could not be delivered', 'close'),
          h(
            'div',
            { class: 'mode' },
            'Dry-run mode: answers are held and logged, not written to sources.',
          ),
          h('p', { class: 'err' }, icon('alert', 'sm'), 'Request failed (503)'),
        ),
      ),
    ),
    section(
      'Inputs, disclosure, empty state',
      '',
      both(() => {
        const id = Math.random().toString(36).slice(2, 7);
        const empty = h(
          'div',
          { class: 'empty' },
          illo('empty'),
          pixel('p', 'All clear'),
          h('p', {}, 'Nothing is waiting on you.'),
        );
        return h(
          'div',
          { class: 'ds-stack' },
          h('label', { class: 'label', for: `t-${id}` }, 'Device token'),
          h('input', { id: `t-${id}`, type: 'password', placeholder: 'Device token' }),
          h('label', { class: 'label', for: `b-${id}` }, 'Invalid'),
          h('input', { id: `b-${id}`, type: 'text', value: 'not-a-token', 'aria-invalid': 'true' }),
          h('label', { class: 'label', for: `o-${id}` }, icon('other', 'sm'), 'Other'),
          h('textarea', {
            id: `o-${id}`,
            rows: 2,
            placeholder: 'Other: tell the agent what to do instead',
          }),
          h(
            'div',
            { class: 'panel' },
            h(
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
            ),
          ),
          empty,
        );
      }),
    ),
  ];
}

function glasses() {
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
        h(
          'tr',
          {},
          h('th', {}, 'Token'),
          h('th', {}, 'Web (dark)'),
          h('th', {}, 'Glasses level 0-15'),
        ),
      ),
      h(
        'tbody',
        {},
        Object.entries(TOKENS.glasses.level).map(([name, level]) =>
          h(
            'tr',
            {},
            h('td', {}, name),
            h('td', { class: 'ds-nowrap' }, chip(hex(name, 'dark')), ` ${hex(name, 'dark')}`),
            h(
              'td',
              { class: 'ds-nowrap' },
              chip(`rgb(93 255 138 / ${(level / 15).toFixed(2)})`),
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
    emphasis(),
    colors(),
    type(),
    space(),
    icons(),
    ...components(),
    glasses(),
  );
