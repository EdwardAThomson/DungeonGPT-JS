// TourOverlay.js
// Renders the guided-tour coach-marks. Non-blocking by design: no full-screen
// dimming. A step either highlights a specific element with a pulsing outline +
// tooltip (when it has a `target`), or shows a small docked info card. Cards can be
// minimized to a small pill (so the player can re-read them), advanced with "Next"
// for multi-step pages, or the whole tour skipped.

import React, { useState, useEffect, useCallback } from 'react';
import { useGuidedTour } from '../contexts/GuidedTourContext';
import '../styles/tour.css';

const TOOLTIP_WIDTH = 300;

const Card = ({ step, pageInfo, hasNextOnPage, onNext, onSkip, onMinimize, anchored, style }) => (
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
      <button className="tour-skip-link" onClick={onSkip}>Skip tour</button>
      <button className="tour-next-btn" onClick={onNext}>{hasNextOnPage ? 'Next →' : 'Got it'}</button>
    </div>
  </div>
);

const Pill = ({ onExpand }) => (
  <button className="tour-pill" onClick={onExpand} aria-label="Show tour tip" title="Show tip">
    💡 Tip
  </button>
);

const TourOverlay = () => {
  const { activeStep, pageInfo, hasNextOnPage, minimizedSteps, skipTour, advanceStep, minimizeStep, expandStep } = useGuidedTour();
  const [rect, setRect] = useState(null);

  const hasTarget = !!activeStep?.target;
  const minimized = !!activeStep && minimizedSteps.includes(activeStep.id);
  const needsRect = hasTarget && !minimized;

  const measure = useCallback(() => {
    if (!needsRect) { setRect(null); return; }
    const el = document.querySelector(activeStep.target);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else {
      setRect(null);
    }
  }, [activeStep, needsRect]);

  // Locate (and scroll to) the target when a targeted step activates; poll briefly
  // because the element may render a beat after the route does.
  useEffect(() => {
    if (!needsRect) { setRect(null); return; }
    let tries = 0;
    const locate = () => {
      const el = document.querySelector(activeStep.target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  }, [activeStep, needsRect, measure]);

  useEffect(() => {
    if (!needsRect) return;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [needsRect, measure]);

  if (!activeStep) return null;

  if (minimized) {
    return <Pill onExpand={() => expandStep(activeStep.id)} />;
  }

  const cardProps = {
    step: activeStep,
    pageInfo,
    hasNextOnPage,
    onNext: advanceStep,
    onSkip: skipTour,
    onMinimize: () => minimizeStep(activeStep.id),
  };

  // Untargeted step, or target not located yet -> docked info card (non-blocking).
  if (!hasTarget || !rect) {
    return <Card {...cardProps} anchored={false} />;
  }

  const pad = 6;
  const ringStyle = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
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

export default TourOverlay;
