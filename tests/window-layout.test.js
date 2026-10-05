const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const display = { workArea: { x: 100, y: 40, width: 1200, height: 600 } };
Module._load = function (name, ...rest) {
    if (name === 'electron') return { screen: { getDisplayNearestPoint: () => display } };
    return originalLoad.call(this, name, ...rest);
};
const WindowLayoutManager = require('../src/window/windowLayoutManager');
Module._load = originalLoad;
const manager = new WindowLayoutManager(new Map());
const header = { isDestroyed: () => false, getBounds: () => ({ x: 1000, y: 500, width: 353, height: 47 }) };

test('expanding setup near a display edge keeps its controls on screen', () => {
    const bounds = manager.calculateHeaderResize(header, { width: 456, height: 500 });
    assert.deepEqual(bounds, { x: 844, y: 140, width: 456, height: 500 });
});

test('setup height is limited to the current display work area', () => {
    const bounds = manager.calculateHeaderResize(header, { width: 456, height: 720 });
    assert.deepEqual(bounds, { x: 844, y: 40, width: 456, height: 600 });
});
