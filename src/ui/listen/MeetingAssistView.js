import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

class MeetingAssistView extends LitElement {
    static properties = { state: { type: Object }, sources: { type: Array }, error: {}, expanded: { type: Boolean } };
    static styles = css`
        :host { display:block; color:#eef1fa; font:12px -apple-system,sans-serif; }
        section { padding:14px; border-bottom:1px solid #ffffff25; background:#182134; }
        header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        h3 { font-size:13px; margin:0; } p { color:#bcc6db; font-size:11px; line-height:1.45; margin:8px 0; }
        .answer { white-space:pre-wrap; font-size:13px; line-height:1.55; max-height:240px; overflow:auto; user-select:text; }
        .question { color:#a5b9e9; max-height:45px; overflow:auto; }
        select, textarea { box-sizing:border-box; width:100%; background:#111b2c; color:white; border:1px solid #53627e; border-radius:5px; padding:7px; margin:5px 0; }
        button { border:1px solid #6e7e9a; border-radius:5px; background:#233757; color:white; padding:6px 8px; cursor:pointer; margin:4px 6px 0 0; }
        button:disabled { opacity:.5; cursor:default; } label { display:block; margin:8px 0; } .error { color:#ffb1b1; } .dot { color:#79e3b8; }
    `;
    constructor() { super(); this.state = { settings: {} }; this.sources = []; this.error = ''; this.expanded = false; }
    connectedCallback() {
        super.connectedCallback();
        this.listener = (_event, state) => { this.state = state; };
        window.api?.meetingAssist.onState(this.listener);
        window.api?.meetingAssist.getState().then(state => { this.state = state; });
    }
    disconnectedCallback() { super.disconnectedCallback(); window.api?.meetingAssist.removeOnState(this.listener); }
    updated() { this.dispatchEvent(new CustomEvent('assist-resized', { bubbles: true, composed: true })); }
    async configure(update) {
        this.error = '';
        try { this.state = await window.api.meetingAssist.configure(update); }
        catch (error) { this.error = error.message; }
    }
    async loadSources() {
        try { this.sources = await window.api.meetingAssist.sources(); this.error = ''; }
        catch (error) { this.error = error.message; }
    }
    render() {
        const settings = this.state.settings || {};
        return html`<section>
            <header><h3><span class="dot">${this.state.active ? '●' : '○'}</span> Meeting assistant</h3>
                <button @click=${() => { this.expanded = !this.expanded; }}>Options</button></header>
            <label><input type="checkbox" .checked=${settings.enabled === true} @change=${e => this.configure({ enabled: e.target.checked })} /> Suggest answers automatically</label>
            ${this.expanded ? html`
                <p>Listen captures your microphone and meeting audio. Suggestions use your selected answer provider.</p>
                <label>Meeting background<textarea rows="2" maxlength="2000" placeholder="Topic, role, or useful context" .value=${settings.background || ''} @change=${e => this.configure({ background: e.target.value })}></textarea></label>
                <button @click=${this.loadSources}>Choose / refresh windows</button>
                <select aria-label="Screen context source" .value=${settings.sourceId || ''} @change=${e => this.configure({ sourceId: e.target.value })}>
                    <option value="">Select a window or screen</option>
                    ${this.sources.map(source => html`<option value=${source.id}>${source.name}</option>`)}
                </select>
                <label><input type="checkbox" .checked=${settings.screenEnabled === true} @change=${e => this.configure({ screenEnabled: e.target.checked })} /> Include the selected screen</label>
                <p>Frames stay in memory. A frame is sent when generating a suggestion. Text-only answer models use OpenAI to read it first.</p>
            ` : ''}
            <p role="status">${this.state.status}</p>
            ${settings.screenEnabled ? html`<p>${this.state.screenStatus}</p>` : ''}
            ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : ''}
            ${this.state.answer ? html`<p class="question">${this.state.question}</p><div class="answer">${this.state.answer}</div>` : ''}
            <button ?disabled=${!this.state.active || this.state.busy} @click=${() => window.api.meetingAssist.suggest()}>Suggest now</button>
            ${this.state.answer ? html`<button @click=${() => navigator.clipboard.writeText(this.state.answer)}>Copy answer</button>` : ''}
        </section>`;
    }
}
customElements.define('meeting-assist-view', MeetingAssistView);
