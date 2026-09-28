/**
 * Fifteen players to test the engine with, one of each kind of hitter across
 * the three builds. Test fixtures only; the league's own players live in
 * game/teams.ts.
 */
import type { Player } from '../roster.ts';

export const POOL: readonly Player[] = [
  // HUMAN — the holdouts. Contact and nerve, no power. Outgunned and know it.
  { id: 'hu1', name: 'Cap Mullaney', build: 'human', trait: 'grit', power: 0.7, contact: 1.3, vision: 1.27, clutch: 1.1, bunt: 1.29, speed: 1.15, bats: 'R',
    bio: 'Player-manager of a team that folded under him. Has never once been rung up looking.' },
  { id: 'hu2', name: 'Deacon Roy', build: 'human', trait: 'grit', power: 0.75, contact: 1.25, vision: 1.24, clutch: 1.2, bunt: 1.12, speed: 0.95, bats: 'R',
    bio: 'Preaches Sundays, catches doubleheaders. Says the machines cannot be nervous, so they cannot be brave.' },
  { id: 'hu3', name: 'Wee Tom Barrow', build: 'human', trait: 'showman', power: 0.65, contact: 1.35, vision: 1.19, clutch: 1.0, bunt: 1.05, speed: 1.4, bats: 'L',
    bio: "Five foot four and the fastest pair of legs in the division. Tips his cap before he's reached the bag." },
  { id: 'hu4', name: 'Rosa Ivern', build: 'human', trait: 'reader', power: 0.8, contact: 1.28, vision: 1.31, clutch: 1.05, bunt: 1.17, speed: 1.2, bats: 'R',
    bio: 'Charts every pitcher she faces in a notebook she will not let anyone photograph.' },
  { id: 'hu5', name: 'Smoky Joe Vance', build: 'human', trait: 'slugger', power: 1.05, contact: 1.05, vision: 0.92, clutch: 0.95, bunt: 0.35, speed: 0.8, bats: 'L',
    bio: 'Last man to win a home run title on nothing but breakfast. Reminds you of it hourly.' },

  // AUGMENTED — grafted and calibrated. Power arrives, contact suffers.
  { id: 'au1', name: 'Dex Okafor', build: 'augmented', trait: 'slugger', power: 1.45, contact: 0.8, vision: 0.81, clutch: 1.0, bunt: 0.38, speed: 0.85, bats: 'R',
    bio: 'Traded both shoulders for a contract. Swings like the debt is due today.' },
  { id: 'au2', name: 'Marco Vela', build: 'augmented', trait: 'reader', power: 1.1, contact: 1.15, vision: 1.25, clutch: 0.9, bunt: 1.06, speed: 1.1, bats: 'L',
    bio: 'Optical graft reads spin at the release point. Still cannot hit a changeup.' },
  { id: 'au3', name: 'Ty Brennan', build: 'augmented', trait: 'slugger', power: 1.55, contact: 0.7, vision: 0.75, clutch: 1.05, bunt: 0.3, speed: 0.7, bats: 'R',
    bio: 'Four surgeries, three of them elective. Makes contact perhaps once a week, and the wall remembers it.' },
  { id: 'au4', name: 'Ravi Sundaram', build: 'augmented', trait: 'reader', power: 0.95, contact: 1.3, vision: 1.28, clutch: 1.0, bunt: 1.1, speed: 1.25, bats: 'R',
    bio: 'Took the smallest legal augment and out-hit everyone who took the largest.' },
  { id: 'au5', name: 'Junior Castellanos', build: 'augmented', trait: 'showman', power: 1.25, contact: 0.95, vision: 0.96, clutch: 1.25, bunt: 0.84, speed: 1.0, bats: 'L',
    bio: 'Third generation ballplayer, first to be built. The crowd has not decided how it feels.' },

  // MACHINE — factory units. Consistent, powerful, and nobody's teammate.
  { id: 'ma1', name: 'UNIT-7 "Cletus"', build: 'machine', trait: 'precision', power: 1.3, contact: 1.2, vision: 1.11, clutch: 1.0, bunt: 0.66, speed: 1.0, bats: 'R',
    bio: 'The clubhouse named him. He has filed no objection and no thanks.' },
  { id: 'ma2', name: 'Xandra Kō', build: 'machine', trait: 'slugger', power: 1.7, contact: 0.75, vision: 0.8, clutch: 0.9, bunt: 0.15, speed: 0.75, bats: 'L',
    bio: 'Built to one specification: exit velocity. Nobody specified what to do with two strikes.' },
  { id: 'ma3', name: 'Orbital Pete', build: 'machine', trait: 'showman', power: 1.4, contact: 0.9, vision: 0.93, clutch: 1.35, bunt: 0.96, speed: 1.5, bats: 'R',
    bio: 'Runs a highlight reel of himself on his own chest plate. Somehow the fans love it.' },
  { id: 'ma4', name: 'The Gantry', build: 'machine', trait: 'precision', power: 1.5, contact: 1.0, vision: 1.01, clutch: 1.0, bunt: 0.47, speed: 0.6, bats: 'L',
    bio: 'Two metres of factory frame that has never been thrown out at first, because it has never tried.' },
  { id: 'ma5', name: 'Nine-Iron Nadia', build: 'machine', trait: 'reader', power: 1.15, contact: 1.25, vision: 1.32, clutch: 1.05, bunt: 0.85, speed: 1.05, bats: 'R',
    bio: 'Decommissioned from a driving range and rebuilt for the league. The swing plane never changed.' },
];
