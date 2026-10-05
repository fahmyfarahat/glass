const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocketServer } = require('ws');
const { connectTranscription, transcriptionConfig } = require('../src/features/common/ai/realtimeTranscription');

async function server(t, onConnection) {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(wss, 'listening'); wss.on('connection', onConnection);
    t.after(() => { for (const client of wss.clients) client.terminate(); wss.close(); });
    return `ws://127.0.0.1:${wss.address().port}`;
}
test('GA transcription uses nested 24kHz audio configuration and selected model', () => {
    const config = transcriptionConfig({ model: 'gpt-4o-transcribe', language: 'de' });
    assert.equal(config.type, 'session.update');
    assert.equal(config.session.type, 'transcription');
    assert.deepEqual(config.session.audio.input.format, { type: 'audio/pcm', rate: 24000 });
    assert.equal(config.session.audio.input.transcription.language, 'de');
    assert.equal(config.session.audio.input.transcription.model, 'gpt-4o-transcribe');
});
test('session waits for server acknowledgement before sending audio', async t => {
    let config;
    let acknowledged = false;
    let audioResolve;
    const audio = new Promise(resolve => { audioResolve = resolve; });
    const url = await server(t, ws => ws.on('message', data => {
        const event = JSON.parse(data);
        if (event.type === 'session.update') {
            config = event;
            setTimeout(() => { acknowledged = true; ws.send(JSON.stringify({ type: 'session.updated' })); }, 20);
        } else audioResolve(event);
    }));
    const session = await connectTranscription({ url, headers: {}, timeoutMs: 1000 });
    assert.equal(acknowledged, true);
    assert.equal(config.session.type, 'transcription');
    session.sendRealtimeInput('AAAA');
    assert.deepEqual(await audio, { type: 'input_audio_buffer.append', audio: 'AAAA' });
    session.close();
});
test('server rejection fails initialization and closes the socket', async t => {
    const url = await server(t, ws => ws.on('message', () => ws.send(JSON.stringify({ type: 'error', error: { message: 'invalid model' } }))));
    await assert.rejects(connectTranscription({ url, headers: {}, timeoutMs: 1000 }), /invalid model/);
});
test('missing session acknowledgement times out', async t => {
    const url = await server(t, () => {});
    await assert.rejects(connectTranscription({ url, headers: {}, timeoutMs: 30 }), /timed out/);
});
