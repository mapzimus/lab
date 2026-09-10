// v111-art-pack-c.js — authored Canvas 2D art for roster objects 17–25.
//
// This shard is intentionally paint-only. It registers immutable, lazy variant
// builders with FlipArtV111 and derives every public ID/label from the canonical
// v111 manifest. Preview and gameplay therefore share exactly the same painter.
(function (root, factory) {
  'use strict';
  var Art = root && root.FlipArtV111;
  var Manifest = root && root.FLIP_V111_OBJECT_MANIFEST;
  if (typeof module === 'object' && module.exports) {
    Art = Art || require('./v111-art-platform.js');
    Manifest = Manifest || require('./v111-object-manifest.js');
  }
  var api = factory(Art, Manifest);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipArtV111PackC = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Art, Manifest) {
  'use strict';

  if (!Art || typeof Art.registerObject !== 'function') {
    throw new Error('v111-art-pack-c.js requires FlipArtV111 first');
  }
  if (!Manifest || !Array.isArray(Manifest.objects)) {
    throw new Error('v111-art-pack-c.js requires FLIP_V111_OBJECT_MANIFEST first');
  }

  var OBJECT_IDS = Object.freeze([
    'snow-globe',
    'eyeball-monster',
    'soda-can',
    'watering-can',
    'pinata',
    'huge-rubber-duck',
    'action-figures',
    'tall-buildings',
    'box-of-snacks',
  ]);

  var BOUNDS = Object.freeze({
    'snow-globe':       Object.freeze({ x: 34, y: 38, width: 232, height: 338 }),
    'eyeball-monster':  Object.freeze({ x: 24, y: 45, width: 252, height: 331 }),
    'soda-can':         Object.freeze({ x: 48, y: 26, width: 204, height: 350 }),
    'watering-can':     Object.freeze({ x: 4, y: 60, width: 278, height: 316 }),
    'pinata':           Object.freeze({ x: 25, y: 42, width: 250, height: 334 }),
    'huge-rubber-duck': Object.freeze({ x: 22, y: 72, width: 256, height: 304 }),
    'action-figures':   Object.freeze({ x: 34, y: 40, width: 232, height: 336 }),
    'tall-buildings':   Object.freeze({ x: 38, y: 28, width: 224, height: 348 }),
    'box-of-snacks':    Object.freeze({ x: 38, y: 42, width: 224, height: 334 }),
  });

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function shade(hex, amount) {
    var raw = String(hex || '#6699cc').replace('#', '');
    var value = parseInt(raw, 16);
    if (!Number.isFinite(value)) value = 0x6699cc;
    var red = clampByte(((value >> 16) & 255) + amount * 255);
    var green = clampByte(((value >> 8) & 255) + amount * 255);
    var blue = clampByte((value & 255) + amount * 255);
    return '#' + [red, green, blue].map(function (part) {
      return part.toString(16).padStart(2, '0');
    }).join('');
  }

  function paletteFor(color) {
    return Object.freeze({
      base: color,
      light: shade(color, 0.23),
      shine: shade(color, 0.40),
      dark: shade(color, -0.24),
      outline: shade(color, -0.43),
      ink: '#172331',
      white: '#f7fbff',
      cream: '#fff0c4',
      silver: '#cbd7df',
      silverDark: '#657784',
      glass: 'rgba(205,244,255,0.38)',
      shadow: 'rgba(9,20,31,0.28)',
      green: '#3d9448',
      brown: '#80502e',
      orange: '#ff9c32',
      pink: '#ff91b7',
      yellow: '#ffd84e',
    });
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    var r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function polygon(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
  }

  function starPath(ctx, x, y, outerRadius, innerRadius, pointCount, rotation) {
    var points = [];
    for (var i = 0; i < pointCount * 2; i++) {
      var radius = i % 2 ? innerRadius : outerRadius;
      var angle = (rotation == null ? -Math.PI / 2 : rotation) + i * Math.PI / pointCount;
      points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
    }
    polygon(ctx, points);
  }

  function fillStroke(ctx, fill, stroke, width) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && width > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function ellipse(ctx, x, y, rx, ry, fill, stroke, width, rotation) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation || 0, 0, Math.PI * 2);
    fillStroke(ctx, fill, stroke, width == null ? 4 : width);
  }

  function circle(ctx, x, y, radius, fill, stroke, width) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    fillStroke(ctx, fill, stroke, width == null ? 4 : width);
  }

  function line(ctx, points, color, width, closed) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (closed) ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function bodyGradient(ctx, p, x, y, width, height) {
    if (typeof ctx.createLinearGradient !== 'function') return p.base;
    var gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, p.shine);
    gradient.addColorStop(0.38, p.base);
    gradient.addColorStop(1, p.dark);
    return gradient;
  }

  function shine(ctx, x, y, width, height, radius, p) {
    ctx.save();
    ctx.globalAlpha = 0.34;
    roundedRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = p.white;
    ctx.fill();
    ctx.restore();
  }

  function clock(state, speed, phase) {
    if (!state || state.reducedMotion) return 0;
    return Math.sin((Number(state.time) || 0) * speed + (phase || 0));
  }

  function drawFriendlyFace(ctx, x, y, scale, p) {
    circle(ctx, x - 16 * scale, y, 7 * scale, p.white, p.ink, 3 * scale);
    circle(ctx, x + 16 * scale, y, 7 * scale, p.white, p.ink, 3 * scale);
    circle(ctx, x - 14 * scale, y + 1 * scale, 2.7 * scale, p.ink);
    circle(ctx, x + 18 * scale, y + 1 * scale, 2.7 * scale, p.ink);
    ctx.beginPath();
    ctx.moveTo(x - 15 * scale, y + 18 * scale);
    ctx.quadraticCurveTo(x, y + 31 * scale, x + 17 * scale, y + 17 * scale);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 4 * scale;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawFlakes(ctx, state, p, count) {
    var total = state && state.reducedMotion ? Math.min(5, count) : count;
    for (var i = 0; i < total; i++) {
      var phase = i * 1.73;
      var dx = clock(state, 1.2, phase) * (4 + i % 3);
      var dy = state && state.reducedMotion ? 0
        : ((Number(state.time) || 0) * (8 + i % 4) + i * 23) % 116;
      var x = 82 + (i * 37 % 138) + dx;
      var y = 115 + (state && state.reducedMotion ? i * 22 : dy);
      circle(ctx, x, y, 2.4 + i % 2, p.white);
    }
  }

  function drawSnowGlobeScene(ctx, index, p) {
    ctx.save();
    if (index === 0) {
      roundedRect(ctx, 112, 237, 72, 63, 5); fillStroke(ctx, p.brown, p.ink, 4);
      polygon(ctx, [[103,240],[148,202],[193,240]]); fillStroke(ctx,p.dark,p.ink,4);
      roundedRect(ctx, 140, 267, 17, 33, 3); fillStroke(ctx,p.cream,p.ink,3);
      line(ctx, [[95,299],[203,299]], p.white, 6);
    } else if (index === 1) {
      [0,1,2,3,4].forEach(function (n) {
        var h = 45 + (n % 3) * 26;
        roundedRect(ctx, 87 + n * 27, 300 - h, 22, h, 2);
        fillStroke(ctx, n % 2 ? p.silverDark : p.dark, p.ink, 3);
        circle(ctx, 94 + n * 27, 272 - h / 3, 2, p.yellow);
      });
    } else if (index === 2) {
      polygon(ctx, [[76,300],[139,193],[177,248],[205,211],[229,300]]);
      fillStroke(ctx,p.silver,p.ink,5);
      polygon(ctx, [[119,226],[139,193],[153,216]]); fillStroke(ctx,p.white,null,0);
    } else if (index === 3) {
      ellipse(ctx,150,255,42,50,p.ink,p.ink,3);
      ellipse(ctx,150,266,25,35,p.white,null,0);
      circle(ctx,136,232,5,p.white); circle(ctx,164,232,5,p.white);
      polygon(ctx,[[143,244],[157,244],[150,254]]); fillStroke(ctx,p.orange,p.ink,2);
    } else if (index === 4) {
      [104,150,196].forEach(function (x, n) {
        polygon(ctx, [[x,204+n*12],[x-31,285],[x+31,285]]);
        fillStroke(ctx, n === 1 ? p.green : p.dark, p.ink, 4);
      });
      line(ctx,[[78,298],[224,298]],p.white,6);
    } else if (index === 5) {
      ctx.beginPath(); ctx.arc(145,241,48,-Math.PI/2,Math.PI/2);
      ctx.arc(164,241,38,Math.PI/2,-Math.PI/2,true); ctx.closePath();
      fillStroke(ctx,p.cream,p.ink,4);
      [[101,207],[202,219],[192,279]].forEach(function (v) { circle(ctx,v[0],v[1],5,p.yellow); });
    } else if (index === 6) {
      roundedRect(ctx,116,235,68,65,3); fillStroke(ctx,p.silver,p.ink,4);
      [108,147,186].forEach(function (x) {
        roundedRect(ctx,x,211,25,89,3); fillStroke(ctx,p.light,p.ink,4);
        polygon(ctx,[[x-4,214],[x+12,194],[x+29,214]]); fillStroke(ctx,p.dark,p.ink,3);
      });
    } else if (index === 7) {
      line(ctx,[[95,286],[118,257],[143,281],[169,241],[205,287]],p.light,12);
      [[109,222],[191,214],[209,254],[91,260]].forEach(function (v,n) { circle(ctx,v[0],v[1],4+n%2,p.white); });
    } else if (index === 8) {
      roundedRect(ctx,116,229,70,70,10); fillStroke(ctx,p.silver,p.ink,5);
      circle(ctx,136,254,7,p.light,p.ink,2); circle(ctx,166,254,7,p.light,p.ink,2);
      line(ctx,[[134,278],[168,278]],p.ink,5);
      line(ctx,[[151,228],[151,209]],p.ink,4); circle(ctx,151,204,5,p.yellow,p.ink,2);
    } else if (index === 9) {
      [112,151,191].forEach(function (x,n) {
        line(ctx,[[x,300],[x,248]],p.green,6);
        ellipse(ctx,x,238-n*8,29+n*2,20,p.light,p.ink,3);
        circle(ctx,x,237-n*8,8,p.yellow,p.ink,2);
      });
    } else if (index === 10) {
      polygon(ctx,[[132,300],[137,244],[112,228],[144,213],[150,185],[157,214],[188,230],[164,244],[169,300]]);
      fillStroke(ctx,p.silver,p.ink,4);
      ellipse(ctx,150,257,12,29,p.white,null,0);
    } else {
      ctx.save(); ctx.globalAlpha=0.68;
      [0,1,2,3].forEach(function(n){
        ctx.strokeStyle = n%2 ? p.pink : p.light; ctx.lineWidth=12; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(87,222+n*18);
        ctx.bezierCurveTo(119,191+n*21,170,263+n*5,218,215+n*19); ctx.stroke();
      });
      ctx.restore();
    }
    ctx.restore();
  }

  function drawSnowGlobe(ctx, state, index, p) {
    var shape = index === 1 || index === 5 || index === 10 ? 'tall'
      : index === 4 ? 'wide' : index === 8 ? 'square' : index === 9 ? 'bell'
      : index === 11 ? 'facet' : 'round';
    ctx.save();
    ctx.globalAlpha = 0.31;
    if (shape === 'square') {
      roundedRect(ctx,62,73,176,246,54); fillStroke(ctx,p.light,p.outline,7);
    } else if (shape === 'bell') {
      ctx.beginPath(); ctx.moveTo(88,308); ctx.bezierCurveTo(50,220,76,92,150,67);
      ctx.bezierCurveTo(224,92,250,220,212,308); ctx.closePath(); fillStroke(ctx,p.light,p.outline,7);
    } else if (shape === 'facet') {
      polygon(ctx,[[150,50],[222,92],[244,203],[211,310],[89,310],[56,203],[78,92]]);
      fillStroke(ctx,p.light,p.outline,7);
    } else {
      var rx = shape === 'wide' ? 112 : (shape === 'tall' ? 86 : 99);
      var ry = shape === 'wide' ? 119 : (shape === 'tall' ? 139 : 127);
      ellipse(ctx,150,184,rx,ry,p.glass,p.outline,7);
    }
    ctx.restore();
    drawSnowGlobeScene(ctx,index,p);
    // The miniature is bolted to an interior plinth, so it never appears to
    // drift with the flakes when the water mass rotates around it.
    roundedRect(ctx, 91, 292, 118, 15, 6); fillStroke(ctx, p.silver, p.outline, 3);
    line(ctx, [[119, 292], [119, 277], [181, 277], [181, 292]], p.silverDark, 4);
    circle(ctx, 108, 299, 3, p.yellow, p.outline, 1.5);
    circle(ctx, 192, 299, 3, p.yellow, p.outline, 1.5);
    drawFlakes(ctx,state,p,11);
    ctx.save(); ctx.globalAlpha=0.48;
    ctx.beginPath(); ctx.arc(122,142,54,3.45,4.72); ctx.strokeStyle=p.white; ctx.lineWidth=11; ctx.lineCap='round'; ctx.stroke();
    ctx.restore();
    roundedRect(ctx,index===4?52:62,303,index===4?196:176,73,16);
    fillStroke(ctx,bodyGradient(ctx,p,62,303,176,73),p.outline,7);
    if (index === 0 || index === 4) line(ctx,[[79,335],[221,335]],p.brown,7);
    if (index === 2) { ctx.save(); ctx.globalAlpha=.55; line(ctx,[[78,348],[222,348]],p.white,8); ctx.restore(); }
    if (index === 7) { line(ctx,[[73,338],[99,322],[124,342],[151,321],[181,342],[222,323]],p.light,6); }
    if (index === 10) { [87,111,189,213].forEach(function(x){circle(ctx,x,339,3,p.yellow);}); }
    if (index === 11) { shine(ctx,81,317,28,45,8,p); line(ctx,[[120,348],[180,348]],p.shine,5); }
  }

  function drawMonsterEye(ctx, x, y, radius, state, index, p) {
    var gazeX = clock(state, 0.82, index * 0.7) * 7;
    var gazeY = clock(state, 0.61, index * 0.4) * 4;
    circle(ctx,x,y,radius,p.white,p.ink,6);
    circle(ctx,x+gazeX,y+gazeY,radius*.52,p.light,p.ink,4);
    circle(ctx,x+gazeX,y+gazeY,radius*.25,p.ink);
    circle(ctx,x+gazeX-radius*.09,y+gazeY-radius*.12,radius*.07,p.white);
  }

  function drawEyeballMonster(ctx,state,index,p) {
    var wobble=clock(state,2.1,index)*4;
    ctx.save(); ctx.translate(0,wobble);
    if(index===0){
      ellipse(ctx,150,252,92,112,bodyGradient(ctx,p,58,140,184,224),p.outline,7);
      ellipse(ctx,101,362,44,14,p.dark,p.outline,5); ellipse(ctx,199,362,44,14,p.dark,p.outline,5);
      drawMonsterEye(ctx,150,218,48,state,index,p);
    }else if(index===1){
      ellipse(ctx,150,326,76,50,p.base,p.outline,7); roundedRect(ctx,130,120,40,210,19); fillStroke(ctx,p.light,p.outline,6);
      drawMonsterEye(ctx,150,107,50,state,index,p);
    }else if(index===2){
      ellipse(ctx,150,244,104,118,p.base,p.outline,7); drawMonsterEye(ctx,150,224,60,state,index,p);
      [[116,124],[150,108],[184,124]].forEach(function(v){line(ctx,[[v[0],v[1]+31],[v[0]-7,v[1]]],p.ink,6);});
    }else if(index===3){
      ellipse(ctx,150,265,90,108,p.dark,p.outline,7); circle(ctx,150,210,76,p.silver,p.ink,8); drawMonsterEye(ctx,150,210,57,state,index,p);
      line(ctx,[[85,282],[57,261]],p.silverDark,11); line(ctx,[[215,282],[243,261]],p.silverDark,11);
    }else if(index===4){
      ctx.beginPath(); ctx.moveTo(59,319); ctx.bezierCurveTo(75,250,137,271,132,325); ctx.bezierCurveTo(129,360,78,363,67,338); ctx.bezierCurveTo(90,375,229,381,239,298); ctx.bezierCurveTo(244,250,212,230,183,245); ctx.closePath(); fillStroke(ctx,p.base,p.outline,7);
      roundedRect(ctx,138,115,35,159,17); fillStroke(ctx,p.light,p.outline,6); drawMonsterEye(ctx,155,108,47,state,index,p);
    }else if(index===5){
      roundedRect(ctx,62,126,176,250,24); fillStroke(ctx,bodyGradient(ctx,p,62,126,176,250),p.outline,7); drawMonsterEye(ctx,150,220,61,state,index,p);
      line(ctx,[[92,318],[208,318]],p.silverDark,7); [87,213].forEach(function(x){circle(ctx,x,342,10,p.yellow,p.ink,3);});
    }else if(index===6){
      ellipse(ctx,150,253,94,115,p.base,p.outline,7); drawMonsterEye(ctx,150,228,54,state,index,p);
      polygon(ctx,[[88,146],[76,85],[126,117],[150,69],[176,117],[225,85],[212,151]]); fillStroke(ctx,p.yellow,p.ink,6);
    }else if(index===7){
      ellipse(ctx,150,260,74,105,p.base,p.outline,7);
      ctx.beginPath(); ctx.moveTo(81,211); ctx.bezierCurveTo(27,166,24,262,85,278); ctx.closePath(); fillStroke(ctx,p.light,p.outline,6);
      ctx.beginPath(); ctx.moveTo(219,211); ctx.bezierCurveTo(273,166,276,262,215,278); ctx.closePath(); fillStroke(ctx,p.light,p.outline,6);
      drawMonsterEye(ctx,150,218,53,state,index,p);
    }else if(index===8){
      for(var petal=0;petal<8;petal++){var a=petal*Math.PI/4; ellipse(ctx,150+Math.cos(a)*67,218+Math.sin(a)*67,35,20,p.light,p.outline,4,a);}
      ellipse(ctx,150,273,78,103,p.base,p.outline,7); drawMonsterEye(ctx,150,218,55,state,index,p);
    }else if(index===9){
      ctx.beginPath(); ctx.arc(145,240,112,-Math.PI/2,Math.PI/2); ctx.arc(180,240,76,Math.PI/2,-Math.PI/2,true); ctx.closePath(); fillStroke(ctx,p.base,p.outline,7);
      drawMonsterEye(ctx,136,214,48,state,index,p); circle(ctx,111,319,7,p.yellow,p.ink,2);
    }else if(index===10){
      polygon(ctx,[[58,139],[150,160],[242,139],[226,376],[150,353],[74,376]]); fillStroke(ctx,p.base,p.outline,7);
      line(ctx,[[150,160],[150,353]],p.cream,5); drawMonsterEye(ctx,151,231,52,state,index,p);
      line(ctx,[[91,311],[130,321]],p.light,6); line(ctx,[[209,311],[170,321]],p.light,6);
    }else{
      var star=[]; for(var n=0;n<10;n++){var a2=-Math.PI/2+n*Math.PI/5;var rr=n%2?72:119;star.push([150+Math.cos(a2)*rr,231+Math.sin(a2)*rr]);}
      polygon(ctx,star); fillStroke(ctx,p.base,p.outline,7); drawMonsterEye(ctx,150,224,53,state,index,p); ellipse(ctx,150,354,52,20,p.dark,p.outline,5);
    }
    ctx.restore();
  }

  function canBody(ctx,x,y,w,h,top,bottom,p) {
    ctx.beginPath(); ctx.moveTo(x+top,y); ctx.lineTo(x+w-top,y);
    ctx.quadraticCurveTo(x+w,y+7,x+w-bottom,y+h); ctx.lineTo(x+bottom,y+h);
    ctx.quadraticCurveTo(x,y+h-7,x+top,y); ctx.closePath();
    fillStroke(ctx,bodyGradient(ctx,p,x,y,w,h),p.outline,7);
    ellipse(ctx,x+w/2,y,w/2-top/2,13,p.silver,p.outline,5);
    ellipse(ctx,x+w/2,y+h-10,w/2-bottom/2,10,p.dark,p.outline,5);
  }

  function drawCanMark(ctx,index,x,y,w,h,p) {
    ctx.save();
    if(index===0){ellipse(ctx,x+w/2,y+h*.53,w*.29,h*.17,p.light,p.white,4);}
    else if(index===1){for(var n=0;n<7;n++)line(ctx,[[x+22+n*12,y+38],[x+5+n*12,y+h-38]],n%2?p.light:p.dark,5);}
    else if(index===2){circle(ctx,x+w/2,y+h*.55,w*.29,p.light,p.ink,4);}
    else if(index===3){[.31,.5,.69].forEach(function(q){line(ctx,[[x+8,y+h*q],[x+w-8,y+h*q]],p.silver,7);});}
    else if(index===4){line(ctx,[[x+16,y+52],[x+w-16,y+h-52]],p.shine,12);}
    else if(index===5){[0,1,2,3,4].forEach(function(n){circle(ctx,x+25+(n*29)%Math.max(35,w-35),y+70+(n*41)%(h-110),6+n%3,p.white,p.ink,2);});}
    else if(index===6){polygon(ctx,[[x+16,y+h-32],[x+38,y+h-79],[x+w/2,y+h-42],[x+w-35,y+h-85],[x+w-14,y+h-32]]);fillStroke(ctx,p.light,p.ink,4);}
    else if(index===7){roundedRect(ctx,x+22,y+70,w-44,105,8);fillStroke(ctx,p.silver,p.ink,4);drawFriendlyFace(ctx,x+w/2,y+105,.65,p);}
    else if(index===8){circle(ctx,x+w/2,y+103,32,p.cream,p.ink,4);polygon(ctx,[[x+w/2,y+70],[x+w/2+27,y+86],[x+w/2+12,y+115],[x+w/2-18,y+121],[x+w/2-28,y+91]]);fillStroke(ctx,p.light,null,0);}
    else if(index===9){ctx.globalAlpha=.72;polygon(ctx,[[x+9,y+54],[x+w-9,y+54],[x+w-24,y+110],[x+24,y+110]]);fillStroke(ctx,p.white,null,0);ctx.globalAlpha=1;}
    else if(index===10){line(ctx,[[x+18,y+72],[x+w-18,y+72]],p.shine,14);line(ctx,[[x+18,y+h-60],[x+w-18,y+h-60]],p.dark,14);}
    else{[.28,.46,.64,.82].forEach(function(q){line(ctx,[[x+7,y+h*q],[x+w-7,y+h*q]],p.silverDark,5);});}
    ctx.restore();
  }

  function drawSodaCan(ctx,state,index,p) {
    var spec=[
      [70,72,160,304,18,14],[90,42,120,334,14,10],[54,120,192,256,22,18],
      [69,70,162,306,18,14],[77,82,146,294,28,18],[61,85,178,291,32,26],
      [88,54,124,322,15,10],[65,73,170,303,9,9],[70,66,160,310,18,15],
      [65,83,170,293,28,20],[89,42,122,334,12,9],[58,74,184,302,18,18],
    ][index];
    canBody(ctx,spec[0],spec[1],spec[2],spec[3],spec[4],spec[5],p);
    drawCanMark(ctx,index,spec[0],spec[1],spec[2],spec[3],p);
    var twitch=clock(state,3.4,index)*5;
    if(index===4){roundedRect(ctx,127,50,46,35,15);fillStroke(ctx,p.silver,p.outline,4);circle(ctx,150,60,8,p.dark);}
    else{
      ctx.save();ctx.translate(twitch,0);ellipse(ctx,150,Math.max(49,spec[1]-1),29,8,p.silverDark,p.ink,3,-.12);ctx.restore();
    }
    var bubbleCount=state&&state.reducedMotion?3:6;
    for(var b=0;b<bubbleCount;b++){
      var by=state&&state.reducedMotion?spec[1]+72+b*31:spec[1]+65+((b*47+(Number(state.time)||0)*18)%(spec[3]-100));
      circle(ctx,spec[0]+22+(b*31)%(spec[2]-44),by,2+b%2,p.white);
    }
    shine(ctx,spec[0]+18,spec[1]+25,11,Math.max(64,spec[3]-74),6,p);
  }

  function drawWateringCan(ctx,state,index,p) {
    var flex=clock(state,1.7,index)*5;
    var body={x:84,y:190,w:132,h:170,r:30};
    if(index===1)body={x:103,y:133,w:96,h:227,r:22};
    if(index===2)body={x:78,y:188,w:145,h:172,r:56};
    if(index===5||index===7)body={x:88,y:170,w:126,h:190,r:12};
    if(index===6)body={x:81,y:178,w:145,h:182,r:55};
    if(index===9)body={x:90,y:157,w:126,h:203,r:60};
    if(index===10)body={x:93,y:145,w:119,h:215,r:22};
    if(index===11)body={x:101,y:126,w:103,h:234,r:32};
    ctx.save();
    ctx.strokeStyle=p.outline;ctx.lineWidth=18;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(body.x+21,body.y+34);ctx.bezierCurveTo(body.x+5,82+flex,body.x+body.w-2,78-flex,body.x+body.w-18,body.y+35);ctx.stroke();
    ctx.strokeStyle=p.light;ctx.lineWidth=10;ctx.stroke();ctx.restore();
    var sx=body.x, sy=body.y+78;
    ctx.save();ctx.strokeStyle=p.outline;ctx.lineWidth=index===3?29:24;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(sx+4,sy);ctx.bezierCurveTo(index===3?31:48,sy-18,index===3?18:32,112,index===3?25:34,104);ctx.stroke();
    ctx.strokeStyle=p.base;ctx.lineWidth=index===3?17:14;ctx.stroke();ctx.restore();
    if(index===4){ellipse(ctx,28,101,20,39,p.silver,p.outline,5,.75);for(var k=0;k<7;k++)circle(ctx,21+(k%3)*8,84+Math.floor(k/3)*10,2,p.ink);}
    else if(index!==2&&index!==10){ellipse(ctx,index===3?23:35,index===3?102:103,18,28,p.silver,p.outline,5,.7);}
    roundedRect(ctx,body.x,body.y,body.w,body.h,body.r);fillStroke(ctx,bodyGradient(ctx,p,body.x,body.y,body.w,body.h),p.outline,7);
    ellipse(ctx,body.x+body.w/2,360,body.w*.43,16,p.dark,p.outline,4);
    if(index===2){circle(ctx,82,231,30,p.light,p.outline,4);drawFriendlyFace(ctx,151,246,.65,p);}
    else if(index===5){line(ctx,[[97,199],[205,199],[205,341]],p.shine,6);}
    else if(index===6){line(ctx,[[198,208],[238,177],[219,246]],p.light,12);}
    else if(index===7){roundedRect(ctx,112,235,79,72,8);fillStroke(ctx,p.silver,p.ink,4);drawFriendlyFace(ctx,152,259,.55,p);}
    else if(index===8){for(var n=0;n<7;n++){var a=n*Math.PI*2/7;ellipse(ctx,150+Math.cos(a)*39,244+Math.sin(a)*32,20,10,p.light,p.outline,2,a);}circle(ctx,150,244,19,p.yellow,p.ink,3);}
    else if(index===9){polygon(ctx,[[116,161],[151,120],[186,161]]);fillStroke(ctx,p.brown,p.outline,5);line(ctx,[[151,122],[151,84]],p.green,9);}
    else if(index===10){ctx.beginPath();ctx.moveTo(97,150);ctx.lineTo(185,150);ctx.lineTo(207,292);ctx.quadraticCurveTo(181,372,105,357);ctx.closePath();fillStroke(ctx,p.base,p.outline,7);line(ctx,[[109,302],[191,302]],p.light,6);}
    else if(index===11){polygon(ctx,[[104,169],[151,82],[201,169]]);fillStroke(ctx,p.light,p.outline,6);polygon(ctx,[[101,330],[70,376],[119,354],[181,354],[230,376],[204,328]]);fillStroke(ctx,p.dark,p.outline,5);}
    else{shine(ctx,body.x+19,body.y+28,13,body.h-65,6,p);}
    var dropY=state&&state.reducedMotion?134:134+clock(state,2.3,index)*9;
    ctx.beginPath();ctx.moveTo(30,dropY-9);ctx.quadraticCurveTo(19,dropY+8,30,dropY+14);ctx.quadraticCurveTo(42,dropY+8,30,dropY-9);ctx.closePath();fillStroke(ctx,p.light,p.outline,2);
  }

  function fringe(ctx,x,y,w,h,p) {
    var colors=[p.light,p.base,p.dark,p.yellow];
    for(var row=0;row<Math.floor(h/24);row++){
      var yy=y+row*24;ctx.fillStyle=colors[row%colors.length];ctx.fillRect(x,yy,w,17);
      for(var cut=0;cut<w;cut+=12)line(ctx,[[x+cut,yy+13],[x+cut+4,yy+23]],colors[row%colors.length],3);
    }
  }

  function drawPinata(ctx,state,index,p) {
    var sway=clock(state,2.2,index)*9;
    ctx.save();
    if(index===0){
      roundedRect(ctx,82,173,145,126,35);fillStroke(ctx,p.base,p.outline,7);roundedRect(ctx,181,104,63,100,24);fillStroke(ctx,p.light,p.outline,6);
      polygon(ctx,[[193,110],[197,70],[216,105],[235,77],[236,118]]);fillStroke(ctx,p.dark,p.outline,4);
      [[98,291],[130,291],[188,291],[217,291]].forEach(function(v){roundedRect(ctx,v[0],v[1],18,85,7);fillStroke(ctx,p.dark,p.outline,4);});
      circle(ctx,225,137,5,p.white,p.ink,2);
    }else if(index===1){
      var star=[];for(var n=0;n<10;n++){var a=-Math.PI/2+n*Math.PI/5;var rr=n%2?55:114;star.push([150+Math.cos(a)*rr,183+Math.sin(a)*rr]);}polygon(ctx,star);fillStroke(ctx,p.base,p.outline,7);ellipse(ctx,150,351,42,25,p.dark,p.outline,5);
    }else if(index===2){
      polygon(ctx,[[150,53],[204,144],[196,305],[178,340],[122,340],[104,305],[96,144]]);fillStroke(ctx,p.base,p.outline,7);ellipse(ctx,150,160,28,48,p.light,p.outline,4);polygon(ctx,[[109,280],[65,342],[116,327],[184,327],[235,342],[191,280]]);fillStroke(ctx,p.dark,p.outline,5);
    }else if(index===3){
      roundedRect(ctx,102,112,96,264,44);fillStroke(ctx,p.base,p.outline,7);roundedRect(ctx,48,178,76,45,20);fillStroke(ctx,p.light,p.outline,6);roundedRect(ctx,176,215,76,45,20);fillStroke(ctx,p.light,p.outline,6);line(ctx,[[86,179],[72,137]],p.outline,7);line(ctx,[[213,216],[225,171]],p.outline,7);
    }else if(index===4){
      polygon(ctx,[[82,194],[218,194],[196,376],[104,376]]);fillStroke(ctx,p.dark,p.outline,7);ellipse(ctx,150,165,94,70,p.light,p.outline,7);circle(ctx,122,148,18,p.pink,p.outline,3);circle(ctx,169,133,23,p.cream,p.outline,3);circle(ctx,190,165,17,p.yellow,p.outline,3);
    }else if(index===5){
      roundedRect(ctx,91,82,118,101,12);fillStroke(ctx,p.light,p.outline,7);roundedRect(ctx,77,182,146,158,13);fillStroke(ctx,p.base,p.outline,7);line(ctx,[[77,219],[42,254]],p.dark,16);line(ctx,[[223,219],[258,254]],p.dark,16);line(ctx,[[112,340],[93,376]],p.dark,18);line(ctx,[[188,340],[207,376]],p.dark,18);drawFriendlyFace(ctx,150,119,.8,p);
    }else if(index===6){
      ctx.beginPath();ctx.arc(141,201,119,-Math.PI/2,Math.PI/2);ctx.arc(181,201,78,Math.PI/2,-Math.PI/2,true);ctx.closePath();fillStroke(ctx,p.base,p.outline,7);polygon(ctx,[[211,278],[221,308],[253,309],[227,327],[236,360],[211,341],[185,360],[194,328],[168,309],[201,308]]);fillStroke(ctx,p.yellow,p.outline,4);
    }else if(index===7){
      ellipse(ctx,150,234,89,128,p.base,p.outline,7);[105,128,150,172,195].forEach(function(x,n){polygon(ctx,[[x,116+n%2*7],[x-14,66+n%3*5],[x+11,105]]);fillStroke(ctx,p.green,p.outline,3);});for(var d=0;d<7;d++)line(ctx,[[88+d*19,154],[73+d*22,315]],d%2?p.yellow:p.light,5);
    }else if(index===8){
      roundedRect(ctx,91,129,118,247,8);fillStroke(ctx,p.base,p.outline,7);[72,117,183,228].forEach(function(x){roundedRect(ctx,x,102,36,274,7);fillStroke(ctx,p.light,p.outline,5);polygon(ctx,[[x-4,107],[x+18,74],[x+40,107]]);fillStroke(ctx,p.dark,p.outline,4);});
    }else if(index===9){
      roundedRect(ctx,68,92,164,284,42);fillStroke(ctx,p.base,p.outline,7);[0,1,2,3].forEach(function(n){line(ctx,[[75,143+n*52],[225,111+n*52]],n%2?p.yellow:p.light,9);});ellipse(ctx,150,92,80,18,p.dark,p.outline,5);
    }else if(index===10){
      [100,143,190,222].forEach(function(x,n){circle(ctx,x,208+n%2*18,66-n%2*12,p.light,p.outline,6);});roundedRect(ctx,75,221,151,155,34);fillStroke(ctx,p.base,p.outline,7);
    }else{
      ellipse(ctx,150,232,106,118,p.base,p.outline,7);polygon(ctx,[[82,143],[91,83],[123,139],[177,139],[210,83],[219,143]]);fillStroke(ctx,p.dark,p.outline,5);drawFriendlyFace(ctx,150,216,.82,p);
    }
    // Every cast gets visible paper layering; its region differs by silhouette.
    if(index===0) fringe(ctx,91,207,82,68,p);
    else if(index===2) fringe(ctx,113,177,74,112,p);
    else if(index===3) fringe(ctx,114,260,72,86,p);
    else if(index===5) fringe(ctx,94,201,112,105,p);
    else if(index===9) fringe(ctx,87,268,126,72,p);
    else if(index===11) fringe(ctx,95,281,110,57,p);
    ctx.restore();
    for(var ribbon=0;ribbon<5;ribbon++){
      var rx=111+ribbon*20;var local=sway*(ribbon%2?1:-1);
      ctx.beginPath();ctx.moveTo(rx,344);ctx.bezierCurveTo(rx+local,355,rx-local,365,rx+local,376);ctx.strokeStyle=ribbon%2?p.light:p.yellow;ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke();
    }
  }

  function duckBase(ctx,bodyX,bodyY,bodyRx,bodyRy,headX,headY,headR,p) {
    ellipse(ctx,bodyX,bodyY,bodyRx,bodyRy,bodyGradient(ctx,p,bodyX-bodyRx,bodyY-bodyRy,bodyRx*2,bodyRy*2),p.outline,7);
    circle(ctx,headX,headY,headR,p.light,p.outline,7);
    ellipse(ctx,headX+headR*.78,headY+8,headR*.68,headR*.28,p.orange,p.outline,4);
    circle(ctx,headX+headR*.22,headY-headR*.17,6,p.white,p.ink,3);
    circle(ctx,headX+headR*.25,headY-headR*.16,2.4,p.ink);
  }

  function drawDuck(ctx,state,index,p) {
    var tall=index===1;var round=index===2||index===10;
    var by=tall?276:286, brx=round?116:(tall?80:104), bry=tall?100:(round?88:84);
    var hx=tall?154:194, hy=tall?132:184, hr=tall?48:52;
    if(index===8){hx=180;hy=184;}
    duckBase(ctx,145,by,brx,bry,hx,hy,hr,p);
    var flap=clock(state,2.7,index)*12;
    ctx.save();ctx.translate(0,flap);ellipse(ctx,123,280,53,26,p.dark,p.outline,5,-.35);line(ctx,[[100,279],[138,289]],p.light,4);ctx.restore();
    // Matching far wing, curled tail, nostril and cheek highlight make the
    // oversized duck read as one connected vinyl character from either side.
    ctx.save();ctx.translate(0,-flap*.55);ellipse(ctx,194,276,42,22,p.light,p.outline,4,.30);line(ctx,[[177,282],[210,271]],p.shine,3);ctx.restore();
    polygon(ctx,[[48,278],[22,251],[58,248],[74,269]]);fillStroke(ctx,p.light,p.outline,5);
    circle(ctx,hx+hr*.97,hy+4,2.5,p.ink);
    ctx.save();ctx.globalAlpha=.40;ellipse(ctx,hx-14,hy-22,13,7,p.white,null,0,-.35);ctx.restore();
    if(index===3){polygon(ctx,[[151,153],[191,102],[237,120],[224,149]]);fillStroke(ctx,p.white,p.outline,4);line(ctx,[[160,225],[207,237]],p.veryCherry||p.dark,9);}
    else if(index===4){ellipse(ctx,197,171,59,32,p.silver,p.outline,6);circle(ctx,178,170,17,p.glass,p.ink,3);circle(ctx,215,170,17,p.glass,p.ink,3);roundedRect(ctx,77,250,33,68,9);fillStroke(ctx,p.dark,p.outline,4);}
    else if(index===5){polygon(ctx,[[183,126],[193,81],[207,126]]);fillStroke(ctx,p.silver,p.outline,4);line(ctx,[[85,285],[205,305]],p.silverDark,7);roundedRect(ctx,92,242,44,35,6);fillStroke(ctx,p.silver,p.ink,3);}
    else if(index===6){[74,101,130,158].forEach(function(x,n){polygon(ctx,[[x,235-n*5],[x+14,195-n*6],[x+31,239-n*2]]);fillStroke(ctx,p.green,p.outline,3);});polygon(ctx,[[50,313],[24,285],[67,282]]);fillStroke(ctx,p.dark,p.outline,4);}
    else if(index===7){polygon(ctx,[[193,135],[201,76],[215,136]]);fillStroke(ctx,p.cream,p.outline,4);[0,1,2].forEach(function(n){ellipse(ctx,169+n*18,127-n*9,22,9,n%2?p.pink:p.light,p.outline,2,-.3);});}
    else if(index===8){circle(ctx,180,184,82,p.glass,p.silverDark,7);roundedRect(ctx,79,250,132,92,32);fillStroke(ctx,p.silver,p.outline,6);line(ctx,[[93,302],[196,302]],p.light,5);}
    else if(index===9){ctx.beginPath();ctx.arc(190,184,70,3.35,6.08);ctx.lineTo(231,232);ctx.lineTo(149,232);ctx.closePath();fillStroke(ctx,p.light,p.outline,6);roundedRect(ctx,93,231,111,119,30);fillStroke(ctx,p.dark,p.outline,6);[130,168].forEach(function(x){circle(ctx,x,270,5,p.yellow,p.ink,2);});}
    else if(index===10){polygon(ctx,[[149,166],[132,102],[171,129],[195,76],[221,128],[261,101],[239,171]]);fillStroke(ctx,p.yellow,p.outline,6);}
    else if(index===11){ctx.save();ctx.globalAlpha=.5;line(ctx,[[61,247],[210,332]],p.white,7);line(ctx,[[72,313],[195,235]],p.white,7);ctx.restore();[96,138,181].forEach(function(x,n){circle(ctx,x,304-n*15,10,n%2?p.pink:p.light,p.outline,2);});}
    if(index===0||index===2)shine(ctx,102,232,20,85,10,p);
    ellipse(ctx,145,362,brx*.72,14,p.dark,p.outline,5);
  }

  function figureBody(ctx,x,y,p,pose) {
    var shift=pose||0;
    circle(ctx,x,y,42,p.light,p.outline,6);
    roundedRect(ctx,x-48,y+39,96,144,22);fillStroke(ctx,bodyGradient(ctx,p,x-48,y+39,96,144),p.outline,7);
    line(ctx,[[x-39,y+72],[x-79-shift,y+144],[x-62-shift,y+154]],p.outline,23);
    line(ctx,[[x+39,y+72],[x+79+shift,y+135],[x+64+shift,y+150]],p.outline,23);
    line(ctx,[[x-25,y+181],[x-42-shift,y+260]],p.outline,29);
    line(ctx,[[x+25,y+181],[x+43+shift,y+260]],p.outline,29);
    roundedRect(ctx,x-70-shift,y+246,55,22,10);fillStroke(ctx,p.dark,p.outline,4);
    roundedRect(ctx,x+15+shift,y+246,55,22,10);fillStroke(ctx,p.dark,p.outline,4);
    drawFriendlyFace(ctx,x,y-6,.62,p);
  }

  function drawActionFigure(ctx,state,index,p) {
    var roleIndex=index;
    index=[0,3,6,11,2,5,8,1,10,4,7,9][roleIndex];
    var pose=clock(state,1.35,index)*5;
    figureBody(ctx,150,103,p,pose);
    if(index===0){ctx.beginPath();ctx.arc(150,103,52,Math.PI,0);fillStroke(ctx,p.glass,p.silverDark,6);roundedRect(ctx,105,158,30,88,8);fillStroke(ctx,p.silver,p.outline,4);line(ctx,[[111,184],[82,211]],p.light,5);}
    else if(index===1){ctx.beginPath();ctx.arc(150,105,54,Math.PI,0);fillStroke(ctx,p.silver,p.outline,6);[101,199].forEach(function(x){polygon(ctx,[[x,151],[x-29,177],[x+9,189]]);fillStroke(ctx,p.light,p.outline,4);});}
    else if(index===2){ctx.beginPath();ctx.moveTo(111,148);ctx.quadraticCurveTo(62,219,85,319);ctx.lineTo(139,244);ctx.closePath();fillStroke(ctx,p.green,p.outline,5);[99,201].forEach(function(x){polygon(ctx,[[x,146],[x-27,171],[x,184]]);fillStroke(ctx,p.green,p.outline,3);});}
    else if(index===3){roundedRect(ctx,102,61,96,85,12);fillStroke(ctx,p.silver,p.outline,6);circle(ctx,132,99,7,p.light,p.ink,2);circle(ctx,168,99,7,p.light,p.ink,2);line(ctx,[[95,188],[49,188]],p.silverDark,18);line(ctx,[[205,188],[251,188]],p.silverDark,18);}
    else if(index===4){ellipse(ctx,150,91,52,23,p.silverDark,p.outline,5);circle(ctx,134,91,16,p.glass,p.ink,3);circle(ctx,170,91,16,p.glass,p.ink,3);var scarf=clock(state,2,index)*12;ctx.beginPath();ctx.moveTo(185,138);ctx.bezierCurveTo(218,155+scarf,244,135-scarf,257,165);ctx.strokeStyle=p.light;ctx.lineWidth=10;ctx.stroke();}
    else if(index===5){polygon(ctx,[[105,151],[132,127],[150,139],[170,126],[198,152],[179,232],[120,232]]);fillStroke(ctx,p.glass,p.outline,6);[116,184].forEach(function(x){polygon(ctx,[[x,135],[x-24,169],[x+15,177]]);fillStroke(ctx,p.light,p.outline,4);});}
    else if(index===6){ctx.beginPath();ctx.arc(150,103,53,Math.PI,0);fillStroke(ctx,p.yellow,p.outline,6);roundedRect(ctx,99,151,29,99,6);fillStroke(ctx,p.silverDark,p.outline,4);polygon(ctx,[[190,161],[226,192],[194,217]]);fillStroke(ctx,p.silver,p.outline,4);}
    else if(index===7){[107,193].forEach(function(x){circle(ctx,x,159,24,p.silver,p.outline,4);circle(ctx,x,159,14,p.light,p.ink,3);line(ctx,[[x,159],[x+6,150]],p.ink,2);});line(ctx,[[119,222],[181,222]],p.yellow,6);}
    else if(index===8){polygon(ctx,[[102,148],[120,116],[139,143],[161,143],[181,116],[199,148]]);fillStroke(ctx,p.green,p.outline,5);[0,1,2,3,4].forEach(function(n){ellipse(ctx,118+n*16,186+n%2*9,12,7,n%2?p.pink:p.light,p.outline,2);});}
    else if(index===9){ctx.beginPath();ctx.arc(150,103,55,Math.PI,0);fillStroke(ctx,p.white,p.outline,6);roundedRect(ctx,101,154,31,92,7);fillStroke(ctx,p.silver,p.outline,4);line(ctx,[[113,180],[88,196]],p.light,4);line(ctx,[[108,205],[83,219]],p.light,4);}
    else if(index===10){var wave=clock(state,1.8,index)*9;ctx.beginPath();ctx.moveTo(111,147);ctx.quadraticCurveTo(61,196+wave,91,322);ctx.quadraticCurveTo(150,279-wave,209,322);ctx.quadraticCurveTo(239,195-wave,189,147);ctx.closePath();fillStroke(ctx,p.light,p.outline,5);ellipse(ctx,150,155,35,21,p.white,p.outline,3);}
    else{polygon(ctx,[[150,44],[162,71],[191,74],[169,94],[176,123],[150,108],[124,123],[131,94],[109,74],[138,71]]);fillStroke(ctx,p.yellow,p.outline,4);var cape=clock(state,1.9,index)*10;ctx.beginPath();ctx.moveTo(113,146);ctx.bezierCurveTo(73,196+cape,73,281-cape,99,325);ctx.lineTo(145,224);ctx.closePath();fillStroke(ctx,p.light,p.outline,5);}
    // Original role emblems keep all twelve locked characters immediately
    // distinguishable even at small roster size.
    if(roleIndex===0){line(ctx,[[113,196],[187,196]],p.silver,5);circle(ctx,150,196,12,p.glass,p.outline,3);}
    else if(roleIndex===1){line(ctx,[[150,58],[150,39]],p.silverDark,4);circle(ctx,150,35,5,p.yellow,p.outline,2);}
    else if(roleIndex===2){polygon(ctx,[[150,167],[177,183],[169,218],[150,231],[131,218],[123,183]]);fillStroke(ctx,p.silver,p.outline,4);}
    else if(roleIndex===3){[119,181].forEach(function(x){starPath(ctx,x,183,10,4,5);fillStroke(ctx,p.yellow,p.outline,2);});}
    else if(roleIndex===4){circle(ctx,150,196,18,p.cream,p.outline,3);line(ctx,[[150,196],[159,184]],p.ink,2);}
    else if(roleIndex===5){circle(ctx,150,195,19,p.white,p.outline,3);[0,1,2].forEach(function(n){ctx.beginPath();ctx.arc(150,195,8+n*6,n*.7,n*.7+2.3);ctx.strokeStyle=p.light;ctx.lineWidth=2;ctx.stroke();});}
    else if(roleIndex===6){line(ctx,[[114,180],[186,212]],p.white,9);line(ctx,[[114,199],[186,231]],p.dark,7);}
    else if(roleIndex===7){[109,191].forEach(function(x){circle(ctx,x,206,6,p.glass,p.outline,2);circle(ctx,x,224,4,p.glass,p.outline,1);});}
    else if(roleIndex===8){circle(ctx,174,204,14,p.glass,p.outline,3);line(ctx,[[184,214],[199,231]],p.outline,5);}
    else if(roleIndex===9){polygon(ctx,[[118,190],[150,174],[182,190],[150,205]]);fillStroke(ctx,p.silver,p.outline,3);}
    else if(roleIndex===10){for(var gear=0;gear<8;gear++){var ga=gear*Math.PI/4;circle(ctx,150+Math.cos(ga)*17,201+Math.sin(ga)*17,4,p.yellow,p.outline,1);}circle(ctx,150,201,12,p.silver,p.outline,3);}
    else{starPath(ctx,150,198,22,9,5);fillStroke(ctx,p.yellow,p.outline,3);}
    ellipse(ctx,150,370,92,6,p.shadow,null,0);
  }

  function windows(ctx,x,y,w,h,p,state,index,cols,rows) {
    var cw=(w-18)/(cols*1.55);var gap=(w-18-cw*cols)/Math.max(1,cols-1);
    var rh=(h-24)/(rows*1.65);var vgap=(h-24-rh*rows)/Math.max(1,rows-1);
    for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){
      var on=state&&state.reducedMotion?(r+c+index)%3===0:clock(state,.8,(r*cols+c+index)*.9)>-.18;
      roundedRect(ctx,x+9+c*(cw+gap),y+12+r*(rh+vgap),cw,rh,2);fillStroke(ctx,on?p.yellow:p.silverDark,p.outline,1.5);
    }
  }

  function drawBuilding(ctx,state,index,p) {
    var buildingIndex=index;
    index=[0,1,3,2,9,8,7,10,11,6,5,4][buildingIndex];
    var sway=clock(state,1.6,index)*4;
    if(index===0){roundedRect(ctx,91,74,118,302,5);fillStroke(ctx,bodyGradient(ctx,p,91,74,118,302),p.outline,7);polygon(ctx,[[106,74],[106,52],[194,52],[194,74]]);fillStroke(ctx,p.light,p.outline,5);windows(ctx,100,97,100,248,p,state,index,4,8);}
    else if(index===1){roundedRect(ctx,72,54,156,322,3);fillStroke(ctx,p.dark,p.outline,7);for(var n=0;n<8;n++)line(ctx,[[78,94+n*35],[222,94+n*35]],p.brown,5);windows(ctx,86,70,128,275,p,state,index,3,8);}
    else if(index===2){roundedRect(ctx,98,108,104,268,4);fillStroke(ctx,p.silver,p.outline,7);polygon(ctx,[[87,109],[150,42],[213,109]]);fillStroke(ctx,p.light,p.outline,6);circle(ctx,150,135,30,p.white,p.outline,5);line(ctx,[[150,135],[150,116]],p.ink,3);line(ctx,[[150,135],[166,143]],p.ink,3);windows(ctx,111,187,78,151,p,state,index,2,5);}
    else if(index===3){polygon(ctx,[[62,376],[62,233],[88,233],[88,164],[111,164],[111,99],[134,99],[134,54],[166,54],[166,99],[189,99],[189,164],[212,164],[212,233],[238,233],[238,376]]);fillStroke(ctx,p.base,p.outline,7);polygon(ctx,[[120,99],[150,55],[180,99],[150,85]]);fillStroke(ctx,p.yellow,p.outline,3);windows(ctx,81,248,138,99,p,state,index,5,3);}
    else if(index===4){for(var floor=0;floor<10;floor++){var shift=(floor-5)*4;roundedRect(ctx,85+shift,342-floor*29,130,25,7);fillStroke(ctx,floor%2?p.light:p.base,p.outline,3);}line(ctx,[[150,54+sway],[150,30]],p.silverDark,5);}
    else if(index===5){roundedRect(ctx,82,64,136,312,6);fillStroke(ctx,p.brown,p.outline,7);for(var f=0;f<7;f++){roundedRect(ctx,66,101+f*39,168,15,5);fillStroke(ctx,p.green,p.outline,3);ellipse(ctx,89,98+f*39,24,10,p.light,p.outline,2);ellipse(ctx,208,98+f*39,24,10,p.light,p.outline,2);}windows(ctx,103,82,94,260,p,state,index,3,7);}
    else if(index===6){roundedRect(ctx,69,92,162,284,7);fillStroke(ctx,p.silverDark,p.outline,7);[105,195].forEach(function(x){circle(ctx,x,135,19,p.light,p.ink,4);});roundedRect(ctx,107,278,86,98,8);fillStroke(ctx,p.dark,p.outline,5);line(ctx,[[105,91],[95,54+sway]],p.silver,6);line(ctx,[[195,91],[205,54-sway]],p.silver,6);windows(ctx,89,176,122,80,p,state,index,4,3);}
    else if(index===7){polygon(ctx,[[76,376],[92,113],[120,71],[134,71],[150,38],[166,71],[180,71],[208,113],[224,376]]);fillStroke(ctx,bodyGradient(ctx,p,76,38,148,338),p.outline,7);polygon(ctx,[[76,376],[42,376],[78,319]]);fillStroke(ctx,p.dark,p.outline,4);polygon(ctx,[[224,376],[258,376],[222,319]]);fillStroke(ctx,p.dark,p.outline,4);windows(ctx,108,112,84,225,p,state,index,3,7);}
    else if(index===8){roundedRect(ctx,80,119,140,257,5);fillStroke(ctx,p.silver,p.outline,7);[57,191].forEach(function(x){roundedRect(ctx,x,97,52,279,5);fillStroke(ctx,p.light,p.outline,5);polygon(ctx,[[x-4,99],[x+26,64],[x+56,99]]);fillStroke(ctx,p.dark,p.outline,4);});windows(ctx,105,148,90,190,p,state,index,3,6);}
    else if(index===9){line(ctx,[[92,376],[117,155],[183,155],[208,376]],p.silverDark,12);ellipse(ctx,150,129,72,70,p.base,p.outline,7);roundedRect(ctx,121,187,58,189,4);fillStroke(ctx,p.light,p.outline,5);windows(ctx,130,206,40,140,p,state,index,2,5);}
    else if(index===10){[[92,282,104,94],[67,207,123,77],[105,133,128,76],[76,64,116,70]].forEach(function(v,n){roundedRect(ctx,v[0]+(n%2?sway:0),v[1],v[2],v[3],5);fillStroke(ctx,n%2?p.light:p.base,p.outline,6);windows(ctx,v[0]+10+(n%2?sway:0),v[1]+8,v[2]-20,v[3]-16,p,state,index+n,3,2);});}
    else{polygon(ctx,[[84,376],[84,101],[109,75],[109,55],[191,55],[191,75],[216,101],[216,376]]);fillStroke(ctx,bodyGradient(ctx,p,84,55,132,321),p.outline,7);polygon(ctx,[[109,55],[123,34],[177,34],[191,55]]);fillStroke(ctx,p.yellow,p.outline,5);ctx.save();ctx.globalAlpha=.48;roundedRect(ctx,120,46,60,75,17);fillStroke(ctx,p.white,null,0);ctx.restore();windows(ctx,103,139,94,199,p,state,index,3,6);}
    // Missing tower-specific architectural cues for the locked matrix.
    if(buildingIndex===4){ellipse(ctx,150,129,84,18,p.glass,p.outline,4);line(ctx,[[150,104],[150,51+sway]],p.silverDark,5);}
    else if(buildingIndex===8){ctx.save();ctx.globalAlpha=.24;polygon(ctx,[[150,83],[277,132],[150,154]]);fillStroke(ctx,p.yellow,null,0);ctx.restore();}
    else if(buildingIndex===9){roundedRect(ctx,63,307,174,27,8);fillStroke(ctx,p.cream,p.outline,4);line(ctx,[[82,335],[82,365],[218,365],[218,335]],p.silverDark,5);}
    else if(buildingIndex===11){ctx.save();ctx.globalAlpha=.46;[0,1,2,3].forEach(function(n){polygon(ctx,[[150,45+n*68],[112+n*3,104+n*68],[188-n*3,104+n*68]]);fillStroke(ctx,n%2?p.glass:p.white,p.outline,2);});ctx.restore();}
    ellipse(ctx,150,370,108,6,p.shadow,null,0);
  }

  function carton(ctx,points,p) {
    polygon(ctx,points);fillStroke(ctx,bodyGradient(ctx,p,55,70,190,306),p.outline,7);
  }

  function packageMarks(ctx,index,p) {
    if(index===0){for(var n=0;n<4;n++)line(ctx,[[104,170+n*35],[198,170+n*35]],n%2?p.light:p.cream,8);}
    else if(index===1){for(var s=0;s<6;s++){polygon(ctx,[[73+s*29,138],[88+s*29,138],[68+s*29,345],[53+s*29,345]]);fillStroke(ctx,s%2?p.white:p.light,null,0);}}
    else if(index===2){ctx.beginPath();ctx.arc(126,135,27,.25,5.9);ctx.arc(174,135,27,-2.9,2.7);ctx.strokeStyle=p.brown;ctx.lineWidth=11;ctx.stroke();circle(ctx,150,174,31,p.cream,p.outline,3);}
    else if(index===3){[118,151,184].forEach(function(x,n){ellipse(ctx,x,203+n%2*10,24,31,n%2?p.green:p.light,p.outline,3);line(ctx,[[x,174+n%2*10],[x+11,158+n%2*10]],p.green,5);});}
    else if(index===4){roundedRect(ctx,91,164,118,129,8);fillStroke(ctx,'rgba(240,250,255,.45)',p.outline,4);[[113,190],[151,213],[183,185],[127,254],[179,260]].forEach(function(v,n){circle(ctx,v[0],v[1],12+n%3,n%2?p.cream:p.light,p.outline,2);});}
    else if(index===5){[0,1,2].forEach(function(n){roundedRect(ctx,92+n%2*9,92+n*91,116,82,8);fillStroke(ctx,n===1?p.light:(n===2?p.dark:p.base),p.outline,5);line(ctx,[[111+n%2*9,131+n*91],[190+n%2*9,131+n*91]],p.white,6);});}
    else if(index===6){roundedRect(ctx,96,177,108,90,13);fillStroke(ctx,p.cream,p.outline,4);circle(ctx,129,219,19,p.light,p.outline,3);polygon(ctx,[[158,244],[180,190],[201,244]]);fillStroke(ctx,p.green,p.outline,3);}
    else if(index===7){roundedRect(ctx,89,159,122,130,8);fillStroke(ctx,p.silver,p.outline,4);drawFriendlyFace(ctx,150,195,.75,p);polygon(ctx,[[69,200],[42,221],[69,240]]);fillStroke(ctx,p.light,p.outline,3);polygon(ctx,[[231,200],[258,221],[231,240]]);fillStroke(ctx,p.light,p.outline,3);}
    else if(index===8){polygon(ctx,[[110,292],[122,173],[150,116],[178,173],[190,292]]);fillStroke(ctx,p.light,p.outline,4);ellipse(ctx,150,207,24,45,p.white,p.outline,3);}
    else if(index===9){
      polygon(ctx,[[94,155],[131,132],[155,155],[190,131],[211,159],[184,185],[211,216],[177,239],[151,217],[120,242],[93,211],[119,183]]);fillStroke(ctx,p.light,p.outline,4);
      polygon(ctx,[[101,263],[137,239],[164,261],[142,292]]);fillStroke(ctx,p.cream,p.outline,3);
      polygon(ctx,[[164,261],[202,242],[213,282],[179,301]]);fillStroke(ctx,p.dark,p.outline,3);
      polygon(ctx,[[116,310],[151,289],[187,312],[169,348],[128,345]]);fillStroke(ctx,p.base,p.outline,3);
    }
    else if(index===10){for(var t=0;t<6;t++){polygon(ctx,[[65+t*31,116+(t%2)*13],[80+t*31,140+(t%2)*13],[95+t*31,116+(t%2)*13]]);fillStroke(ctx,t%2?p.yellow:p.light,p.outline,2);}}
    else{polygon(ctx,[[150,151],[166,184],[202,189],[176,215],[182,251],[150,234],[118,251],[124,215],[98,189],[134,184]]);fillStroke(ctx,p.yellow,p.outline,4);ctx.save();ctx.globalAlpha=.35;line(ctx,[[87,118],[209,322]],p.white,13);ctx.restore();}
  }

  function drawSnackAssortment(ctx,state,index,p) {
    var lag=clock(state,1.6,index)*3;
    roundedRect(ctx,82,183,136,127,14);fillStroke(ctx,p.cream,p.outline,5);
    // Popcorn tub.
    polygon(ctx,[[91,215],[124,215],[120,286],[96,286]]);fillStroke(ctx,p.white,p.outline,3);
    [0,1,2,3,4].forEach(function(n){circle(ctx,97+(n%3)*11+lag*.12,211-Math.floor(n/3)*8,8,p.yellow,p.outline,2);});
    // Cracker packet with sealed crimp lines.
    roundedRect(ctx,128+lag*.18,205,37,81,7);fillStroke(ctx,p.light,p.outline,3);
    line(ctx,[[133+lag*.18,216],[160+lag*.18,216]],p.white,3);
    [0,1,2].forEach(function(n){roundedRect(ctx,137+lag*.18,229+n*15,19,10,2);fillStroke(ctx,p.cream,p.brown,1.5);});
    // Fruit bites and a looped pretzel are unmistakably separate snacks.
    roundedRect(ctx,170-lag*.14,222,38,64,7);fillStroke(ctx,p.dark,p.outline,3);
    [0,1,2].forEach(function(n){circle(ctx,180+(n%2)*16-lag*.14,242+n*12,6,n%2?p.green:p.pink,p.outline,1.5);});
    ctx.beginPath();ctx.arc(182,199,12,.2,5.9);ctx.arc(202,199,12,-2.9,2.7);
    ctx.strokeStyle=p.brown;ctx.lineWidth=6;ctx.stroke();
    line(ctx,[[91,296],[209,296]],p.base,5);
  }

  function drawSnackBox(ctx,state,index,p) {
    var flap=clock(state,1.9,index)*7;
    if(index===0){carton(ctx,[[79,100],[112,76+flap],[132,99],[221,99],[221,376],[79,376]],p);polygon(ctx,[[112,77+flap],[137,63],[162,77+flap],[188,61],[221,99],[79,99]]);fillStroke(ctx,p.light,p.outline,5);}
    else if(index===1){carton(ctx,[[62,105],[238,105],[215,376],[85,376]],p);polygon(ctx,[[77,105],[96,72+flap],[204,72-flap],[223,105]]);fillStroke(ctx,p.cream,p.outline,5);}
    else if(index===2){carton(ctx,[[71,117],[229,117],[216,376],[84,376]],p);ctx.save();ctx.strokeStyle=p.outline;ctx.lineWidth=18;ctx.beginPath();ctx.arc(126,112,28,.2,5.8);ctx.arc(174,112,28,-2.9,2.7);ctx.stroke();ctx.strokeStyle=p.brown;ctx.lineWidth=10;ctx.stroke();ctx.restore();}
    else if(index===3){ctx.beginPath();ctx.moveTo(70,133);ctx.quadraticCurveTo(70,98,105,98);ctx.lineTo(126,70+flap);ctx.lineTo(150,101);ctx.lineTo(178,70-flap);ctx.lineTo(199,100);ctx.quadraticCurveTo(230,104,230,133);ctx.lineTo(216,376);ctx.lineTo(84,376);ctx.closePath();fillStroke(ctx,bodyGradient(ctx,p,70,70,160,306),p.outline,7);}
    else if(index===4){carton(ctx,[[67,91],[233,91],[220,376],[80,376]],p);}
    else if(index===5){carton(ctx,[[83,72],[217,72],[230,376],[70,376]],p);}
    else if(index===6){carton(ctx,[[64,138],[84,91],[113,69+flap],[187,69-flap],[216,91],[236,138],[218,376],[82,376]],p);roundedRect(ctx,116,55,68,30,13);fillStroke(ctx,p.dark,p.outline,5);}
    else if(index===7){carton(ctx,[[65,94],[235,94],[225,376],[75,376]],p);}
    else if(index===8){carton(ctx,[[87,60],[213,60],[230,376],[70,376]],p);polygon(ctx,[[70,315],[42,376],[91,350],[209,350],[258,376],[230,315]]);fillStroke(ctx,p.dark,p.outline,4);}
    else if(index===9){carton(ctx,[[78,91],[121,58],[151,82],[184,57],[222,98],[204,376],[91,376],[65,329]],p);}
    else if(index===10){carton(ctx,[[49,122],[251,122],[226,376],[74,376]],p);polygon(ctx,[[49,122],[73,81+flap],[98,117],[125,80-flap],[151,117],[178,80+flap],[204,117],[229,81-flap],[251,122]]);fillStroke(ctx,p.light,p.outline,5);}
    else{carton(ctx,[[75,84],[225,84],[213,376],[87,376]],p);polygon(ctx,[[75,84],[112,53+flap],[150,75],[189,51-flap],[225,84]]);fillStroke(ctx,p.light,p.outline,5);}
    packageMarks(ctx,index,p);
    drawSnackAssortment(ctx,state,index,p);
    if(index!==5)shine(ctx,index===10?73:92,index===10?157:123,12,172,5,p);
    ellipse(ctx,150,370,index===10?96:76,6,p.shadow,null,0);
  }

  var PAINTERS = Object.freeze({
    'snow-globe': drawSnowGlobe,
    'eyeball-monster': drawEyeballMonster,
    'soda-can': drawSodaCan,
    'watering-can': drawWateringCan,
    'pinata': drawPinata,
    'huge-rubber-duck': drawDuck,
    'action-figures': drawActionFigure,
    'tall-buildings': drawBuilding,
    'box-of-snacks': drawSnackBox,
  });

  function manifestObject(id) {
    for (var i = 0; i < Manifest.objects.length; i++) {
      if (Manifest.objects[i].id === id) return Manifest.objects[i];
    }
    throw new Error('Missing v111 manifest object: ' + id);
  }

  function metricsFor(id) {
    return {
      viewBox: { x: 0, y: 0, width: 300, height: 420 },
      bounds: BOUNDS[id],
      pivot: { x: 150, y: 323.2972972973 },
      baselineY: 376,
      artScale: 0.74,
      localContactOffset: 39,
    };
  }

  function faceOverride(id, index) {
    if (id === 'huge-rubber-duck') {
      if (index === 1) return { anchor: { x: 154, y: 132 }, scale: 0.72, focusRadius: 72, supportsEmotion: true };
      if (index === 8) return { anchor: { x: 180, y: 184 }, scale: 0.72, focusRadius: 72, supportsEmotion: true };
    }
    return null;
  }

  function register(id) {
    var existing = Art.getObject(id);
    if (existing) return existing;
    var source = manifestObject(id);
    var painter = PAINTERS[id];
    return Art.registerObject({
      id: source.id,
      label: source.displayName,
      metrics: metricsFor(id),
      variants: source.variants.map(function (variant, index) {
        return {
          id: variant.variantId,
          label: variant.label,
          color: variant.color,
          face: faceOverride(id, index),
          tokens: {
            castIndex: index,
            castLabel: variant.castLabel,
            silhouette: variant.silhouette,
            finish: variant.finish,
          },
        };
      }),
      buildVariant: function (variant) {
        var p = paletteFor(variant.color);
        var castIndex = variant.tokens.castIndex;
        return function paintPackCVariant(ctx, state) {
          ctx.save();
          try {
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            painter(ctx, state || {}, castIndex, p);
            Art.paintPhysicalDynamics(ctx, id, state, variant.color);
            Art.paintReactionFace(ctx, variant.face, state);
          } finally {
            ctx.restore();
          }
        };
      },
    });
  }

  var definitions = OBJECT_IDS.map(register);
  var variantIds = [];
  definitions.forEach(function (definition) {
    definition.variants.forEach(function (variant) { variantIds.push(variant.canonicalId); });
  });

  return Object.freeze({
    objectIds: OBJECT_IDS,
    definitions: Object.freeze(definitions.slice()),
    variantIds: Object.freeze(variantIds),
  });
});
