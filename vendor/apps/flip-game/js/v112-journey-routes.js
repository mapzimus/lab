// Presentation only. No Rules, Profile, Story reducer, localStorage or reward
// dependencies. The private activity-composition owner injects this host:
// schema: FlipgameV112JourneyHostV1
// storyViews() -> existing StoryRuntime.views() (checkpoint/defeats read-only)
// prepareStory({activityId,chapterId?|rivalId?,cooperative,humans}) ->
//   {handle,request:prescribed MatchRequestV2,card:StoryBroadcastCardV1}.
//   Host owns immutable input binding, reservation and opaque handle lifetime.
// startPreparedStory(handle) -> installs SAME reserved request in real engine.
// cancelPreparedStory(handle) -> releases unstarted reservation, no checkpoint.
// activitySnapshot() -> {kind:'story'|'tour',status:'playing'|'finalizing'|
//   'retryable'|'settled',message?,tour?:FirstFlipTourSessionV1}.
// subscribe(wake) -> unsubscribe; wake is only a signal to reread host state.
// retryFinalization() -> retries privately captured Rules outcome, NO arguments.
// startTour({human}) / acknowledgeTour() / launchTourAttempt() / skipTour().
//   Host owns Training.createTutorialSession, prepared event binding, actual
//   qualified pointer input and real landing callbacks. launchTourAttempt arms
//   input; it NEVER submits a verdict. Bottle->protected T-Rex and fallible
//   Rainbow/Trampoline come from Training, not route-authored physics. ALL Tour
//   data stays Test Data; no FXP/FC/achievement/ownership/default-stat rewards.
// On Story terminal, host privately freezes Rules outcome then calls the SAME
// StoryRuntime.finalize; only that successful transaction writes checkpoints
// and shared rival flags. UI never sends a result or edits persistent state.
// No public globals for any reward authority are required or installed here.
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else Object.defineProperty(root,'FlipgameV112JourneyRoutes',{value:factory()});
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function frozen(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(k=>frozen(value[k]));return Object.freeze(value);}
  function create(options){
    const listeners=new Set();let host=null,detach=null,pending=null,busy=false;
    let state={route:'closed',title:'Pressure Signal',items:[],message:null};
    function snapshot(){return frozen({...clone(state),busy});}
    function emit(){const view=snapshot();listeners.forEach(fn=>{try{fn(view);}catch(error){if(typeof options.onRenderError==='function')options.onRenderError(error,view);}});return view;}
    function connect(methods){
      const next=options.getHost();
      if(!next||next.schema!=='FlipgameV112JourneyHostV1'||methods.some(key=>typeof next[key]!=='function')){
        throw new Error('This activity is not connected to the match runtime in this development build. Your progress has not changed.');
      }
      if(next!==host){if(detach)detach();host=next;detach=typeof host.subscribe==='function'?host.subscribe(refresh):null;}
      return host;
    }
    function refresh(){
      if(!host||typeof host.activitySnapshot!=='function')return;
      const activity=host.activitySnapshot();
      if(!activity)return;
      if(state.route==='playing'||state.route==='pending-result'||state.route==='tour'){
        if(activity.kind==='tour'&&activity.tour)state={route:'tour',title:'First Flip Tour',tour:clone(activity.tour),status:activity.status,message:activity.message||null};
        else if(activity.status==='settled'){
          const rival=state.origin==='rivals',views=host.storyViews();
          state={route:rival?'rivals':'story',title:rival?'Rival Board':'Pressure Signal',items:clone(rival?views.rivalBoard.entries:views.hub.chapters),message:activity.message||'Result saved. Your checkpoint is shown below.'};
        }
        else state={...state,route:activity.status==='playing'?'playing':'pending-result',message:activity.message||'Saving the match result…',status:activity.status};
        emit();
      }
    }
    async function perform(fn){
      if(busy)return emit();busy=true;emit();
      try{await fn();}catch(error){state={...state,route:state.route==='closed'?'unavailable':state.route,message:error.message||'Activity unavailable.'};}
      finally{busy=false;emit();}return snapshot();
    }
    function humans(count){const rows=options.getHumans(count);if(!Array.isArray(rows)||rows.length!==count)throw new Error('Choose '+count+' human player'+(count===1?'':'s')+' in Setup first.');return clone(rows);}
    async function release(){if(pending){const handle=pending;await host.cancelPreparedStory(handle);pending=null;}}
    function open(route){
      // Show the screen before any work runs, so a slow or stuck load can
      // never leave both Home and this screen hidden.
      if(state.route!=='playing'&&state.route!=='pending-result'&&!busy)
        state={route,title:route==='rivals'?'Rival Board':'Pressure Signal',items:[],message:'Loading…'};
      return perform(async()=>{
      if(state.route==='playing'||state.route==='pending-result')throw new Error('Finish or leave the active match first.');
      state={route,title:route==='rivals'?'Rival Board':'Pressure Signal',items:[],message:'Loading…'};
      connect(['storyViews','prepareStory','startPreparedStory','cancelPreparedStory','activitySnapshot','retryFinalization']);
      await release();const views=host.storyViews();
      state.items=clone(route==='rivals'?views.rivalBoard.entries:views.hub.chapters);
      state.message=route==='rivals'?'Invitations are permanent. Story and Rival Board share first clears.':'Checkpoints save between matches. Replays never erase your progress.';
    });}
    function choose(id,cooperative){return perform(async()=>{
      if(state.route!=='story'&&state.route!=='rivals')throw new Error('Open the Story Hub or Rival Board first.');
      const rival=state.route==='rivals';
      const item=state.items.find(row=>!row.locked&&(rival?row.rivalId:row.chapterId)===id);
      if(!item)throw new Error('This invitation is not available.');
      const coop=!rival&&cooperative===true;
      const input={activityId:rival?'rival-board':'story',cooperative:coop,humans:humans(coop?2:1)};
      input[rival?'rivalId':'chapterId']=id;
      const prepared=await host.prepareStory(input);
      if(!prepared||!prepared.handle)throw new Error('The host did not reserve a match.');
      pending=prepared.handle;
      const request=prepared.request;
      if(!request||request.schema!=='MatchRequestV2'||request.activityId!==input.activityId||
          !request.activityContext||request.activityContext.prescribedArena!==true||!prepared.card){
        await release();throw new Error('A prescribed Story request is required.');
      }
      state={route:'preview',title:prepared.card.chapterTitle,card:clone(prepared.card),
        request:clone({activityId:request.activityId,physicsModeId:request.physicsModeId,
          roster:request.roster,startingLives:request.rulesOptions.startingLives,
          arenaId:request.rulesOptions.arenaId}),origin:rival?'rivals':'story',message:null};
    });}
    function enter(){return perform(async()=>{
      if(state.route!=='preview'||!pending)throw new Error('Choose a match first.');
      await host.startPreparedStory(pending);pending=null;state={route:'playing',origin:state.origin,title:'Match in progress',items:[],message:null};
      if(options.onPlay)options.onPlay();
    });}
    function tour(){return perform(async()=>{
      state={route:'tour',title:'First Flip Tour',message:null};
      connect(['startTour','acknowledgeTour','launchTourAttempt','skipTour','activitySnapshot']);
      await host.startTour({human:humans(1)[0]});refresh();
    });}
    function continueTour(){return perform(async()=>{
      if(state.route!=='tour'||!state.tour)throw new Error('Start the Tour first.');
      const step=state.tour.step;
      if(step.kind==='card')await host.acknowledgeTour();
      else if(step.kind==='attempt'){await host.launchTourAttempt();if(options.onPlay)options.onPlay();}
      else throw new Error('Replay or leave the completed Tour.');
      refresh();
    });}
    function close(){return perform(async()=>{
      await release();if(state.route==='tour'&&host&&state.tour)await host.skipTour();
      if(state.route==='playing'||state.route==='pending-result')throw new Error('Finish saving or leave the active match through its menu.');
      state={route:'closed',title:'Pressure Signal',items:[],message:null};if(options.onHome)options.onHome();
    });}
    function retry(){return perform(async()=>{if(!host||state.status!=='retryable')throw new Error('No finalization to retry.');await host.retryFinalization();refresh();});}
    return Object.freeze({snapshot,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);},
      openStory:()=>open('story'),openRivals:()=>open('rivals'),choose,enter,startTour:tour,
      continueTour,close,retry,refresh});
  }
  function mount(options){
    const d=options.document,screen=d.getElementById('journey-screen');
    const title=d.getElementById('journey-title'),body=d.getElementById('journey-body'),message=d.getElementById('journey-message');
    const controller=create(Object.assign({},options,{onRenderError(error,view){
      if(view.route==='closed'||view.route==='playing')return;
      screen.classList.remove('hidden');
      message.textContent='This screen could not load: '+(error&&error.message?error.message:String(error))+'. Go Home and try again.';
      d.getElementById('journey-back').disabled=false;
    }}));
    function node(tag,text,className){const element=d.createElement(tag);if(text!=null)element.textContent=text;if(className)element.className=className;return element;}
    function button(label,action,disabled){const b=node('button',label,'secondary-action');b.type='button';b.disabled=!!disabled;b.addEventListener('click',action);return b;}
    controller.subscribe(view=>{
      screen.classList.toggle('hidden',view.route==='closed'||view.route==='playing'||(view.route==='tour'&&view.status==='playing'));
      title.textContent=view.title;message.textContent=view.message||'';body.replaceChildren();
      d.getElementById('journey-back').disabled=view.busy;
      if(view.route==='story'||view.route==='rivals'){
        let cooperative;
        if(view.route==='story'){
          const label=node('label','Play style','journey-play-style');cooperative=node('select');
          [['solo','Solo'],['co-op','Co-op · Two humans']].forEach(([value,text])=>{const option=node('option',text);option.value=value;cooperative.append(option);});label.append(cooperative);body.append(label);
        }
        const grid=node('div',null,'journey-grid');
        (view.items||[]).forEach(item=>{
          if(item.locked){const lock=node('div','🔒','locked-tile journey-card');lock.setAttribute('aria-label','Locked');grid.append(lock);return;}
          const card=node('article',null,'journey-card');card.append(node('p',item.callsign,'broadcast-eyebrow'),node('h2',item.title||item.rivalName));
          card.append(node('p',item.defeated||item.status==='cleared'?'Cleared · Rematch available':view.route==='story'?'Story match':'Signature invitation'));
          card.append(button(item.defeated||item.status==='cleared'?'Replay':'View match',()=>controller.choose(item.chapterId||item.rivalId,cooperative&&cooperative.value==='co-op'),view.busy));grid.append(card);
        });body.append(grid);
      }else if(view.route==='preview'){
        const card=view.card;body.append(node('p',card.eyebrow,'broadcast-eyebrow'),node('h2',card.headline),node('p',card.lead));
        const details=node('p',view.request.roster.length+' players · '+view.request.startingLives+' lives · '+(view.request.physicsModeId==='alien'?'Alien physics':'Normal physics'));
        body.append(details,node('p','Prescribed venue: '+view.request.arenaId),button(card.controls.primaryLabel,controller.enter,view.busy));
      }else if(view.route==='tour'&&view.tour){
        const step=view.tour.step;body.append(node('p','Test Data · No rewards','broadcast-eyebrow'),node('h2',step.title||'Try a flip'));
        body.append(node('p',step.id==='lives-turns'?'A miss costs the current stake. An ON FIRE-ending miss is free. Turns pass after the result.':step.instruction));
        if(step.kind==='complete')body.append(button('Replay Tour',controller.startTour,view.busy));
        else body.append(button(step.kind==='attempt'?'Try it':'Continue',controller.continueTour,view.busy));
        body.append(button('Skip Tour',controller.close,view.busy));
      }
      if(view.status==='retryable')body.append(button('Retry saving result',controller.retry,view.busy));
    });
    d.getElementById('journey-back').addEventListener('click',controller.close);
    function open(action){if(options.onOpen)options.onOpen();action();title.focus({preventScroll:true});}
    d.getElementById('journey-story').addEventListener('click',()=>open(controller.openStory));
    d.getElementById('journey-rivals').addEventListener('click',()=>open(controller.openRivals));
    d.getElementById('journey-tour').addEventListener('click',()=>open(controller.startTour));
    return controller;
  }
  return Object.freeze({create,mount});
});
