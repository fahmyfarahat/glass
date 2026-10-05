// Run with the packaged Electron binary and ELECTRON_RUN_AS_NODE=1.
// Exercises the shipped files without accessing user data or provider credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

async function main() {
    assert.ok(process.argv[2], 'Pass the packaged Resources directory.');
    const resources = path.resolve(process.argv[2]);
    const root = path.join(resources, 'app.asar');
    assert.ok(fs.existsSync(path.join(resources, 'out/index.html')), 'Web export is missing.');
    assert.ok(fs.existsSync(path.join(root, 'src/ui/app/header.html')), 'Desktop header is missing.');
    const createBackendApp = require(path.join(root, 'pickleglass_web/backend_node'));
    const backend = createBackendApp(new EventEmitter());
    const server = await new Promise((resolve, reject) => {
        const candidate = backend.listen(0, '127.0.0.1', () => resolve(candidate));
        candidate.once('error', reject);
    });
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(typeof body.message, 'string');
        console.log('Packaged backend HTTP request and desktop/web assets passed.');
    } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
