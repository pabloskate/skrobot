'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TbAlertTriangle, TbCheck, TbDownload } from 'react-icons/tb';
import type { TrickVideoOptions } from '@skrobot/animations/three/video';
import { videoFilename } from './explorer';

type Status =
  | { kind: 'idle' }
  | { kind: 'filming'; progress: number }
  | { kind: 'saved' }
  | { kind: 'failed'; unsupported: boolean };

/** How long "Saved" or a failure shows before the button resets. */
const NOTICE_MS = 2400;
/** Seconds the download link stays alive; Safari reads it after the click returns. */
const LINK_LIFETIME_MS = 60_000;

/** Hands the browser a file to download. */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), LINK_LIFETIME_MS);
}

/**
 * Download a video of what's on stage: the trick filmed once through, at the
 * stage's speed and camera, then saved as a file. Filming happens off screen
 * and takes a few seconds; pressing again while it runs cancels.
 */
export default function VideoButton({ video }: { video: Omit<TrickVideoOptions, 'onProgress' | 'signal'> }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const job = useRef<AbortController | null>(null);

  useEffect(() => () => job.current?.abort(), []);

  useEffect(() => {
    if (status.kind !== 'saved' && status.kind !== 'failed') return;
    const timer = window.setTimeout(() => setStatus({ kind: 'idle' }), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [status.kind]);

  const film = async () => {
    if (job.current) {
      job.current.abort();
      return;
    }
    const controller = new AbortController();
    job.current = controller;
    setStatus({ kind: 'filming', progress: 0 });
    try {
      // The encoder loads only when someone films.
      const { recordTrickVideo } = await import('@skrobot/animations/three/video');
      const blob = await recordTrickVideo({
        ...video,
        signal: controller.signal,
        onProgress: (progress) => setStatus({ kind: 'filming', progress }),
      });
      controller.signal.throwIfAborted();
      saveFile(blob, videoFilename(video.trick.name, video.rate ?? 1, blob.type));
      setStatus({ kind: 'saved' });
    } catch (error) {
      if (controller.signal.aborted) setStatus({ kind: 'idle' });
      else setStatus({ kind: 'failed', unsupported: error instanceof Error && error.name === 'VideoUnsupportedError' });
    } finally {
      if (job.current === controller) job.current = null;
    }
  };

  const percent = status.kind === 'filming' ? Math.floor(status.progress * 100) : 0;
  const { icon, label, aria } = {
    idle: { icon: <TbDownload aria-hidden />, label: 'Download', aria: 'Download a video of this trick' },
    filming: { icon: null, label: `${percent}%`, aria: `Making the video, ${percent}%. Press to cancel` },
    saved: { icon: <TbCheck aria-hidden />, label: 'Saved', aria: 'Video saved' },
    failed: {
      icon: <TbAlertTriangle aria-hidden />,
      label: 'Failed',
      aria: status.kind === 'failed' && status.unsupported
        ? "This browser can't make videos. Press to try again"
        : "The video couldn't be made. Press to try again",
    },
  }[status.kind];

  return (
    <button
      type="button"
      className={`explorer-download ${status.kind}`}
      onClick={film}
      aria-label={aria}
      title={status.kind === 'failed' ? aria : undefined}
      style={{ '--progress': status.kind === 'filming' ? status.progress : 0 } as CSSProperties}
    >
      {icon}
      <span className="explorer-download-label">{label}</span>
    </button>
  );
}
