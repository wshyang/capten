/**
 * Balance Comparison Test
 * 
 * Compares baseline game balance vs balanced configuration (Variations 1 + 7)
 * to verify that the direct throw to captain is no longer overwhelmingly dominant.
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { analyzeMCTSFromStartingPosition } from '../src/engine/ai/mctsAnalysis';
import { 
  BASELINE_CONFIG, 
  BALANCED_CONFIG_V1_V7,
  analyzeThrowDifficulty,
  type BalanceConfig
} from '../src/engine/balanceVariations';

describe('Game Balance Comparison', () => {
  it('should analyze throw difficulty for direct throw to captain', () => {
    const state = createInitialState(42);
    const afterJumpBall = gameReducer(state, {
      type: 'JUMP_BALL_RELEASE',
      winner: 'AI',
    });

    // Get AI pieces
    const aiPieces = afterJumpBall.pieces.filter(p => p.side === 'AI');
    const ballCarrier = aiPieces.find(p => p.hasBall);
    const captain = aiPieces.find(p => p.id === 0);
    const defenders = afterJumpBall.pieces.filter(p => p.side === 'PLAYER');

    expect(ballCarrier).toBeDefined();
    expect(captain).toBeDefined();

    console.log('\n=== Throw Difficulty Analysis ===\n');
    console.log(`Ball Carrier: ${ballCarrier!.id} at (${ballCarrier!.cell.col}, ${ballCarrier!.cell.row})`);
    console.log(`Captain: ${captain!.id} at (${captain!.cell.col}, ${captain!.cell.row})`);
    console.log(`Defenders: ${defenders.length} player pieces\n`);

    // Analyze with baseline config
    console.log('--- BASELINE CONFIG ---');
    const baselineAnalysis = analyzeThrowDifficulty(
      ballCarrier!.cell,
      captain!.cell,
      defenders,
      BASELINE_CONFIG
    );

    console.log(`Distance: ${baselineAnalysis.distance.toFixed(2)} cells`);
    console.log(`Energy Cost: ${baselineAnalysis.energyCost.toFixed(2)}`);
    console.log(`Distance Interception: ${(baselineAnalysis.distanceInterception * 100).toFixed(1)}%`);
    console.log(`Defensive Bonus: ${(baselineAnalysis.defensiveBonus * 100).toFixed(1)}%`);
    console.log(`Total Interception: ${(baselineAnalysis.totalInterception * 100).toFixed(1)}%`);

    // Analyze with balanced config
    console.log('\n--- BALANCED CONFIG (V1 + V7) ---');
    const balancedAnalysis = analyzeThrowDifficulty(
      ballCarrier!.cell,
      captain!.cell,
      defenders,
      BALANCED_CONFIG_V1_V7
    );

    console.log(`Distance: ${balancedAnalysis.distance.toFixed(2)} cells`);
    console.log(`Energy Cost: ${balancedAnalysis.energyCost.toFixed(2)}`);
    console.log(`Distance Interception: ${(balancedAnalysis.distanceInterception * 100).toFixed(1)}%`);
    console.log(`Defensive Bonus: ${(balancedAnalysis.defensiveBonus * 100).toFixed(1)}%`);
    console.log(`Total Interception: ${(balancedAnalysis.totalInterception * 100).toFixed(1)}%`);

    // Compare results
    console.log('\n--- COMPARISON ---');
    const costIncrease = ((balancedAnalysis.energyCost - baselineAnalysis.energyCost) / baselineAnalysis.energyCost * 100);
    const interceptIncrease = ((balancedAnalysis.totalInterception - baselineAnalysis.totalInterception) / Math.max(baselineAnalysis.totalInterception, 0.01) * 100);

    console.log(`Energy Cost Increase: ${costIncrease.toFixed(1)}%`);
    console.log(`Interception Chance Increase: ${interceptIncrease.toFixed(1)}%`);

    // Verify balanced config makes throw harder
    expect(balancedAnalysis.energyCost).toBeGreaterThan(baselineAnalysis.energyCost);
    expect(balancedAnalysis.totalInterception).toBeGreaterThanOrEqual(baselineAnalysis.totalInterception);

    console.log('\n✓ Balanced configuration successfully increases throw difficulty\n');
  });

  it('should compare MCTS analysis between baseline and balanced configs', () => {
    const state = createInitialState(42);
    const afterJumpBall = gameReducer(state, {
      type: 'JUMP_BALL_RELEASE',
      winner: 'AI',
    });

    console.log('\n=== MCTS Analysis: Baseline Configuration ===\n');
    
    // Run baseline analysis
    const baselineResults = analyzeMCTSFromStartingPosition(afterJumpBall, 42, BASELINE_CONFIG);
    
    console.log(`Total actions analyzed: ${baselineResults.length}`);
    console.log('\nTop 5 actions:');
    baselineResults.slice(0, 5).forEach((result, index) => {
      const actionDesc = result.action.throwTargetPieceId !== undefined
        ? `Throw to piece ${result.action.throwTargetPieceId}`
        : result.action.moves.length > 0
        ? `Move ${result.action.moves.length} pieces`
        : 'No action';
      
      console.log(`${index + 1}. ${actionDesc}: ${result.backpropagationValue.toFixed(2)} (${result.visits} visits)`);
    });

    // Calculate dominance ratio
    const baselineTopAction = baselineResults[0];
    const baselineSecondAction = baselineResults[1];
    const baselineDominanceRatio = baselineTopAction.backpropagationValue / baselineSecondAction.backpropagationValue;

    console.log(`\nDominance Ratio (Top / 2nd): ${baselineDominanceRatio.toFixed(2)}x`);

    console.log('\n=== MCTS Analysis: Balanced Configuration (V1 + V7) ===\n');
    
    // Run balanced analysis
    const balancedResults = analyzeMCTSFromStartingPosition(afterJumpBall, 42, BALANCED_CONFIG_V1_V7);
    
    console.log(`Total actions analyzed: ${balancedResults.length}`);
    console.log('\nTop 5 actions:');
    balancedResults.slice(0, 5).forEach((result, index) => {
      const actionDesc = result.action.throwTargetPieceId !== undefined
        ? `Throw to piece ${result.action.throwTargetPieceId}`
        : result.action.moves.length > 0
        ? `Move ${result.action.moves.length} pieces`
        : 'No action';
      
      console.log(`${index + 1}. ${actionDesc}: ${result.backpropagationValue.toFixed(2)} (${result.visits} visits)`);
    });

    // Calculate dominance ratio
    const balancedTopAction = balancedResults[0];
    const balancedSecondAction = balancedResults[1];
    const balancedDominanceRatio = balancedTopAction.backpropagationValue / balancedSecondAction.backpropagationValue;

    console.log(`\nDominance Ratio (Top / 2nd): ${balancedDominanceRatio.toFixed(2)}x`);

    // Compare results
    console.log('\n=== COMPARISON ===\n');
    console.log(`Baseline Dominance: ${baselineDominanceRatio.toFixed(2)}x`);
    console.log(`Balanced Dominance: ${balancedDominanceRatio.toFixed(2)}x`);
    console.log(`Improvement: ${((baselineDominanceRatio - balancedDominanceRatio) / baselineDominanceRatio * 100).toFixed(1)}% reduction in dominance`);

    // Verify balanced config reduces dominance
    // Note: We use a relaxed threshold because MCTS is stochastic
    // The key is that the ratio should be significantly lower than 26,000x
    expect(balancedDominanceRatio).toBeLessThan(baselineDominanceRatio * 0.5); // At least 50% reduction

    // Check if we achieved good balance (ratio < 10x is excellent, < 100x is good)
    if (balancedDominanceRatio < 10) {
      console.log('\n✓✓✓ EXCELLENT: Actions are well-balanced (ratio < 10x)');
    } else if (balancedDominanceRatio < 100) {
      console.log('\n✓✓ GOOD: Actions are reasonably balanced (ratio < 100x)');
    } else if (balancedDominanceRatio < 1000) {
      console.log('\n✓ FAIR: Top action still dominant but improved (ratio < 1000x)');
    } else {
      console.log('\n⚠ NEEDS WORK: Top action still too dominant (ratio > 1000x)');
    }

    console.log('\n✓ Balance comparison complete\n');
  });

  it('should analyze multiple throw distances', () => {
    const state = createInitialState(42);
    
    console.log('\n=== Throw Distance Analysis ===\n');
    console.log('Comparing energy costs at different distances:\n');
    console.log('Distance | Baseline Cost | Balanced Cost | Increase');
    console.log('---------|---------------|---------------|----------');

    const distances = [2, 4, 6, 8, 10];
    const from = { col: 5, row: 5 };

    distances.forEach(distance => {
      const to = { col: 5, row: 5 + distance };
      const baselineCost = calculateThrowCost(from, to, BASELINE_CONFIG);
      const balancedCost = calculateThrowCost(from, to, BALANCED_CONFIG_V1_V7);
      const increase = ((balancedCost - baselineCost) / baselineCost * 100);

      console.log(
        `${distance.toString().padStart(8)} | ` +
        `${baselineCost.toFixed(2).padStart(13)} | ` +
        `${balancedCost.toFixed(2).padStart(13)} | ` +
        `${increase.toFixed(1).padStart(7)}%`
      );
    });

    console.log('\n✓ Distance analysis complete\n');
  });
});

// Helper function for distance analysis
function calculateThrowCost(from: Cell, to: Cell, config: any): number {
  const distance = Math.hypot(to.col - from.col, to.row - from.row);
  if (config.useExponentialThrowCost) {
    return Math.pow(distance, config.throwCostExponent) / 3;
  } else {
    return distance / 3;
  }
}
