const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const http = require('node:http');
const { once } = require('node:events');

function loadService() {
    const rows = new Map([['openai', { provider: 'openai', api_key: 'openai-key', selected_llm_model: 'gpt-4.1', selected_stt_model: 'gpt-4o-mini-transcribe' }]]);
    const active = { llm: 'openai', stt: 'openai' };
    const repo = {
        getByProvider: async id => rows.get(id), getAll: async () => [...rows.values()],
        upsert: async (id, data) => rows.set(id, { ...data, provider: id }),
        getActiveProvider: async type => rows.get(active[type]),
        getActiveSettings: async () => ({ llm: rows.get(active.llm), stt: rows.get(active.stt) }),
        setActiveProvider: async (id, type) => { active[type] = id; },
    };
    const original = Module._load;
    Module._load = function (name, ...rest) {
        if (name === 'electron-store') return class {
            constructor() { this.values = new Map(); }
            get(key, fallback) { return this.values.get(key) ?? fallback; }
            set(key, value) { this.values.set(key, value); }
        };
        if (name === '../repositories/providerSettings') return repo;
        if (name === './encryptionService') return {};
        if (name === './authService') return { getCurrentUser: () => ({ isLoggedIn: false }) };
        if (name === '../repositories/ollamaModel') return { getInstalledModels: () => [] };
        return original.call(this, name, ...rest);
    };
    const path = require.resolve('../src/features/common/services/modelStateService');
    delete require.cache[path];
    try { return { service: require(path), rows }; } finally { Module._load = original; }
}
test('configurable models route to their endpoint while OpenAI remains the speech provider', async t => {
    const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const baseURL = `http://127.0.0.1:${server.address().port}/v1`;
    const { service } = loadService();
    assert.deepEqual(await service.configureProvider('ionos', { baseURL, key: 'ionos-token', model: 'gpt-4.1' }), { success: true });
    const info = await service.getCurrentModelInfo('llm');
    assert.equal(info.provider, 'ionos'); assert.equal(info.model, 'gpt-4.1'); assert.equal(info.baseURL, baseURL);
    assert.equal((await service.getCurrentModelInfo('stt')).provider, 'openai');
    assert.equal((await service.getSelectedModels()).llm, 'ionos::configured');
    assert.equal((await service.getLiveState()).apiKeys.ionos, 'configured');
    assert.equal((await service.getAllApiKeys()).ionos, 'configured');
    assert.equal(await service.areProvidersConfigured(), true);
    assert.equal((await service.configureProvider('ionos', { baseURL, key: '', model: 'org/another-model' })).success, true);
    assert.equal((await service.getCurrentModelInfo('llm')).model, 'org/another-model');
    // A saved token must not be silently reused at a newly entered endpoint.
    const result = await service.configureProvider('ionos', { baseURL: 'https://different.example/v1', model: 'test' });
    assert.equal(result.success, false);
    assert.equal((await service.getCurrentModelInfo('llm')).baseURL, baseURL);
});
