// v112-globe.js — offline rotating Desk Globe renderer and focus easter egg.
//
// This module owns presentation only. It never imports the game simulation,
// changes a collision body, or consumes the gameplay/event random stream.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipGlobeV112 = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var DEFAULT_PERIOD_SECONDS = 13.5;
  var DEFAULT_DATA_URL = 'data/v112-globe/natural-earth-land-110m.geojson';
  var SOURCE = Object.freeze({
    name: 'Natural Earth 1:110m land',
    license: 'public-domain',
    sourceCommit: 'ca96624a56bd078437bca8184e78163e5039ad19',
    sourcePath: 'geojson/ne_110m_land.geojson',
    projectUrl: 'https://www.naturalearthdata.com/',
  });
  var preparedCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  var bundledGeography = null;

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function wrapRadians(value) {
    var angle = finite(value, 0) % TAU;
    if (angle <= -Math.PI) angle += TAU;
    if (angle > Math.PI) angle -= TAU;
    return angle;
  }

  function wrapDegrees(value) {
    var degrees = finite(value, 0) % 360;
    if (degrees <= -180) degrees += 360;
    if (degrees > 180) degrees -= 360;
    return degrees;
  }

  function hashText(value) {
    var text = String(value == null ? '' : value);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  }

  function createIsolatedRng(seed, namespace) {
    var state = hashText('v112:globe:' + String(namespace || 'visual') + ':' +
      String(seed == null ? '0' : seed)) || 0x9e3779b9;
    return function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function orientationFrom(input) {
    var source = input && typeof input === 'object' ? input : {};
    var centerLon = source.centerLonDeg != null
      ? finite(source.centerLonDeg, 0) * DEG
      : finite(source.centerLon, finite(source.rotation, 0));
    var centerLat = source.centerLatDeg != null
      ? finite(source.centerLatDeg, 0) * DEG
      : finite(source.centerLat, finite(source.tilt, 12 * DEG));
    return Object.freeze({
      centerLon: wrapRadians(centerLon),
      centerLat: clamp(centerLat, -78 * DEG, 78 * DEG),
    });
  }

  function rotationAt(timeSeconds, input) {
    var source = input && typeof input === 'object' ? input : {};
    var period = Math.max(2, finite(source.periodSeconds, DEFAULT_PERIOD_SECONDS));
    var initial = source.initialLonDeg != null
      ? finite(source.initialLonDeg, 0) * DEG
      : finite(source.initialLon, 0);
    return wrapRadians(initial + Math.max(0, finite(timeSeconds, 0)) * TAU / period);
  }

  // World axes: +Y north, +Z at Greenwich, +X at 90° east.
  function latLonToVector(latitude, longitude) {
    var lat = clamp(finite(latitude, 0), -Math.PI / 2, Math.PI / 2);
    var lon = wrapRadians(finite(longitude, 0));
    var cosLat = Math.cos(lat);
    return Object.freeze({
      x: cosLat * Math.sin(lon),
      y: Math.sin(lat),
      z: cosLat * Math.cos(lon),
    });
  }

  function vectorToLatLon(vector) {
    var x = finite(vector && vector.x, 0);
    var y = finite(vector && vector.y, 0);
    var z = finite(vector && vector.z, 1);
    var length = Math.sqrt(x * x + y * y + z * z) || 1;
    return Object.freeze({
      latitude: Math.asin(clamp(y / length, -1, 1)),
      longitude: wrapRadians(Math.atan2(x, z)),
      latitudeDeg: Math.asin(clamp(y / length, -1, 1)) / DEG,
      longitudeDeg: wrapDegrees(Math.atan2(x, z) / DEG),
    });
  }

  function dot(left, right) {
    return left.x * right.x + left.y * right.y + left.z * right.z;
  }

  function basisFor(input) {
    var orientation = orientationFrom(input);
    var lon = orientation.centerLon;
    var lat = orientation.centerLat;
    var forward = latLonToVector(lat, lon);
    var east = Object.freeze({ x: Math.cos(lon), y: 0, z: -Math.sin(lon) });
    var north = Object.freeze({
      x: -Math.sin(lat) * Math.sin(lon),
      y: Math.cos(lat),
      z: -Math.sin(lat) * Math.cos(lon),
    });
    return Object.freeze({ orientation: orientation, forward: forward, east: east, north: north });
  }

  function visibility(latitude, longitude, input) {
    var basis = basisFor(input);
    return dot(latLonToVector(latitude, longitude), basis.forward);
  }

  function projectPoint(latitude, longitude, input) {
    var source = input && typeof input === 'object' ? input : {};
    var basis = basisFor(source);
    var vector = latLonToVector(latitude, longitude);
    var radius = Math.max(1, finite(source.radius, 100));
    var centerX = finite(source.centerX, 0);
    var centerY = finite(source.centerY, 0);
    var depth = dot(vector, basis.forward);
    return Object.freeze({
      x: centerX + dot(vector, basis.east) * radius,
      y: centerY - dot(vector, basis.north) * radius,
      depth: depth,
      visible: depth >= 0,
    });
  }

  function isCoordinate(value) {
    return Array.isArray(value) && value.length >= 2 &&
      Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
  }

  function addGeometryRings(geometry, output) {
    if (!geometry || typeof geometry !== 'object') return;
    var coordinates = geometry.coordinates;
    if (geometry.type === 'Polygon' && Array.isArray(coordinates)) {
      coordinates.forEach(function (ring, ringIndex) {
        if (!Array.isArray(ring) || ring.length < 3) return;
        output.push(Object.freeze({
          hole: ringIndex > 0,
          points: Object.freeze(ring.filter(isCoordinate).map(function (point) {
            return Object.freeze({ longitude: Number(point[0]) * DEG, latitude: Number(point[1]) * DEG });
          })),
        }));
      });
      return;
    }
    if (geometry.type === 'MultiPolygon' && Array.isArray(coordinates)) {
      coordinates.forEach(function (polygon) {
        addGeometryRings({ type: 'Polygon', coordinates: polygon }, output);
      });
      return;
    }
    if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
      geometry.geometries.forEach(function (entry) { addGeometryRings(entry, output); });
    }
  }

  function prepareGeography(dataset) {
    if (!dataset || typeof dataset !== 'object') {
      return Object.freeze({ source: SOURCE, rings: Object.freeze([]), pointCount: 0 });
    }
    if (preparedCache && preparedCache.has(dataset)) return preparedCache.get(dataset);
    var rings = [];
    if (dataset.type === 'FeatureCollection' && Array.isArray(dataset.features)) {
      dataset.features.forEach(function (feature) { addGeometryRings(feature && feature.geometry, rings); });
    } else if (dataset.type === 'Feature') {
      addGeometryRings(dataset.geometry, rings);
    } else {
      addGeometryRings(dataset, rings);
    }
    var pointCount = rings.reduce(function (total, ring) { return total + ring.points.length; }, 0);
    var result = Object.freeze({ source: SOURCE, rings: Object.freeze(rings), pointCount: pointCount });
    if (preparedCache) preparedCache.set(dataset, result);
    return result;
  }

  function setBundledGeography(dataset) {
    var prepared = prepareGeography(dataset);
    if (!prepared.rings.length) throw new TypeError('Globe geography must contain land polygons');
    bundledGeography = dataset;
    return prepared;
  }

  function getBundledGeography() {
    return bundledGeography;
  }

  function loadBundledGeography(url, fetchImpl) {
    var fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!fetcher) return Promise.reject(new Error('No fetch implementation is available'));
    return Promise.resolve(fetcher(url || DEFAULT_DATA_URL)).then(function (response) {
      if (!response || response.ok === false || typeof response.json !== 'function') {
        throw new Error('Unable to load offline globe geography');
      }
      return response.json();
    }).then(function (dataset) {
      setBundledGeography(dataset);
      return dataset;
    });
  }

  function beginVisibleSegments(ctx, points, projection) {
    var drawing = false;
    var visibleCount = 0;
    for (var index = 0; index < points.length; index += 1) {
      var projected = projectPoint(points[index].latitude, points[index].longitude, projection);
      if (!projected.visible) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        ctx.moveTo(projected.x, projected.y);
        drawing = true;
      } else {
        ctx.lineTo(projected.x, projected.y);
      }
      visibleCount += 1;
    }
    return visibleCount;
  }

  function graticuleLine(kind, value, step) {
    var points = [];
    if (kind === 'latitude') {
      for (var longitude = -180; longitude <= 180; longitude += step) {
        points.push({ latitude: value * DEG, longitude: longitude * DEG });
      }
    } else {
      for (var latitude = -84; latitude <= 84; latitude += step) {
        points.push({ latitude: latitude * DEG, longitude: value * DEG });
      }
    }
    return points;
  }

  function globePalette(input) {
    var source = input && typeof input === 'object' ? input : {};
    return Object.freeze({
      oceanDeep: source.oceanDeep || '#0b3761',
      ocean: source.ocean || '#166aa4',
      oceanLight: source.oceanLight || '#4ab1cf',
      land: source.land || '#73a957',
      landLight: source.landLight || '#b7cd72',
      coast: source.coast || '#d8dfab',
      grid: source.grid || 'rgba(220,244,255,0.22)',
      atmosphere: source.atmosphere || 'rgba(112,220,255,0.48)',
    });
  }

  function renderCanvasGlobe(ctx, request) {
    if (!ctx || typeof ctx.save !== 'function') throw new TypeError('A canvas 2D context is required');
    var source = request && typeof request === 'object' ? request : {};
    var radius = Math.max(8, finite(source.radius, 72));
    var centerX = finite(source.centerX, 150);
    var centerY = finite(source.centerY, 153);
    var palette = globePalette(source.palette);
    var orientation = orientationFrom({
      centerLon: source.centerLon != null ? source.centerLon
        : rotationAt(finite(source.time, 0), source),
      centerLat: source.centerLat != null ? source.centerLat : 12 * DEG,
    });
    var projection = {
      centerX: centerX,
      centerY: centerY,
      radius: radius,
      centerLon: orientation.centerLon,
      centerLat: orientation.centerLat,
    };
    var geography = prepareGeography(source.geography || bundledGeography);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, TAU);
    var ocean = typeof ctx.createRadialGradient === 'function'
      ? ctx.createRadialGradient(centerX - radius * 0.30, centerY - radius * 0.36,
        radius * 0.08, centerX, centerY, radius)
      : null;
    if (ocean) {
      ocean.addColorStop(0, palette.oceanLight);
      ocean.addColorStop(0.48, palette.ocean);
      ocean.addColorStop(1, palette.oceanDeep);
      ctx.fillStyle = ocean;
    } else {
      ctx.fillStyle = palette.ocean;
    }
    ctx.fill();
    if (typeof ctx.clip === 'function') ctx.clip();

    ctx.beginPath();
    for (var latitude = -60; latitude <= 60; latitude += 30) {
      beginVisibleSegments(ctx, graticuleLine('latitude', latitude, 4), projection);
    }
    for (var longitude = -180; longitude < 180; longitude += 30) {
      beginVisibleSegments(ctx, graticuleLine('longitude', longitude, 3), projection);
    }
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = Math.max(0.7, radius / 105);
    ctx.stroke();

    geography.rings.forEach(function (ring) {
      ctx.beginPath();
      var visibleCount = beginVisibleSegments(ctx, ring.points, projection);
      if (visibleCount < 3) return;
      ctx.closePath();
      ctx.fillStyle = ring.hole ? palette.ocean : palette.land;
      ctx.fill();
      ctx.strokeStyle = palette.coast;
      ctx.lineWidth = Math.max(0.55, radius / 135);
      ctx.stroke();
    });

    var daylight = typeof ctx.createLinearGradient === 'function'
      ? ctx.createLinearGradient(centerX - radius, centerY, centerX + radius, centerY)
      : null;
    if (daylight) {
      daylight.addColorStop(0, 'rgba(2,12,29,0.44)');
      daylight.addColorStop(0.56, 'rgba(8,28,46,0.02)');
      daylight.addColorStop(1, 'rgba(255,255,255,0.13)');
      ctx.fillStyle = daylight;
      ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, TAU); ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, TAU);
    ctx.strokeStyle = palette.atmosphere;
    ctx.lineWidth = Math.max(2, radius * 0.055);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX - radius * 0.28, centerY - radius * 0.31, radius * 0.14, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
    ctx.restore();

    return Object.freeze({
      renderer: 'canvas',
      centerLon: orientation.centerLon,
      centerLat: orientation.centerLat,
      geographyRings: geography.rings.length,
      geographyPoints: geography.pointCount,
    });
  }

  function createTextureCanvas(documentRef, dataset, input) {
    if (!documentRef || typeof documentRef.createElement !== 'function') {
      throw new TypeError('A document-like object is required to build the globe texture');
    }
    var source = input && typeof input === 'object' ? input : {};
    var width = Math.max(256, Math.round(finite(source.width, 1024)));
    var height = Math.max(128, Math.round(finite(source.height, width / 2)));
    var canvas = documentRef.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    var palette = globePalette(source.palette);
    ctx.fillStyle = palette.ocean;
    ctx.fillRect(0, 0, width, height);
    var geography = prepareGeography(dataset || bundledGeography);

    geography.rings.forEach(function (ring) {
      if (!ring.points.length) return;
      [-width, 0, width].forEach(function (offset) {
        ctx.beginPath();
        var previousX = null;
        ring.points.forEach(function (point, index) {
          var x = (point.longitude / TAU + 0.5) * width;
          var y = (0.5 - point.latitude / Math.PI) * height;
          if (previousX != null) {
            while (x - previousX > width / 2) x -= width;
            while (x - previousX < -width / 2) x += width;
          }
          if (index === 0) ctx.moveTo(x + offset, y);
          else ctx.lineTo(x + offset, y);
          previousX = x;
        });
        ctx.closePath();
        ctx.fillStyle = ring.hole ? palette.ocean : palette.land;
        ctx.fill();
        ctx.strokeStyle = palette.coast;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    });
    return canvas;
  }

  function buildSphereMesh(latitudeSegments, longitudeSegments) {
    var latSegments = Math.max(8, Math.min(128, Math.floor(finite(latitudeSegments, 32))));
    var lonSegments = Math.max(12, Math.min(256, Math.floor(finite(longitudeSegments, 64))));
    var positions = [];
    var normals = [];
    var uvs = [];
    var indices = [];
    for (var latIndex = 0; latIndex <= latSegments; latIndex += 1) {
      var v = latIndex / latSegments;
      var latitude = Math.PI / 2 - v * Math.PI;
      var cosLat = Math.cos(latitude);
      for (var lonIndex = 0; lonIndex <= lonSegments; lonIndex += 1) {
        var u = lonIndex / lonSegments;
        var longitude = u * TAU - Math.PI;
        var x = cosLat * Math.sin(longitude);
        var y = Math.sin(latitude);
        var z = cosLat * Math.cos(longitude);
        positions.push(x, y, z);
        normals.push(x, y, z);
        uvs.push(u, v);
      }
    }
    for (var row = 0; row < latSegments; row += 1) {
      for (var column = 0; column < lonSegments; column += 1) {
        var first = row * (lonSegments + 1) + column;
        var second = first + lonSegments + 1;
        indices.push(first, second, first + 1, second, second + 1, first + 1);
      }
    }
    var IndexArray = positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
    return Object.freeze({
      latitudeSegments: latSegments,
      longitudeSegments: lonSegments,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new IndexArray(indices),
    });
  }

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    var program = gl.createProgram();
    var vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    var fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var message = gl.getProgramInfoLog(program) || 'Unable to link globe shader';
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  function createBuffer(gl, target, values) {
    var buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, values, gl.STATIC_DRAW);
    return buffer;
  }

  function createWebGLRenderer(canvas, input) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new TypeError('A canvas is required for WebGL globe rendering');
    }
    var source = input && typeof input === 'object' ? input : {};
    var gl = canvas.getContext('webgl', { alpha: true, antialias: true,
      premultipliedAlpha: true, preserveDrawingBuffer: true }) ||
      canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL is unavailable');
    var mesh = buildSphereMesh(source.latitudeSegments, source.longitudeSegments);
    if (mesh.indices instanceof Uint32Array && !gl.getExtension('OES_element_index_uint')) {
      mesh = buildSphereMesh(32, 64);
    }
    var vertexSource = [
      'attribute vec3 aPosition;',
      'attribute vec3 aNormal;',
      'attribute vec2 aUv;',
      'uniform vec2 uFit;',
      'uniform float uLon;',
      'uniform float uLat;',
      'varying vec3 vNormal;',
      'varying vec2 vUv;',
      'void main(){',
      ' float cy=cos(uLon), sy=sin(uLon);',
      ' float cx=cos(uLat), sx=sin(uLat);',
      ' vec3 py=vec3(cy*aPosition.x-sy*aPosition.z,aPosition.y,sy*aPosition.x+cy*aPosition.z);',
      ' vec3 pn=vec3(cy*aNormal.x-sy*aNormal.z,aNormal.y,sy*aNormal.x+cy*aNormal.z);',
      ' vec3 p=vec3(py.x,cx*py.y-sx*py.z,sx*py.y+cx*py.z);',
      ' vec3 n=normalize(vec3(pn.x,cx*pn.y-sx*pn.z,sx*pn.y+cx*pn.z));',
      ' gl_Position=vec4(p.x*uFit.x,p.y*uFit.y,p.z*.12,1.0);',
      ' vNormal=n; vUv=aUv;',
      '}',
    ].join('\n');
    var fragmentSource = [
      'precision mediump float;',
      'uniform sampler2D uMap;',
      'varying vec3 vNormal;',
      'varying vec2 vUv;',
      'void main(){',
      ' vec3 n=normalize(vNormal);',
      ' float light=.50+.50*max(0.0,dot(n,normalize(vec3(-.35,.55,.76))));',
      ' float rim=pow(1.0-max(0.0,n.z),2.4);',
      ' vec3 base=texture2D(uMap,vUv).rgb;',
      ' vec3 color=base*light+vec3(.10,.28,.35)*rim;',
      ' gl_FragColor=vec4(color,1.0);',
      '}',
    ].join('\n');
    var program = createProgram(gl, vertexSource, fragmentSource);
    var positionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, mesh.positions);
    var normalBuffer = createBuffer(gl, gl.ARRAY_BUFFER, mesh.normals);
    var uvBuffer = createBuffer(gl, gl.ARRAY_BUFFER, mesh.uvs);
    var indexBuffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
    var textureCanvas = source.textureCanvas || createTextureCanvas(
      source.document || (typeof document !== 'undefined' ? document : null),
      source.geography || bundledGeography, source.textureOptions);
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);

    var locations = {
      position: gl.getAttribLocation(program, 'aPosition'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      uv: gl.getAttribLocation(program, 'aUv'),
      fit: gl.getUniformLocation(program, 'uFit'),
      lon: gl.getUniformLocation(program, 'uLon'),
      lat: gl.getUniformLocation(program, 'uLat'),
      map: gl.getUniformLocation(program, 'uMap'),
    };

    function bindAttribute(buffer, location, size) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }

    function render(renderInput) {
      if (typeof gl.isContextLost === 'function' && gl.isContextLost()) {
        throw new Error('WebGL globe context is lost');
      }
      var request = renderInput && typeof renderInput === 'object' ? renderInput : {};
      var orientation = orientationFrom({
        centerLon: request.centerLon != null ? request.centerLon
          : rotationAt(finite(request.time, 0), request),
        centerLat: request.centerLat != null ? request.centerLat : 12 * DEG,
      });
      var width = Math.max(1, gl.drawingBufferWidth || canvas.width || 1);
      var height = Math.max(1, gl.drawingBufferHeight || canvas.height || 1);
      var fitX = width > height ? height / width : 1;
      var fitY = height > width ? width / height : 1;
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.useProgram(program);
      bindAttribute(positionBuffer, locations.position, 3);
      bindAttribute(normalBuffer, locations.normal, 3);
      bindAttribute(uvBuffer, locations.uv, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(locations.map, 0);
      gl.uniform2f(locations.fit, fitX * 0.94, fitY * 0.94);
      gl.uniform1f(locations.lon, orientation.centerLon);
      gl.uniform1f(locations.lat, orientation.centerLat);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length,
        mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      return Object.freeze({ renderer: 'webgl', centerLon: orientation.centerLon,
        centerLat: orientation.centerLat, triangles: mesh.indices.length / 3 });
    }

    function destroy() {
      [positionBuffer, normalBuffer, uvBuffer, indexBuffer].forEach(function (buffer) {
        gl.deleteBuffer(buffer);
      });
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
    }

    return Object.freeze({ kind: 'webgl', render: render, destroy: destroy, mesh: mesh });
  }

  function createRenderer(canvas, input) {
    var source = input && typeof input === 'object' ? input : {};
    if (!source.forceCanvas && !source.reducedMotion) {
      try {
        return createWebGLRenderer(canvas, source);
      } catch (error) {
        if (typeof source.onFallback === 'function') source.onFallback(error);
      }
    }
    var ctx = source.context2d || (canvas && typeof canvas.getContext === 'function'
      ? canvas.getContext('2d') : null);
    if (!ctx) throw new Error('Neither WebGL nor Canvas 2D globe rendering is available');
    return Object.freeze({
      kind: 'canvas',
      render: function (request) {
        var width = canvas.width || 300;
        var height = canvas.height || 300;
        return renderCanvasGlobe(ctx, Object.assign({}, source, request || {}, {
          centerX: width / 2,
          centerY: height / 2,
          radius: Math.min(width, height) * 0.46,
        }));
      },
      destroy: function () {},
    });
  }

  // Construct this once per application/render worker and inject the returned
  // surface into every preview/gameplay paint. A shared surface renders into
  // one offscreen canvas, which callers composite immediately; it intentionally
  // owns no player, tile, lane, object, or match state.
  function createSharedSurface(canvas, input) {
    if (!canvas || typeof canvas !== 'object') {
      throw new TypeError('A shared globe surface requires an offscreen canvas');
    }
    var source = input && typeof input === 'object' ? input : {};
    var renderer = source.renderer || createRenderer(canvas, source);
    if (!renderer || typeof renderer.render !== 'function') {
      throw new TypeError('A shared globe surface requires a renderer');
    }
    var destroyed = false;
    var attempts = 0;
    var successes = 0;
    var lastSnapshot = null;
    var failure = null;

    function render(request) {
      if (destroyed) throw new Error('Shared globe surface has been destroyed');
      if (failure) throw failure;
      attempts += 1;
      try {
        lastSnapshot = renderer.render(request || {});
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        throw failure;
      }
      successes += 1;
      return Object.freeze({
        canvas: canvas,
        rendererKind: renderer.kind || 'injected',
        snapshot: lastSnapshot,
      });
    }

    function info() {
      return Object.freeze({
        rendererKind: renderer.kind || 'injected',
        attempts: attempts,
        successes: successes,
        destroyed: destroyed,
        failed: !!failure,
        failureMessage: failure ? failure.message : null,
        lastSnapshot: lastSnapshot,
      });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (typeof renderer.destroy === 'function') renderer.destroy();
    }

    return Object.freeze({
      schema: 'SharedGlobeSurfaceV1',
      shared: true,
      canvas: canvas,
      rendererKind: renderer.kind || 'injected',
      render: render,
      info: info,
      destroy: destroy,
    });
  }

  function selectVisiblePoint(seed, input) {
    var source = input && typeof input === 'object' ? input : {};
    var basis = basisFor(source);
    var minimumFacing = clamp(finite(source.minimumFacing, 0.24), 0.02, 0.95);
    var rng = createIsolatedRng(seed, 'focus-point');
    var facing = minimumFacing + (1 - minimumFacing) * rng();
    var theta = rng() * TAU;
    var radial = Math.sqrt(Math.max(0, 1 - facing * facing));
    var localX = radial * Math.cos(theta);
    var localY = radial * Math.sin(theta);
    var world = {
      x: basis.east.x * localX + basis.north.x * localY + basis.forward.x * facing,
      y: basis.east.y * localX + basis.north.y * localY + basis.forward.y * facing,
      z: basis.east.z * localX + basis.north.z * localY + basis.forward.z * facing,
    };
    var coordinates = vectorToLatLon(world);
    return Object.freeze({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      latitudeDeg: coordinates.latitudeDeg,
      longitudeDeg: coordinates.longitudeDeg,
      facing: visibility(coordinates.latitude, coordinates.longitude, basis.orientation),
    });
  }

  function focusCameraPath(point, input) {
    var source = input && typeof input === 'object' ? input : {};
    var orientation = orientationFrom(source);
    var duration = clamp(finite(source.duration, 1.8), 1.2, 3);
    var targetLon = wrapRadians(point.longitude);
    var targetLat = clamp(point.latitude, -70 * DEG, 70 * DEG);
    function frame(at, centerLon, centerLat, zoom, hold) {
      return Object.freeze({ at: at, centerLon: centerLon, centerLat: centerLat,
        zoom: zoom, hold: !!hold });
    }
    return Object.freeze({
      duration: duration,
      restoresOrientation: true,
      frames: Object.freeze([
        frame(0, orientation.centerLon, orientation.centerLat, 1, false),
        frame(0.22, targetLon, targetLat, 1.32, false),
        frame(0.48, targetLon, targetLat, 2.65, true),
        frame(0.76, targetLon, targetLat, 2.65, true),
        frame(1, orientation.centerLon, orientation.centerLat, 1, false),
      ]),
    });
  }

  function focusDecision(input) {
    var source = input && typeof input === 'object' ? input : {};
    var eligible = source.made === true && source.physical === true && source.testData !== true;
    var denominator = source.playerName === 'Mr. Howe' ? 10 : 100;
    var seed = String(source.seed == null ? '0' : source.seed);
    var roll = hashText('v112:globe:focus-roll:' + seed) % denominator;
    if (!eligible || roll !== 0) {
      return Object.freeze({ triggered: false, eligible: eligible,
        denominator: denominator, roll: roll, point: null, camera: null });
    }
    var orientation = orientationFrom(source.orientation || source);
    var point = selectVisiblePoint(seed, orientation);
    return Object.freeze({
      triggered: true,
      eligible: true,
      denominator: denominator,
      roll: roll,
      point: point,
      camera: focusCameraPath(point, orientation),
    });
  }

  return Object.freeze({
    schema: 'FlipgameGlobeV1',
    schemaVersion: 1,
    visualOnly: true,
    DEFAULT_DATA_URL: DEFAULT_DATA_URL,
    DEFAULT_PERIOD_SECONDS: DEFAULT_PERIOD_SECONDS,
    SOURCE: SOURCE,
    hashText: hashText,
    createIsolatedRng: createIsolatedRng,
    orientationFrom: orientationFrom,
    rotationAt: rotationAt,
    latLonToVector: latLonToVector,
    vectorToLatLon: vectorToLatLon,
    visibility: visibility,
    projectPoint: projectPoint,
    prepareGeography: prepareGeography,
    setBundledGeography: setBundledGeography,
    getBundledGeography: getBundledGeography,
    loadBundledGeography: loadBundledGeography,
    renderCanvasGlobe: renderCanvasGlobe,
    createTextureCanvas: createTextureCanvas,
    buildSphereMesh: buildSphereMesh,
    createWebGLRenderer: createWebGLRenderer,
    createRenderer: createRenderer,
    createSharedSurface: createSharedSurface,
    selectVisiblePoint: selectVisiblePoint,
    focusCameraPath: focusCameraPath,
    focusDecision: focusDecision,
  });
});
