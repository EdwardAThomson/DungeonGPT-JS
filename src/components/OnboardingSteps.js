// OnboardingSteps.js
// Lightweight 3-step progress indicator for the new-player journey:
// Create Hero -> Choose Adventure -> Begin Quest. Rendered on the setup pages so a
// first-time player always knows where they are and what comes next.

import React from 'react';
import '../styles/onboarding.css';

const STEPS = [
  { n: 1, label: 'Create Hero' },
  { n: 2, label: 'Choose Adventure' },
  { n: 3, label: 'Begin Quest' },
];

// currentStep highlights the page you're on. completedSteps marks steps as truly
// done (a checkmark) — pass it explicitly so we never imply, e.g., that a hero was
// created when the player jumped straight into game setup without one.
const OnboardingSteps = ({ currentStep = 1, completedSteps = [] }) => {
  return (
    <ol className="onboarding-steps" aria-label="Getting started progress">
      {STEPS.map((step, i) => {
        const state =
          completedSteps.includes(step.n)
            ? 'done'
            : step.n === currentStep
              ? 'active'
              : 'upcoming';
        return (
          <li
            key={step.n}
            className={`onboarding-step ${state}`}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            {i < STEPS.length - 1 && (
              <span className="onboarding-step-connector" aria-hidden="true" />
            )}
            <span className="onboarding-step-marker">{state === 'done' ? '✓' : step.n}</span>
            <span className="onboarding-step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
};

export default OnboardingSteps;
