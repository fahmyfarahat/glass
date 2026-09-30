// Run inside Electron's Node runtime so the native SQLite ABI matches the app.
// Uses an in-memory DB and a fake OS vault; it never accesses real credentials.
const assert = require('node:assert/strict');
const Module = require('node:module');
const sqlite = require('../src/features/common/services/sqliteClient');
let vaultAvailable = true;
const original = Module._load;
Module._load = function (name, ...rest) {
    if (name === 'electron') return { safeStorage: {
        isEncryptionAvailable: () => vaultAvailable,
        encryptString: text => Buffer.from(`sealed:${text}`),
        decryptString: data => data.toString().slice(7),
    } };
    if (name === '../../services/encryptionService') return { looksEncrypted: () => false };
    return original.call(this, name, ...rest);
};
const repository = require('../src/features/common/repositories/providerSettings/sqlite.repository');
Module._load = original;

(async () => {
    sqlite.connect(':memory:');
    const db = sqlite.getDb();
    db.exec(`CREATE TABLE provider_settings (provider TEXT PRIMARY KEY, api_key TEXT, selected_llm_model TEXT, selected_stt_model TEXT, is_active_llm INTEGER DEFAULT 0, is_active_stt INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER)`);
    await sqlite.synchronizeSchema();
    assert.ok(db.prepare('PRAGMA table_info(provider_settings)').all().some(column => column.name === 'connection_options'));
    const options = JSON.stringify({ baseURL: 'https://test.example/v1', model: 'test' });
    repository.upsert('ionos', { api_key: 'test-token', connection_options: options, selected_llm_model: 'ionos::configured' });
    const raw = db.prepare('SELECT * FROM provider_settings WHERE provider = ?').get('ionos');
    assert.ok(raw.api_key.startsWith('os:'));
    assert.notEqual(raw.api_key, 'test-token');
    assert.equal(repository.getByProvider('ionos').api_key, 'test-token');
    assert.equal(repository.getAll()[0].api_key, 'test-token');
    repository.setActiveProvider('ionos', 'llm');
    assert.equal(repository.getActiveProvider('llm').api_key, 'test-token');
    assert.equal(repository.getActiveSettings().llm.api_key, 'test-token');
    vaultAvailable = false;
    assert.throws(() => repository.upsert('ionos', { api_key: 'replacement', connection_options: '{}' }), /Secure OS credential storage/);
    assert.equal(repository.getByProvider('ionos').api_key, 'test-token');
    assert.equal(repository.getByProvider('ionos').connection_options, options);
    db.close();
    console.log('Native SQLite migration, credential round trips, and atomic failure checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
