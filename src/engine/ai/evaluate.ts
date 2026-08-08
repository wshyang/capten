import type { GameState } from '../types';
import { MCTS_EVALUATION_WEIGHTS } from '../config/mcts';
import { computeControlMap, getControlAt } from '../control';
import { BOARD_CONFIG, areCellsEqual } from '../config/board';
import { previewThrow, getThrowPathCells } from '../interception';

/**
 * Patch v3.1 §E Dense Evaluation Function
 * Enforces dynamic passing: holding the ball without advancing is strictly discouraged.
 * Dominating terminal goal reward (+1000) and dense ball-progress gradient (x40) drive the AI to attack.
 * Defensively, evaluates human goal threats at full terminal goal gravity (-1000.0) to aggressively deny wins.
 */
export function evaluateState(state: GameState): number {
  const weights = state.config.mcts.weights || MCTS_EVALUATION_WEIGHTS;
  let totalScore = 0;

  // 1. Dominating Terminal Goal Term (+1000 / -1000)
  const scoreDiff = state.score.AI - state.score.PLAYER;
  totalScore += scoreDiff * weights.goal;

  const aiPieces = state.pieces.filter(p => p.side === 'AI');
  const playerPieces = state.pieces.filter(p => p.side === 'PLAYER');
  const aiCaptain = aiPieces.find(p => p.isCaptain) || { cell: BOARD_CONFIG.aiScoringCell };
  const playerCaptain = playerPieces.find(p => p.isCaptain) || { cell: BOARD_CONFIG.playerScoringCell };

  const aiCarrier = aiPieces.find(p => p.hasBall);
  const playerCarrier = playerPieces.find(p => p.hasBall);

  const controlMap = computeControlMap(state.pieces, state.temporaryState);

  // 2. Ball-progress gradient: -(distance from ball to own Captain's cell) x 40
  // AI attacks toward row 0 (AI_SCORING_CELL at 5,0)
  // Player attacks toward row 10 (PLAYER_SCORING_CELL at 5,10)
  if (aiCarrier) {
    const distToAICaptain = Math.hypot(
      aiCarrier.cell.col - aiCaptain.cell.col,
      aiCarrier.cell.row - aiCaptain.cell.row
    );
    // As distToAICaptain decreases, reward increases steeply!
    totalScore += (11.0 - distToAICaptain) * weights.ballProgress;

    // 3. Clean scoring-lane bonus (x25): check if carrier has an open pass to Captain or advanced teammate
    const throwToCaptainPreview = previewThrow(
      aiCarrier,
      aiCaptain.cell,
      state.pieces,
      controlMap,
      state.temporaryState,
      undefined,
      !!state.isRestartPhase?.AI
    );
    if (throwToCaptainPreview.isClean && !state.isRestartPhase?.AI) {
      totalScore += weights.cleanScoringLane * 2.0;
    } else if (!state.isRestartPhase?.AI) {
      totalScore += (1.0 - throwToCaptainPreview.cumulativeCaptureRisk) * weights.cleanScoringLane;
    }

    // 4. Carrier safety (x10)
    totalScore += (aiCarrier.energy / 10.0) * weights.carrierSafety;

    // 5. Attacking Perimeter Sweet Spot (rows 2-4) & Baseline Flank (rows 0-1) Scoring Engine:
    // Rows 2 and 3 are the peak assist shooting perimeter (~3.0 - 4.5 cells from Captain at 5,0).
    // If rows 2-4 are occupied/crowded, runners can naturally sneak into rows 0-1 on the flank for a baseline assist.
    let attackingFormationScore = 0;
    for (const p of aiPieces) {
      if (p.isCaptain || p.isBlocker) continue;
      const r = p.cell.row;
      if (r === 2 || r === 3) {
        attackingFormationScore += 35.0; // Peak assist shooting pocket
      } else if (r === 4 || r === 1) {
        attackingFormationScore += 25.0; // Strong attacking half / perimeter wing
      } else if (r === 0) {
        attackingFormationScore += 20.0; // Baseline flank sneak option
      }
    }
    totalScore += attackingFormationScore;

    // Carrier assist-readiness bonus:
    if (aiCarrier.cell.row === 2 || aiCarrier.cell.row === 3) {
      totalScore += 40.0; // Peak assist shooting stance directly into Captain
    } else if (aiCarrier.cell.row === 1 || aiCarrier.cell.row === 4) {
      totalScore += 25.0;
    } else if (aiCarrier.cell.row === 0) {
      totalScore += 20.0; // Goal line assist stance
    }

    // Holding the ball far back without advancing (stagnation in own back half) is penalized
    if (aiCarrier.cell.row >= 6 && !aiCarrier.isCaptain) {
      totalScore -= 25.0; // Stagnation penalty to force breaking formation and driving forward
    }

    // High Hazard Penalty for Passing to Bouncer / Holding Ball Near Opponent Captain:
    // ai_blocker is at (5, 9) in opponent territory right in front of player captain at (5, 10).
    // If the bouncer gets the ball, any turnover, fumble, or interception grants the player an immediate goal!
    const distToPlayerCaptain = Math.hypot(
      aiCarrier.cell.col - playerCaptain.cell.col,
      aiCarrier.cell.row - playerCaptain.cell.row
    );
    if (aiCarrier.isBlocker || aiCarrier.id === 'ai_blocker' || distToPlayerCaptain <= 2.0) {
      totalScore -= 300.0; // Severe risk penalty: ball is in opponent's goal mouth!
    }
  } else if (playerCarrier) {
    const distToPlayerCaptain = Math.hypot(
      playerCarrier.cell.col - playerCaptain.cell.col,
      playerCarrier.cell.row - playerCaptain.cell.row
    );
    totalScore -= (11.0 - distToPlayerCaptain) * weights.ballProgress;

    const playerThrowPreview = previewThrow(
      playerCarrier,
      playerCaptain.cell,
      state.pieces,
      controlMap,
      state.temporaryState,
      undefined,
      !!state.isRestartPhase?.PLAYER
    );

    // CRITICAL DEFENSIVE AWARENESS:
    // When the human player has the ball with a direct scoring pass to Captain,
    // penalize the state at full goal gravity (-1000.0) scaled by scoring probability!
    if (!state.isRestartPhase?.PLAYER) {
      if (playerThrowPreview.isClean) {
        totalScore -= weights.goal * 0.95; // Massive -950 penalty for leaving player with a clean open shot!
      } else {
        const scoreProbability = Math.max(0, 1.0 - playerThrowPreview.cumulativeCaptureRisk);
        totalScore -= scoreProbability * weights.goal * 0.85; // Danger penalty proportional to unintercepted flight
      }
    }

    totalScore -= (playerCarrier.energy / 10.0) * weights.carrierSafety;

    // Reward AI defenders that are directly interposing on the passing ray between player carrier and Captain
    const passRay = getThrowPathCells(playerCarrier.cell, playerCaptain.cell);
    let defObstructControl = 0;
    for (const rayCell of passRay) {
      const aiCtrl = getControlAt(controlMap, rayCell, 'AI');
      if (aiCtrl > 0) {
        defObstructControl += aiCtrl;
      }
    }
    totalScore += defObstructControl * 15.0; // Reward stacking control directly in the player's scoring corridor
  }

  // 6. Energy differential (x3)
  const aiTotalEnergy = aiPieces.reduce((sum, p) => sum + p.energy, 0);
  const playerTotalEnergy = playerPieces.reduce((sum, p) => sum + p.energy, 0);
  totalScore += (aiTotalEnergy - playerTotalEnergy) * weights.energyDiff;

  // 7. Area-of-control coverage of key scoring lanes (x5)
  let aiLaneControl = 0;
  let playerLaneControl = 0;
  for (let c = 3; c <= 7; c++) {
    for (let r = 1; r <= 9; r++) {
      aiLaneControl += getControlAt(controlMap, { col: c, row: r }, 'AI');
      playerLaneControl += getControlAt(controlMap, { col: c, row: r }, 'PLAYER');
    }
  }
  totalScore += (aiLaneControl - playerLaneControl) * weights.control;

  // 8. Spacing dispersion among mobile teammates (x2)
  let aiSpacing = 0;
  const aiMobile = aiPieces.filter(p => !p.isCaptain);
  for (let i = 0; i < aiMobile.length; i++) {
    for (let j = i + 1; j < aiMobile.length; j++) {
      aiSpacing += Math.hypot(
        aiMobile[i].cell.col - aiMobile[j].cell.col,
        aiMobile[i].cell.row - aiMobile[j].cell.row
      );
    }
  }
  totalScore += (aiSpacing / 3.0) * weights.spacing;

  // 9. Hub / rest-streak compounding on NON-CARRIER pieces (x2)
  const aiRestSum = aiPieces.filter(p => !p.hasBall).reduce((sum, p) => sum + (p.movedLastTurn ? 0 : p.restStreak), 0);
  const playerRestSum = playerPieces.filter(p => !p.hasBall).reduce((sum, p) => sum + (p.movedLastTurn ? 0 : p.restStreak), 0);
  totalScore += (aiRestSum - playerRestSum) * weights.hub;

  // 10. Heuristic Branch Stagnation & Initial Formation Failure Check:
  // If at the end of the search depth, >40% of AI pieces still occupy their initial position
  // AND the number of AI pieces in the ENEMY half of the board (rows <= 4) never changed/increased,
  // the branch is considered to be failed.
  const initialPositions = BOARD_CONFIG.aiPiecesStart;
  const sameInitialCount = aiPieces.filter(p => {
    const init = initialPositions.find(x => x.id === p.id);
    return init && areCellsEqual(init.cell, p.cell);
  }).length;
  const pctInInitial = sameInitialCount / (aiPieces.length || 7);
  const enemyHalfCount = aiPieces.filter(p => p.cell.row <= 4).length;
  const initialEnemyHalfCount = initialPositions.filter(p => p.cell.row <= 4).length;

  if (pctInInitial > 0.40 && enemyHalfCount <= initialEnemyHalfCount && !state.matchResult.isOver) {
    totalScore -= 500.0; // Branch considered failed due to lack of enemy territory penetration
  }

  return totalScore;
}