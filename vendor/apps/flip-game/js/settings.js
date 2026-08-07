// settings.js — persisted user preferences (localStorage). Loaded after audio,
// before records/main. Holds the mute + reduce-motion prefs (extensible later).
const Settings = (() => {
  const KEY = 'flipgame.settings.v1';
  const DEFAULTS = { sound: true, reduceMotion: false };
  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch (e) { return { ...DEFAULTS }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  return {
    get sound()        { return data.sound; },
    get reduceMotion() { return data.reduceMotion; },
    setSound(v)        { data.sound = !!v; save(); },
    setReduceMotion(v) { data.reduceMotion = !!v; save(); },
  };
})();
