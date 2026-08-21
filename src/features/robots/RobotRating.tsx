import type { Robot } from './robots';
import { robotDisplayRating } from './robots';

export default function RobotRating({ robot, profile = false }: { robot: Robot; profile?: boolean }) {
  const rating = robotDisplayRating(robot);
  if (rating === null) return null;

  return (
    <span
      className={`robot-rating${profile ? ' robot-rating--profile' : ''}`}
      aria-label={`Robot rating ${rating}`}
    >
      <span className="robot-rating-label">Rating</span>
      <span className="robot-rating-value">{rating}</span>
    </span>
  );
}
