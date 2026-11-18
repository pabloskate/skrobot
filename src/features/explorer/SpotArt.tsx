import { setInfo, type StageSet } from '@skrobot/animations';

/** A spot's silhouette for its card, drawn from its profile in the animation registry. Decorative; the card names the spot. */
export default function SpotArt({ set }: { set: StageSet }) {
  const profile = setInfo(set).card?.profile;
  if (!profile) return null;
  return (
    <svg className="dream-spot-art" viewBox="0 0 72 40" aria-hidden>
      <path d={`${profile.ground} V40 H0 Z`} fill="currentColor" fillOpacity={0.2} />
      <g fill="none" stroke="currentColor" strokeWidth={profile.strokeWidth ?? 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={profile.ground} />
        {profile.marks?.map(({ d, strokeWidth, strokeOpacity, fillOpacity }) => (
          <path
            key={d}
            d={d}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
            {...(fillOpacity != null && { fill: 'currentColor', fillOpacity })}
          />
        ))}
      </g>
    </svg>
  );
}
