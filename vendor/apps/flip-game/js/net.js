// net.js — v111 online rooms over a fail-closed NetworkEnvelopeV2 protocol.
(function (root, factory) {
  'use strict';
  var protocol = root && root.FlipgameNetworkProtocolV2;
  if (typeof module === 'object' && module.exports) protocol = require('./v111-network-protocol.js');
  var createNet = factory(root || {}, protocol);
  var api = createNet();
  api.create = createNet;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Net = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (root, DefaultProtocol) {
  'use strict';

  var MQTT_URL = 'wss://broker.emqx.io:8084/mqtt';
  var TOPIC_ROOT = 'flipgame/v2';

  return function createNet(options) {
    var config = options || {};
    var environment = config.root || root;
    var Protocol = config.protocol === undefined ? DefaultProtocol : config.protocol;
    var socket = null;
    var mode = null;
    var roomCode = null;
    var selfId = null;
    var selfName = null;
    var hostId = null;
    var isHost = false;
    var roster = [];
    var handlers = {};
    var bc = null;
    var mqttTopic = null;
    var connected = false;
    var compatible = !!(Protocol && Protocol.ProtocolSession && Protocol.PROTOCOL === 'flipgame-net/2');
    var reconnectTimer = null;
    var packetId = 1;
    var pingTimer = null;
    var protocolSession = null;
    var resumeToken = null;
    var outboundQueue = [];
    var matchStateAdapter = null;
    // v111 has no account service or authenticated relay.  The public build
    // therefore stays hidden/fail-closed.  A future transport may opt in only
    // by supplying an independent sender-identity verifier.
    var authenticateSender = typeof config.authenticateSender === 'function' ? config.authenticateSender : null;
    compatible = compatible && !!authenticateSender;

    function on(evt, fn) {
      if (typeof fn !== 'function') throw new TypeError('Net listener must be a function');
      (handlers[evt] || (handlers[evt] = [])).push(fn);
      return function () {
        var list = handlers[evt] || [];
        var index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
      };
    }

    function emit(evt, data) {
      (handlers[evt] || []).slice().forEach(function (fn) {
        try { fn(data); } catch (error) {
          if (environment.console && environment.console.error) environment.console.error('Net handler', evt, error);
        }
      });
    }

    function hideOnline(reason) {
      compatible = false;
      var documentRef = environment.document;
      if (documentRef && typeof documentRef.getElementById === 'function') {
        var button = documentRef.getElementById('online-btn');
        var screen = documentRef.getElementById('online-screen');
        if (button && button.classList) button.classList.add('hidden');
        if (screen && screen.classList) screen.classList.add('hidden');
      }
      emit('compatibility-failure', Object.freeze({
        code: reason || 'legacy-protocol',
        message: 'This online match is not compatible with the secure v1.11 protocol.',
      }));
    }

    function requireProtocol() {
      if (!compatible || !Protocol) {
        hideOnline('protocol-unavailable');
        throw new Error('Secure online play is unavailable.');
      }
    }

    function randomValues(array) {
      var cryptoObject = config.crypto || environment.crypto;
      if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
        cryptoObject.getRandomValues(array);
        return;
      }
      for (var i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 0x100000000) >>> 0;
    }

    function randomHex(words) {
      var values = new Uint32Array(words || 2);
      randomValues(values);
      return Array.from(values).map(function (part) {
        return ('00000000' + part.toString(16)).slice(-8);
      }).join('');
    }

    function codeGen() {
      var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      var values = new Uint32Array(4);
      randomValues(values);
      var code = '';
      for (var i = 0; i < 4; i++) code += alphabet[values[i] % alphabet.length];
      return code;
    }

    function uid() { return 'p_' + randomHex(2); }

    function relayUrl() {
      try {
        var locationRef = config.location || environment.location;
        var query = new URLSearchParams(locationRef && locationRef.search || '').get('relay');
        if (query) return query;
      } catch (_) {}
      try { return environment.localStorage && environment.localStorage.getItem('flipgameRelay') || ''; }
      catch (_) { return ''; }
    }

    function wantLocal() {
      try {
        var locationRef = config.location || environment.location;
        return new URLSearchParams(locationRef && locationRef.search || '').get('net') === 'local';
      } catch (_) { return false; }
    }

    function namePolicy() {
      var runtime = environment.FlipgameV111Runtime;
      if (runtime && runtime.namePolicy && typeof runtime.namePolicy.validate === 'function') return runtime.namePolicy;
      var concrete = environment.FlipgameV111NamePolicy;
      if (concrete && typeof concrete.validate === 'function') return concrete;
      return null;
    }

    function validateName(value, context) {
      var original = String(value == null ? '' : value);
      var policy = namePolicy();
      if (!policy) return { valid: false, ok: false, value: original, error: 'Choose a different name.', code: 'policy-unavailable' };
      try {
        var checked = policy.validate(original, context || {});
        if (!checked || typeof checked !== 'object') throw new TypeError('Malformed NamePolicy result');
        var valid = checked.valid !== undefined ? !!checked.valid : !!checked.ok;
        if (!valid) return { valid: false, ok: false, value: original, error: 'Choose a different name.', code: checked.code || 'invalid-name' };
        var normalized = String(checked.value == null ? original : checked.value);
        if (!normalized) return { valid: false, ok: false, value: original, error: 'Choose a different name.', code: 'empty-name' };
        return { valid: true, ok: true, value: normalized, error: null, code: null };
      } catch (_) {
        return { valid: false, ok: false, value: original, error: 'Choose a different name.', code: 'policy-error' };
      }
    }

    function safeColor(value) {
      var color = String(value || '');
      return /^#[0-9a-f]{6}$/i.test(color) ? color : '#4fc3f7';
    }

    function safeSkin(value) {
      var skin = String(value || '');
      return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skin) ? skin : 'bottle';
    }

    function normalizePlayer(candidate, context) {
      var source = candidate && typeof candidate === 'object' ? candidate : {};
      var checked = validateName(source.name, context);
      var id = String(source.id || source.netId || '');
      return {
        player: {
          id: /^p_[a-f0-9]{16}$/.test(id) ? id : '',
          name: checked.valid ? checked.value : 'Player',
          color: safeColor(source.color),
          skin: safeSkin(source.skin),
          flavor: Number.isInteger(source.flavor) && source.flavor >= 0 && source.flavor < 12 ? source.flavor : 0,
          host: !!source.host,
          ready: source.ready !== false,
        },
        rejected: !checked.valid,
        code: checked.code,
      };
    }

    function validatedLocalPlayer(player) {
      var normalized = normalizePlayer(player, { source: 'network-send', local: true });
      if (normalized.rejected) throw new Error('Choose a different name.');
      return normalized.player;
    }

    function upsertPeer(player) {
      if (!player || !player.id) return;
      var index = roster.findIndex(function (item) { return item.id === player.id; });
      if (index >= 0) roster[index] = Object.assign({}, roster[index], player);
      else roster.push(Object.assign({}, player));
    }

    function sanitizeRoster(list, context) {
      if (!Array.isArray(list)) return [];
      return list.map(function (player) { return normalizePlayer(player, context); })
        .filter(function (normalized) { return !normalized.rejected && !!normalized.player.id; })
        .map(function (normalized) { return normalized.player; });
    }

    function sanitizeStart(payload, outbound) {
      var source = payload && typeof payload === 'object' ? payload : {};
      if (!Array.isArray(source.defs) || source.defs.length < 2) throw new Error('A match needs at least two players.');
      var defs = source.defs.map(function (definition) {
        var normalized = normalizePlayer(Object.assign({}, definition, { id: definition.netId }), {
          source: outbound ? 'network-send' : 'network-receive', matchStart: true,
        });
        if (normalized.rejected) throw new Error('Choose a different name.');
        return Object.assign({}, definition, {
          name: normalized.player.name,
          color: normalized.player.color,
          skin: normalized.player.skin,
          netId: normalized.player.id,
          isAI: false,
        });
      });
      if (defs.some(function (definition) { return !definition.netId; })) throw new Error('Match players require network ids.');
      var playerIds = defs.map(function (definition) { return definition.netId; });
      if (new Set(playerIds).size !== playerIds.length) throw new Error('Match player ids must be unique.');
      if (roster.length && playerIds.some(function (id) {
        return !roster.some(function (player) { return player.id === id; });
      })) throw new Error('Match players must belong to the room roster.');
      if (source.startIndex != null && (!Number.isInteger(source.startIndex) ||
          source.startIndex < 0 || source.startIndex >= defs.length)) throw new Error('Invalid starting player.');
      return Object.assign({}, source, { defs: defs });
    }

    function detached(value) {
      if (value == null) return null;
      return JSON.parse(JSON.stringify(value));
    }

    function sanitizeGameState(value, outbound) {
      var state = detached(value);
      if (!state || typeof state !== 'object') return state;
      (function screenNames(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(screenNames); return; }
        Object.keys(node).forEach(function (key) {
          if (key === 'name' && typeof node[key] === 'string') {
            var checked = validateName(node[key], {
              source: outbound ? 'network-send' : 'network-receive', resumeState: true,
            });
            if (outbound && !checked.valid) throw new Error('Choose a different name.');
            node[key] = checked.valid ? checked.value : 'Player';
          } else screenNames(node[key]);
        });
      })(state);
      return state;
    }

    function sanitizeControlPayload(type, payload) {
      var source = Object.assign({}, payload || {});
      if (type === 'hello' && source.player) {
        var helloPlayer = normalizePlayer(source.player, { source: 'network-send', control: type });
        if (helloPlayer.rejected) throw new Error('Choose a different name.');
        source.player = helloPlayer.player;
      }
      if ((type === 'welcome' || type === 'roster' || type === 'resume-state') && source.roster) {
        source.roster = sanitizeRoster(source.roster, { source: 'network-send', control: type });
      }
      return source;
    }

    function encodeRemainingLength(number) {
      var bytes = [];
      do {
        var digit = number % 128;
        number = Math.floor(number / 128);
        if (number > 0) digit |= 0x80;
        bytes.push(digit);
      } while (number > 0);
      return bytes;
    }

    function mqttConnectPacket(clientId) {
      var proto = [0, 4, 77, 81, 84, 84, 4];
      var idBytes = new TextEncoder().encode(clientId);
      var body = proto.concat([2, 0, 30, (idBytes.length >> 8) & 255, idBytes.length & 255], Array.from(idBytes));
      return new Uint8Array([0x10].concat(encodeRemainingLength(body.length), body));
    }

    function mqttSubscribePacket(topic) {
      var id = [(packetId >> 8) & 255, packetId & 255];
      packetId = (packetId + 1) & 0xffff || 1;
      var bytes = new TextEncoder().encode(topic);
      var body = id.concat([(bytes.length >> 8) & 255, bytes.length & 255], Array.from(bytes), [0]);
      return new Uint8Array([0x82].concat(encodeRemainingLength(body.length), body));
    }

    function mqttPublishPacket(topic, message) {
      var topicBytes = new TextEncoder().encode(topic);
      var messageBytes = new TextEncoder().encode(message);
      var body = [(topicBytes.length >> 8) & 255, topicBytes.length & 255]
        .concat(Array.from(topicBytes), Array.from(messageBytes));
      return new Uint8Array([0x30].concat(encodeRemainingLength(body.length), body));
    }

    function mqttPingPacket() { return new Uint8Array([0xC0, 0]); }

    function startMqttPing() {
      stopMqttPing();
      pingTimer = setInterval(function () {
        if (mode !== 'mqtt' || !socket || socket.readyState !== 1) return;
        try { socket.send(mqttPingPacket()); } catch (_) {}
      }, 20000);
    }

    function stopMqttPing() { clearInterval(pingTimer); pingTimer = null; }

    function mqttParse(buffer) {
      var view = new Uint8Array(buffer);
      if (!view.length) return null;
      var type = view[0] >> 4;
      var multiplier = 1, length = 0, index = 1;
      for (;;) {
        if (index >= view.length) return null;
        var digit = view[index++];
        length += (digit & 127) * multiplier;
        multiplier *= 128;
        if (!(digit & 128)) break;
      }
      var payload = view.subarray(index, index + length);
      if (type === 2) return { type: 'connack' };
      if (type === 3) {
        var topicLength = (payload[0] << 8) | payload[1];
        return {
          type: 'publish',
          topic: new TextDecoder().decode(payload.subarray(2, 2 + topicLength)),
          msg: new TextDecoder().decode(payload.subarray(2 + topicLength)),
        };
      }
      if (type === 9) return { type: 'suback' };
      if (type === 13) return { type: 'pingresp' };
      return { type: 'other' };
    }

    function transmit(envelope) {
      var message = JSON.stringify(envelope);
      if (mode === 'local' && bc) { bc.postMessage(message); return true; }
      if (mode === 'mqtt' && socket && socket.readyState === 1) {
        socket.send(mqttPublishPacket(mqttTopic, message)); return true;
      }
      if (mode === 'relay' && socket && socket.readyState === 1) { socket.send(message); return true; }
      return false;
    }

    function sendEnvelope(envelope) {
      if (!connected || !transmit(envelope)) {
        if (!outboundQueue.some(function (item) { return item.sequence === envelope.sequence; })) outboundQueue.push(envelope);
        return false;
      }
      return true;
    }

    function flushQueue() {
      var waiting = outboundQueue.slice();
      outboundQueue = [];
      waiting.forEach(function (envelope) {
        if (!transmit(envelope)) outboundQueue.push(envelope);
      });
      return outboundQueue.length === 0;
    }

    function sendControl(type, payload) {
      requireProtocol();
      if (!protocolSession) throw new Error('Network session is not initialized');
      var envelope = protocolSession.control(type, sanitizeControlPayload(type, payload));
      sendEnvelope(envelope);
      return envelope;
    }

    function project(envelope) {
      return Object.assign({}, envelope.payload, {
        type: envelope.type,
        from: envelope.senderId,
        room: envelope.room,
        matchId: envelope.matchId,
        turnId: envelope.turnId,
        flipId: envelope.flipId,
        sequence: envelope.sequence,
      });
    }

    function sendRenameRequired(targetId, code) {
      if (!isHost) return;
      sendControl('rename-required', {
        targetId: targetId,
        replacement: 'Player',
        code: code || 'invalid-name',
        error: 'Choose a different name.',
      });
    }

    function verifiedIdentity(envelope, transportIdentity) {
      if (!authenticateSender) return null;
      try {
        var verified = authenticateSender(Object.freeze({
          transport: mode, transportIdentity: transportIdentity == null ? null : transportIdentity,
        }));
        if (verified && typeof verified === 'object') verified = verified.senderId;
        verified = String(verified || '');
        return verified && verified === envelope.senderId ? verified : null;
      } catch (_) { return null; }
    }

    function handleMessage(raw, transportIdentity) {
      var envelope;
      if (typeof raw === 'string' && raw.length > 262144) {
        emit('protocol-reject', Object.freeze({ code: 'message-too-large', senderId: null }));
        return;
      }
      try { envelope = typeof raw === 'string' ? JSON.parse(raw) : raw; }
      catch (_) { hideOnline('legacy-protocol'); return; }
      if (!compatible) return;
      if (!envelope || envelope.senderId === selfId) return;
      if (!protocolSession) { hideOnline('protocol-unavailable'); return; }
      if (envelope.schema !== Protocol.SCHEMA || envelope.version !== Protocol.VERSION ||
          envelope.protocol !== Protocol.PROTOCOL) { hideOnline('legacy-protocol'); return; }
      var acceptedSender = verifiedIdentity(envelope, transportIdentity);
      if (!acceptedSender) {
        emit('protocol-reject', Object.freeze({ code: 'unauthenticated-sender', senderId: null }));
        return;
      }

      if (envelope.type === 'welcome' && !hostId && envelope.payload &&
          envelope.payload.targetId === selfId && envelope.payload.hostId === envelope.senderId) {
        try { protocolSession.setHost(envelope.senderId); hostId = envelope.senderId; }
        catch (_) { hideOnline('host-conflict'); return; }
      }

      var accepted = protocolSession.receive(envelope, acceptedSender);
      if (!accepted.ok) {
        emit('protocol-reject', Object.freeze({ code: accepted.code, senderId: envelope && envelope.senderId || null }));
        if (accepted.code === 'legacy-protocol') hideOnline(accepted.code);
        return;
      }
      var msg = project(accepted.envelope);

      switch (msg.type) {
        case 'hello': {
          if (!isHost) return;
          if (protocolSession.snapshot().matchId &&
              !roster.some(function (player) { return player.id === msg.from; })) return;
          var incoming = normalizePlayer(Object.assign({}, msg.player, { id: msg.from }), {
            source: 'network-receive', senderId: msg.from,
          });
          if (incoming.rejected) { sendRenameRequired(msg.from, incoming.code); return; }
          incoming.player.host = false;
          upsertPeer(incoming.player);
          sendControl('welcome', {
            targetId: msg.from,
            hostId: selfId,
            roster: roster,
            state: protocolSession.snapshot(),
          });
          sendControl('roster', { roster: roster });
          emit('roster', roster.slice());
          emit('join', Object.assign({}, incoming.player));
          break;
        }
        case 'join': {
          if (!isHost) return;
          var joined = normalizePlayer(Object.assign({}, msg.player, { id: msg.from }), {
            source: 'network-receive', senderId: msg.from,
          });
          if (joined.rejected) { sendRenameRequired(msg.from, joined.code); return; }
          joined.player.host = false;
          upsertPeer(joined.player);
          sendControl('roster', { roster: roster });
          emit('roster', roster.slice());
          emit('join', Object.assign({}, joined.player));
          break;
        }
        case 'welcome':
          if (msg.targetId !== selfId || msg.hostId !== msg.from || msg.from !== hostId) return;
          roster = sanitizeRoster(msg.roster, { source: 'network-receive', roster: true });
          if (!roster.some(function (player) { return player.id === selfId; })) {
            upsertPeer({ id: selfId, name: selfName, color: '#4fc3f7', skin: 'bottle', host: false, ready: true });
          }
          emit('roster', roster.slice());
          emit('welcome', msg);
          break;
        case 'roster':
          if (msg.from !== hostId) return;
          roster = sanitizeRoster(msg.roster, { source: 'network-receive', roster: true });
          emit('roster', roster.slice());
          break;
        case 'rename-required':
          if (msg.from !== hostId || msg.targetId !== selfId) return;
          selfName = 'Player';
          upsertPeer({ id: selfId, name: 'Player' });
          emit('rename-required', Object.freeze({
            error: 'Choose a different name.', replacement: 'Player', code: msg.code || 'invalid-name',
          }));
          break;
        case 'leave':
          roster = roster.filter(function (player) { return player.id !== msg.from; });
          emit('roster', roster.slice());
          emit('leave', msg.from);
          break;
        case 'start': {
          if (msg.from !== hostId) return;
          var start;
          try { start = sanitizeStart(msg, false); }
          catch (_) { hideOnline('invalid-start'); return; }
          emit('start', start);
          break;
        }
        case 'flick':
          emit('flick', msg);
          break;
        case 'result':
          emit('result', msg);
          break;
        case 'resume':
          if (!isHost || !roster.some(function (player) { return player.id === msg.from; })) return;
          var gameState = null;
          var stateAvailable = !protocolSession.snapshot().matchId;
          if (matchStateAdapter && typeof matchStateAdapter.capture === 'function') {
            try { gameState = sanitizeGameState(matchStateAdapter.capture(), true); stateAvailable = gameState != null; }
            catch (_) { stateAvailable = false; }
          }
          sendControl('resume-state', {
            targetId: msg.from,
            resumeToken: msg.resumeToken,
            roster: roster,
            state: protocolSession.snapshot(),
            gameState: gameState,
            stateAvailable: stateAvailable,
          });
          break;
        case 'resume-state':
          if (msg.from !== hostId || msg.targetId !== selfId || msg.resumeToken !== resumeToken) return;
          if (msg.state && msg.state.matchId && (!msg.stateAvailable || msg.gameState == null || !matchStateAdapter ||
              typeof matchStateAdapter.restore !== 'function')) {
            emit('resume-state-missing', Object.freeze({ matchId: msg.state.matchId || null }));
            hideOnline('resume-state-missing');
            return;
          }
          try { protocolSession.restore(msg.state, hostId); }
          catch (_) { hideOnline('invalid-resume-state'); return; }
          if (msg.state && msg.state.matchId) {
            try { matchStateAdapter.restore(sanitizeGameState(msg.gameState, false)); }
            catch (_) { hideOnline('invalid-game-state'); return; }
          }
          roster = sanitizeRoster(msg.roster, { source: 'network-receive', resume: true });
          emit('roster', roster.slice());
          emit('resumed', Object.freeze({ matchId: protocolSession.snapshot().matchId }));
          break;
        case 'ping':
          sendControl('pong', { targetId: msg.from });
          break;
        default:
          emit('message', msg);
      }
    }

    function WebSocketCtor() { return config.WebSocket || environment.WebSocket; }
    function BroadcastChannelCtor() { return config.BroadcastChannel || environment.BroadcastChannel; }

    function connectSocket(url, asMqtt) {
      return new Promise(function (resolve, reject) {
        var Constructor = WebSocketCtor();
        if (!Constructor) { reject(new Error('WebSocket unavailable')); return; }
        var settled = false;
        var webSocket = new Constructor(url);
        webSocket.binaryType = 'arraybuffer';
        var timer = setTimeout(function () {
          if (!settled) { settled = true; try { webSocket.close(); } catch (_) {} reject(new Error('connect timeout')); }
        }, 8000);
        webSocket.onopen = function () {
          if (asMqtt) webSocket.send(mqttConnectPacket(selfId));
          else { clearTimeout(timer); settled = true; resolve(webSocket); }
        };
        webSocket.onmessage = function (event) {
          if (!asMqtt) { handleMessage(event.data); return; }
          var parsed = mqttParse(event.data);
          if (!parsed) return;
          if (parsed.type === 'connack') {
            webSocket.send(mqttSubscribePacket(mqttTopic));
            startMqttPing();
            if (!settled) { clearTimeout(timer); settled = true; resolve(webSocket); }
          } else if (parsed.type === 'publish') handleMessage(parsed.msg);
        };
        webSocket.onerror = function () {
          if (!settled) { clearTimeout(timer); settled = true; reject(new Error('ws error')); }
        };
        webSocket.onclose = function () {
          connected = false;
          emit('disconnected');
          if (roomCode) scheduleReconnect(url, asMqtt);
        };
      });
    }

    function scheduleReconnect(url, asMqtt) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(function reconnect() {
        if (!roomCode) return;
        connectSocket(url, asMqtt).then(function (newSocket) {
          socket = newSocket;
          connected = true;
          flushQueue();
          resumeToken = randomHex(2);
          if (hostId && !isHost) {
            sendControl('resume', { resumeToken: resumeToken, lastState: protocolSession.snapshot() });
          } else {
            sendControl('hello', {
              resumeToken: resumeToken,
              player: roster.find(function (player) { return player.id === selfId; }) || { id: selfId, name: selfName },
            });
          }
          emit('reconnected');
        }).catch(function () { scheduleReconnect(url, asMqtt); });
      }, 1500);
    }

    function openTransport() {
      if (wantLocal() || !WebSocketCtor()) {
        var Channel = BroadcastChannelCtor();
        if (!Channel) return Promise.reject(new Error('No secure network transport is available.'));
        mode = 'local';
        bc = new Channel('flipgame-net-v2-' + roomCode);
        bc.onmessage = function (event) { handleMessage(event.data); };
        connected = true;
        return Promise.resolve();
      }
      var custom = relayUrl();
      if (custom) {
        mode = 'relay';
        return connectSocket(custom, false).then(function (newSocket) { socket = newSocket; connected = true; });
      }
      mode = 'mqtt';
      mqttTopic = TOPIC_ROOT + '/' + roomCode;
      return connectSocket(MQTT_URL, true).then(function (newSocket) { socket = newSocket; connected = true; });
    }

    function initializeSession() {
      protocolSession = new Protocol.ProtocolSession({
        selfId: selfId, room: roomCode, hostId: hostId,
        randomValues: randomValues,
      });
    }

    async function createRoom(player) {
      requireProtocol();
      await leave();
      var local = validatedLocalPlayer(player || {});
      selfId = uid();
      selfName = local.name;
      isHost = true;
      hostId = selfId;
      roomCode = codeGen();
      resumeToken = randomHex(2);
      local.id = selfId; local.host = true; local.ready = true;
      roster = [local];
      initializeSession();
      await openTransport();
      emit('roster', roster.slice());
      emit('connected', { roomCode: roomCode, selfId: selfId, isHost: true, protocol: Protocol.PROTOCOL });
      return { roomCode: roomCode, selfId: selfId };
    }

    async function joinRoom(code, player) {
      requireProtocol();
      await leave();
      var local = validatedLocalPlayer(player || {});
      selfId = uid();
      selfName = local.name;
      isHost = false;
      hostId = null;
      roomCode = String(code || '').trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{3,6}$/.test(roomCode)) throw new Error('Enter a room code');
      resumeToken = randomHex(2);
      local.id = selfId; local.host = false; local.ready = true;
      roster = [local];
      initializeSession();
      await openTransport();
      sendControl('hello', { player: local, resumeToken: resumeToken });
      emit('roster', roster.slice());
      emit('connected', { roomCode: roomCode, selfId: selfId, isHost: false, protocol: Protocol.PROTOCOL });
      return { roomCode: roomCode, selfId: selfId };
    }

    function startMatch(payload) {
      requireProtocol();
      if (!isHost || !protocolSession) return false;
      var sanitized = sanitizeStart(payload, true);
      var envelope = protocolSession.start(sanitized);
      sendEnvelope(envelope);
      return envelope.matchId;
    }

    function setTurn(value) {
      requireProtocol();
      if (!protocolSession) throw new Error('Network session is not initialized');
      return protocolSession.setTurn(value);
    }

    function bindMatchState(adapter) {
      if (adapter == null) { matchStateAdapter = null; return null; }
      if (typeof adapter !== 'object' ||
          (adapter.capture != null && typeof adapter.capture !== 'function') ||
          (adapter.restore != null && typeof adapter.restore !== 'function')) {
        throw new TypeError('Match state adapter requires capture/restore functions');
      }
      matchStateAdapter = { capture: adapter.capture || null, restore: adapter.restore || null };
      return Object.freeze(Object.assign({}, matchStateAdapter));
    }

    function sendFlick(payload) {
      requireProtocol();
      if (!connected) return false;
      var envelope = protocolSession.flick(payload);
      sendEnvelope(envelope);
      return true;
    }

    function sendResult(payload) {
      requireProtocol();
      var envelope = protocolSession.result(payload);
      sendEnvelope(envelope);
      return true;
    }

    // The protocol validates the payload shape at the envelope boundary. The
    // renderer supplies its deterministic local event id here as the second,
    // independent binding before any authoritative outcome reaches game rules.
    function acceptResult(payload, expectedEventId) {
      requireProtocol();
      var accepted = Protocol.resolveAuthoritativeResult(payload, expectedEventId);
      if (!accepted.ok) {
        emit('protocol-reject', Object.freeze({ code: accepted.code, senderId: payload && payload.playerId || null }));
        hideOnline(accepted.code);
        return null;
      }
      return accepted.value;
    }

    async function leave() {
      clearTimeout(reconnectTimer);
      stopMqttPing();
      if (connected && roomCode && protocolSession) {
        try { sendControl('leave', {}); } catch (_) {}
      }
      connected = false;
      roomCode = null;
      selfId = null;
      selfName = null;
      hostId = null;
      isHost = false;
      roster = [];
      protocolSession = null;
      resumeToken = null;
      outboundQueue = [];
      if (bc) { try { bc.close(); } catch (_) {} bc = null; }
      if (socket) { try { socket.onclose = null; socket.close(); } catch (_) {} socket = null; }
      mode = null;
    }

    var api = {
      on: on,
      createRoom: createRoom,
      joinRoom: joinRoom,
      leave: leave,
      startMatch: startMatch,
      setTurn: setTurn,
      bindMatchState: bindMatchState,
      sendFlick: sendFlick,
      sendResult: sendResult,
      acceptResult: acceptResult,
      get roomCode() { return roomCode; },
      get selfId() { return selfId; },
      get isHost() { return isHost; },
      get hostId() { return hostId; },
      get roster() { return roster.map(function (player) { return Object.assign({}, player); }); },
      get connected() { return connected; },
      get compatible() { return compatible; },
      get transport() { return mode; },
      get matchId() { return protocolSession ? protocolSession.snapshot().matchId : null; },
      get protocol() { return Protocol && Protocol.PROTOCOL || null; },
      _testing: Object.freeze({
        handleMessage: handleMessage,
        handleAuthenticatedMessage: handleMessage,
        validateName: validateName,
        normalizePlayer: normalizePlayer,
        protocolSnapshot: function () { return protocolSession && protocolSession.snapshot(); },
        setSession: function (value) {
          selfId = value.selfId; roomCode = value.room; hostId = value.hostId || null;
          isHost = !!value.isHost; selfName = value.name || 'Player'; roster = value.roster || [];
          initializeSession();
        },
      }),
    };

    if (!compatible) setTimeout(function () { hideOnline('protocol-unavailable'); }, 0);
    return api;
  };
});
