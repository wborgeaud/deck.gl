import test from 'tape-catch';

import Cache from '@deck.gl/layers/text-layer/cache';

test('TextLayer - Cache#Constructor', t => {
  let cache = new Cache();
  cache.clear();

  t.ok(cache.limit === 5, 'Should constructed with default limit.');

  cache = new Cache(3);
  t.ok(cache.limit === 3, 'Should constructed with given limit.');
  t.end();
});

test('TextLayer - Cache#clear', t => {
  const cache = new Cache();

  cache.clear();

  cache.set('key1', 'val1');

  cache.clear();
  t.notOk(cache.get('key1'), 'Should be cleared.');

  t.end();
});

test('TextLayer - Cache#set and get', t => {
  const cache = new Cache(2);
  cache.clear();

  t.notOk(cache.get('key1'), 'Should be empty');

  cache.set('key1', 'val1');
  cache.set('key2', 'val2');

  t.ok(cache.get('key1') === 'val1', 'Should set correctly.');

  cache.set('key3', 'val3');
  t.notOk(cache.get('key1'), 'Should delete the oldest one.');
  t.ok(cache.get('key2') === 'val2', 'Should not be deleted.');
  t.ok(cache.get('key3') === 'val3', 'Should not be deleted.');

  t.end();
});

test('TextLayer - Cache#delete', t => {
  const cache = new Cache(2);
  cache.clear();

  cache.set('key1', 'val1');
  cache.set('key2', 'val2');

  cache.delete('key1');
  t.notOk(cache.get('key1'), 'Should be deleted.');
  t.ok(cache.get('key2') === 'val2', 'Should exist in cache.');

  t.end();
});
