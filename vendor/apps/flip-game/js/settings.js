// settings.js — persisted user preferences (localStorage). Loaded after audio,
// before records/main. Holds mute + reduce-motion + physics feel + flick coach.
const Settings = (() => {
  const KEY = 'flipgame.settings.v1';
  const FEELS = ['forgiving', 'standard', 'pro'];
  const DEFAULTS = {
    sound: true,
    reduceMotion: false,
    feel: 'standard',
    flickFeedback: false,
  };
  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const merged = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
      if (!FEELS.includes(merged.feel)) merged.feel = 'standard';
      merged.flickFeedback = !!merged.flickFeedback;
      return merged;
    } catch (e) { return { ...DEFAULTS }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  return {
    get sound()         { return data.sound; },
    get reduceMotion()  { return data.reduceMotion; },
    get feel()          { return data.feel; },
    get flickFeedback() { return data.flickFeedback; },
    setSound(v)         { data.sound = !!v; save(); },
    setReduceMotion(v)  { data.reduceMotion = !!v; save(); },
    setFeel(v) {
      data.feel = FEELS.includes(v) ? v : 'standard';
      save();
    },
    setFlickFeedback(v) { data.flickFeedback = !!v; save(); },
  };
})();
