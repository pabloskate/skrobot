'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TbX } from 'react-icons/tb';
import { cameraPreset, type CameraPresetId } from './explorer';
import type { DreamShot } from './dream';
import ShotIcon from './ShotIcon';

interface Props {
  shots: readonly DreamShot[];
  selected: CameraPresetId | null;
  onChoose: (shot: CameraPresetId) => void;
  onClose: () => void;
}

export default function CameraAngleDialog({ shots, selected, onChoose, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();

  useEffect(() => {
    const el = dialog.current;
    const trigger = document.activeElement;
    el?.showModal();
    return () => {
      el?.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      className="dream-camera-dialog"
      aria-labelledby={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
    >
      <div className="dream-heading-row">
        <h2 id={title} className="dream-heading">Camera angle</h2>
        <button type="button" className="dream-camera-close" aria-label="Close camera angles" onClick={onClose}>
          <TbX aria-hidden />
        </button>
      </div>
      <p className="dream-camera-hint">Pick a shot, or drag the animation to look around.</p>
      <div className="dream-shot-list" role="radiogroup" aria-labelledby={title}>
        {shots.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            className={`dream-shot ${selected === option.id ? 'active' : ''}`}
            onClick={() => onChoose(option.id)}
            title={option.hint}
          >
            <ShotIcon camera={cameraPreset(option.id).camera} tripod={cameraPreset(option.id).tripod != null} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </dialog>,
    document.body,
  );
}
