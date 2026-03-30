import { parseSSEStream, SSEEvent } from '../utils/sse-parser';

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of parseSSEStream(stream)) {
    events.push(event);
  }
  return events;
}

describe('parseSSEStream', () => {
  it('parses a single event with data', async () => {
    const stream = createStream(['data: hello world\n\n']);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'message', data: 'hello world' });
  });

  it('parses named events', async () => {
    const stream = createStream(['event: status\ndata: ok\n\n']);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'status', data: 'ok' });
  });

  it('parses JSON data', async () => {
    const stream = createStream(['data: {"key":"value"}\n\n']);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'message', data: { key: 'value' } });
  });

  it('handles multiple events in one chunk', async () => {
    const stream = createStream(['data: first\n\ndata: second\n\n']);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0]!.data).toBe('first');
    expect(events[1]!.data).toBe('second');
  });

  it('handles events split across chunks', async () => {
    const stream = createStream(['data: hel', 'lo\n\n']);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toBe('hello');
  });

  it('skips heartbeat comments', async () => {
    const stream = createStream([': heartbeat\n\ndata: real\n\n']);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toBe('real');
  });

  it('skips empty parts', async () => {
    const stream = createStream(['\n\ndata: value\n\n']);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
  });

  it('handles empty stream', async () => {
    const stream = createStream([]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(0);
  });
});
