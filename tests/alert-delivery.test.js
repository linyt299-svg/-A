'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { deliverAlertWebhook, deliverWechatWorkAlert } = require('../server');

function alert(side) {
  return {
    id: `alert-${side}`,
    side,
    title: `${side} alert`,
    message: 'simulation',
    stock: { code: '600000', name: '测试股票' },
    triggerPrice: 10,
    createdAt: new Date().toISOString(),
    channels: {
      inApp: { status: 'delivered', attempts: 1 },
      webhook: { status: 'pending', attempts: 0 },
      wechatWork: { status: 'pending', attempts: 0 },
    },
  };
}

test('position alert uses the enterprise WeChat robot payload', async () => {
  const item = alert('sell');
  let requestBody;
  await deliverWechatWorkAlert(item, 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test', {
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ errcode: 0, errmsg: 'ok' }) };
    },
    logImpl: async () => {},
    persistImpl: async () => {},
    sleepImpl: async () => {},
  });

  assert.equal(requestBody.msgtype, 'text');
  assert.match(requestBody.text.content, /测试股票（600000）/);
  assert.equal(item.channels.wechatWork.status, 'delivered');
});

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
