// v111-name-policy.js -- deterministic, device-local player-name safety.
(function (root, factory) {
  'use strict';
  var Interfaces = root && root.FlipgameV111Interfaces;
  var Runtime = root && root.FlipgameV111Runtime;
  if (typeof module === 'object' && module.exports) {
    Interfaces = require('./v111-interfaces.js');
    Runtime = require('./v111-runtime.js');
  }
  var api = factory(Interfaces, Runtime);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111NamePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Interfaces, Runtime) {
  'use strict';

  var ERROR = 'Choose a different name.';
  var MAX_GRAPHEMES = 14;
  var FALLBACK_NAME = 'Player';
  var CONTROL_BIDI_RE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
  var SPACE_RE = /\s+/g;
  var SAFE_CHAR_RE;
  var ALNUM_RE;
  try {
    SAFE_CHAR_RE = new RegExp('^[\\p{L}\\p{M}\\p{N} ._\\-\'’]+$', 'u');
    ALNUM_RE = new RegExp('[\\p{L}\\p{N}]', 'u');
  } catch (_) {
    SAFE_CHAR_RE = /^[A-Za-z0-9\u00c0-\u024f ._\-'’]+$/;
    ALNUM_RE = /[A-Za-z0-9\u00c0-\u024f]/;
  }

  // These are exact QA entry names. Their spelling is part of the event test
  // interface and an allowlisted value bypasses screening and the ordinary
  // roster limit. The short aliases are still used by the legacy
  // event harness and are kept for backwards-compatible classroom QA.
  var LEGACY_QA_NAMES = [
    'Rainbow Trail', 'Power Launch', 'Moon Gravity', 'Ice Slide', 'Alien',
    'Alien Invasion', 'Gravity Slam', 'Trampoline', 'Trampoline Tab',
    'Trampoline Table', 'Wind Tunnel', 'Double Flip', 'Magnet',
    'Magnet Landing', 'Heart Rush', 'Life Drain', 'Plinko', 'Plinko Drop',
  ];
  var EVENT_QA_NAMES = ['Mr. Howe'].concat(
    Interfaces && Array.isArray(Interfaces.EVENT_CATALOG)
      ? Interfaces.EVENT_CATALOG.map(function (event) { return event.displayName; }) : [],
    LEGACY_QA_NAMES
  ).filter(function (value, index, values) { return values.indexOf(value) === index; });
  var ALLOWLIST = new Set(EVENT_QA_NAMES);

  // Whole-word rules avoid familiar false positives such as Cass, Class,
  // Essex, Hancock, Scunthorpe, therapist, grape, and Saturday.
  var WORD_RULES = new Set([
    'anal', 'anus', 'arse', 'ass', 'bastard', 'bitch', 'bollock', 'boner',
    'boob', 'boobs', 'buttplug', 'cock', 'crap', 'cum', 'cunt', 'damn',
    'dick', 'dildo', 'fart', 'fuck', 'fucker', 'fucking', 'hell', 'hentai',
    'horny', 'jackass', 'jerkoff', 'penis', 'piss', 'porn', 'porno', 'pussy',
    'sex', 'shit', 'slut', 'testicle', 'tit', 'tits', 'vagina', 'whore',
  ]);

  // Only terms whose appearance inside a compacted string is itself high risk
  // belong here. This catches separators/repeats/lookalikes without turning
  // short ambiguous words such as "ass" into substring rules.
  var HIGH_RISK_SUBSTRINGS = [
    'childporn', 'faggot', 'faggt', 'fuck', 'nigga', 'nigger',
    'whitesupremacy', 'heilhitler', 'kkk',
  ];
  var HIGH_RISK_EXACT = new Set([
    'beaner', 'chink', 'coon', 'dyke', 'gook', 'kike', 'nazi', 'rapist', 'spic', 'tranny',
  ]);

  var CONFUSABLES = {
    '\u0391': 'a', '\u0392': 'b', '\u0395': 'e', '\u0397': 'h', '\u0399': 'i',
    '\u039a': 'k', '\u039c': 'm', '\u039d': 'n', '\u039f': 'o', '\u03a1': 'p',
    '\u03a4': 't', '\u03a5': 'y', '\u03a7': 'x', '\u03b1': 'a', '\u03b5': 'e',
    '\u03b2': 'b', '\u03b4': 'd', '\u03b9': 'i', '\u03ba': 'k', '\u03bd': 'v',
    '\u03bf': 'o', '\u03c1': 'p', '\u03c2': 'c', '\u03c4': 't', '\u03c5': 'u', '\u03c7': 'x',
    '\u03f2': 'c', '\u03f9': 'c', '\u0410': 'a', '\u0412': 'b', '\u0415': 'e',
    '\u041a': 'k', '\u041c': 'm', '\u041d': 'h', '\u041e': 'o', '\u0420': 'p',
    '\u0421': 'c', '\u0422': 't', '\u0425': 'x', '\u0430': 'a', '\u0435': 'e',
    '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x',
    '\u0456': 'i', '\u04bb': 'h',
    // Additional single-code-point lookalikes seen in saved/imported-name
    // evasions.  The display value is preserved; these folds are screening
    // only and never transliterate an accepted player's name.
    '\u0405': 's', '\u0455': 's', '\u0408': 'j', '\u0458': 'j', '\u04cf': 'l',
    '\u0131': 'i', '\u0261': 'g', '\u028b': 'u', '\u028c': 'u', '\u057d': 'u', '\u1d1c': 'u',
    '\u0501': 'd', '\u051b': 'q',
    // Cherokee glyphs which are direct Latin lookalikes. This deliberately is
    // a screening skeleton only; accepted Cherokee display names stay intact.
    '\u13a0': 'd', '\u13a1': 'r', '\u13a2': 't', '\u13a5': 'i', '\u13aa': 'a',
    '\u13ab': 'j', '\u13ac': 'e', '\u13b3': 'w', '\u13b7': 'm', '\u13bb': 'h',
    '\u13bd': 'y', '\u13c0': 'g', '\u13c3': 'z', '\u13cc': 'u', '\u13ce': 'w',
    '\u13d2': 's', '\u13d9': 'v', '\u13da': 's', '\u13de': 'l', '\u13df': 'c',
    '\u13e2': 'p', '\u13e6': 'k',
    '\uab70': 'd', '\uab71': 'r', '\uab72': 't', '\uab75': 'i', '\uab7a': 'a',
    '\uab7b': 'j', '\uab7c': 'e', '\uab83': 'w', '\uab87': 'm', '\uab8b': 'h',
    '\uab8d': 'y', '\uab90': 'g', '\uab93': 'z', '\uab9c': 'u', '\uab9e': 'w',
    '\uaba2': 's', '\uaba9': 'v', '\uabaa': 's', '\uabae': 'l', '\uabaf': 'c',
    '\uabb2': 'p', '\uabb6': 'k',
    // Common phonetic/modifier forms used as one-character substitutions.
    '\u1d00': 'a', '\u0299': 'b', '\u1d04': 'c', '\u1d05': 'd', '\u1d07': 'e',
    '\uA730': 'f', '\u0262': 'g', '\u029c': 'h', '\u026a': 'i', '\u1d0a': 'j',
    '\u1d0b': 'k', '\u029f': 'l', '\u1d0d': 'm', '\u0274': 'n', '\u1d0f': 'o',
    '\u1d18': 'p', '\u0280': 'r', '\ua731': 's', '\u1d1b': 't', '\u1d20': 'v',
    '\u1d21': 'w', '\u028f': 'y', '\u1d22': 'z',
    '\uff21': 'a', '\uff22': 'b', '\uff25': 'e', '\uff27': 'g', '\uff29': 'i',
    '\uff2a': 'j', '\uff2b': 'k', '\uff2d': 'm', '\uff2e': 'n', '\uff2f': 'o',
    '\uff30': 'p', '\uff33': 's', '\uff34': 't', '\uff35': 'u', '\uff38': 'x',
    '\uff39': 'y', '\uff41': 'a', '\uff42': 'b', '\uff45': 'e', '\uff47': 'g',
    '\uff49': 'i', '\uff4a': 'j', '\uff4b': 'k', '\uff4d': 'm', '\uff4e': 'n',
    '\uff4f': 'o', '\uff50': 'p', '\uff53': 's', '\uff54': 't', '\uff55': 'u',
    '\uff58': 'x', '\uff59': 'y',
  };
  var LEET = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };

  function string(value) { return String(value == null ? '' : value); }
  function nfkc(value) {
    var text = string(value);
    try { return text.normalize('NFKC'); } catch (_) { return text; }
  }
  function stripControlsAndBidi(value) { return string(value).replace(CONTROL_BIDI_RE, ''); }
  function normalize(value) {
    return stripControlsAndBidi(nfkc(value)).replace(SPACE_RE, ' ').trim();
  }
  function graphemes(value) {
    var text = string(value);
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      var segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), function (part) { return part.segment; });
    }
    // Combining marks and variation selectors stay attached in engines without
    // Intl.Segmenter. This is intentionally conservative around surrogate pairs.
    var units = Array.from(text);
    var result = [];
    units.forEach(function (unit) {
      if (result.length && /[\u0300-\u036f\ufe00-\ufe0f]/.test(unit)) result[result.length - 1] += unit;
      else result.push(unit);
    });
    return result;
  }
  function fold(value) {
    var text = normalize(value).toLowerCase();
    try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    return Array.from(text).map(function (character) {
      return CONFUSABLES[character] || LEET[character] || character;
    }).join('').replace(/ph/g, 'f');
  }
  function screen(value) {
    var folded = fold(value);
    var repeated = folded.replace(/(.)\1{1,}/g, '$1');
    var rawCompact = folded.replace(/[^a-z]+/g, '');
    // Collapse again *after* removing separators.  This catches evasions such
    // as f.u.u.c.c.k where duplicated letters were not adjacent in the source.
    var compactRepeated = rawCompact.replace(/(.)\1{1,}/g, '$1');
    var words = folded.split(/[^a-z]+/).concat(repeated.split(/[^a-z]+/)).filter(Boolean);
    var compact = [rawCompact, repeated.replace(/[^a-z]+/g, ''), compactRepeated,
      rawCompact.replace(/ph/g, 'f'), compactRepeated.replace(/ph/g, 'f')]
      .filter(function (candidate, index, values) { return values.indexOf(candidate) === index; });
    if (words.some(function (word) { return WORD_RULES.has(word) || HIGH_RISK_EXACT.has(word); })) {
      return false;
    }
    if (compact.some(function (candidate) {
      return WORD_RULES.has(candidate) || HIGH_RISK_EXACT.has(candidate);
    })) return false;
    if (HIGH_RISK_SUBSTRINGS.some(function (term) {
      return compact.some(function (candidate) { return candidate.indexOf(term) >= 0; });
    })) {
      return false;
    }
    return true;
  }
  function invalid(code) {
    return Object.freeze({ valid: false, ok: false, value: null, error: ERROR, code: code });
  }
  function valid(value) {
    return Object.freeze({ valid: true, ok: true, value: value, error: null, code: null });
  }
  function validate(input) {
    var value = normalize(input);
    if (!value) return invalid('empty');
    if (!SAFE_CHAR_RE.test(value) || !ALNUM_RE.test(value)) return invalid('unsupported');
    if (ALLOWLIST.has(value)) return valid(value);
    if (graphemes(value).length > MAX_GRAPHEMES) return invalid('too-long');
    return screen(value) ? valid(value) : invalid('not-allowed');
  }
  function truncate(value, count) { return graphemes(value).slice(0, count).join(''); }
  function safeDisplay(input, fallback) {
    var result = validate(input);
    if (result.valid) return result.value;
    // Imported/legacy values are never echoed on validation failure. A caller
    // can supply a neutral seat label while player-entered renames use ERROR.
    var neutral = validate(fallback || FALLBACK_NAME);
    return neutral.valid ? neutral.value : FALLBACK_NAME;
  }
  function install(runtime) {
    var target = runtime || Runtime;
    if (!target || !target.namePolicy || typeof target.namePolicy.install !== 'function') return false;
    target.namePolicy.install(api);
    return true;
  }

  var api = Object.freeze({
    schema: 'NamePolicyV1', version: 1, ERROR: ERROR,
    MAX_GRAPHEMES: MAX_GRAPHEMES, EVENT_QA_NAMES: Object.freeze(EVENT_QA_NAMES.slice()),
    normalize: normalize, graphemes: graphemes, screen: screen, validate: validate,
    safeDisplay: safeDisplay, truncate: truncate, install: install,
  });
  install(Runtime);
  return api;
});
