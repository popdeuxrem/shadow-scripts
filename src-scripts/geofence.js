#!/usr/bin/env node
/**
 * Geofence.js — Cyberpunk Geofence / GPS Spoofer v2.0
 * ───────────────────────────────────────────────
 * Features:
 *  - Per-site dynamic GPS spoofing
 *  - Virtual geofences (trigger zones)
 *  - Randomized lat/lon jitter
 *  - Integrates with loader API
 *  - Neon HUD logging for debugging
 */

(function(){
  console.log("%c[GEOFENCE] Initializing Cyberpunk Geofence module", "color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");

  window.__GEOFENCE_STORE = window.__GEOFENCE_STORE || {};

  // Generate random offset in meters
  function randomOffset(maxMeters = 50){
    const offset = (Math.random() - 0.5) * 2 * maxMeters / 111320; // rough conversion meters → degrees
    return offset;
  }

  // Spoof a location
  function spoofLocation(lat, lon, options = {}){
    const jitter = options.jitter || 20;
    const spoofLat = lat + randomOffset(jitter);
    const spoofLon = lon + randomOffset(jitter);

    const position = {
      coords: {
        latitude: spoofLat,
        longitude: spoofLon,
        altitude: options.altitude || null,
        accuracy: options.accuracy || 5,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };

    window.__GEOFENCE_STORE.current = position;
    console.log(`%c[GEOFENCE] Spoofed location: ${spoofLat.toFixed(6)}, ${spoofLon.toFixed(6)}`, "color:#0ff;font-weight:bold");
    return position;
  }

  // Define a geofence
  function addGeofence(name, centerLat, centerLon, radiusMeters = 100){
    window.__GEOFENCE_STORE[name] = { lat: centerLat, lon: centerLon, radius: radiusMeters };
    console.log(`%c[GEOFENCE] Added geofence "${name}" radius ${radiusMeters}m`, "color:#0ff;font-weight:bold");
  }

  // Check if current spoofed location is within a geofence
  function checkGeofence(name){
    const fence = window.__GEOFENCE_STORE[name];
    const pos = window.__GEOFENCE_STORE.current;
    if(!fence || !pos) return false;

    const dx = (pos.coords.latitude - fence.lat) * 111320; // approx meters
    const dy = (pos.coords.longitude - fence.lon) * 111320 * Math.cos(fence.lat * Math.PI/180);
    const distance = Math.sqrt(dx*dx + dy*dy);

    const inside = distance <= fence.radius;
    console.log(`%c[GEOFENCE] "${name}" inside: ${inside} (distance: ${distance.toFixed(1)}m)`, "color:#0ff;font-weight:bold");
    return inside;
  }

  // Patch geolocation API
  if(navigator.geolocation){
    const origGetCurrent = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function(success, error, options){
      if(window.__GEOFENCE_STORE.current){
        success(window.__GEOFENCE_STORE.current);
      } else {
        origGetCurrent(success, error, options);
      }
    };

    const origWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = function(success, error, options){
      if(window.__GEOFENCE_STORE.current){
        success(window.__GEOFENCE_STORE.current);
        return 1; // fake watch ID
      } else {
        return origWatch(success, error, options);
      }
    };
  }

  // Expose API
  window.spoofLocation = spoofLocation;
  window.addGeofence = addGeofence;
  window.checkGeofence = checkGeofence;

  console.log("%c[GEOFENCE] Module ready — use spoofLocation(lat,lon), addGeofence(name,lat,lon,radius), checkGeofence(name)", "color:#0ff;font-weight:bold;text-shadow:0 0 6px #0ff");
})();
