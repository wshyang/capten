import type { GameState, Card, Cell } from '../types';
import { STAGE_0_MOVE_ENABLER_CARDS, STAGE_2_TACTICAL_CARDS } from '../config/cards';

export interface CardDecision {
  card: Card | null;
  targetPieceId?: string;
  targetCell?: Cell;
  secondaryPieceId?: string;
  evaluatedDelta: number;
}

export function evaluateStage0Cards(state: GameState): CardDecision {
  const aiHand = state.hands.AI;
  const aiMomentum = state.momentum.AI;

  const enablers = aiHand.filter(
    c => STAGE_0_MOVE_ENABLER_CARDS.includes(c.id) && c.momentumCost <= aiMomentum
  );

  if (enablers.length === 0) {
    return { card: null, evaluatedDelta: 0 };
  }

  const aiPieces = state.pieces.filter(p => p.side === 'AI');
  const aiCarrier = aiPieces.find(p => p.hasBall);

  const overclock = enablers.find(c => c.id === 'overclock');
  if (overclock && aiCarrier && aiCarrier.energy >= 2.0) {
    return { card: overclock, targetPieceId: aiCarrier.id, evaluatedDelta: 45.0 };
  }

  const setThePlay = enablers.find(c => c.id === 'set_the_play');
  if (setThePlay && aiPieces.some(p => p.energy < 4.0)) {
    return { card: setThePlay, evaluatedDelta: 35.0 };
  }

  const surge = enablers.find(c => c.id === 'surge');
  if (surge && aiPieces.every(p => p.energy >= 3.0)) {
    return { card: surge, evaluatedDelta: 50.0 };
  }

  return { card: null, evaluatedDelta: 0 };
}

export function evaluateStage2Cards(state: GameState): CardDecision {
  const aiHand = state.hands.AI;
  const aiMomentum = state.momentum.AI;

  const tacticalCards = aiHand.filter(
    c => STAGE_2_TACTICAL_CARDS.includes(c.id) && c.momentumCost <= aiMomentum
  );

  if (tacticalCards.length === 0) {
    return { card: null, evaluatedDelta: 0 };
  }

  const aiPieces = state.pieces.filter(p => p.side === 'AI');
  const playerPieces = state.pieces.filter(p => p.side === 'PLAYER');
  const playerCarrier = playerPieces.find(p => p.hasBall);
  const aiCarrier = aiPieces.find(p => p.hasBall);

  let bestDecision: CardDecision = { card: null, evaluatedDelta: 0 };

  for (const card of tacticalCards) {
    let delta = 0;
    let targetPieceId: string | undefined;
    let targetCell: Cell | undefined;

    switch (card.effect) {
      case 'threaded_pass':
        if (aiCarrier) {
          delta = 55.0; // High value to break surrounds and bypass enemy control
        }
        break;

      case 'no_look_pass':
        if (aiCarrier && aiCarrier.energy >= 3.0) {
          delta = 65.0; // Uninterceptable escape strike
        }
        break;

      case 'steady_hands':
        if (aiCarrier) {
          delta = 42.0; // +50% interception defense
        }
        break;

      case 'insurance':
        if (aiCarrier) {
          delta = 38.0; // Safe throw protection
        }
        break;

      case 'drain':
        if (playerCarrier) {
          delta = 30.0 + (playerCarrier.energy * 2);
          targetPieceId = playerCarrier.id;
        }
        break;

      case 'clamp':
        if (playerPieces.length > 0) {
          const highestEnergyPlayer = [...playerPieces].sort((a, b) => b.energy - a.energy)[0];
          delta = 35.0;
          targetPieceId = highestEnergyPlayer.id;
        }
        break;

      case 'screen':
        if (aiPieces.length > 0) {
          const courtPiece = aiPieces.find(p => !p.isCaptain) || aiPieces[0];
          delta = 32.0;
          targetPieceId = courtPiece.id;
        }
        break;

      case 'jam_the_lane':
        if (playerCarrier) {
          const playerCaptain = playerPieces.find(p => p.isCaptain);
          if (playerCaptain) {
            targetCell = {
              col: Math.round((playerCarrier.cell.col + playerCaptain.cell.col) / 2),
              row: Math.round((playerCarrier.cell.row + playerCaptain.cell.row) / 2),
            };
            delta = 38.0;
          }
        }
        break;

      case 'deep_breath': {
        const restingPiece = aiPieces.find(p => !p.movedLastTurn);
        if (restingPiece) {
          delta = 20.0 + restingPiece.restStreak * 4;
          targetPieceId = restingPiece.id;
        }
        break;
      }

      case 'second_wind': {
        const lowEnergyPiece = [...aiPieces].sort((a, b) => a.energy - b.energy)[0];
        if (lowEnergyPiece && lowEnergyPiece.energy <= 6.0) {
          delta = (10.0 - lowEnergyPiece.energy) * 5;
          targetPieceId = lowEnergyPiece.id;
        }
        break;
      }

      case 'rally':
        delta = 30.0;
        break;

      case 'slow_burn':
        if (aiPieces.length > 0) {
          const courtPiece = aiPieces.find(p => !p.isCaptain) || aiPieces[0];
          delta = 28.0;
          targetPieceId = courtPiece.id;
        }
        break;

      case 'anchor':
        if (aiPieces.length > 0) {
          const keyPiece = aiCarrier || aiPieces.find(p => !p.isCaptain) || aiPieces[0];
          delta = 26.0;
          targetPieceId = keyPiece.id;
        }
        break;

      case 'give_and_go':
        if (aiCarrier) {
          delta = 36.0;
          targetPieceId = aiCarrier.id;
        }
        break;

      case 'reset': {
        const exhaustedPiece = [...aiPieces].sort((a, b) => a.energy - b.energy)[0];
        if (exhaustedPiece && exhaustedPiece.energy < 3.0) {
          delta = (10.0 - exhaustedPiece.energy) * 4.5;
          targetPieceId = exhaustedPiece.id;
        }
        break;
      }

      case 'bait':
        if (playerPieces.length > 0) {
          const blocker = playerPieces.find(p => p.isBlocker) || playerPieces[0];
          targetPieceId = blocker.id;
          targetCell = { col: Math.max(0, Math.min(10, blocker.cell.col + (blocker.cell.col < 5 ? 1 : -1))), row: blocker.cell.row };
          delta = 34.0;
        }
        break;

      case 'spacing':
      case 'overlap':
        if (aiPieces.length >= 2) {
          const p1 = aiPieces.find(p => !p.isCaptain) || aiPieces[0];
          const p2 = aiPieces.find(p => p.id !== p1.id && !p.isCaptain) || aiPieces[1];
          if (p1 && p2) {
            targetPieceId = p1.id;
            delta = 32.0;
          }
        }
        break;

      default:
        delta = 15.0;
        break;
    }

    if (delta > bestDecision.evaluatedDelta) {
      bestDecision = {
        card,
        targetPieceId,
        targetCell,
        evaluatedDelta: delta,
      };
    }
  }

  return bestDecision;
}

export function getAIDiscardChoice(hand: Card[], currentMomentum: number): Card {
  if (hand.length === 0) throw new Error('Hand is empty');
  
  const sorted = [...hand].sort((a, b) => {
    const aAffordable = a.momentumCost <= currentMomentum;
    const bAffordable = b.momentumCost <= currentMomentum;
    if (!aAffordable && bAffordable) return -1;
    if (aAffordable && !bAffordable) return 1;
    return b.momentumCost - a.momentumCost;
  });

  return sorted[0];
}
