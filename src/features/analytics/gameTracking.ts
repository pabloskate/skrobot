import { trackAnalyticsEvent } from './api';
import type {
  AnalyticsGameContext,
  AnalyticsGameFormat,
  AnalyticsGameMode,
  AnalyticsGameVariant,
  AnalyticsSurface,
  VoiceFailureReason,
} from './events';

export interface AnalyticsGameSession {
  id: string;
  startedAt: string;
}

export interface TrackedGame {
  session: AnalyticsGameSession;
  robotId: string;
  mode: AnalyticsGameMode;
  gameFormat: AnalyticsGameFormat;
  gameVariant: AnalyticsGameVariant;
}

interface TrackedGameSnapshot {
  state: {
    winner: 'player' | 'robot' | null;
    letters: { player: number; robot: number };
    gameFormat: AnalyticsGameFormat;
    gameVariant: AnalyticsGameVariant;
  };
  progress: { trickAttempts: readonly unknown[] };
}

function eventContext(game: TrackedGame): AnalyticsGameContext {
  return {
    gameId: game.session.id,
    robotId: game.robotId,
    mode: game.mode,
    gameFormat: game.gameFormat,
    gameVariant: game.gameVariant,
  };
}

/** Product-level game event semantics. AppShell only supplies lifecycle callbacks and screen context. */
export const gameAnalytics = {
  createSession(): AnalyticsGameSession {
    return { id: crypto.randomUUID(), startedAt: new Date().toISOString() };
  },

  started(game: TrackedGame, surface: AnalyticsSurface): void {
    trackAnalyticsEvent({ name: 'game_started', properties: eventContext(game) }, surface);
  },

  saved(game: TrackedGame, snapshot: TrackedGameSnapshot, surface: AnalyticsSurface): void {
    trackAnalyticsEvent(
      {
        name: 'game_saved',
        properties: {
          ...eventContext(game),
          attemptCount: snapshot.progress.trickAttempts.length,
        },
      },
      surface,
    );
  },

  resumed(game: TrackedGame, savedAt: string, surface: AnalyticsSurface): void {
    trackAnalyticsEvent(
      {
        name: 'game_resumed',
        properties: {
          ...eventContext(game),
          savedForMs: Math.max(0, Date.now() - Date.parse(savedAt)),
        },
      },
      surface,
    );
  },

  completed(game: TrackedGame, snapshot: TrackedGameSnapshot, surface: AnalyticsSurface): void {
    if (!snapshot.state.winner) return;
    trackAnalyticsEvent(
      {
        name: 'game_completed',
        properties: {
          ...eventContext(game),
          gameFormat: snapshot.state.gameFormat,
          gameVariant: snapshot.state.gameVariant,
          won: snapshot.state.winner === 'player',
          playerLetters: snapshot.state.letters.player,
          robotLetters: snapshot.state.letters.robot,
          attemptCount: snapshot.progress.trickAttempts.length,
          durationMs: Math.max(0, Date.now() - Date.parse(game.session.startedAt)),
        },
      },
      surface,
    );
  },

  voiceConnectionFailed(
    game: TrackedGame,
    reason: VoiceFailureReason,
    surface: AnalyticsSurface,
  ): void {
    trackAnalyticsEvent(
      {
        name: 'voice_connection_failed',
        properties: { ...eventContext(game), reason },
      },
      surface,
    );
  },
};
