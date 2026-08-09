import { describe, it, expect } from 'vitest';
import { createInitialState } from '../setup';
import { analyzeMCTSFromStartingPosition } from '../ai/mctsAnalysis';
import { gameReducer } from '../reducer';

describe('MCTS Analysis from Starting Position', () => {
  it('should identify the action with highest backpropagation value', () => {
    // Create initial state
    let state = createInitialState(42);
    
    // Simulate jump ball won by AI (so AI has the ball)
    state = gameReducer(state, {
      type: 'JUMP_BALL_RELEASE',
      wonBy: 'AI',
      releaseMarginMs: 100,
    });

    console.log('\n=== MCTS Analysis from Starting Position ===\n');
    console.log('Game State:');
    console.log('- Phase:', state.phase);
    console.log('- Ball holder:', state.ballHolderId);
    console.log('- AI Score:', state.score.AI, '| Player Score:', state.score.PLAYER);
    console.log('- AI Momentum:', state.momentum.AI, '| Player Momentum:', state.momentum.PLAYER);
    console.log('\nAI Pieces:');
    state.pieces.filter(p => p.side === 'AI').forEach(p => {
      console.log(`  ${p.id}: (${p.cell.col},${p.cell.row}) energy=${p.energy.toFixed(1)} hasBall=${p.hasBall}`);
    });

    // Run MCTS analysis
    console.log('\nRunning MCTS analysis with 300 iterations...\n');
    const results = analyzeMCTSFromStartingPosition(state, 42);

    console.log(`Total candidate actions analyzed: ${results.length}\n`);
    console.log('Top 10 Actions by Backpropagation Value:\n');
    console.log('Rank | Action Description                                    | Visits | Total Score | Avg Score | UCB1 Score | Backprop Value');
    console.log('-----|---------------------------------------------------------|--------|-------------|-----------|------------|---------------');

    results.slice(0, 10).forEach((result, index) => {
      const rank = (index + 1).toString().padStart(4);
      const desc = (result.action.description || 'Unnamed action').substring(0, 55).padEnd(55);
      const visits = result.visits.toString().padStart(6);
      const totalScore = result.totalScore.toFixed(2).padStart(11);
      const avgScore = result.averageScore.toFixed(3).padStart(9);
      const ucb1Score = result.ucb1Score.toFixed(3).padStart(10);
      const backprop = result.backpropagationValue.toFixed(2).padStart(14);

      console.log(`${rank} | ${desc} | ${visits} | ${totalScore} | ${avgScore} | ${ucb1Score} | ${backprop}`);
    });

    // Identify the best action
    const bestAction = results[0];
    
    console.log('\n=== BEST ACTION (Highest Backpropagation) ===\n');
    console.log('Description:', bestAction.action.description);
    console.log('Moves:', bestAction.action.moves.length > 0 
      ? bestAction.action.moves.map(m => `${m.pieceId} → (${m.destCell.col},${m.destCell.row})`).join(', ')
      : 'None (stationary)');
    console.log('Throw Target:', bestAction.action.throwTargetPieceId || 'None');
    console.log('Statistics:');
    console.log(`  - Visits: ${bestAction.visits}`);
    console.log(`  - Total Backpropagated Score: ${bestAction.totalScore.toFixed(2)}`);
    console.log(`  - Average Score: ${bestAction.averageScore.toFixed(3)}`);
    console.log(`  - UCB1 Score: ${bestAction.ucb1Score.toFixed(3)}`);
    console.log(`  - Win Rate Estimate: ${(bestAction.averageScore * 100).toFixed(1)}%`);

    // Verify we got results
    expect(results.length).toBeGreaterThan(0);
    expect(bestAction.visits).toBeGreaterThan(0);
    expect(bestAction.backpropagationValue).toBeDefined();
    
    // The best action should have the highest backpropagation value
    for (let i = 1; i < results.length; i++) {
      expect(bestAction.backpropagationValue).toBeGreaterThanOrEqual(results[i].backpropagationValue);
    }

    console.log('\n=== Analysis Complete ===\n');
  });

  it('should compare top 3 actions in detail', () => {
    let state = createInitialState(42);
    state = gameReducer(state, {
      type: 'JUMP_BALL_RELEASE',
      wonBy: 'AI',
      releaseMarginMs: 100,
    });

    const results = analyzeMCTSFromStartingPosition(state, 42);
    const top3 = results.slice(0, 3);

    console.log('\n=== Detailed Comparison: Top 3 Actions ===\n');
    
    top3.forEach((result, index) => {
      console.log(`\n#${index + 1}: ${result.action.description}`);
      console.log('─'.repeat(60));
      
      if (result.action.moves.length > 0) {
        console.log('Moves:');
        result.action.moves.forEach(m => {
          console.log(`  • ${m.pieceId}: (${m.destCell.col}, ${m.destCell.row}) [cost: ${m.cost.toFixed(2)}]`);
        });
      } else {
        console.log('Moves: None (hold position)');
      }
      
      if (result.action.throwTargetPieceId) {
        console.log(`Throw: Pass to ${result.action.throwTargetPieceId}`);
      } else {
        console.log('Throw: None');
      }
      
      console.log('\nPerformance Metrics:');
      console.log(`  Visits:              ${result.visits}`);
      console.log(`  Total Score:         ${result.totalScore.toFixed(2)}`);
      console.log(`  Average Score:       ${result.averageScore.toFixed(4)}`);
      console.log(`  UCB1 Score:          ${result.ucb1Score.toFixed(4)}`);
      console.log(`  Backprop Value:      ${result.backpropagationValue.toFixed(2)}`);
      console.log(`  Estimated Win Rate:  ${(result.averageScore * 100).toFixed(2)}%`);
    });

    // Calculate gaps
    if (top3.length >= 2) {
      const gap1to2 = top3[0].backpropagationValue - top3[1].backpropagationValue;
      console.log(`\nGap between #1 and #2: ${gap1to2.toFixed(2)} backprop points`);
    }
    if (top3.length >= 3) {
      const gap2to3 = top3[1].backpropagationValue - top3[2].backpropagationValue;
      console.log(`Gap between #2 and #3: ${gap2to3.toFixed(2)} backprop points`);
    }

    expect(top3.length).toBe(3);
  });
});
