// MapSkyOverlay.js
// Ambient sky layer for the world map: a few drifting clouds + occasional passing birds.
// Rendered ONCE as a single absolutely-positioned layer spanning the FULL map grid — the
// same structural precedent as WorldMapLabels (one instance across the whole grid, not a
// per-tile SVG). This is a different animation mechanism than the rest of this session's
// tile work in worldTileArt.js: those tiles are sealed 40x40 SVG data-URIs animated with
// SMIL (<animate>/<animateTransform>) because an external stylesheet can't reach inside a
// background-image. Clouds/birds need to cross many tiles' boundaries, which a single
// tile's viewBox can't do at all, so this is real DOM instead, and ordinary CSS
// `@keyframes` (see src/styles/maps.css, `.mapsky-*` rules) does the animating.
//
// Positioning contract: drop this in as a sibling of WorldMapLabels inside the same
// position:relative map-grid container (`.realmap` in HomeWorldMap, `.world-map-grid` in
// WorldMapDisplay). Both of those containers are already sized to the FULL conceptual map
// (cols/rows * current tile size), so an `inset: 0` layer here inherits that size — and
// therefore pans/zooms in lockstep with the tiles — with no width/height math of its own.
//
// Non-interactive (`pointer-events: none`) and clipped to its own box (`overflow: hidden`
// in CSS) so drifting shapes never intercept clicks/drags meant for tiles, POIs, the party
// marker, or the pannable viewport's own drag handling in WorldMapDisplay, and never grow
// the scrollable region of that pane by poking out past the grid's edge.
//
// Cloud/bird parameters are randomized once per mount (`useMemo(..., [])`), not on every
// render — these components re-render often for unrelated reasons (scroll position, zoom
// step, hero state), and regenerating random values on every render would reset/glitch an
// animation already mid-flight.

import React, { useMemo } from 'react';

const CLOUD_COUNT = 5;
const BIRD_COUNT = 5;

const rand = (a, b) => a + Math.random() * (b - a);

function makeClouds() {
  return Array.from({ length: CLOUD_COUNT }, (_, i) => ({
    key: `cloud-${i}`,
    top: rand(4, 88),          // % from top of the map — full vertical span, not just the top half
    scale: rand(0.7, 1.3),
    opacity: rand(0.14, 0.28), // subtle — this should read as weather, not fog
    duration: rand(70, 130),   // seconds for one off-left -> off-right traverse
    delay: -rand(0, 120),      // negative delay desyncs clouds from each other
  }));
}

function makeBirds() {
  return Array.from({ length: BIRD_COUNT }, (_, i) => ({
    key: `bird-${i}`,
    top: rand(6, 90),          // % from top — full vertical span, not just the top half
    duration: rand(22, 40),    // full cycle; the bird is only visible for ~15% of it
    delay: -rand(0, 40),
    scale: rand(0.85, 1.25),
    reverse: i % 2 === 1,      // alternate flight direction so flocks don't all match
  }));
}

const Cloud = ({ top, scale, opacity, duration, delay }) => (
  <div
    className="mapsky-cloud"
    style={{ top: `${top}%`, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
  >
    <svg width="140" height="50" viewBox="0 0 140 50" aria-hidden="true" style={{ opacity, transform: `scale(${scale})` }}>
      <ellipse cx="35" cy="30" rx="30" ry="16" fill="#fff" />
      <ellipse cx="65" cy="20" rx="26" ry="18" fill="#fff" />
      <ellipse cx="95" cy="28" rx="28" ry="15" fill="#fff" />
      <ellipse cx="60" cy="34" rx="45" ry="12" fill="#fff" />
    </svg>
  </div>
);

// Two wing poses (up/spread vs. lowered) crossfaded via CSS `steps()` so it reads as a
// clean 2-beat flap rather than a smooth morph — matches the flat, illustrative style of
// the rest of the tile art better than a continuous wing curl would. Each pose is its own
// static path (no shape animation needed — a shape's `d` attribute isn't reliably
// CSS-animatable across browsers) with its own opacity flicker, independent of the outer
// flight animation on the wrapping div; the two compose fine since CSS opacity multiplies
// down the tree, so the flap only shows while the bird itself is faded in.
const Bird = ({ top, duration, delay, scale, reverse }) => (
  <div
    className={`mapsky-bird${reverse ? ' mapsky-bird-rev' : ''}`}
    style={{ top: `${top}%`, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
  >
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" style={{ transform: `scale(${scale})` }}>
      <path className="mapsky-wing-up" d="M0,8 Q5.5,-1 11,8 Q16.5,-1 22,8" stroke="#3a3226" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path className="mapsky-wing-down" d="M0,8 Q5.5,4.5 11,8 Q16.5,4.5 22,8" stroke="#3a3226" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  </div>
);

/**
 * Purely decorative sky layer: drifting clouds + occasional bird flybys over the full
 * world map. No props needed — it fills whatever position:relative container it's
 * dropped into (see contract above).
 */
const MapSkyOverlay = () => {
  const clouds = useMemo(makeClouds, []);
  const birds = useMemo(makeBirds, []);

  return (
    <div className="mapsky-overlay" aria-hidden="true">
      {clouds.map((c) => <Cloud key={c.key} {...c} />)}
      {birds.map((b) => <Bird key={b.key} {...b} />)}
    </div>
  );
};

export default MapSkyOverlay;
