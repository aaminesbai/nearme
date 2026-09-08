import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDistance,
  messageSchema,
  offsetPoint,
  pointSchema,
  profileSchema,
  radiusSchema,
  BORDEAUX,
} from '@nearme/shared';
import { pairKey, tokenHash } from '../src/service';
import { needsPush } from '../src/presence';
test('push is required for disconnected or inactive recipients and suppressed only for the matching active chat', () => {
  assert.equal(needsPush('bob', 'chat1', []), true);
  assert.equal(needsPush('bob', 'chat1', [{ userId: 'bob' }]), true);
  assert.equal(needsPush('bob', 'chat1', [{ userId: 'bob', activeConversation: 'chat2' }]), true);
  assert.equal(needsPush('bob', 'chat1', [{ userId: 'alice', activeConversation: 'chat1' }]), true);
  assert.equal(
    needsPush('bob', 'chat1', [
      { userId: 'bob', activeConversation: 'chat2' },
      { userId: 'bob', activeConversation: 'chat1' },
    ]),
    false,
  );
});
test('radius validates boundaries and rejects coercion traps', () => {
  for (const value of [50, 200, 1000, 5000, '750'])
    assert.equal(radiusSchema.safeParse(value).success, true);
  for (const value of [-1, 0, 49, 5001, Infinity, NaN, '', 'nope', null])
    assert.equal(radiusSchema.safeParse(value).success, false);
});
test('message validation bounds, trims, and rejects forged ids', () => {
  const valid = {
    conversationId: 'fd5e5a90-f27c-4f0e-bc6d-4e643f9ff804',
    clientId: '3672c29e-4260-48c6-a08d-d3669c8f43bf',
    body: ' salut ',
  };
  assert.equal(messageSchema.parse(valid).body, 'salut');
  assert.equal(messageSchema.safeParse({ ...valid, body: ' ' }).success, false);
  assert.equal(messageSchema.safeParse({ ...valid, body: 'a'.repeat(2001) }).success, false);
  assert.equal(messageSchema.safeParse({ ...valid, conversationId: 'forged' }).success, false);
});
test('conversation pair keys symmetric and distinct', () => {
  assert.equal(pairKey('alice', 'bob'), pairKey('bob', 'alice'));
  assert.notEqual(pairKey('alice', 'bob'), pairKey('alice', 'carol'));
});
test('distance labels and geospatial seed offsets', () => {
  assert.equal(formatDistance(80), '80 m');
  assert.equal(formatDistance(1000), '1 km');
  assert.equal(formatDistance(2500), '2.5 km');
  const north = offsetPoint(BORDEAUX, 1113.2, 0);
  assert.ok(Math.abs(north.latitude - BORDEAUX.latitude - 0.01) < 1e-8);
  assert.equal(north.longitude, BORDEAUX.longitude);
  assert.equal(pointSchema.safeParse({ latitude: 91, longitude: 0 }).success, false);
});
test('profile validation and hashed bearer tokens', () => {
  assert.equal(
    profileSchema.parse({ username: '  ALICE ', displayName: 'Alice' }).username,
    'alice',
  );
  assert.equal(profileSchema.safeParse({ username: '<script>', displayName: 'A' }).success, false);
  assert.equal(tokenHash('secret').length, 64);
  assert.notEqual(tokenHash('secret'), tokenHash('other'));
});
