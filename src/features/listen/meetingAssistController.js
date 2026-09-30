// Pure session controller. Dependencies are injected so cancellation and timing
// can be tested without Electron, microphones, or paid provider calls.
class MeetingAssistController {
    constructor({ generate, onState, debounceMs = 1000, cooldownMs = 6000 }) {
        this.generate = generate;
        this.onState = onState;
        this.debounceMs = debounceMs;
        this.cooldownMs = cooldownMs;
        this.active = false;
        this.enabled = false;
        this.turns = [];
        this.revision = 0;
        this.lastStarted = 0;
        this.lastQuestion = '';
    }
    start() {
        this.stop(); this.active = true; this.turns = []; this.lastQuestion = ''; this.lastStarted = 0;
        this.emit({ status: this.enabled ? 'Listening for a question…' : 'Automatic suggestions are off.', answer: '', question: '' });
    }
    stop() {
        this.active = false; this.cancel();
        this.emit({ status: 'Stopped' });
    }
    cancel() {
        this.revision++; clearTimeout(this.timer); this.timer = null;
        this.abortController?.abort(); this.abortController = null;
        this.pending = false; this.busy = false;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        this.cancel();
        this.emit({ status: enabled ? (this.active ? 'Listening for a question…' : 'Press Listen to start.') : 'Automatic suggestions are off.' });
    }
    emit(update) { this.onState?.({ ...update, active: this.active, enabled: this.enabled, busy: this.busy }); }
    addTurn(speaker, text) {
        if (!this.active || typeof text !== 'string' || !text.trim()) return;
        const turn = { speaker, text: text.trim().slice(0, 6000) };
        this.turns.push(turn); this.turns = this.turns.slice(-30);
        if (!this.enabled || speaker !== 'Them' || turn.text.length < 8) return;
        this.pending = true;
        this.schedule();
    }
    schedule() {
        clearTimeout(this.timer);
        if (!this.active || !this.enabled || this.busy || !this.pending) return;
        const delay = Math.max(this.debounceMs, this.cooldownMs - (Date.now() - this.lastStarted));
        this.timer = setTimeout(() => this.suggest(false), delay);
    }
    async suggest(manual = true) {
        if (!this.active || this.busy || (!manual && !this.enabled)) return;
        clearTimeout(this.timer);
        const question = [...this.turns].reverse().find(t => t.speaker === 'Them')?.text || '';
        if (!manual && (!question || question === this.lastQuestion)) { this.pending = false; return; }
        this.pending = false; this.busy = true; this.lastStarted = Date.now();
        const revision = this.revision;
        const abortController = new AbortController(); this.abortController = abortController;
        this.emit({ status: 'Preparing a suggestion…' });
        try {
            const result = await this.generate({ turns: this.turns.slice(), manual, signal: abortController.signal });
            if (revision !== this.revision || abortController.signal.aborted) return;
            this.lastQuestion = question;
            const answer = result.trim();
            if (answer === '[WAIT]') this.emit({ status: 'Listening for a question…' });
            else this.emit({ status: 'Suggestion ready', answer, question });
        } catch (error) {
            if (revision === this.revision && !abortController.signal.aborted) this.emit({ status: `Could not suggest: ${error.message}` });
        } finally {
            if (revision === this.revision) {
                this.busy = false; this.abortController = null; this.emit({}); this.schedule();
            }
        }
    }
}
module.exports = { MeetingAssistController };
