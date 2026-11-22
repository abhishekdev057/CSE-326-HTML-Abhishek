/* ==========================================================================
   Barterly — Storage
   Safe wrapper around localStorage. Every call is guarded because storage
   can be unavailable (private mode, blocked site data, file:// quirks).
   All keys are namespaced with "ss-" (kept from the first project name so
   existing saved accounts, drafts and theme choices keep working).
   ========================================================================== */
(function (SE) {
  'use strict';

  var PREFIX = 'ss-';

  function get(key, fallback) {
    try {
      var value = window.localStorage.getItem(PREFIX + key);
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch (e) { /* ignore */ }
  }

  function getJSON(key, fallback) {
    var raw = get(key, null);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function setJSON(key, value) {
    return set(key, JSON.stringify(value));
  }

  SE.storage = { get: get, set: set, remove: remove, getJSON: getJSON, setJSON: setJSON };
})(window.SE = window.SE || {});
