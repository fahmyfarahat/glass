import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class EndpointSettings extends LitElement {
    static properties = { provider: {}, connection: { type: Object }, configured: { type: Boolean }, status: {}, busy: { type: Boolean }, models: { type: Array } };
    static styles = css`
        :host { display:block; padding:12px 0; font:12px -apple-system,sans-serif; color:#eee; border-bottom:1px solid #ffffff22; }
        h4 { margin:0 0 10px; } label { display:block; margin:8px 0; color:#ccc; }
        input { display:block; box-sizing:border-box; width:100%; margin-top:4px; padding:8px; color:white; background:#24252b; border:1px solid #555; border-radius:6px; }
        input[type=checkbox] { display:inline; width:auto; } button { margin:4px 6px 4px 0; background:#323540; color:white; border:1px solid #666; border-radius:6px; padding:7px; cursor:pointer; }
        p { font-size:11px; line-height:1.5; color:#c8cad2; overflow-wrap:anywhere; } button:disabled { opacity:.5; }
    `;
    constructor() { super(); this.connection = {}; this.models = []; this.status = ''; this.busy = false; }
    options() {
        return { provider: this.provider, key: this.renderRoot.querySelector('#key').value,
            baseURL: this.renderRoot.querySelector('#url').value, model: this.renderRoot.querySelector('#model').value,
            supportsVision: this.renderRoot.querySelector('#vision').checked };
    }
    async run(action) {
        this.busy = true; this.status = '';
        try {
            const result = await window.api.providers[action](this.options());
            if (!result.success) throw new Error(result.error);
            if (action === 'listModels') { this.models = result.models; this.status = `${result.models.length} models loaded. Choose or enter the exact model ID.`; }
            else { this.status = 'Connection tested and selected for answers.'; this.renderRoot.querySelector('#key').value = ''; this.dispatchEvent(new CustomEvent('provider-saved', { bubbles: true, composed: true })); }
        } catch (error) { this.status = error.message; }
        finally { this.busy = false; }
    }
    render() {
        return html`<h4>${this.provider === 'ionos' ? 'IONOS AI Model Hub' : 'Custom OpenAI-compatible API'}</h4>
            <label>API base URL<input id="url" type="url" .value=${this.connection.baseURL || ''} placeholder="https://your-endpoint/v1" /></label>
            <label>${this.provider === 'ionos' ? 'IONOS token' : 'API key'}<input id="key" type="password" autocomplete="off" placeholder=${this.configured ? 'Saved securely — leave blank to keep' : 'Enter key or token'} /></label>
            <label>Model ID<input id="model" list="models" .value=${this.connection.model || ''} placeholder="Exact ID from your provider" /></label>
            <datalist id="models">${this.models.map(id => html`<option value=${id}></option>`)}</datalist>
            <label><input id="vision" type="checkbox" .checked=${this.connection.supportsVision === true} /> This model accepts images</label>
            <p>For text models, screen context is described by OpenAI first. Keep an OpenAI key saved to use this option.</p>
            <button ?disabled=${this.busy} @click=${() => this.run('listModels')}>Load models</button>
            <button ?disabled=${this.busy} @click=${() => this.run('configure')}>${this.busy ? 'Checking…' : 'Save and test'}</button>
            ${this.configured ? html`<button ?disabled=${this.busy} @click=${async () => { await window.api.settingsView.removeApiKey(this.provider); this.status = 'Key removed.'; this.dispatchEvent(new CustomEvent('provider-saved', { bubbles: true, composed: true })); }}>Remove key</button>` : ''}
            <p role="status">${this.status}</p>`;
    }
}
customElements.define('endpoint-settings', EndpointSettings);
