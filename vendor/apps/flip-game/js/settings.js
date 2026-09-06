// settings.js — the single persisted user-preference store. Loaded after
// audio and before records/main as a classic script.
(function (root) {
  'use strict';

  // Re-evaluating a classic script must not create a second in-memory store.
  // This also guarantees the identifier used by later scripts is the exact
  // object exposed through window.Settings.
  if (root.Settings &&
      typeof root.Settings.setSound === 'function' &&
      typeof root.Settings.setReduceMotion === 'function' &&
      typeof root.Settings.setFeel === 'function' &&
      typeof root.Settings.setFlickFeedback === 'function') return;

  const KEY = 'flipgame.settings.v1';
  const LEGACY_SETUP_KEY = 'flipgame.setup.v2';
  const FEELS = ['forgiving', 'standard', 'pro'];
  const DEFAULTS = {
    sound: true,
    reduceMotion: false,
    feel: 'standard',
    flickFeedback: false,
  };
  const storage = root.localStorage;

  function readObject(key) {
    try {
      const value = JSON.parse(storage.getItem(key));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }

  function hasBoolean(source, key) {
    return !!source && typeof source[key] === 'boolean';
  }

  function hasFeel(source) {
    return !!source && FEELS.includes(source.feel);
  }

  const stored = readObject(KEY);
  const legacySetup = readObject(LEGACY_SETUP_KEY);
  const migrateLegacyReduceMotion = hasBoolean(legacySetup, 'reduceMotion');
  const migrateLegacyFeel = hasFeel(legacySetup);
  const migrateLegacyFeedback = hasBoolean(legacySetup, 'feedback');
  let data = {
    ...(stored || {}),
    sound: hasBoolean(stored, 'sound') ? stored.sound : DEFAULTS.sound,
    reduceMotion: migrateLegacyReduceMotion ? legacySetup.reduceMotion
      : (hasBoolean(stored, 'reduceMotion') ? stored.reduceMotion : DEFAULTS.reduceMotion),
    feel: migrateLegacyFeel ? legacySetup.feel
      : (hasFeel(stored) ? stored.feel : DEFAULTS.feel),
    flickFeedback: migrateLegacyFeedback ? legacySetup.feedback
      : (hasBoolean(stored, 'flickFeedback') ? stored.flickFeedback : DEFAULTS.flickFeedback),
  };

  function save() {
    try {
      storage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (_) { return false; }
  }

  // In v110, setup controls were persisted even when their guarded Settings
  // setters did not run, so a complete canonical object can contain stale
  // defaults. Setup selections win exactly once; sound has no setup copy.
  let canonicalReady = true;
  if (!stored || !hasBoolean(stored, 'sound') || !hasBoolean(stored, 'reduceMotion') ||
      !hasFeel(stored) || !hasBoolean(stored, 'flickFeedback') ||
      migrateLegacyReduceMotion || migrateLegacyFeel || migrateLegacyFeedback) canonicalReady = save();

  // Preferences no longer live in setup v2. Remove only the obsolete copies
  // and preserve every roster/format field and any future unknown data.
  if (canonicalReady && legacySetup && ['feel', 'feedback', 'reduceMotion'].some((key) =>
      Object.prototype.hasOwnProperty.call(legacySetup, key))) {
    const cleaned = { ...legacySetup };
    delete cleaned.feel;
    delete cleaned.feedback;
    delete cleaned.reduceMotion;
    try { storage.setItem(LEGACY_SETUP_KEY, JSON.stringify(cleaned)); } catch (_) {}
  }

  const settings = Object.freeze({
    get sound()         { return data.sound; },
    get reduceMotion()  { return data.reduceMotion; },
    get feel()          { return data.feel; },
    get flickFeedback() { return data.flickFeedback; },
    setSound(value) {
      data.sound = !!value;
      save();
    },
    setReduceMotion(value) {
      data.reduceMotion = !!value;
      save();
    },
    setFeel(value) {
      data.feel = FEELS.includes(value) ? value : 'standard';
      save();
    },
    setFlickFeedback(value) {
      data.flickFeedback = !!value;
      save();
    },
  });

  root.Settings = settings;
})(typeof window !== 'undefined' ? window : globalThis);
