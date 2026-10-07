/**
 * THE BEATS BETWEEN PITCHES — how long the screen holds on a call, how long the
 * man on the mound takes to let go of a pitch nobody is timing the release of,
 * and when a press may be banked for the next pitch.
 *
 * ⚠️ NONE OF THIS GRADES ANYTHING. The ±12/±35/±80 swing windows and the
 * release windows in core/delivery.ts are measured between two timestamps that
 * every function here leaves alone. These numbers only decide when a picture
 * starts and how long it stays — dead time, which is the thing to cut.
 *
 * Pure, so the frame loop's decisions can be tested without a DOM. main.ts owns
 * every clock; it passes them in.
 */

/**
 * A ROUTINE PITCH — a ball, a called strike, a whiff that is not strike three.
 *
 * ⚠️ IT WAS A FLAT SECOND, and a second per pitch is most of a minute of
 * nothing an inning. Six hundred is long enough to read one word off the flash
 * and short enough that the count is the thing you look at next.
 */
export const PITCH_BEAT_MS = 600;

/**
 * THE PITCH THAT ENDS THE AT-BAT keeps the full second. Strike three, ball
 * four, the hit batter and the ball put in play are the events, and the beat
 * before the caption or the replay is where they land.
 */
export const PLAY_BEAT_MS = 1000;

/** How long 'resolve' holds after a pitch, by whether it ended the at-bat. */
export const beatMs = (atBatOver: boolean): number => (atBatOver ? PLAY_BEAT_MS : PITCH_BEAT_MS);

/** The two numbers of a tempo armPoseAt() reads. See core/delivery.ts. */
export interface Tempo {
  sweepMs: number;
  releaseAtMs: number;
}

/**
 * THE COMPUTER'S DELIVERY, compressed exactly as much as the flight is.
 *
 * ⚠️ `scale` IS flightScale(), never readScale(). In watch mode the windup is
 * dead time and shrinks with the speed setting; at 1x — every pitch a human is
 * hitting — it is the tempo as written, and the practice speed does not slow
 * the arm, only the ball.
 */
export const windupTempo = (d: Tempo, scale: number): Tempo => ({
  sweepMs: d.sweepMs / scale,
  releaseAtMs: d.releaseAtMs / scale,
});

/**
 * MAY A HUMAN PRESS START THE BAT YET — only once the ball has left the hand.
 *
 * ⚠️ HUMAN PRESSES ONLY. The computer's swing is scheduled off the arrival and
 * fires on its own clock; gating it here would turn a decided swing into a
 * take at 8x, where a flight is shorter than an early offset.
 */
export const ballOut = (now: number, launchAt: number): boolean => now >= launchAt;

/**
 * A PRESS THIS SOON AFTER THE PITCH RESOLVED IS THE TAIL OF THE SWING, not a
 * request for the next one — a check tapped a hair too late, a bounce on the
 * key. It is dropped rather than banked.
 */
export const QUEUE_GUARD_MS = 150;

/** Should a press during 'resolve' be banked as the next pitch? */
export const canQueue = (now: number, resolvedAt: number): boolean =>
  now - resolvedAt >= QUEUE_GUARD_MS;

/**
 * IS THE SCREEN CLEAR FOR THE BANKED PITCH. Everything that owns the screen
 * blocks it: a replay, the break card (up or queued), and any phase but a
 * hitter waiting on a pitch — a defensive throw, the mound, the final. A
 * blocked press is dropped, never held over: the next pitch after a break is
 * asked for by somebody who has seen the break.
 *
 * ⚠️ AND IT IS NEVER BANKED ON THE PITCH THAT ENDS AN AT-BAT — main.ts refuses
 * the press itself, so strike three and ball four keep their whole beat.
 */
export interface QueueGate {
  phase: string;
  youBat: boolean;
  auto: boolean;
  replay: boolean;
  breakUp: boolean;
}

export const fireQueued = (g: QueueGate): boolean =>
  g.phase === 'idle' && g.youBat && !g.auto && !g.replay && !g.breakUp;
