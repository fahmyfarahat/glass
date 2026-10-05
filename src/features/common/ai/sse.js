// Buffer across network packets: neither UTF-8 characters nor SSE events align
// with read() boundaries. Yield only complete Chat Completions text deltas.
async function* streamText(reader, signal) {
    const decoder = new TextDecoder();
    let buffer = '';
    const abort = () => { reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    const parse = line => {
        if (!line.startsWith('data:')) return null;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return null;
        const event = JSON.parse(data);
        if (event.error) throw new Error(event.error.message || 'Streaming API error');
        return event.choices?.[0]?.delta?.content || null;
    };
    try {
        while (true) {
            signal?.throwIfAborted();
            const { value, done } = await reader.read();
            signal?.throwIfAborted();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) { const text = parse(line); if (text) yield text; }
            if (done) { const text = parse(buffer); if (text) yield text; break; }
        }
    } finally {
        signal?.removeEventListener('abort', abort);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
module.exports = { streamText };
