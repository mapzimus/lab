// Battle presentation only. No Rules, physics, reward, clock or save writes.
// Inject FlipgameV112BattleHost with schema FlipgameV112BattleHostV1:
// capabilities() -> qualified Battle.hardwareProfile (never navigator estimates).
// prepare({formatId,paceId,powerProfileId,players}) -> {handle}; start(handle,{stage}).
// Host owns the opaque reservation, validates roster/teams and capabilities at
// start, and binds real lane canvases/input in stage (maximum four active lanes).
// cancel(handle) cancels an unstarted reservation. abandon() owns match cleanup.
// snapshot() -> {status:'playing'|'finalizing'|'retryable'|'settled', state:
// BattleStateV1, lanes:[{laneId,playerId,status}], message?}; subscribe(wake).
// choosePower({playerId,cardId,targetId?}) selects a currently offered card;
// host validates target and stores it for a not-yet-armed launch. No UI consume.
// retryFinalization() retries only the host's captured immutable outcome.
// The route exposes NO submit-result/finalize/grant or synthetic input method.
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'FlipgameV112BattleRoutes', { value: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const formats = freeze([
    { id:'duel', label:'1v1', count:2, formatId:'duel' },
    { id:'doubles', label:'2v2', count:4, formatId:'doubles' },
    { id:'four-way', label:'1v1v1v1', count:4, formatId:'four-way' },
    ...Array.from({length:6}, (_,i) => ({ id:`team-${i+3}`, label:`${i+3}v${i+3}`, count:(i+3)*2, formatId:'team' })),
  ]);
  const labels = freeze({ 'magnet-pulse':'Magnet Pulse', 'heartbeat-brace':'Heartbeat Brace',
    'power-launch':'Power Launch', 'moon-round':'Moon Round', 'bouncy-round':'Bouncy Round',
    'wind-round':'Wind Round', 'trampoline-round':'Trampoline Round', 'ice-patch':'Ice Patch',
    crosswind:'Crosswind', earthquake:'Earthquake', 'gravity-slam':'Gravity Slam', 'fizz-jet':'Fizz Jet' });
  function capabilities(value) {
    if (!value || ![1,2,4].includes(value.activeLaneLimit) ||
        value.simultaneous !== (value.activeLaneLimit > 1) ||
        !Number.isInteger(value.verifiedContacts) || value.verifiedContacts < value.activeLaneLimit ||
        (value.activeLaneLimit === 1 && value.fallback !== 'alternating-relay') ||
        (value.activeLaneLimit === 2 && value.width < 768) ||
        (value.activeLaneLimit === 4 && value.width < 1100)) throw new Error('Display capability is not qualified.');
    return copy(value);
  }
  function project(view) {
    if (!view || !['playing','finalizing','retryable','settled'].includes(view.status)) throw new Error('Battle status is unavailable.');
    const state = view.state;
    if (!state || state.schema !== 'BattleStateV1' || !state.config || !Array.isArray(state.config.players)) throw new Error('Battle state is unavailable.');
    const hardware = capabilities(state.config.hardware);
    const players = state.config.players;
    const lanes = view.lanes || [];
    if (!Array.isArray(lanes) || lanes.length > hardware.activeLaneLimit || lanes.length > 4 ||
        new Set(lanes.map(l=>l.laneId)).size !== lanes.length || new Set(lanes.map(l=>l.playerId)).size !== lanes.length ||
        lanes.some(l=>!players.some(p=>p.id===l.playerId) || !state.activePlayerIds.includes(l.playerId))) throw new Error('Battle lane projection is invalid.');
    const team = ['doubles','team'].includes(state.config.formatId);
    const competitors = [...new Set(players.map(p=>team?p.teamId:p.id))];
    const nameOf = id => team ? (id==='team-a'?'Team A':id==='team-b'?'Team B':id)
      : (players.find(p=>p.id===id).displayName || 'Player');
    return freeze({ status:view.status, message:String(view.message || ''), hardware,
      heat:state.heatNumber, volley:state.volleyIndex+1, suddenDeath:!!state.suddenDeath,
      remainingMs:Math.max(0, state.config.rushDurationMs-state.elapsedMs), paceId:state.config.paceId,
      // Whoever the rules named. A Battle that has run its heats and cannot say
      // who won is not a finished match, it is an unread scoreboard.
      winnerId:competitors.includes(state.winnerId) ? state.winnerId : null,
      winnerLabel:competitors.includes(state.winnerId) ? nameOf(state.winnerId) : null,
      scores:competitors.map(id=>({ id, label:nameOf(id),
        score:state.scores[id], heatWins:state.heatWins[id], charges:state.charges[id],
        offers:copy(state.powerOffers[id] || []), stored:copy(state.storedPowers[id]),
        playerId:players.find(p=>(team?p.teamId:p.id)===id).id,
        targets:competitors.filter(other=>other!==id),
      })),
      lanes:lanes.map(l=>({laneId:String(l.laneId), playerId:l.playerId,
        label:players.find(p=>p.id===l.playerId).displayName || 'Player', status:String(l.status || 'Waiting')})),
    });
  }
  function create(options) {
    const opts = options || {}, listeners = new Set();
    let state = { route:'closed', formatId:'duel', paceId:'volley', powerProfileId:'sport', busy:false,
      available:false, hardware:null, message:'', rosterCount:0, hud:null };
    let host = null, ticket = null, unsubscribe = null;
    const snapshot = () => freeze(copy(state));
    const emit = () => { const view=snapshot(); listeners.forEach(fn=>fn(view)); return view; };
    function refresh() {
      try {
        if (host && state.route==='game') {
          // Between the reservation and the first heat there is no series to show
          // yet. That is this screen opening, not a host that has lost its way,
          // and start() fills the scoreboard in as soon as the heat is live.
          const view=host.snapshot();
          if (view) state.hud=project(view);
        } else if (host) state.hardware=capabilities(host.capabilities());
      } catch (_) { state.message='Battle is waiting for a valid host update.'; state.available=false; }
      return emit();
    }
    async function run(action) {
      if (state.busy) return false;
      state.busy=true; state.message=''; emit();
      try { await action(); return true; }
      catch (_) { state.message='Battle could not continue. No result was created by this screen.'; return false; }
      finally { state.busy=false; emit(); }
    }
    function open() {
      if (state.route==='game') return refresh();
      if (unsubscribe) unsubscribe();
      host = opts.getHost && opts.getHost();
      state.route='setup'; state.hud=null; state.hardware=null;
      state.rosterCount=(opts.getPlayers && opts.getPlayers() || []).length;
      state.available=!!host && host.schema==='FlipgameV112BattleHostV1' &&
        ['capabilities','prepare','start','cancel','snapshot','subscribe','choosePower','abandon','retryFinalization'].every(key=>typeof host[key]==='function');
      if (!state.available) { host=null; state.message='Battle is not connected in this development build. Your progress has not changed.'; }
      else { unsubscribe=host.subscribe(refresh); refresh(); }
      return emit();
    }
    function configure(changes) {
      if (state.route!=='setup' || state.busy) return false;
      if (changes.formatId != null && formats.some(f=>f.id===changes.formatId)) state.formatId=changes.formatId;
      if (['volley','rush'].includes(changes.paceId)) state.paceId=changes.paceId;
      if (['sport','mayhem'].includes(changes.powerProfileId)) state.powerProfileId=changes.powerProfileId;
      emit(); return true;
    }
    function start() {
      if (!state.available || state.route!=='setup') return Promise.resolve(false);
      return run(async()=>{
        state.hardware=capabilities(host.capabilities());
        const format=formats.find(f=>f.id===state.formatId), players=copy(opts.getPlayers() || []);
        if (players.length!==format.count) throw new Error('Roster count mismatch');
        const team=['doubles','team'].includes(format.formatId);
        players.forEach((p,index)=>{p.teamId=team?(index%2?'team-b':'team-a'):null;});
        ticket=await host.prepare({formatId:format.formatId, paceId:state.paceId, powerProfileId:state.powerProfileId, players});
        if (!ticket || ticket.handle==null) throw new Error('Missing reservation');
        try {
          state.route='game'; emit(); // Reveal the persistent stage before host measures lane geometry.
          await host.start(ticket.handle, {stage:opts.getStage ? opts.getStage() : null});
          ticket=null; state.hud=project(host.snapshot());
        } catch(error) {
          // Getting back to the lineup must not depend on the host still taking a
          // cancel. A host that already dropped the reservation itself refuses
          // this call, and letting that refusal escape would strand the player on
          // a heat that never opened.
          try { await host.cancel(ticket.handle); } catch (_) {}
          ticket=null; state.route='setup'; state.hud=null; throw error;
        }
      });
    }
    function choosePower(input) {
      if (!state.available || state.route!=='game' || !state.hud || state.hud.status!=='playing') return Promise.resolve(false);
      const owner=state.hud.scores.find(s=>s.playerId===input.playerId);
      const offered=owner && owner.offers.find(c=>c.id===input.cardId);
      if (!offered || owner.stored || (offered.scope==='target' && !owner.targets.includes(input.targetId))) return Promise.resolve(false);
      return run(async()=>{ await host.choosePower({playerId:input.playerId,cardId:input.cardId,
        ...(offered.scope==='target'?{targetId:input.targetId}:{})}); refresh(); });
    }
    function close() {
      if (state.busy || (state.hud && ['finalizing','retryable'].includes(state.hud.status))) return Promise.resolve(false);
      return run(async()=>{
        // A running series is the host's to release, so a refusal there keeps this
        // screen where it is. A game route with no scoreboard has no series at
        // all: whatever the host is still holding is released best effort, because
        // refusing to leave a blank screen strands the player and this screen has
        // no result to protect.
        if (state.route==='game' && state.hud) {
          if (state.hud.status!=='settled') await host.abandon();
        } else if (state.route==='game') {
          try { await host.abandon(); } catch (_) {}
          if (ticket) { try { await host.cancel(ticket.handle); } catch (_) {} ticket=null; }
        }
        if (ticket) await host.cancel(ticket.handle);
        ticket=null; if(unsubscribe)unsubscribe(); unsubscribe=null; state.route='closed'; state.hud=null;
      });
    }
    return freeze({snapshot,open,configure,start,choosePower,close,refresh,
      retry:()=>state.hud && state.hud.status==='retryable' ? run(async()=>{await host.retryFinalization();refresh();}) : Promise.resolve(false),
      subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    });
  }
  function mount(options) {
    const opts=options, d=opts.document, screen=d.getElementById('battle-screen');
    const controller=create({...opts,getStage:()=>d.getElementById('battle-stage')});
    const body=d.getElementById('battle-body'), message=d.getElementById('battle-message');
    function element(tag,text,className) { const n=d.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n; }
    function button(label,action,disabled,key) {const b=element('button',label);b.type='button';b.dataset.battleFocus=key||label;b.disabled=!!disabled;b.addEventListener('click',action);return b;}
    function render(s) {
      screen.classList.toggle('hidden',s.route==='closed');
      if(s.route==='closed')return;
      const focusKey=d.activeElement && d.activeElement.dataset && d.activeElement.dataset.battleFocus;
      body.replaceChildren(); message.textContent=s.message;
      d.getElementById('battle-back').disabled=s.busy || !!s.hud && ['finalizing','retryable'].includes(s.hud.status);
      // The stage is the pointer surface for a running heat. A series that is no
      // longer taking launches must not leave an empty lane-sized hole behind.
      d.getElementById('battle-stage').classList.toggle('hidden',
        s.route!=='game' || !!(s.hud && s.hud.status!=='playing'));
      if(s.route==='setup') {
        for(const [key,title,choices] of [['formatId','Format',formats],['paceId','Pace',[{id:'volley',label:'Equal Volley'},{id:'rush',label:'Timed Rush'}]],['powerProfileId','Power cards',[{id:'sport',label:'Sport'},{id:'mayhem',label:'Mayhem'}]]]) {
          const field=element('fieldset'),legend=element('legend',title);field.append(legend);
          const group=element('div',null,'battle-options');
          for(const choice of choices){const b=button(choice.label,()=>controller.configure({[key]:choice.id}),s.busy);b.setAttribute('aria-pressed',String(s[key]===choice.id));group.append(b);} field.append(group);body.append(field);
        }
        const format=formats.find(f=>f.id===s.formatId);
        body.append(element('p',`${s.rosterCount} entries in your lineup · ${format.count} required. Teams alternate seats: odd entries Team A, even entries Team B.`));
        // Rush heats are 60 seconds of gameplay clock, and on a relay that clock
        // runs only while the lane is yours to launch from: a flip in the air
        // pauses it and pushes the horn out by exactly that much. Calling it a
        // minute is how a heat ends up sitting on "58 seconds" for several.
        body.append(element('p',s.paceId==='volley'?'Best of three heats · five synchronized volleys per heat.'
          :`Best of three 60-second heats · launches released before the horn finish resolving.${s.hardware&&!s.hardware.simultaneous?' On a relay the clock only runs while a lane is yours to launch from, so a heat takes longer than a minute at the table.':''}`));
        body.append(element('p','Upright 1 · Cap 2 · Miss 0. Three qualified manual launches offer two power cards; store one. Powers affect only launches that have not been armed.'));
        body.append(element('p',s.hardware ? (s.hardware.simultaneous?`Verified simultaneous play · up to ${s.hardware.activeLaneLimit} active lanes.`:'Alternating relay · one active lane. Each competitor receives a fair turn.') : 'Display capability has not been qualified.', 'battle-capability'));
        body.append(button('Edit lineup',async()=>{if(await controller.close())opts.onEditRoster();},s.busy));
        body.append(button('Begin Battle',()=>controller.start(),s.busy||!s.available||s.rosterCount!==format.count));
      } else if(s.hud) {
        const h=s.hud;
        // A finished series stops counting volleys and stops telling people to
        // wait for a lane. It says who won.
        const live=h.status==='playing';
        // The live heading is the only text a lane-mode Battle shows, so it is
        // where a Rush clock has to admit it is a gameplay clock. Counting plain
        // seconds reads as wall time, which a relay heat is not.
        // Sudden death is paired on hardware that can run two lanes at once. A
        // relay owns one lane, so it takes those two turns one after the other,
        // and calling that paired describes play this table cannot give.
        const suddenLabel=h.hardware.activeLaneLimit>1?'Paired sudden death':'Sudden death';
        body.append(element('h2',live
          ? `Heat ${h.heat} · ${h.suddenDeath?suddenLabel:h.paceId==='rush'?`${Math.ceil(h.remainingMs/1000)}s gameplay clock`:`Volley ${h.volley}`}`
          : h.winnerLabel ? `${h.winnerLabel} takes it` : `Heat ${h.heat} · final`));
        if(live)body.append(element('p',h.hardware.simultaneous?'Simultaneous lanes':'Alternating relay · wait for your active lane','battle-capability'));
        const scores=element('div',null,'battle-scoreboard');
        // Points are a heat's currency and heats are the series': a live heat leads
        // with the points being played for, and a result leads with the heats that
        // decided it. A charge is progress towards an offer, and offers only apply
        // to a launch that has not been armed, so a result has none left to count.
        for(const s of h.scores){const card=element('article',null,'battle-score');
          card.append(element('h3',s.label),element('strong',String(live?s.score:s.heatWins)),
            element('p',live?`${s.heatWins} heats · ${s.charges}/3 charges`
              :`heats won · ${s.score} ${s.score===1?'point':'points'} in the last heat`));
          scores.append(card);
          // Cards only apply to a launch that has not been armed. Once the series
          // stops taking launches there is nothing left for one to affect, so an
          // offer on the result would be dead chrome.
          if(!live)continue;
          if(s.stored)card.append(element('p',`Stored: ${labels[s.stored.id]||s.stored.id} · applies to an eligible upcoming launch`));
          for(const offer of s.offers){
            if(offer.scope==='target') for(const targetId of s.targets)card.append(button(`${labels[offer.id]||offer.id} → ${h.scores.find(x=>x.id===targetId).label}`,()=>controller.choosePower({playerId:s.playerId,cardId:offer.id,targetId}),stateBusy(),`${s.id}:${offer.id}:${targetId}`));
            else card.append(button(labels[offer.id]||offer.id,()=>controller.choosePower({playerId:s.playerId,cardId:offer.id}),stateBusy(),`${s.id}:${offer.id}`));
          }
        }
        function stateBusy(){return s.busy||h.status!=='playing';}
        body.append(scores);
        // An empty lane list is a lane-sized hole on the result, not a status.
        if(h.lanes.length){const lanes=element('div',null,'battle-lane-status');for(const lane of h.lanes)lanes.append(element('p',`${lane.label} · ${lane.status}`));body.append(lanes);}
        body.append(element('p',h.message || ({finalizing:'Saving the authoritative result…',retryable:'Result waiting to be saved.',settled:'Battle complete.'}[h.status]||'')));
        if(h.status==='retryable')body.append(button('Retry saving',()=>controller.retry(),s.busy));
      }
      if(focusKey){const next=[...body.querySelectorAll('button')].find(b=>b.dataset.battleFocus===focusKey&&!b.disabled);if(next)next.focus({preventScroll:true});}
    }
    controller.subscribe(render);
    d.getElementById('battle-open').addEventListener('click',()=>{controller.open();opts.onOpen();d.getElementById('battle-title').focus();});
    d.getElementById('battle-back').addEventListener('click',async()=>{if(await controller.close())opts.onHome();});
    return controller;
  }
  return freeze({schema:'BattleRoutesV1',formats,project,create,mount});
});
