const test = require('node:test');
const assert = require('node:assert/strict');
const { MeetingAssistController } = require('../src/features/listen/meetingAssistController');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('only an active, enabled session responds automatically to the other speaker', async () => {
    const calls = [];
    const controller = new MeetingAssistController({ debounceMs: 5, cooldownMs: 0, generate: async data => { calls.push(data); return 'Answer'; } });
    controller.addTurn('Them', 'How does Kubernetes work?');
    controller.start(); controller.addTurn('Them', 'How does Kubernetes work?');
    await delay(20); assert.equal(calls.length, 0);
    controller.setEnabled(true); controller.addTurn('Me', 'How does Kubernetes work?');
    await delay(20); assert.equal(calls.length, 0);
    controller.addTurn('Them', 'How does leader election work?');
    await delay(30); assert.equal(calls.length, 1);
    controller.stop();
});
test('rapid utterances coalesce and duplicate questions are suppressed', async () => {
    const calls = [];
    const controller = new MeetingAssistController({ debounceMs: 10, cooldownMs: 0, generate: async data => { calls.push(data); return 'Answer'; } });
    controller.setEnabled(true); controller.start();
    controller.addTurn('Them', 'Can you explain?'); controller.addTurn('Them', 'How do pods communicate?');
    await delay(30); assert.equal(calls.length, 1); assert.equal(calls[0].turns.at(-1).text, 'How do pods communicate?');
    controller.addTurn('Them', 'How do pods communicate?');
    await delay(30); assert.equal(calls.length, 1); controller.stop();
});
test('stop aborts pending requests and suppresses late answers', async () => {
    let finish; let request;
    const states = [];
    const controller = new MeetingAssistController({ onState: state => states.push(state), generate: data => { request = data; return new Promise(resolve => { finish = resolve; }); } });
    controller.start(); controller.addTurn('Them', 'What is a quorum?');
    const running = controller.suggest();
    controller.stop(); assert.equal(request.signal.aborted, true);
    finish('A late answer'); await running;
    assert.equal(states.some(state => state.answer === 'A late answer'), false);
});
test('only one request runs and a new question is handled afterward', async () => {
    const calls = []; let finish;
    const controller = new MeetingAssistController({ debounceMs: 5, cooldownMs: 0, generate: data => {
        calls.push(data); return calls.length === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve('Second answer');
    } });
    controller.setEnabled(true); controller.start(); controller.addTurn('Them', 'Question one?');
    await delay(20); controller.addTurn('Them', 'Question two?');
    await delay(20); assert.equal(calls.length, 1);
    finish('First answer'); await delay(30); assert.equal(calls.length, 2); controller.stop();
});
test('WAIT keeps the previous answer, and disabling cancels scheduled work', async () => {
    const states = []; let calls = 0;
    const controller = new MeetingAssistController({ debounceMs: 20, cooldownMs: 0, onState: state => states.push(state), generate: async () => { calls++; return '[WAIT]'; } });
    controller.setEnabled(true); controller.start(); await controller.suggest();
    assert.equal(states.some(state => state.answer === '[WAIT]'), false);
    controller.addTurn('Them', 'One more question?'); controller.setEnabled(false);
    await delay(40); assert.equal(calls, 1); controller.stop();
});
