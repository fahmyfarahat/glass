const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
if (process.platform !== 'darwin') throw new Error('Local macOS packaging must run on macOS.');
const root = path.resolve(__dirname, '..');
const run = (command, args, extra = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', ...extra });
run('npm', ['run', 'build:all']);
run(path.join(root, 'node_modules/.bin/electron-builder'), [
    '--mac', '--arm64', '--dir', '--publish', 'never', '--config.electronDist=node_modules/electron/dist',
], { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
const app = path.join(root, 'dist/mac-arm64/Glass Meeting Assistant.app');
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--entitlements', 'entitlements.plist', app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const archive = path.join(root, 'dist/Glass-Meeting-Assistant-mac-arm64.zip');
if (fs.existsSync(archive)) fs.unlinkSync(archive);
run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
console.log(`Built ${archive}`);
