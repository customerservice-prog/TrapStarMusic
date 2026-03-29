import { useState, useEffect, useCallback } from 'react';
import BrandLogo from './BrandLogo.jsx';

export const ONBOARDING_STORAGE_KEY = 'rapfactory_onboarding_dismissed_v1';
const ONBOARDING_SESSION_KEY = 'rapfactory_onboarding_seen_session_v1';

const TOUR_STEPS = [
  {
    title: 'Sessions',
    body: 'Every row is a song in progress. Open one to jump back in, rename from the card, or start a new session when a new idea hits.',
  },
  {
    title: 'Studio layout',
    body: 'Song: drop your beat and set your mic type. The timeline shows beat plus vocal lanes — mute, solo, and arm the layer you are printing to. Record: big button, levels, punch-in, and hear-yourself. Layers: every take stacked for that session.',
  },
  {
    title: 'Stacking takes',
    body: 'Select a lane, hit record — your take lands on that layer. Record again on the same lane for alternates; the Smart Engine keeps polish consistent. Use the quick-add strip for lead, double, adlib, harmony, punch-in, or MIDI.',
  },
  {
    title: 'Export & sound',
    body: 'When it feels right, Export prints full mix, acapella, or stems. Settings is where studio setup, smart sound, and your evolving voice profile live — no engineer jargon required.',
  },
];

export default function FirstVisitOverlay() {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState('welcome');
  const [tourIx, setTourIx] = useState(0);

  const close = useCallback(() => {
    try {
      sessionStorage.setItem(ONBOARDING_SESSION_KEY, '1');
    } catch {
      /* */
    }
    setOpen(false);
    setScreen('welcome');
    setTourIx(0);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(ONBOARDING_STORAGE_KEY) || sessionStorage.getItem(ONBOARDING_SESSION_KEY)) return;
      setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const onReplay = (e) => {
      const goTour = e?.detail?.screen === 'tour';
      setScreen(goTour ? 'tour' : 'welcome');
      setTourIx(0);
      setOpen(true);
    };
    window.addEventListener('rapfactory-open-onboarding', onReplay);
    return () => window.removeEventListener('rapfactory-open-onboarding', onReplay);
  }, []);

  const dismissForever = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
      /* */
    }
    close();
  };

  const startTour = () => {
    setTourIx(0);
    setScreen('tour');
  };

  if (!open) return null;

  return (
    <div
      className="rf-onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={screen === 'welcome' ? 'rf-onboarding-title' : 'rf-onboarding-tour-heading'}
    >
      <div className="rf-onboarding-card glass-panel">
        {screen === 'welcome' && (
          <>
            <div className="rf-onboarding-brand">
              <BrandLogo variant="inline" className="rf-onboarding-logo" />
            </div>
            <h1 id="rf-onboarding-title" className="rf-onboarding-title">
              RAP FACTORY
            </h1>
            <p className="rf-onboarding-tagline">Record rap vocals fast. RAP FACTORY handles the studio sound for you.</p>
            <ol className="rf-onboarding-steps">
              <li>Open or create a session</li>
              <li>Drop your beat on the Song screen</li>
              <li>Pick a layer — lead, double, adlib, harmony, or punch-in</li>
              <li>Hit record; stack takes on the same lane or add new layers</li>
              <li>Print a bounce from Export when you are mix-ready</li>
            </ol>
            <p className="rf-onboarding-reassure">
              No engineering degree required. The Smart Engine works like a producer in the room — cleanup, level, polish, and next moves
              without touching a DAW.
            </p>
            <div className="rf-onboarding-actions">
              <button type="button" className="btn btn-primary" onClick={close}>
                Enter RAP FACTORY
              </button>
              <button type="button" className="btn btn-ghost" onClick={startTour}>
                Quick tour
              </button>
              <button type="button" className="btn btn-ghost rf-onboarding-quiet" onClick={dismissForever}>
                Don&apos;t show this again
              </button>
            </div>
          </>
        )}

        {screen === 'tour' && (
          <div className="rf-onboarding-tour">
            <p className="rf-onboarding-tour-kicker">Quick tour · step {tourIx + 1} of {TOUR_STEPS.length}</p>
            <h2 className="rf-onboarding-tour-title" id="rf-onboarding-tour-heading">
              {TOUR_STEPS[tourIx].title}
            </h2>
            <p className="rf-onboarding-tour-body">{TOUR_STEPS[tourIx].body}</p>
            <div className="rf-onboarding-dots" aria-hidden>
              {TOUR_STEPS.map((_, i) => (
                <span key={i} className={`rf-onboarding-dot ${i === tourIx ? 'is-active' : ''}`} />
              ))}
            </div>
            <div className="rf-onboarding-tour-nav">
              {tourIx > 0 ? (
                <button type="button" className="btn btn-ghost" onClick={() => setTourIx((x) => x - 1)}>
                  Back
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="btn btn-ghost rf-onboarding-quiet" onClick={close}>
                Skip
              </button>
              {tourIx < TOUR_STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={() => setTourIx((x) => x + 1)}>
                  Next
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={close}>
                  Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
