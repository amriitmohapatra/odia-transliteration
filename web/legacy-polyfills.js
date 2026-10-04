/*
 * Polyfills for the legacy build (docs/odia-app-legacy.html).
 *
 * Prepended to the bundle, so it runs before any application code.
 *
 * Why this file exists: macOS Big Sur tops out at an older Safari, and the app
 * failed there with
 *
 *     Engine failed to load: Object.hasOwn is not a function
 *
 * `Object.hasOwn` is ES2022 and needs Safari 15.4; Big Sur ships 14.x for most
 * people. It comes from the smol-toml dependency, not from our own code.
 *
 * esbuild downlevels *syntax* for an old target but never polyfills *built-ins*,
 * so a low `target` alone would not have fixed this.
 *
 * Everything below is feature-detected, so on a current browser this file is a
 * no-op. Only methods the bundle actually uses are included — this is not a
 * general-purpose shim.
 */
(function () {
  'use strict';

  // ES2022 — Safari 15.4. The one that actually broke Big Sur.
  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value: function hasOwn(target, key) {
        if (target === null || target === undefined) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
        return Object.prototype.hasOwnProperty.call(Object(target), key);
      },
      configurable: true,
      writable: true,
    });
  }

  // ES2021 — Safari 13.1. Present on Big Sur, but cheap to guarantee.
  if (typeof String.prototype.replaceAll !== 'function') {
    Object.defineProperty(String.prototype, 'replaceAll', {
      value: function replaceAll(search, replacement) {
        if (Object.prototype.toString.call(search) === '[object RegExp]') {
          if (!search.global) {
            throw new TypeError('replaceAll must be called with a global RegExp');
          }
          return this.replace(search, replacement);
        }
        return this.split(String(search)).join(String(replacement));
      },
      configurable: true,
      writable: true,
    });
  }

  // ES2022 — Safari 15.4.
  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      value: function at(index) {
        var i = Math.trunc(index) || 0;
        if (i < 0) i += this.length;
        return i < 0 || i >= this.length ? undefined : this[i];
      },
      configurable: true,
      writable: true,
    });
  }
  if (typeof String.prototype.at !== 'function') {
    Object.defineProperty(String.prototype, 'at', {
      value: function at(index) {
        var i = Math.trunc(index) || 0;
        if (i < 0) i += this.length;
        return i < 0 || i >= this.length ? undefined : this[i];
      },
      configurable: true,
      writable: true,
    });
  }

  // ES2019 — Safari 12.1.
  if (typeof Object.fromEntries !== 'function') {
    Object.defineProperty(Object, 'fromEntries', {
      value: function fromEntries(entries) {
        var out = {};
        var list = Array.from(entries);
        for (var i = 0; i < list.length; i += 1) out[list[i][0]] = list[i][1];
        return out;
      },
      configurable: true,
      writable: true,
    });
  }

  // ES2023 — Safari 15.4.
  if (typeof Array.prototype.findLast !== 'function') {
    Object.defineProperty(Array.prototype, 'findLast', {
      value: function findLast(predicate, thisArg) {
        for (var i = this.length - 1; i >= 0; i -= 1) {
          if (predicate.call(thisArg, this[i], i, this)) return this[i];
        }
        return undefined;
      },
      configurable: true,
      writable: true,
    });
  }
})();
