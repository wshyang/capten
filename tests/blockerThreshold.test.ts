/**
 * Blocker Bonus Threshold Analysis
 * 
 * Tests different blocker bonus multipliers to find the threshold
 * where direct throws become viable again
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { analyzeMCTSFromStartingPosition } from '../src/engine/ai/mctsAnalysis';
import { BALANCED_CONFIG_V1_V7 } from '../src/engine/balanceVariations';

describe('Blocker Bonus Threshold Analysis', () => {
  it('should find the threshold where direct throws become viable', () => {
    let state = createInitialState(42);
    state = gameReducer(state, {
      type: 'JUMP_BALL_RELEASE',
      wonBy: 'AI',
      releaseMarginMs: 100,
    });

    console.log('\n=== Blocker Bonus Threshold Analysis ===\n');
    console.log('Testing blocker bonus multipliers from 0.0 to 1.0\n');
    console.log('Multiplier | Direct Throw in Top 5? | Top Action | Dominance Ratio');
    console.log('-----------|--------------------------|------------|----------------');

    const multipliers = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const results: any[] = [];

    multipliers.forEach(multiplier => {
      const config = {
        ...BALANCED_CONFIG_V1_V7,
        blockerDefensiveBonusMultiplier: multiplier,
      };

      console.log(`\nTesting multiplier: ${multiplier.toFixed(1)}...`);
      const startTime = Date.now();
      const mctsResults = analyzeMCTSFromStartingPosition(state, 42, config);
      const duration = Date.now() - startTime;

      console.log(`  Analysis completed in ${duration}ms`);

      // Check if direct throw to captain is in top 5
      const top5 = mctsResults.slice(0, 5);
      const directThrow = top5.find(r => 
        r.action.description && 
        r.action.description.includes('Direct Throw to Captain')
      );

      const hasDirectThrow = !!directThrow;
      const topAction = mctsResults[0]?.action.description || 'None';
      const topActionShort = topAction.substring(0, 40);
      
      let dominanceRatio = 'N/A';
      if (mctsResults.length >= 2 && mctsResults[1].backpropagationValue > 0) {
        const ratio = mctsResults[0].backpropagationValue / mctsResults[1].backpropagationValue;
        dominanceRatio = ratio.toFixed(2) + 'x';
      }

      console.log(`  Direct throw in top 5: ${hasDirectThrow ? 'YES ✓' : 'NO'}`);
      console.log(`  Top action: ${topActionShort}`);
      console.log(`  Dominance ratio: ${dominanceRatio}`);

      results.push({
        multiplier,
        hasDirectThrow,
        topAction: topActionShort,
        dominanceRatio,
        directThrowRank: directThrow ? top5.indexOf(directThrow) + 1 : null,
        directThrowBackprop: directThrow?.backpropagationValue || 0,
        topBackprop: mctsResults[0]?.backpropagationValue || 0,
      });

      console.log(
        `${multiplier.toFixed(1).padStart(10)} | ` +
        `${(hasDirectThrow ? 'YES ✓' : 'NO').padStart(24)} | ` +
        `${topActionShort.padStart(40)} | ` +
        `${dominanceRatio.padStart(16)}`
      );
    });

    console.log('\n=== Threshold Analysis ===\n');

    // Find the threshold where direct throws start appearing
    const thresholdResult = results.find(r => r.hasDirectThrow);
    
    if (thresholdResult) {
      console.log(`✓ Direct throws become viable at multiplier: ${thresholdResult.multiplier.toFixed(1)}`);
      console.log(`  Direct throw rank: #${thresholdResult.directThrowRank}`);
      console.log(`  Direct throw backprop: ${thresholdResult.directThrowBackprop.toFixed(2)}`);
      console.log(`  Top action backprop: ${thresholdResult.topBackprop.toFixed(2)}`);
      
      if (thresholdResult.directThrowRank && thresholdResult.directThrowRank <= 3) {
        console.log(`  ⚠️  Direct throw is in top 3 - might be too strong`);
      } else {
        console.log(`  ✓ Direct throw is viable but not dominant`);
      }
    } else {
      console.log('✗ Direct throws never become viable (even at 1.0 multiplier)');
      console.log('  This suggests blockers are still too strong or other factors prevent direct throws');
    }

    // Find the sweet spot
    console.log('\n=== Sweet Spot Analysis ===\n');
    
    const sweetSpotResults = results.filter(r => {
      // Sweet spot: direct throw is viable (in top 5) but not dominant (rank 4-5)
      return r.hasDirectThrow && r.directThrowRank && r.directThrowRank >= 4;
    });

    if (sweetSpotResults.length > 0) {
      console.log('Sweet spot multipliers (direct throw viable but not dominant):');
      sweetSpotResults.forEach(r => {
        console.log(`  ${r.multiplier.toFixed(1)}: Direct throw at rank #${r.directThrowRank}`);
      });
      
      const bestSweetSpot = sweetSpotResults[0];
      console.log(`\n✓ Recommended multiplier: ${bestSweetSpot.multiplier.toFixed(1)}`);
      console.log(`  Direct throw rank: #${bestSweetSpot.directThrowRank}`);
      console.log(`  This provides good balance between strategies`);
    } else {
      console.log('No clear sweet spot found');
      console.log('Direct throws are either:');
      console.log('  - Not viable (multiplier too high)');
      console.log('  - Too dominant (multiplier too low)');
    }

    console.log('\n=== Recommendation ===\n');
    
    if (thresholdResult) {
      if (thresholdResult.multiplier <= 0.3) {
        console.log(`⚠️  Threshold is very low (${thresholdResult.multiplier.toFixed(1)})`);
        console.log('  This suggests blockers have too much impact even with reduction');
        console.log('  Consider additional balance changes');
      } else if (thresholdResult.multiplier >= 0.7) {
        console.log(`✓ Threshold is reasonable (${thresholdResult.multiplier.toFixed(1)})`);
        console.log('  Blocker reduction is working well');
      } else {
        console.log(`✓ Threshold is moderate (${thresholdResult.multiplier.toFixed(1)})`);
        console.log('  Current 0.5 multiplier is in a good range');
      }
    }

    console.log('\n✓ Threshold analysis complete\n');

    // Verify we got results
    expect(results.length).toBe(multipliers.length);
  });

  it('should analyze detailed impact at key multipliers', () => {
    let state = createInitialState(42);
    state = gameReducer(state, {
      type: 'JUMP_BALL_RELEASE',
      wonBy: 'AI',
      releaseMarginMs: 100,
    });

    const keyMultipliers = [0.0, 0.3, 0.5, 0.7, 1.0];

    console.log('\n=== Detailed Analysis at Key Multipliers ===\n');

    keyMultipliers.forEach(multiplier => {
      const config = {
        ...BALANCED_CONFIG_V1_V7,
        blockerDefensiveBonusMultiplier: multiplier,
      };

      console.log(`\n--- Multiplier: ${multiplier.toFixed(1)} ---\n`);

      const mctsResults = analyzeMCTSFromStartingPosition(state, 42, config);

      console.log('Top 5 actions:');
      mctsResults.slice(0, 5).forEach((result, index) => {
        const actionDesc = result.action.description || 'Unnamed action';
        const isDirectThrow = actionDesc.includes('Direct Throw to Captain');
        const marker = isDirectThrow ? ' [DIRECT THROW]' : '';
        console.log(`  ${index + 1}. ${actionDesc.substring(0, 50)}${marker}`);
        console.log(`     Backprop: ${result.backpropagationValue.toFixed(2)}, Visits: ${result.visits}`);
      });

      // Check for direct throw
      const directThrow = mctsResults.find(r => 
        r.action.description && 
        r.action.description.includes('Direct Throw to Captain')
      );

      if (directThrow) {
        const rank = mctsResults.indexOf(directThrow) + 1;
        console.log(`\n  Direct throw found at rank #${rank}`);
        console.log(`  Backprop: ${directThrow.backpropagationValue.toFixed(2)}`);
        console.log(`  Visits: ${directThrow.visits}`);
      } else {
        console.log('\n  Direct throw NOT in results');
      }
    });

    console.log('\n✓ Detailed analysis complete\n');
  });
});
