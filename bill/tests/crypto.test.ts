import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptSecret, encryptSecret, hashPassword, maskVpa, safeEqual, verifyPassword } from '../src/lib/crypto';

test('the payee address round-trips and is never plain text in storage', () => {
  const vpa = 'aniruddhasali473@oksbi';
  const token = encryptSecret(vpa);
  assert.notEqual(token.includes(vpa), true);
  assert.equal(decryptSecret(token), vpa);
});

test('a tampered ciphertext fails instead of returning rubbish', () => {
  const token = encryptSecret('demo@okhdfcbank');
  const parts = token.split('.');
  const flipped = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3].slice(0, -2)}AA`;
  assert.throws(() => decryptSecret(flipped));
  assert.throws(() => decryptSecret('v2.aaaa.bbbb.cccc'));
});

test('the mask is recognisable to staff and useless to a stranger', () => {
  const masked = maskVpa('demo-cafe@okhdfcbank');
  assert.equal(masked.includes('demo-cafe'), false);
  assert.match(masked, /^dem•+@okhdfcbank$/);
  assert.equal(maskVpa('notalid'), '••••');
});

test('passwords verify, and only the right one does', () => {
  const hash = hashPassword('Owner#12345');
  assert.equal(hash.startsWith('scrypt$'), true);
  assert.equal(verifyPassword('Owner#12345', hash), true);
  assert.equal(verifyPassword('owner#12345', hash), false);
  assert.equal(verifyPassword('Owner#1234', hash), false);
});

test('two hashes of the same password differ, and junk hashes are refused', () => {
  assert.notEqual(hashPassword('same'), hashPassword('same'));
  assert.equal(verifyPassword('same', 'bcrypt$whatever'), false);
  assert.equal(verifyPassword('same', 'scrypt$onlyonepart'), false);
});

test('safeEqual compares without leaking length timing to unequal inputs', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});
