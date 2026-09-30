const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

function loadService() {
    const calls = [];
    const models = Object.assign(new EventEmitter(), { getCurrentModelInfo: async () => ({ provider: 'ionos', model: 'test', apiKey: 'token', baseURL: 'https://example.com/v1' }) });
    const capture = { getSources: async () => [{ id: 'window:chosen', name: 'Meet', thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from('chosen-frame') } }] };
    const original = Module._load;
    Module._load = function (name, ...rest) {
        if (name === 'electron') return { desktopCapturer: capture, BrowserWindow: { getAllWindows: () => [] }, systemPreferences: { getMediaAccessStatus: () => 'granted' } };
        if (name === 'electron-store') return class { get(key) { return key === 'enabled' ? false : ''; } set() {} };
        if (name === '../common/services/modelStateService') return models;
        if (name === '../common/repositories/providerSettings') return { getByProvider: async () => ({ api_key: 'openai-key' }) };
        if (name === '../common/ai/screenContext') return { describeScreen: async image => { calls.push({ provider: 'vision', image }); return 'Visible question: explain a quorum.'; } };
        if (name === '../common/ai/factory') return { createLLM: (provider, options) => ({ chat: async messages => { calls.push({ provider, options, messages }); return { content: 'A quorum is a majority.' }; } }) };
        return original.call(this, name, ...rest);
    };
    const path = require.resolve('../src/features/listen/meetingAssistService'); delete require.cache[path];
    try { return { service: require(path), calls, capture }; } finally { Module._load = original; }
}
test('selected screen is described separately for a text-only answer model', async () => {
    const { service, calls } = loadService();
    service.controller.active = true;
    service.settings.screenEnabled = true; service.settings.sourceId = 'window:chosen';
    await service.captureFrame();
    const answer = await service.generate({ turns: [{ speaker: 'Them', text: 'Explain a quorum?' }], manual: false, signal: new AbortController().signal });
    assert.equal(answer, 'A quorum is a majority.');
    assert.equal(calls[0].provider, 'vision');
    assert.equal(calls[0].image, Buffer.from('chosen-frame').toString('base64'));
    assert.equal(calls[1].provider, 'ionos');
    assert.match(calls[1].messages[1].content, /Screen description from OpenAI/);
    assert.doesNotMatch(calls[1].messages[1].content, /data:image/);
    service.stop(); assert.equal(service.frame, null);
});
test('no screen is captured or sent when screen context is off', async () => {
    const { service, calls, capture } = loadService();
    capture.getSources = async () => { throw new Error('Must not capture'); };
    service.controller.active = true;
    await service.generate({ turns: [], manual: true, signal: new AbortController().signal });
    assert.equal(calls.length, 1); assert.equal(calls[0].provider, 'ionos'); service.stop();
});
test('capture completing after Stop cannot restore a frame', async () => {
    const { service, capture } = loadService();
    let finish;
    capture.getSources = () => new Promise(resolve => { finish = resolve; });
    service.controller.active = true; service.settings.screenEnabled = true;
    const pending = service.captureFrame(); service.stop();
    finish([{ id: 'window:chosen', thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from('late') } }]);
    await pending; assert.equal(service.frame, null); assert.equal(service.state.active, false);
});
test('enabling screen context requires an available selected source', async () => {
    const { service } = loadService();
    await assert.rejects(service.configure({ screenEnabled: true, sourceId: 'window:missing' }), /Choose an available/);
    assert.equal(service.settings.screenEnabled, false); service.stop();
});
