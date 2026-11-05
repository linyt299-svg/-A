'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { deliverAlertWebhook } = require('../server');

function alert(side) {
  return {
    id: `alert-${side}`,
    side,
    title: `${side} alert`,
    message: 'simulation',
    stock: { code: '600000', name: '测试股票' },
    triggerPrice: 10,
    createdAt: new Date().toISOString(),
    channels: { inApp: { status: 'delivered', attempts: 1 }, webhook: { status: 'pending', attempts: 0 } },
  };
}

for (const side of ['buy', 'sell']) {
  test(`${side} alert reaches webhook after bounded retries`, async () => {
    let attempts = 0;
    const logs = [];
    const item = alert(side);
    await deliverAlertWebhook(item, 'https://alerts.example.test/hook', {
      fetchImpl: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('simulated outage');
        return { ok: true, status: 200 };
      },
      logImpl: async (entry) => logs.push(entry),
      persistImpl: async () => {},
      sleepImpl: async () => {},
    });
    assert.equal(attempts, 3);
    assert.equal(item.channels.inApp.status, 'delivered');
    assert.equal(item.channels.webhook.status, 'delivered');
    assert.equal(item.channels.webhook.attempts, 3);
    assert.equal(logs.filter((entry) => entry.status === 'retry').length, 2);
    assert.equal(logs.at(-1).status, 'delivered');
  });
}
