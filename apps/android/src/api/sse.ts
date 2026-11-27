import type { NodEvent } from './types.js';

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Incremental Server-Sent Events parser. Feed it text chunks; it returns the
 * complete events found so far and keeps the remainder for the next chunk.
 *
 * Ported from `apps/web/public/lib.js` (`createSseParser`) so the phone and
 * the desk parse the core stream identically.
 */
export function createSseParser(): (chunk: string) => SseEvent[] {
  let buf = '';
  return (chunk: string): SseEvent[] => {
    buf += chunk.replace(/\r\n/g, '\n');
    const events: SseEvent[] = [];
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length > 0 || event !== 'message') events.push({ event, data: data.join('\n') });
    }
    return events;
  };
}

export type ParsedNodEvent = NodEvent | { type: 'ready' } | { type: 'resync' };

/** Parses one SSE frame from the core stream into a typed event, or null. */
export function parseNodEvent(frame: SseEvent): ParsedNodEvent | null {
  if (frame.event === 'ready') return { type: 'ready' };
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p.type === 'decision' && typeof p.id === 'string' && typeof p.status === 'string') {
    // Core sends { id: '*', status: 'resync' } after a gap; treat it as resync.
    return p.id === '*' ? { type: 'resync' } : { type: 'decision', id: p.id, status: p.status };
  }
  if (p.type === 'update' && typeof p.id === 'number') {
    return { type: 'update', id: p.id };
  }
  return null;
}
