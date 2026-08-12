import type { GameState, GameConfig, Piece, Side } from './types';
import { createRNG } from './rng';
import { BOARD_CONFIG } from './config/board';
import { ENERGY_CONFIG } from './config/energy';
import { THROW_CONFIG } from './config/throw';
import { MOMENTUM_CONFIG } from './config/momentum';
import { ALL_CARDS } from './config/cards';
import { MCTS_EVALUATION_WEIGHTS } from './config/mcts';
import { computeControlMap } from './control';

export const DEFAULT_CONFIG: GameConfig = {
  board: {
    cols: 11,
    rows: 11,
    playerCaptainStart: BOARD_CONFIG.playerPiecesStart[0].cell,
    playerScoringCell: BOARD_CONFIG.playerScoringCell,
    aiCaptainStart: BOARD_CONFIG.aiPiecesStart[0].cell,
    aiScoringCell: BOARD_CONFIG.aiScoringCell,
    playerPiecesStart: BOARD_CONFIG.playerPiecesStart,
    aiPiecesStart: BOARD_CONFIG.aiPiecesStart,
    pointsToWin: BOARD_CONFIG.pointsToWin,
    maxTurns: BOARD_CONFIG.maxTurns,
    holdToScore: BOARD_CONFIG.holdToScore,
    carrierMayPivotStep: BOARD_CONFIG.carrierMayPivotStep,
    holdingFoulEnforced: BOARD_CONFIG.holdingFoulEnforced,
  },
  energy: {
    startEnergy: ENERGY_CONFIG.startEnergy,
    maxEnergy: ENERGY_CONFIG.maxEnergy,
    moveCostPerCell: ENERGY_CONFIG.moveCostPerCell,
    throwCostDivisor: ENERGY_CONFIG.throwCostDivisor,
    baseRegen: ENERGY_CONFIG.baseRegenMoved,
    compoundingRegenBase: 1.0,
    swingEnergyCost: ENERGY_CONFIG.swingEnergyCost,
  },
  throw: THROW_CONFIG,
  momentum: {
    startMomentum: MOMENTUM_CONFIG.startMomentum,
    regenPerTurn: MOMENTUM_CONFIG.regenPerTurn,
    maxMomentum: MOMENTUM_CONFIG.maxMomentum,
    handLimit: MOMENTUM_CONFIG.handLimit,
    cleanAssistEarn: MOMENTUM_CONFIG.cleanAssistEarn,
    interceptionBaseEarn: MOMENTUM_CONFIG.interceptionBaseEarn,
    interceptionRestStreakMultiplier: MOMENTUM_CONFIG.interceptionRestStreakMultiplier,
    interceptionEarnCap: MOMENTUM_CONFIG.interceptionEarnCap,
  },
  interception: {
    pieceSelfControl: 1.0,
    orthogonalControl: 0.5,
    diagonalControl: 0.25,
    maxControlFactorPerCell: 1.0,
  },
  timing: {
    jumpBallWindowMs: 250,
    turnTimerSeconds: 60, // 60 seconds planning budget
  },
  mcts: {
    tier: 'T1',
    iterations: 10000,
    rolloutDepth: 8,
    ismctsSamples: 10,
    explorationConstant: 1.414,
    weights: MCTS_EVALUATION_WEIGHTS,
  },
  ai: {
    defaultEngineMode: 'EPSILON_GREEDY_NN',
    playerEngineMode: 'EPSILON_GREEDY_NN',
    aiEngineMode: 'EPSILON_GREEDY_NN',
    nnModelSize: '64',
    epsilonExploitRate: 0.75,
  },
};

export function createInitialState(seed = 4242, overrides?: Partial<GameConfig>): GameState {
  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    board: { ...DEFAULT_CONFIG.board, ...overrides?.board },
    energy: { ...DEFAULT_CONFIG.energy, ...overrides?.energy },
    throw: { ...DEFAULT_CONFIG.throw, ...overrides?.throw },
    momentum: { ...DEFAULT_CONFIG.momentum, ...overrides?.momentum },
    interception: { ...DEFAULT_CONFIG.interception, ...overrides?.interception },
    timing: { ...DEFAULT_CONFIG.timing, ...overrides?.timing },
    mcts: { ...DEFAULT_CONFIG.mcts, ...overrides?.mcts },
    ai: { ...DEFAULT_CONFIG.ai, ...overrides?.ai },
  };

  const rng = createRNG(seed);

  const playerPieces: Piece[] = config.board.playerPiecesStart.map(p => ({
    id: p.id,
    side: 'PLAYER' as Side,
    isCaptain: p.isCaptain,
    isBlocker: p.isBlocker || false,
    height: p.height ?? (p.isCaptain ? 2 : 0),
    cell: { ...p.cell },
    energy: config.energy.startEnergy,
    restStreak: 0,
    hasBall: false,
    movedLastTurn: false,
    buffs: [],
  }));

  const aiPieces: Piece[] = config.board.aiPiecesStart.map(p => ({
    id: p.id,
    side: 'AI' as Side,
    isCaptain: p.isCaptain,
    isBlocker: p.isBlocker || false,
    height: p.height ?? (p.isCaptain ? 2 : 0),
    cell: { ...p.cell },
    energy: config.energy.startEnergy,
    restStreak: 0,
    hasBall: false,
    movedLastTurn: false,
    buffs: [],
  }));

  const allPieces = [...playerPieces, ...aiPieces];

  const playerDeck = rng.shuffle(ALL_CARDS);
  const aiDeck = rng.shuffle(ALL_CARDS);

  const playerHand = playerDeck.splice(0, 2);
  const aiHand = aiDeck.splice(0, 2);

  const initialControlMap = computeControlMap(allPieces, undefined, config.board.cols, config.board.rows);

  return {
    seed,
    rngState: rng.getState(),
    config,
    turn: 1,
    phase: 'JUMP_BALL',
    toAct: 'PLAYER',
    pieces: allPieces,
    ballHolderId: null,
    score: { PLAYER: 0, AI: 0 },
    momentum: {
      PLAYER: config.momentum.startMomentum,
      AI: config.momentum.startMomentum,
    },
    hands: {
      PLAYER: playerHand,
      AI: aiHand,
    },
    decks: {
      PLAYER: playerDeck,
      AI: aiDeck,
    },
    discardPiles: {
      PLAYER: [],
      AI: [],
    },
    drawnThisTurn: {
      PLAYER: null,
      AI: null,
    },
    cardPlayedThisTurn: {
      PLAYER: false,
      AI: false,
    },
    controlMap: initialControlMap,
    isRestartPhase: {
      PLAYER: false,
      AI: false,
    },
    plannedMoves: [],
    plannedThrow: null,
    plannedCards: [],
    aiPlannedActions: null,
    temporaryState: {},
    eventLog: [],
    jumpBall: {
      active: true,
      currentIndicator: 'PLAYER',
      switchIntervalMs: config.timing.jumpBallWindowMs,
      cycleCount: 0,
      playerHeld: false,
      releaseMarginMs: null,
      wonBy: null,
    },
    timer: {
      turnStartTime: Date.now(),
      remainingSeconds: config.timing.turnTimerSeconds,
      isPaused: false,
      isExpired: false,
      latencies: [],
    },
    aiStatus: {
      isThinking: false,
      selectedPosture: null,
    },
    matchResult: {
      winner: null,
      isOver: false,
      reason: null,
      aptitudeReport: null,
    },
  };
}
