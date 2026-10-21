// v112-story-view.js -- pure, headless presentation models for Pressure Signal.
// The DOM renderer consumes these models; this module never injects markup.
(function (root, factory) {
  'use strict';
  var Story = root && root.FlipgameV112Story;
  var Urth = root && root.FlipgameV112Urth;
  if (typeof module === 'object' && module.exports) {
    Story = require('./v112-story.js');
    Urth = require('./v112-urth.js');
  }
  var api = factory(Story, Urth);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112StoryView = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Story, Urth) {
  'use strict';

  if (!Story || !Urth) {
    throw new Error('v1.12 Story and Urth modules must load before Story view models');
  }

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function chapterById(id) {
    return Story.chapters.find(function (chapter) { return chapter.id === String(id); }) || null;
  }
  function knownChapter(state, chapter) {
    var current = Story.normalizeState(state);
    var frontier = Story.nextChapter(current);
    return current.discoveredRivalIds.indexOf(chapter.rivalId) >= 0 ||
      current.clearedChapterIds.indexOf(chapter.id) >= 0 || !!(frontier && frontier.id === chapter.id);
  }

  var ACT_LABELS = freeze({ 1: 'The Open', 2: 'The Array', 3: 'The Field Unit', 4: 'The Signal' });
  var PRELIMINARY_TITLES = freeze({
    'wfc-qualifier': 'WFC Qualifier',
    'broadcast-heat': 'WFC Broadcast Heat',
    'instrumented-heat': 'Instrumented WFC Heat',
    'wfc-semifinal': 'WFC Semifinal',
    'wfc-final': 'Wurld Flip Championship Final',
  });
  var FIELD_NOTES = freeze({
    'field-note-act-1': {
      id: 'field-note-act-1', act: 1, title: 'Return Channel',
      kicker: 'WFC REPLAY CONTROL',
      body: 'LANE 09 — RETURN RECEIVED. The source clock reports a transmission before the throw.',
    },
    'field-note-act-2': {
      id: 'field-note-act-2', act: 2, title: 'Ninth Return',
      kicker: 'ARRAY REVIEW',
      body: 'EIGHT ENTRIES. NINE RETURNS. The extra line held its shape through three independent replays.',
    },
    'field-note-act-3': {
      id: 'field-note-act-3', act: 3, title: 'Case 50-A',
      kicker: 'FIELD PHYSICS UNIT',
      body: 'MASS VERIFIED. TRAJECTORY DID NOT COMPLY. No equipment fault was found.',
    },
    'field-note-act-4': {
      id: 'field-note-act-4', act: 4, title: 'Visitor Posting',
      kicker: 'OPEN EXHIBITION',
      body: 'NO SEED / NO FEDERATION / SIGNAL VERIFIED. FIELD STABLE. SIGNAL QUIET. REMATCH AVAILABLE.',
    },
  });
  var CHAPTER_COPY = freeze({
    'first-broadcast': {
      eyebrow: 'WFC OPEN QUALIFIER',
      lead: 'A first appearance under the public clock. Ten lives, one clean route into the bracket.',
    },
    scatterline: {
      eyebrow: 'ARCADE INVITATIONAL',
      lead: 'Ivo Bell plays the corners and leaves no quiet space between attempts.',
    },
    'lane-09': {
      eyebrow: 'ARCHIVE COURT · LANE 09',
      lead: 'Safiya Rowan has requested the lane the replay desk stopped assigning.',
    },
    'under-lights': {
      eyebrow: 'WFC BROADCAST HEAT',
      lead: 'Every landing is live. Jules Mercer has built a career inside that pressure.',
    },
    'true-axis': {
      eyebrow: 'ARRAY MATCH',
      lead: 'Niko Arden trusts one axis, one rhythm and nothing that cannot be measured.',
    },
    'standard-bearer': {
      eyebrow: 'FEATURED STANDARD',
      lead: 'Reina Sol carries the cup into a match where the return count no longer agrees.',
    },
    'case-50a': {
      eyebrow: 'FIELD PHYSICS UNIT',
      lead: 'An instrumented heat puts every force on record. Dr. Vale expects the record to hold.',
    },
    'white-noise': {
      eyebrow: 'COLD-ROOM EXHIBITION',
      lead: 'The arena is still. Inez Park says stillness has never meant silence.',
    },
    'high-water': {
      eyebrow: 'OPEN-WATER FEATURE',
      lead: 'Beck Holloway brings volume, patience and the most stable late landing on the tour.',
    },
    'nine-tracks': {
      eyebrow: 'WFC SEMIFINAL',
      lead: 'Eight entries remain on the board. Ren Damar has prepared for a ninth track.',
    },
    'deep-time': {
      eyebrow: 'WFC FINAL',
      lead: 'Talia Quill arrives with the protected original model and a stadium holding its breath.',
    },
    'visitor-zero': {
      eyebrow: 'UNSCHEDULED EXHIBITION',
      lead: 'The posting carries no federation seed. Veyr is waiting inside the field.',
    },
  });

  function broadcastCard(input) {
    var source = object(input);
    var chapter = chapterById(source.chapterId || (source.attempt && source.attempt.chapterId));
    if (!chapter) throw new TypeError('Unknown Story chapter');
    var attempt = object(source.attempt);
    var matchKind = String(source.matchKind || attempt.matchKind ||
      (chapter.preliminaryId ? 'preliminary' : 'signature'));
    var copy = CHAPTER_COPY[chapter.id];
    var isPreliminary = matchKind === 'preliminary';
    return freeze({
      schema: 'StoryBroadcastCardV1',
      storyTitle: Urth.canon.storyTitle,
      act: chapter.act,
      actLabel: ACT_LABELS[chapter.act],
      chapterId: chapter.id,
      chapterNumber: chapter.order,
      chapterTitle: chapter.title,
      eyebrow: copy.eyebrow,
      headline: isPreliminary ? PRELIMINARY_TITLES[chapter.preliminaryId] : chapter.callsign,
      lead: copy.lead,
      rival: isPreliminary ? null : freeze({
        id: chapter.rivalId, name: chapter.rivalName,
        callsign: chapter.callsign, flipperId: chapter.flipperId, tier: chapter.cpuTier,
      }),
      arenaId: chapter.arenaId,
      formatLabel: isPreliminary || attempt.cooperative ? Urth.canon.standardFormat : 'Signature Match',
      refrain: isPreliminary || attempt.cooperative ? Urth.canon.refrain : null,
      cooperative: attempt.cooperative === true,
      nativeAlien: chapter.nativeAlien === true,
      clue: chapter.clue,
      controls: freeze({ primaryLabel: source.replay ? 'Replay Match' : 'Enter Match',
        backLabel: 'Back', skippable: false }),
    });
  }

  function storyHub(stateInput) {
    var state = Story.normalizeState(stateInput);
    var frontier = Story.nextChapter(state);
    var chapters = Story.chapters.map(function (chapter) {
      if (!knownChapter(state, chapter)) {
        return freeze({ slot: chapter.order, locked: true, symbol: '🔒', ariaLabel: 'Locked' });
      }
      var preliminaryDone = !chapter.preliminaryId ||
        state.clearedPreliminaryIds.indexOf(chapter.preliminaryId) >= 0;
      var rivalDone = state.defeatedRivalIds.indexOf(chapter.rivalId) >= 0;
      return freeze({
        slot: chapter.order, locked: false, chapterId: chapter.id, act: chapter.act,
        title: chapter.title, callsign: chapter.callsign, arenaId: chapter.arenaId,
        status: state.clearedChapterIds.indexOf(chapter.id) >= 0 ? 'cleared'
          : (!preliminaryDone ? 'preliminary' : (!rivalDone ? 'signature' : 'checkpoint')),
        current: !!(frontier && frontier.id === chapter.id),
      });
    });
    return freeze({
      schema: 'StoryHubViewV1', eyebrow: 'STORY', title: 'PRESSURE SIGNAL',
      subtitle: Urth.canon.championship, completed: state.campaignCompleted,
      completionLine: state.campaignCompleted ? 'FIELD STABLE. SIGNAL QUIET. REMATCH AVAILABLE.' : null,
      progress: freeze({ cleared: state.clearedChapterIds.length, total: Story.chapters.length }),
      currentChapterId: frontier ? frontier.id : null,
      chapters: chapters,
    });
  }

  function rivalBoard(input) {
    var source = object(input);
    var state = Story.normalizeState(source.storyState || source.state);
    return freeze({
      schema: 'RivalBoardViewV1', eyebrow: 'RIVAL BOARD', title: 'Open Invitations',
      subtitle: 'Permanent signature matches. First clear joins the roster.',
      entries: Story.chapters.map(function (chapter, index) {
        var discovered = state.discoveredRivalIds.indexOf(chapter.rivalId) >= 0;
        if (!discovered) {
          return freeze({ slot: index + 1, locked: true, symbol: '🔒', ariaLabel: 'Locked' });
        }
        return freeze({
          slot: index + 1, locked: false, rivalId: chapter.rivalId,
          rivalName: chapter.rivalName, callsign: chapter.callsign,
          flipperId: chapter.flipperId, tier: chapter.cpuTier,
          arenaId: chapter.arenaId,
          rules: 'Solo · Three lives · Normal events',
          defeated: state.defeatedRivalIds.indexOf(chapter.rivalId) >= 0,
          actionLabel: state.defeatedRivalIds.indexOf(chapter.rivalId) >= 0 ? 'Rematch' : 'Accept',
        });
      }),
    });
  }

  function fieldNotes(input) {
    var source = object(input);
    var ids = source.fieldNoteIds;
    if (!Array.isArray(ids) && source.profile && Array.isArray(source.profile.fieldNoteIds)) {
      ids = source.profile.fieldNoteIds;
    }
    ids = Array.isArray(ids) ? ids.map(String) : [];
    var notes = Object.keys(FIELD_NOTES).filter(function (id) { return ids.indexOf(id) >= 0; })
      .map(function (id) { return clone(FIELD_NOTES[id]); });
    return freeze({
      schema: 'FieldNotesViewV1', eyebrow: 'FIELD NOTES', title: 'Pressure Signal Archive',
      notes: notes,
      emptyMessage: notes.length ? null : 'No field notes recovered yet.',
    });
  }

  function alienGate(input) {
    var source = object(input);
    var profile = object(source.profile);
    var state = Story.normalizeState(source.storyState || source.state);
    var level = Math.max(1, Math.floor(Number(source.flipLevel || profile.flipLevel) || 1));
    var grandfathered = source.grandfathered === true ||
      !!(profile.legacy && profile.legacy.grandfatheredAlien);
    var unlocked = grandfathered || (level >= 100 && state.alienDefeated);
    var challengerWaiting = !grandfathered && level >= 100 && !state.alienDefeated;
    return freeze({
      schema: 'AlienGateViewV1', locked: !unlocked, available: unlocked,
      title: unlocked ? 'Alien' : (challengerWaiting ? 'Final Challenger waiting' : '🔒'),
      subtitle: unlocked ? 'Visitor Zero is available.'
        : (challengerWaiting ? 'An open exhibition has appeared on the Rival Board.' : null),
      ariaLabel: unlocked ? 'Alien available' :
        (challengerWaiting ? 'Final Challenger waiting' : 'Locked'),
    });
  }

  function postMatch(input) {
    var source = object(input);
    var resolution = object(source.resolution || source.activityResolution);
    var chapter = chapterById(resolution.chapterId);
    var success = resolution.success === true;
    var abandoned = resolution.abandoned === true;
    var replay = source.replay === true;
    var title = abandoned ? 'Match left' : (success ? 'Signal held' : 'Result recorded');
    var headline = abandoned ? 'Checkpoint unchanged.'
      : (success ? (chapter && chapter.rivalId === 'visitor-zero'
        ? 'FIELD STABLE. SIGNAL QUIET.' : 'Pressure answered.')
        : 'The invitation remains open.');
    return freeze({
      schema: 'StoryPostMatchViewV1', title: title, headline: headline,
      chapterId: chapter ? chapter.id : null, success: success,
      abandoned: abandoned, replay: replay, duplicate: resolution.duplicate === true,
      campaignCompleted: resolution.campaignCompleted === true,
      completionLine: resolution.campaignCompleted
        ? 'FIELD STABLE. SIGNAL QUIET. REMATCH AVAILABLE.' : null,
      rewardsVisible: !abandoned && !replay && resolution.duplicate !== true,
      actionLabel: success ? 'Continue' : 'Try Again',
    });
  }

  return freeze({
    schema: 'StoryViewModelsV1',
    actLabels: ACT_LABELS, fieldNoteCatalog: FIELD_NOTES,
    broadcastCard: broadcastCard, storyHub: storyHub, rivalBoard: rivalBoard,
    fieldNotes: fieldNotes, alienGate: alienGate, postMatch: postMatch,
  });
});
