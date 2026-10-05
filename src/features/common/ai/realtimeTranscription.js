const WebSocket = require('ws');

function transcriptionConfig({ model = 'gpt-4o-mini-transcribe', language = 'en', prompt = '' } = {}) {
    return {
        type: 'session.update',
        session: { type: 'transcription', audio: { input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model, language, prompt },
            turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 600 },
            noise_reduction: { type: 'near_field' },
        } } },
    };
}

function connectTranscription({ url, headers, callbacks = {}, timeoutMs = 15000, ...options }) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, { headers, handshakeTimeout: timeoutMs });
        let ready = false;
        let closed = false;
        const close = () => {
            closed = true;
            clearTimeout(timer);
            if (ws.readyState === WebSocket.OPEN) ws.close();
            else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
        };
        const fail = error => {
            if (closed) return;
            reject(error);
            callbacks.onerror?.(error);
            close();
        };
        const timer = setTimeout(() => fail(new Error('OpenAI transcription setup timed out.')), timeoutMs);
        ws.on('open', () => ws.send(JSON.stringify(transcriptionConfig(options))));
        ws.on('message', data => {
            if (closed) return;
            let message;
            try { message = JSON.parse(data); } catch { return; }
            if (message.type === 'error') {
                fail(new Error(message.error?.message || 'OpenAI transcription error'));
                return;
            }
            if (message.type === 'session.updated' && !ready) {
                ready = true;
                clearTimeout(timer);
                resolve({
                    sendRealtimeInput(audio) {
                        if (!closed && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
                    },
                    keepAlive() { if (!closed && ws.readyState === WebSocket.OPEN) ws.ping(); },
                    close,
                });
            }
            callbacks.onmessage?.({ ...message, provider: 'openai' });
        });
        ws.on('error', fail);
        ws.on('close', (code, reason) => {
            clearTimeout(timer);
            if (!ready) reject(new Error(`OpenAI transcription connection closed (${code}).`));
            closed = true;
            callbacks.onclose?.({ code, reason: reason.toString() });
        });
    });
}
module.exports = { transcriptionConfig, connectTranscription };
