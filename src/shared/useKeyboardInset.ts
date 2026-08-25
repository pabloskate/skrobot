'use client';

import { useSyncExternalStore } from 'react';

function subscribeToViewport(onStoreChange: () => void): () => void {
  const vv = typeof window === 'undefined' ? null : window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener('resize', onStoreChange);
  vv.addEventListener('scroll', onStoreChange);
  return () => {
    vv.removeEventListener('resize', onStoreChange);
    vv.removeEventListener('scroll', onStoreChange);
  };
}

/**
 * Distance between the layout viewport and the currently visible top edge.
 *
 * Mobile Safari can pan the visual viewport without moving the layout viewport
 * when the keyboard opens. Anchored controls need this offset to stay inside
 * the portion of the page the player can actually see.
 */
function offsetTopSnapshot(): number {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;
  return Math.max(0, Math.round(window.visualViewport.offsetTop));
}

export function useVisualViewportOffsetTop(): number {
  return useSyncExternalStore(subscribeToViewport, offsetTopSnapshot, () => 0);
}

function viewportHeightSnapshot(): number {
  if (typeof window === 'undefined') return 0;
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

export function useVisualViewportHeight(): number {
  return useSyncExternalStore(subscribeToViewport, viewportHeightSnapshot, () => 0);
}
