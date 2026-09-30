// IONOS AI Model Hub and other OpenAI-compatible Chat Completions endpoints.
const IONOS_BASE_URL = 'https://openai.inference.de-txl.ionos.com/v1';

function normalizeBaseURL(value) {
    let url;
    try { url = new URL(String(value).trim()); } catch { throw new Error('Enter a valid API base URL ending in /v1.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
        throw new Error('Use HTTPS, or HTTP for a local endpoint.');
    }
    if (url.username || url.password || url.search || url.hash) throw new Error('The base URL cannot contain credentials, a query, or a fragment.');
    if (/\/(chat\/completions|models)\/?$/.test(url.pathname)) throw new Error('Enter the API base URL, without /chat/completions or /models.');
    return url.toString().replace(/\/+$/, '');
}

function validateOptions({ baseURL, model, apiKey }) {
    baseURL = normalizeBaseURL(baseURL);
    if (typeof model !== 'string' || !model.trim() || model.length > 200) throw new Error('Enter the exact model ID from your provider.');
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('Enter an API key or IONOS token.');
    return { baseURL, model: model.trim(), apiKey: apiKey.trim() };
}

async function request(options, path, body, signal) {
    const baseURL = normalizeBaseURL(options.baseURL);
    const response = await fetch(`${baseURL}/${path}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error', // Never forward credentials to a redirected endpoint.
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = String(data.error?.message || data.message || response.statusText).replaceAll(options.apiKey || '\0', '[redacted]').slice(0, 400);
        throw new Error(`API ${response.status}: ${detail}${response.status === 401 ? ' Check the key or refresh an expired IONOS token.' : ''}`);
    }
    return response;
}

async function listModels(options) {
    const response = await request(options, 'models');
    const data = await response.json();
    if (!Array.isArray(data.data)) throw new Error('This endpoint did not return an OpenAI-compatible model list. Enter a model ID manually.');
    return data.data.filter(m => typeof m.id === 'string').map(m => m.id).sort();
}

async function testConnection(options) {
    const config = validateOptions(options);
    // A reasoning model can use this entire small budget before writing text.
    // An accepted completion still confirms credentials, endpoint and model ID.
    const response = await request(config, 'chat/completions', {
        model: config.model, messages: [{ role: 'user', content: 'Reply OK.' }], max_tokens: 32, stream: false,
    });
    const result = await response.json();
    if (!Array.isArray(result.choices) || !result.choices.length) throw new Error('The endpoint did not return a Chat Completions response.');
}

function createLLM(options) {
    const config = validateOptions(options);
    return { chat: async (messages) => {
        const response = await request(config, 'chat/completions', {
            model: config.model, messages, max_tokens: options.maxTokens || 1024, stream: false,
        }, options.signal);
        const raw = await response.json();
        const content = raw.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('The endpoint returned no answer text. Check the model and token limit.');
        return { content, raw };
    } };
}

function createStreamingLLM(options) {
    const config = validateOptions(options);
    return { streamChat: messages => request(config, 'chat/completions', {
        model: config.model, messages, max_tokens: options.maxTokens || 2048, stream: true,
    }, options.signal) };
}

module.exports = { IONOS_BASE_URL, normalizeBaseURL, validateOptions, listModels, testConnection, createLLM, createStreamingLLM };
