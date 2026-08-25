'use client';

import { useEffect, useState } from 'react';
import { TbChevronRight, TbDotsVertical, TbDownload, TbX } from 'react-icons/tb';
import type { AppInstallOffer } from './useAppInstallOffer';

const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id6455175396';

export default function AppInstallBanner({ offer }: { offer: AppInstallOffer }) {
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => {
    if (!instructionsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInstructionsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [instructionsOpen]);

  if (!offer.platform) return null;
  const bannerLabel =
    offer.platform === 'ios' ? 'Get Skate Robot for iPhone' : 'Install Skate Robot';
  const bannerContent = (
    <>
      <img className="app-install-mark" src="/app-icon.png" alt="" aria-hidden />
      <span className="app-install-copy">{bannerLabel}</span>
      <TbChevronRight className="app-install-chevron" aria-hidden />
    </>
  );

  return (
    <>
      {offer.platform === 'ios' ? (
        <a className="app-install-banner" href={IOS_APP_STORE_URL}>
          {bannerContent}
        </a>
      ) : (
        <button
          className="app-install-banner"
          type="button"
          onClick={() => setInstructionsOpen(true)}
        >
          {bannerContent}
        </button>
      )}

      {offer.platform === 'android' && instructionsOpen && (
        <div className="sheet-backdrop" onClick={() => setInstructionsOpen(false)}>
          <div
            className="sheet install-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-header">
              <div>
                <p className="install-sheet-eyebrow">Android</p>
                <h2 id="install-sheet-title">Install Skate Robot</h2>
              </div>
              <button
                className="install-sheet-close"
                type="button"
                aria-label="Close install instructions"
                onClick={() => setInstructionsOpen(false)}
              >
                <TbX aria-hidden />
              </button>
            </div>

            <ol className="install-steps">
              <li>
                <span className="install-step-icon">
                  <TbDotsVertical aria-hidden />
                </span>
                <span>
                  <strong>Open your browser menu</strong>
                  Tap the three dots near the address bar.
                </span>
              </li>
              <li>
                <span className="install-step-icon">
                  <TbDownload aria-hidden />
                </span>
                <span>
                  <strong>Choose Install app</strong>
                  It may also be called Add to Home screen.
                </span>
              </li>
              <li>
                <span className="install-step-number">3</span>
                <span>
                  <strong>Confirm Install</strong>
                  Skate Robot will appear with your other apps.
                </span>
              </li>
            </ol>

            {offer.canPrompt && (
              <button
                className="btn-primary install-now-button"
                type="button"
                onClick={() => {
                  void offer.install().then((outcome) => {
                    if (outcome === 'accepted') setInstructionsOpen(false);
                  });
                }}
              >
                Install now
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
