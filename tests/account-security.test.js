'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encryptSecret,
  decryptSecret,
  passwordRecord,
  verifyUserPassword,
  canManageAiSettings,
  canCreateSubAccounts,
  aiEndpoint,
  requestAiCompletion,
  verifyAiConfig,
  userAiConfig,
} = require('../server');

test('encrypts AI API keys without retaining plaintext', () => {
  const key = 'sk-test-secret-1234567890';
  const encrypted = encryptSecret(key);
  assert.notEqual(encrypted, key);
  assert.equal(encrypted.includes(key), false);
  assert.equal(decryptSecret(encrypted), key);
});

test('child accounts can only manage their own AI settings', () => {
  const child = { id: 'child-a', phone: '13800000000', role: 'member' };
  const other = { id: 'child-b', phone: '13900000000', role: 'member' };
  const admin = { id: 'admin', phone: '15759863163', role: 'super_admin' };
  assert.equal(canManageAiSettings(child, child.id), true);
  assert.equal(canManageAiSettings(child, other.id), false);
  assert.equal(canManageAiSettings(admin, child.id), false);
  assert.equal(canCreateSubAccounts(child), false);
  assert.equal(canCreateSubAccounts(admin), true);
});

test('stores child account passwords as salted hashes', () => {
  const record = passwordRecord('a-secure-password');
  const user = { ...record };
  assert.equal(record.passwordHash.includes('a-secure-password'), false);
  assert.equal(verifyUserPassword(user, 'a-secure-password'), true);
  assert.equal(verifyUserPassword(user, 'wrong-password'), false);
});

test('uses personal AI settings when present', () => {
  const key = 'sk-personal-test-1234567890';
  const config = userAiConfig({
    id: 'user-a',
    aiKeyEncrypted: encryptSecret(key),
    aiBaseUrl: 'https://api.example.com/v1',
    aiModel: 'example-chat',
  });
  assert.deepEqual(config, {
    apiKey: key,
    baseUrl: 'https://api.example.com/v1',
    model: 'example-chat',
    source: 'personal',
  });
});

test('normalizes chat completion endpoints', () => {
  assert.equal(aiEndpoint('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
  assert.equal(aiEndpoint('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1/chat/completions');
});

test('verifies AI settings through the configured provider', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '连接成功' } }] }),
    };
  };
  const config = { apiKey: 'sk-test-1234567890', baseUrl: 'https://api.example.com/v1', model: 'example-chat' };
  assert.deepEqual(await verifyAiConfig(config, { fetchImpl, timeoutMs: 1_000 }), { ok: true });
  assert.equal(request.url, 'https://api.example.com/v1/chat/completions');
  assert.match(request.options.headers.Authorization, /^Bearer sk-test/);
});

test('reports provider errors instead of accepting a broken AI config', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: 'invalid api key' } }),
  });
  await assert.rejects(
    () => requestAiCompletion(
      { apiKey: 'sk-invalid-123456', baseUrl: 'https://api.example.com/v1', model: 'example-chat' },
      [{ role: 'user', content: 'test' }],
      { fetchImpl, timeoutMs: 1_000 },
    ),
    /invalid api key/,
  );
});
