/* eslint-disable */

let _cache = {};
// update order, first is oldest, last is newest
let _order = [];

/**
 * Cache class with limit
 *
 * Update timestamp for each get/set operation
 * Delete oldest when reach given limit
 */
export default class Cache {
  constructor(limit = 5) {
    this.limit = limit;
  }

  clear() {
    _cache = {};
    _order = [];
  }

  get(key) {
    return _cache[key] ? _cache[key].value : null;
  }

  set(key, value) {
    if (!_cache[key]) {
      // if reach limit, delete the oldest
      if (Object.keys(_cache).length === this.limit) {
        this.delete(_order[0]);
        _order = _order.slice(1);
      }

      _cache[key] = {};
      _order.push(key);
    } else {
      // if found in cache, move the key to end of _order (latest updated)
      const index = _order.findIndex(item => item === key);
      _order.splice(index, 1);
      _order.push(key);
    }

    _cache[key].value = value;
  }

  delete(key) {
    delete _cache[key];
  }
}
