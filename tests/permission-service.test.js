const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/features/common/services/permissionService'), 'utf8');
const settingsURL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

function loadService(getSources, openExternal) {
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, process: { platform: 'darwin' }, console: { log() {}, error() {} },
        require: name => {
            if (name === 'electron') return { systemPreferences: {}, shell: { openExternal }, desktopCapturer: { getSources } };
            if (name === '../repositories/permission') return {};
            throw new Error(`Unexpected dependency: ${name}`);
        },
    });
    return module.exports;
}

test('screen settings still open when capture permission is denied', async () => {
    const opened = [];
    const service = loadService(async () => { throw new Error('Access denied'); }, async url => opened.push(url));
    assert.equal((await service.openSystemPreferences('screen-recording')).success, true);
    assert.deepEqual(opened, [settingsURL]);
});

test('a pending capture permission prompt does not block opening Settings', async () => {
    const opened = [];
    const service = loadService(() => new Promise(() => {}), async url => opened.push(url));
    let timer;
    try {
        const result = await Promise.race([
            service.openSystemPreferences('screen-recording'),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Settings was blocked by capture')), 500); }),
        ]);
        assert.equal(result.success, true);
        assert.deepEqual(opened, [settingsURL]);
    } finally { clearTimeout(timer); }
});

test('Settings launch failures are returned to the renderer', async () => {
    const service = loadService(async () => [], async () => { throw new Error('Settings unavailable'); });
    const result = await service.openSystemPreferences('screen-recording');
    assert.equal(result.success, false);
    assert.equal(result.error, 'Settings unavailable');
});

test('unknown settings sections cannot open external URLs', async () => {
    const service = loadService(() => assert.fail('Capture should not start'), () => assert.fail('Settings should not open'));
    assert.equal((await service.openSystemPreferences('https://example.com')).success, false);
});
