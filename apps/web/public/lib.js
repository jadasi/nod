// Pure helpers for the inbox. No DOM access, so they can be unit tested.

/** 107000 ms -> "1:47". Never negative. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "checked 40s ago" / "checked 3m ago". */
export function formatAge(seconds) {
  if (seconds < 90) return `${Math.max(0, Math.floor(seconds))}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * What the answer banner should say right now. `now` is server-corrected ms.
 * Returns null when there is nothing to show.
 */
export function answerBanner(answer, now) {
  if (!answer) return null;
  const left = new Date(answer.deliver_after).getTime() - now;
  switch (answer.status) {
    case 'pending':
      return left > 0 && answer.can_undo
        ? { kind: 'undo', text: `Sending in ${formatCountdown(left)}`, canUndo: true }
        : { kind: 'sending', text: 'Sending…', canUndo: false };
    case 'delivering':
      return { kind: 'sending', text: 'Sending…', canUndo: false };
    case 'dry_run':
      return {
        kind: 'held',
        text: 'Held: the service is in dry-run mode, so nothing was written to the source',
        canUndo: false,
      };
    case 'delivered':
      return { kind: 'done', text: 'Sent', canUndo: false };
    case 'stale':
      return { kind: 'stale', text: 'Changed since you looked. Not sent.', canUndo: false };
    case 'failed':
      return { kind: 'failed', text: answer.error || 'Could not be delivered', canUndo: false };
    default:
      return null;
  }
}

/** Seconds until the default fires, or null. */
export function defaultCountdown(decision, now) {
  const d = decision.default;
  if (!d || !d.deadline) return null;
  return Math.max(0, new Date(d.deadline).getTime() - now);
}

/**
 * Incremental Server-Sent Events parser. Feed it text chunks; it returns the
 * complete events found so far and keeps the remainder for the next chunk.
 */
export function createSseParser() {
  let buf = '';
  return (chunk) => {
    buf += chunk.replace(/\r\n/g, '\n');
    const events = [];
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      const data = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length || event !== 'message') events.push({ event, data: data.join('\n') });
    }
    return events;
  };
}

/** Inbox order: urgent first, then oldest first (it has waited longest). */
export function sortInbox(list) {
  return [...list].sort((a, b) => {
    const u = Number(b.urgency === 'urgent') - Number(a.urgency === 'urgent');
    return u || a.created_at.localeCompare(b.created_at);
  });
}

/** Evidence is technical, so the UI only shows http(s) links. */
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
