import type { ThrowType, ThrowConfig } from './config/throw';

export type { ThrowType, ThrowConfig };

export type Attribute = 
  | 'RESOURCE' 
  | 'RISK' 
  | 'COMPOSURE' 
  | 'TEAMWORK' 
  | 'SPATIAL' 
  | 'LEADERSHIP';

export type Side = 'PLAYER' | 'AI';

export type Posture = 
  | 'ALL_OUT_ATTACK' 
  | 'BALANCED' 
  | 'LOCK_DEFENCE' 
  | 'SPREAD_CONTROL' 
  | 'COLLAPSE_ON_BALL';

export type GamePhase = 
  | 'JUMP_BALL' 
  | 'PLAYER_PLAN' 
  | 'AI_PLANNED_REVIEW'
  | 'RESOLVE' 
  | 'AI_TURN' 
  | 'MATCH_OVER';

export interface Cell {
  col: number;
  row: number;
}

export type CardEffectKey =
  | 'deep_breath'
  | 'second_wind'
  | 'slow_burn'
  | 'drain'
  | 'overclock'
  | 'insurance'
  | 'threaded_pass'
  | 'steady_hands'
  | 'long_bomb'
  | 'no_look_pass'
  | 'reset'
  | 'ice_in_the_veins'
  | 'anchor'
  | 'timeout'
  | 'give_and_go'
  | 'spacing'
  | 'screen'
  | 'overlap'
  | 'bait'
  | 'jam_the_lane'
  | 'clamp'
  | 'full_court_press'
  | 'tempo_change'
  | 'set_the_play'
  | 'rally'
  | 'surge';

export interface Card {
  id: string;
  name: string;
  dim: Attribute;
  momentumCost: number;
  swingEnergyCost?: number;
  effect: CardEffectKey;
  description: string;
  targetType: 'NONE' | 'FRIENDLY_PIECE' | 'ENEMY_PIECE' | 'CELL' | 'TWO_FRIENDLY' | 'THROW';
}

export interface PieceBuff {
  id: string;
  type: string;
  durationTurns: number;
  value?: number;
}

export interface Piece {
  id: string;
  side: Side;
  isCaptain: boolean;
  isBlocker?: boolean;
  height: number; // 0 for ground runners & blocker, 2 for Captain elevated on stool
  cell: Cell;
  energy: number;
  restStreak: number;
  hasBall: boolean;
  movedLastTurn: boolean;
  buffs: PieceBuff[];
}

export interface InterceptionCheckCell {
  cell: Cell;
  enemyControlFactor: number;
  nearestEnemyPieceId: string | null;
  nearestEnemyEnergy: number;
  captureProbability: number;
  clearRelief?: number;
  effectiveControl?: number;
}

export interface ThrowPreviewData {
  fromCell: Cell;
  targetCell: Cell;
  throwType: ThrowType;
  loft: number;
  catcherHeight: number;
  distance: number;
  throwCost: number;
  postThrowEnergy: number;
  preThrowEnergy: number;
  clearRelief: number;
  catchRate: number;
  isClean: boolean;
  pathCells: InterceptionCheckCell[];
  cumulativeCaptureRisk: number;
  isNoLookPass?: boolean;
  targetMovedThisTurn?: boolean;
}

export interface InterceptionRouletteAudit {
  cell: Cell;
  roll: number;
  pCell: number;
  intercepted: boolean;
  defPieceId?: string | null;
  defEnergy?: number;
  fEffective?: number;
  clearRelief?: number;
  throwerEnergy?: number;
}

export interface ThrowResolution {
  fromCell: Cell;
  targetCell: Cell;
  throwerId: string;
  intendedTargetPieceId: string;
  throwType: ThrowType;
  loft: number;
  catcherHeight: number;
  isClean: boolean;
  throwEnergyPaid: number;
  postThrowEnergy: number;
  preThrowEnergy: number;
  intercepted: boolean;
  interceptedAtCell?: Cell;
  interceptedByPieceId?: string;
  catchRoll: number;
  catchSuccess: boolean;
  scored: boolean;
  missedCatchType?: 'OVERSHOOT' | 'UNDERSHOOT' | 'FUMBLE' | 'OUT_OF_BOUNDS';
  ballRestCell?: Cell;
  ballHolderId?: string;
  rollValues: InterceptionRouletteAudit[];
  refunded: boolean;
}

export interface PlannedMove {
  pieceId: string;
  destCell: Cell;
  cost: number;
}

export interface PlannedThrow {
  targetPieceId: string;
  targetCell: Cell;
  throwType: ThrowType;
  loft: number;
  totalCost: number;
}

export interface PlannedCard {
  cardId: string;
  targetPieceId?: string;
  targetCell?: Cell;
  secondaryPieceId?: string;
}

export interface AIPlannedActionsData {
  moves: { pieceId: string; fromCell: Cell; destCell: Cell; cost: number }[];
  throwAction?: { throwerId: string; fromCell: Cell; targetPieceId: string; targetCell: Cell; throwType?: ThrowType };
  stage0Card?: string | null;
  stage0CardTarget?: string | null;
  stage0CardCell?: Cell | null;
  stage2Card?: string | null;
  stage2CardTarget?: string | null;
  stage2CardCell?: Cell | null;
  posture?: Posture | null;
  stats?: {
    iterations: number;
    nodesEvaluated: number;
    bestScore: number;
    candidateCount?: number;
    bestActionDescription?: string;
    timeMs: number;
  };
}

export interface ActiveTemporaryState {
  extraControlCell?: { cell: Cell; turns: number; side: Side };
  teamControlBoost?: { side: Side; turns: number; radiusBonus?: number };
  teamEnergyInterceptionBoost?: { side: Side; multiplier: number };
  negateDebuff?: Record<Side, boolean>;
  insuranceActive?: Record<Side, boolean>;
  threadedPassActive?: Record<Side, boolean>;
  steadyHandsActive?: Record<Side, boolean>;
  longBombActive?: Record<Side, boolean>;
  noLookPassActive?: Record<Side, boolean>;
  giveAndGoAvailablePieceId?: string | null;
  setThePlayActive?: Record<Side, boolean>;
}

export type EventType =
  | 'JUMP_BALL_WON'
  | 'PIECE_MOVED'
  | 'REST_COMPOUNDED'
  | 'PASS_ATTEMPTED'
  | 'ROULETTE_EVALUATED'
  | 'PASS_CLEAN_REFUND'
  | 'PASS_INTERCEPTED'
  | 'PASS_COMPLETED'
  | 'PASS_MISSED_CATCH'
  | 'PASS_OVERSHOOT_GRABBED'
  | 'PASS_UNDERSHOOT_RACE'
  | 'PASS_FUMBLE_LOOSE'
  | 'OUT_OF_BOUNDS_THROW_IN'
  | 'SCORE_GOAL'
  | 'HOLDING_FOUL_TURNOVER'
  | 'CARD_DRAWN'
  | 'CARD_PLAYED'
  | 'CARD_DISCARDED'
  | 'MOMENTUM_EARNED'
  | 'TURN_STARTED'
  | 'TURN_ENDED'
  | 'MATCH_OVER'
  | 'TIMER_EXPIRED';

export interface GameEvent {
  id: string;
  timestamp: number;
  turn: number;
  phase: GamePhase;
  side: Side;
  type: EventType;
  details: Record<string, any>;
  stateSummary?: {
    playerScore: number;
    aiScore: number;
    playerMomentum: number;
    aiMomentum: number;
  };
}

export interface AptitudeReport {
  overallScore: number;
  attributePoints: Record<Attribute, number>;
  normalizedScores: Record<Attribute, number>;
  bands: Record<Attribute, 'Developing' | 'Solid' | 'Strong'>;
  suggestedRole: 'Playmaker' | 'Closer' | 'Anchor' | 'Captain';
  roleMatchConfidence: number;
  scoutingReport: {
    headline: string;
    summary: string;
    strengths: string[];
    areasForGrowth: string[];
    tacticalDNA: string;
  };
  telemetry: {
    totalTurns: number;
    cleanPasses: number;
    interceptedPasses: number;
    totalPasses: number;
    cleanPassRate: number;
    maxRestStreak: number;
    avgRestStreak: number;
    forcedDiscards: number;
    cardsPlayed: number;
    energyWasted: number;
    avgTurnPlanningLatencyMs: number;
    jumpBallMarginMs: number;
    assistsToCaptain: number;
    interceptionsMade: number;
    holdingFoulsCommitted: number;
    aiDifficultyTier: string;
  };
}

export interface GameConfig {
  board: {
    cols: number;
    rows: number;
    playerCaptainStart: Cell;
    playerScoringCell: Cell;
    aiCaptainStart: Cell;
    aiScoringCell: Cell;
    playerPiecesStart: { id: string; cell: Cell; isCaptain: boolean; isBlocker?: boolean; height?: number }[];
    aiPiecesStart: { id: string; cell: Cell; isCaptain: boolean; isBlocker?: boolean; height?: number }[];
    pointsToWin: number;
    maxTurns: number;
    holdToScore: boolean;
    carrierMayPivotStep: boolean;
    holdingFoulEnforced: boolean;
  };
  energy: {
    startEnergy: number;
    maxEnergy: number;
    moveCostPerCell: number;
    throwCostDivisor: number;
    baseRegen: number;
    compoundingRegenBase: number;
    swingEnergyCost: number;
  };
  throw: ThrowConfig;
  momentum: {
    startMomentum: number;
    regenPerTurn: number;
    maxMomentum: number;
    handLimit: number;
    cleanAssistEarn: number;
    interceptionBaseEarn: number;
    interceptionRestStreakMultiplier: number;
    interceptionEarnCap: number;
  };
  interception: {
    pieceSelfControl: number;
    orthogonalControl: number;
    diagonalControl: number;
    maxControlFactorPerCell: number;
  };
  timing: {
    jumpBallWindowMs: number;
    turnTimerSeconds: number;
  };
  mcts: {
    tier: 'T1' | 'T2' | 'T3' | 'T4' | 'CUSTOM';
    iterations: number;
    rolloutDepth: number;
    ismctsSamples: number;
    explorationConstant: number;
    weights: {
      goal: number;
      ballProgress: number;
      cleanScoringLane: number;
      carrierSafety: number;
      energyDiff: number;
      control: number;
      spacing: number;
      hub: number;
    };
  };
}

export interface GameState {
  seed: number;
  rngState: number;
  config: GameConfig;
  turn: number;
  phase: GamePhase;
  toAct: Side;
  pieces: Piece[];
  ballHolderId: string | null;
  score: Record<Side, number>;
  momentum: Record<Side, number>;
  hands: Record<Side, Card[]>;
  decks: Record<Side, Card[]>;
  discardPiles: Record<Side, Card[]>;
  drawnThisTurn: Record<Side, Card | null>;
  cardPlayedThisTurn: Record<Side, boolean>;
  controlMap: number[][][];
  isRestartPhase: Record<Side, boolean>;
  plannedMoves: PlannedMove[];
  plannedThrow: PlannedThrow | null;
  plannedCards: PlannedCard[];
  aiPlannedActions: AIPlannedActionsData | null;
  temporaryState: ActiveTemporaryState;
  eventLog: GameEvent[];
  jumpBall: {
    active: boolean;
    currentIndicator: Side;
    switchIntervalMs: number;
    cycleCount: number;
    playerHeld: boolean;
    releaseMarginMs: number | null;
    wonBy: Side | null;
  };
  timer: {
    turnStartTime: number;
    remainingSeconds: number;
    isPaused: boolean;
    isExpired: boolean;
    latencies: number[];
  };
  aiStatus: {
    isThinking: boolean;
    selectedPosture: Posture | null;
    lastHumanLatencyMs?: number;
    humanUsedSeconds?: number;
    aiTargetBudgetSeconds?: number;
    maxTurnBudgetSeconds?: number;
    speedRatio?: number;
    adaptiveIterations?: number;
    adaptiveRolloutDepth?: number;
    adaptiveSamples?: number;
    adaptiveTier?: string;
    lastSearchStats?: {
      iterations: number;
      nodesEvaluated: number;
      bestScore: number;
      candidateCount?: number;
      bestActionDescription?: string;
      stage0Card: string | null;
      stage2Card: string | null;
      timeMs: number;
    };
  };
  matchResult: {
    winner: Side | null;
    isOver: boolean;
    reason: string | null;
    aptitudeReport: AptitudeReport | null;
  };
}

export type GameAction =
  | { type: 'INIT_MATCH'; seed?: number; configOverrides?: Partial<GameConfig> }
  | { type: 'JUMP_BALL_TICK'; indicator: Side }
  | { type: 'JUMP_BALL_PRESS' }
  | { type: 'JUMP_BALL_RELEASE'; releaseMarginMs: number; wonBy: Side }
  | { type: 'CHOOSE_RESTART_THROWER'; pieceId: string }
  | { type: 'STAGE_MOVE'; pieceId: string; destCell: Cell }
  | { type: 'MOVE_PIECE_DIRECT'; pieceId: string; destCell: Cell }
  | { type: 'UNSTAGE_MOVE'; pieceId: string }
  | { type: 'CLEAR_PLANNED_MOVES' }
  | { type: 'STAGE_THROW'; targetPieceId: string; targetCell: Cell; throwType?: ThrowType }
  | { type: 'UNSTAGE_THROW' }
  | { type: 'STAGE_CARD'; cardId: string; targetPieceId?: string; targetCell?: Cell; secondaryPieceId?: string }
  | { type: 'UNSTAGE_CARD'; cardId: string }
  | { type: 'CLEAR_PLANNED_CARDS' }
  | { type: 'EXECUTE_PLAYER_MOVES' }
  | { type: 'THROW_BALL'; targetCell: Cell; throwType?: ThrowType }
  | { type: 'PLAY_CARD'; cardId: string; targetPieceId?: string; targetCell?: Cell; secondaryPieceId?: string }
  | { type: 'DISCARD_CARD'; cardId: string }
  | { type: 'START_PLAYER_TURN' }
  | { type: 'END_PLAYER_TURN' }
  | { type: 'RUN_AI_TURN' }
  | { type: 'RUN_AI_TURN_FOR_PLAYER' }
  | { type: 'TIMER_TICK'; secondsElapsed: number }
  | { type: 'CONCEDE_OR_END' }
  | { type: 'REPLAY_MATCH'; seed: number; events: GameEvent[] };
