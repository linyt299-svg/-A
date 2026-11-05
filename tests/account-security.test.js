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
