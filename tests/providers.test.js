const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const compatible = require('../src/features/common/ai/providers/compatible');
const { createLLM, createStreamingLLM } = require('../src/features/common/ai/factory');
const { streamText } = require('../src/features/common/ai/sse');

async function mockServer(t, handler) {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    return `http://127.0.0.1:${server.address().port}/v1`;
}
test('endpoint validation rejects credential leaks and accepts local gateways', () => {
    for (const url of ['http://example.com/v1', 'https://user:secret@host/v1', 'https://host/v1?key=x', 'https://host/v1#key', 'file:///tmp', 'https://host/v1/chat/completions']) {
        assert.throws(() => compatible.normalizeBaseURL(url));
    }
    assert.equal(compatible.normalizeBaseURL('https://host/v1/'), 'https://host/v1');
    assert.equal(compatible.normalizeBaseURL('http://localhost:8000/v1'), 'http://localhost:8000/v1');
});
test('IONOS/custom model listing and answer requests preserve exact model ID and key', async t => {
    const calls = [];
    const baseURL = await mockServer(t, async (req, res) => {
        let body = ''; for await (const chunk of req) body += chunk;
        calls.push({ path: req.url, key: req.headers.authorization, body: body ? JSON.parse(body) : null });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(req.url.endsWith('/models') ? { data: [{ id: 'org/model-glass' }] } : { choices: [{ message: { content: 'An answer.' } }] }));
    });
    const options = { baseURL, apiKey: 'ionos-jwt', model: 'org/model-glass' };
    assert.deepEqual(await compatible.listModels(options), ['org/model-glass']);
    for (const provider of ['ionos', 'custom']) {
        assert.equal((await createLLM(provider, options).chat([{ role: 'user', content: 'Question' }])).content, 'An answer.');
    }
    assert.equal(calls[0].path, '/v1/models');
    for (const call of calls.slice(1)) {
        assert.equal(call.path, '/v1/chat/completions');
        assert.equal(call.key, 'Bearer ionos-jwt');
        assert.equal(call.body.model, 'org/model-glass');
        assert.equal(call.body.stream, false);
    }
});
test('stream parser preserves UTF-8 and events split at every byte', async () => {
    const text = 'data: {"choices":[{"delta":{"content":"Grüße 👋"}}]}\r\n\r\ndata: [DONE]\n\n';
    const stream = new ReadableStream({ start(controller) {
        for (const byte of new TextEncoder().encode(text)) controller.enqueue(new Uint8Array([byte]));
        controller.close();
    } });
    let output = ''; for await (const token of streamText(stream.getReader())) output += token;
    assert.equal(output, 'Grüße 👋');
});
test('stream parser surfaces provider error events', async () => {
    const stream = new Response('data: {"error":{"message":"quota exceeded"}}\n\n').body;
    await assert.rejects(async () => { for await (const token of streamText(stream.getReader())) void token; }, /quota exceeded/);
});
test('compatible streaming sends stream:true and cancellation reaches the request', async t => {
    const baseURL = await mockServer(t, async (req, res) => {
        let body = ''; for await (const chunk of req) body += chunk;
        assert.equal(JSON.parse(body).stream, true);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"first"}}]}\n\n');
    });
    const controller = new AbortController();
    const response = await createStreamingLLM('ionos', { baseURL, apiKey: 'test', model: 'test', signal: controller.signal }).streamChat([]);
    const output = streamText(response.body.getReader(), controller.signal);
    assert.equal((await output.next()).value, 'first');
    controller.abort();
    await assert.rejects(output.next(), { name: 'AbortError' });
});
test('expired token errors are actionable and redact the submitted key', async t => {
    const baseURL = await mockServer(t, (_req, res) => { res.writeHead(401); res.end(JSON.stringify({ error: { message: 'token my-secret expired' } })); });
    await assert.rejects(compatible.listModels({ baseURL, apiKey: 'my-secret' }), error => /refresh an expired IONOS token/.test(error.message) && !error.message.includes('my-secret'));
});
test('redirects are rejected instead of sending credentials to another origin', async t => {
    let forwarded = false;
    const destination = await mockServer(t, (_req, res) => { forwarded = true; res.end('{}'); });
    const baseURL = await mockServer(t, (_req, res) => { res.writeHead(307, { Location: `${destination}/models` }); res.end(); });
    await assert.rejects(compatible.listModels({ baseURL, apiKey: 'test' }));
    assert.equal(forwarded, false);
});
