export interface SSEEvent {
  event: string;
  data: string | Record<string, unknown>;
}

/**
 * Parses an SSE stream into individual events.
 * Buffers incoming chunks, splits on double newlines, and extracts event/data fields.
 */
export async function* parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      // Keep the last part as it may be incomplete
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Skip heartbeat comments
        if (trimmed.startsWith(': heartbeat') || trimmed === ':') continue;

        let eventName = 'message';
        const dataLines: string[] = [];

        for (const line of trimmed.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (dataLines.length === 0) continue;

        const dataStr = dataLines.join('\n');
        let data: string | Record<string, unknown>;
        try {
          data = JSON.parse(dataStr);
        } catch {
          data = dataStr;
        }

        yield { event: eventName, data };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
