import { describe, expect, it } from 'vitest';
import { createSseParser, parseNodEvent } from '@/api/sse.js';

describe('createSseParser', () => {
  it('parses complete events and holds partial frames', () => {
    const parse = createSseParser();
    expect(parse('event: ready\ndata: {}\n\nevent: decision\nda')).toEqual([
      { event: 'ready', data: '{}' },
    ]);
    expect(
      parse('ta: {"type":"decision","id":"a","status":"open"}\n\n').map((e) => e.data),
    ).toEqual(['{"type":"decision","id":"a","status":"open"}']);
  });

  it('normalises CRLF and skips comment lines', () => {
    const parse = createSseParser();
    expect(parse(': keepalive\r\nevent: update\r\ndata: {"type":"update","id":7}\r\n\r\n')).toEqual(
      [{ event: 'update', data: '{"type":"update","id":7}' }],
    );
  });

  it('joins multi-line data', () => {
    const parse = createSseParser();
    expect(parse('data: one\ndata: two\n\n')).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });
});

describe('parseNodEvent', () => {
  it('parses ready, decision, update and resync', () => {
    expect(parseNodEvent({ event: 'ready', data: '{}' })).toEqual({ type: 'ready' });
    expect(
      parseNodEvent({ event: 'decision', data: '{"type":"decision","id":"a","status":"open"}' }),
    ).toEqual({ type: 'decision', id: 'a', status: 'open' });
    expect(parseNodEvent({ event: 'update', data: '{"type":"update","id":7}' })).toEqual({
      type: 'update',
      id: 7,
    });
    expect(
      parseNodEvent({ event: 'decision', data: '{"type":"decision","id":"*","status":"resync"}' }),
    ).toEqual({ type: 'resync' });
  });

  it('drops junk', () => {
    expect(parseNodEvent({ event: 'decision', data: 'not json' })).toBeNull();
    expect(parseNodEvent({ event: 'decision', data: '{"type":"other"}' })).toBeNull();
    expect(parseNodEvent({ event: 'update', data: '{"type":"update","id":"nope"}' })).toBeNull();
  });
});
