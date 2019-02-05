/**
 * LRU Cache class with limit
 *
 * Update timestamp for each get/set operation
 * Delete oldest when reach given limit
 */
export default class LRUCache {
  constructor(limit = 5) {
    this.limit = limit;

    this.clear();
  }

  clear() {
    this._cache = {};

    const head = this._getNode({key: `${this}._head`});
    const tail = this._getNode({key: `${this}._tail`});
    this._head = Object.assign(head, {next: tail});
    this._tail = Object.assign(tail, tail, {prev: head});
  }

  get(key) {
    const node = this._cache[key];
    if (node) {
      this.delete(key);
      this._insertFront(key, node.value);
    }
    return node && node.value;
  }

  set(key, value) {
    if (!this._cache[key]) {
      // if reach limit, delete the oldest
      if (Object.keys(this._cache).length === this.limit) {
        this.delete(this._tail.prev.key);
      }
      this._insertFront(key, value);
    } else {
      // if found in cache, delete the old one, insert new one to the first of list
      this.delete(key);
      this._insertFront(key, value);
    }
  }

  _getNode({key, value = null, prev = null, next = null}) {
    return {
      key,
      value,
      prev,
      next
    };
  }

  _insertFront(key, value) {
    const node = this._getNode({
      key,
      value,
      prev: this._head,
      next: this._head.next
    });

    node.next.prev = node;
    this._head.next = node;

    this._cache[key] = node;
  }

  delete(key) {
    const node = this._cache[key];
    if (node) {
      delete this._cache[key];

      node.prev.next = node.next;
      node.next.prev = node.prev;
    }
  }
}
