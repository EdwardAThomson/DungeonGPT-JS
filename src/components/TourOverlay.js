// TourOverlay.js
// Renders the guided-tour coach-marks. Non-blocking by design: no full-screen
// dimming. A step either highlights a specific element with a pulsing outline +
// tooltip (when it has a `target`), or shows a small docked info card. Cards can be
// minimized to a small pill (so the player can re-read them), advanced with "Next"
// for multi-step pages, or the whole tour skipped.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGuidedTour } from '../contexts/GuidedTourContext';
import '../styles/tour.css';

const TOOLTIP_WIDTH = 300;

const Card = ({ step, pageInfo, hasNextOnPage, onNext, onSkip, onMinimize, anchored, style, skipLabel = 'Skip tour' }) => (
  <div
    className={`tour-tooltip${anchored ? '' : ' tour-tooltip-floating'}`}
    style={style}
    role="dialog"
    aria-label={step.title}
  >
    <button className="tour-tooltip-min" onClick={onMinimize} aria-label="Minimize tip" title="Minimize">–</button>
    {pageInfo && pageInfo.total > 1 && (
      <div className="tour-tooltip-count">Tip {pageInfo.current} of {pageInfo.total}</div>
    )}
    <div className="tour-tooltip-title">{step.title}</div>
    <div className="tour-tooltip-body">{step.body}</div>
    <div className="tour-tooltip-actions">
      <button className="tour-skip-link" onClick={onSkip}>{skipLabel}</button>
      <button className="tour-next-btn" onClick={onNext}>{hasNextOnPage ? 'Next →' : 'Got it'}</button>
    </div>
  </div>
);

const Pill = ({ onExpand }) => (
  <button className="tour-pill" onClick={onExpand} aria-label="Show tour tip" title="Show tip">
    💡 Tip
  </button>
);

// Coachmark: one coach-mark, either ringing `step.target` with an anchored tooltip or,
// untargeted / not found yet, a docked card. Minimized shows a small pill. Shared by
// the cross-route tour (below) and the in-game workspace tips (WorkspaceHints).
export const Coachmark = ({ step, minimized, pageInfo, hasNextOnPage, onNext, onSkip, onMinimize, onExpand, skipLabel }) => {
  const [rect, setRect] = useState(null);
  const lastRect = useRef(null);

  // `target` rings an element; `inside` instead floats the card at the top of an element
  // with no ring (for big areas like the map, where a ring and an outside tooltip don't fit).
  const selector = step?.target || step?.inside || null;
  const hasTarget = !!selector;
  const needsRect = hasTarget && !minimized;

  const measure = useCallback(() => {
    const el = needsRect ? document.querySelector(selector) : null;
    const r = el && el.getBoundingClientRect();
    // A hidden target (display:none, e.g. the other tab on phones) measures 0x0: fall
    // back to the docked card rather than ringing the top-left corner.
    let next = null;
    if (r && (r.width > 0 || r.height > 0)) {
      // The ring copies the target's corner radius so it hugs pills and cards alike.
      const radius = parseFloat(window.getComputedStyle(el).borderTopLeftRadius) || 0;
      next = { top: r.top, left: r.left, width: r.width, height: r.height, radius };
    }
    const prev = lastRect.current;
    const same = prev === next || (prev && next
      && prev.top === next.top && prev.left === next.left
      && prev.width === next.width && prev.height === next.height && prev.radius === next.radius);
    if (same) return;
    lastRect.current = next;
    setRect(next);
  }, [selector, needsRect]);

  // Locate (and scroll to) the target when a targeted step activates; poll briefly
  // because the element may render a beat after the route does.
  useEffect(() => {
    if (!needsRect) { measure(); return undefined; }
    let tries = 0;
    const locate = () => {
      const el = document.querySelector(selector);
      if (el) {
        if (step.target) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        measure();
        return true;
      }
      return false;
    };
    if (locate()) return;
    const iv = setInterval(() => {
      tries += 1;
      if (locate() || tries > 20) clearInterval(iv);
    }, 150);
    return () => clearInterval(iv);
  }, [selector, step, needsRect, measure]);

  // Track the target every frame while it is ringed: content reflowing around it
  // (chips added, web fonts, smooth scrolling) moves it without any resize or scroll
  // event, which left the ring offset. measure() only re-renders when the box changes.
  useEffect(() => {
    if (!needsRect) return undefined;
    let frame;
    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [needsRect, measure]);

  if (!step) return null;

  if (minimized) {
    return <Pill onExpand={onExpand} />;
  }

  const cardProps = { step, pageInfo, hasNextOnPage, onNext, onSkip, onMinimize, skipLabel };

  // Untargeted step, or target not located yet -> docked info card (non-blocking).
  if (!hasTarget || !rect) {
    return <Card {...cardProps} anchored={false} />;
  }

  if (step.inside) {
    const insideStyle = {
      top: rect.top + 16,
      left: Math.max(12, Math.min(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - 12)),
    };
    return <Card {...cardProps} anchored style={insideStyle} />;
  }

  const pad = 6;
  const ringStyle = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: rect.radius > 0 ? rect.radius + pad : undefined,
  };

  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const placeAbove = spaceBelow < 180;
  const tooltipStyle = {
    top: placeAbove ? undefined : rect.top + rect.height + 14,
    bottom: placeAbove ? window.innerHeight - rect.top + 14 : undefined,
    left: Math.max(12, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - 12)),
  };

  return (
    <>
      <div className="tour-ring" style={ringStyle} aria-hidden="true" />
      <Card {...cardProps} anchored style={tooltipStyle} />
    </>
  );
};

const TourOverlay = () => {
  const { activeStep, pageInfo, hasNextOnPage, minimizedSteps, skipTour, advanceStep, minimizeStep, expandStep } = useGuidedTour();
  if (!activeStep) return null;
  return (
    <Coachmark
      step={activeStep}
      minimized={minimizedSteps.includes(activeStep.id)}
      pageInfo={pageInfo}
      hasNextOnPage={hasNextOnPage}
      onNext={advanceStep}
      onSkip={skipTour}
      onMinimize={() => minimizeStep(activeStep.id)}
      onExpand={() => expandStep(activeStep.id)}
    />
  );
};

export default TourOverlay;
