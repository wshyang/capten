import type { GameState, Card, Cell, Side } from '../types';
import { STAGE_0_MOVE_ENABLER_CARDS, STAGE_2_TACTICAL_CARDS } from '../config/cards';

export interface CardDecision {
  card: Card | null;
  targetPieceId?: string;
  targetCell?: Cell;
  secondaryPieceId?: string;
  evaluatedDelta: number;
}

export function evaluateStage0Cards(state: GameState, actingSide: Side = 'AI'): CardDecision {
  const ourHand = state.hands[actingSide];
  const ourMomentum = state.momentum[actingSide];

  const enablers = ourHand.filter(
    c => STAGE_0_MOVE_ENABLER_CARDS.includes(c.id) && c.momentumCost <= ourMomentum
  );

  if (enablers.length === 0) {
    return { card: null, evaluatedDelta: 0 };
  }

  const ourPieces = state.pieces.filter(p => p.side === actingSide);
  const ourCarrier = ourPieces.find(p => p.hasBall);

  const overclock = enablers.find(c => c.id === 'overclock');
  if (overclock && ourCarrier && ourCarrier.energy >= 2.0) {
    return { card: overclock, targetPieceId: ourCarrier.id, evaluatedDelta: 45.0 };
  }

  const setThePlay = enablers.find(c => c.id === 'set_the_play');
  if (setThePlay && ourPieces.some(p => p.energy < 4.0)) {
    return { card: setThePlay, evaluatedDelta: 35.0 };
  }

  const surge = enablers.find(c => c.id === 'surge');
  if (surge && ourPieces.every(p => p.energy >= 3.0)) {
    return { card: surge, evaluatedDelta: 50.0 };
  }

  return { card: null, evaluatedDelta: 0 };
}

export function evaluateStage2Cards(state: GameState, actingSide: Side = 'AI'): CardDecision {
  const ourHand = state.hands[actingSide];
  const ourMomentum = state.momentum[actingSide];

  const tacticalCards = ourHand.filter(
    c => STAGE_2_TACTICAL_CARDS.includes(c.id) && c.momentumCost <= ourMomentum
  );

  if (tacticalCards.length === 0) {
    return { card: null, evaluatedDelta: 0 };
  }

  const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
  const ourPieces = state.pieces.filter(p => p.side === actingSide);
  const enemyPieces = state.pieces.filter(p => p.side === enemySide);
  const enemyCarrier = enemyPieces.find(p => p.hasBall);
  const ourCarrier = ourPieces.find(p => p.hasBall);

  let bestDecision: CardDecision = { card: null, evaluatedDelta: 0 };

  for (const card of tacticalCards) {
    let delta = 0;
    let targetPieceId: string | undefined;
    let targetCell: Cell | undefined;

    switch (card.effect) {
      case 'threaded_pass':
        if (ourCarrier) {
          delta = 55.0; // High value to break surrounds and bypass enemy control
        }
        break;

      case 'no_look_pass':
        if (ourCarrier && ourCarrier.energy >= 3.0) {
          delta = 65.0; // Uninterceptable escape strike
        }
        break;

      case 'steady_hands':
        if (ourCarrier) {
          delta = 42.0; // +50% interception defense
        }
        break;

      case 'insurance':
        if (ourCarrier) {
          delta = 38.0; // Safe throw protection
        }
        break;

      case 'drain':
        if (enemyCarrier) {
          delta = 30.0 + (enemyCarrier.energy * 2);
          targetPieceId = enemyCarrier.id;
        }
        break;

      case 'clamp':
        if (enemyPieces.length > 0) {
          const highestEnergyEnemy = [...enemyPieces].sort((a, b) => b.energy - a.energy)[0];
          delta = 35.0;
          targetPieceId = highestEnergyEnemy.id;
        }
        break;

      case 'screen':
        if (ourPieces.length > 0) {
          const courtPiece = ourPieces.find(p => !p.isCaptain) || ourPieces[0];
          delta = 32.0;
          targetPieceId = courtPiece.id;
        }
        break;

      case 'jam_the_lane':
        if (enemyCarrier) {
          const enemyCaptain = enemyPieces.find(p => p.isCaptain);
          if (enemyCaptain) {
            targetCell = {
              col: Math.round((enemyCarrier.cell.col + enemyCaptain.cell.col) / 2),
              row: Math.round((enemyCarrier.cell.row + enemyCaptain.cell.row) / 2),
            };
            delta = 38.0;
          }
        }
        break;

      case 'deep_breath': {
        const restingPiece = ourPieces.find(p => !p.movedLastTurn);
        if (restingPiece) {
          delta = 20.0 + restingPiece.restStreak * 4;
          targetPieceId = restingPiece.id;
        }
        break;
      }

      case 'second_wind': {
        const lowEnergyPiece = [...ourPieces].sort((a, b) => a.energy - b.energy)[0];
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
        if (ourPieces.length > 0) {
          const courtPiece = ourPieces.find(p => !p.isCaptain) || ourPieces[0];
          delta = 28.0;
          targetPieceId = courtPiece.id;
        }
        break;

      case 'anchor':
        if (ourPieces.length > 0) {
          const keyPiece = ourCarrier || ourPieces.find(p => !p.isCaptain) || ourPieces[0];
          delta = 26.0;
          targetPieceId = keyPiece.id;
        }
        break;

      case 'give_and_go':
        if (ourCarrier) {
          delta = 36.0;
          targetPieceId = ourCarrier.id;
        }
        break;

      case 'reset': {
        const exhaustedPiece = [...ourPieces].sort((a, b) => a.energy - b.energy)[0];
        if (exhaustedPiece && exhaustedPiece.energy < 3.0) {
          delta = (10.0 - exhaustedPiece.energy) * 4.5;
          targetPieceId = exhaustedPiece.id;
        }
        break;
      }

      case 'bait':
        if (enemyPieces.length > 0) {
          const blocker = enemyPieces.find(p => p.isBlocker) || enemyPieces[0];
          targetPieceId = blocker.id;
          targetCell = { col: Math.max(0, Math.min(10, blocker.cell.col + (blocker.cell.col < 5 ? 1 : -1))), row: blocker.cell.row };
          delta = 34.0;
        }
        break;

      case 'spacing':
      case 'overlap':
        if (ourPieces.length >= 2) {
          const p1 = ourPieces.find(p => !p.isCaptain) || ourPieces[0];
          const p2 = ourPieces.find(p => p.id !== p1.id && !p.isCaptain) || ourPieces[1];
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

export function getDiscardChoice(hand: Card[], currentMomentum: number): Card {
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

// Backwards compatibility alias
export function getAIDiscardChoice(hand: Card[], currentMomentum: number): Card {
  return getDiscardChoice(hand, currentMomentum);
}
