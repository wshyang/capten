// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Hand } from '../../src/ui/Hand';
import { createInitialState } from '../../src/engine/setup';

describe('jsdom: <Hand /> Component', () => {
  it('should render cards in player hand with names and momentum costs', () => {
    const state = createInitialState(4242);
    render(
      <Hand
        state={state}
        side="PLAYER"
        onPlayCard={vi.fn()}
        onDiscardCard={vi.fn()}
      />
    );

    const hand = state.hands.PLAYER;
    expect(hand.length).toBeGreaterThan(0);

    for (const card of hand) {
      const cardEl = screen.getByTestId(`card-${card.id}`);
      expect(cardEl).toBeDefined();
      expect(screen.getByText(card.name)).toBeDefined();
    }
  });

  it('should call onPlayCard when an affordable target-free card is played', () => {
    const state = createInitialState(4242);
    // Add an affordable target-free card to hand
    state.hands.PLAYER = [
      {
        id: 'surge',
        name: 'Surge',
        dim: 'RESOURCE',
        momentumCost: 1,
        targetType: 'NONE',
        effect: 'surge',
        description: 'Gain energy',
      },
    ];
    state.momentum.PLAYER = 5;

    const onPlayCard = vi.fn();
    render(
      <Hand
        state={state}
        side="PLAYER"
        onPlayCard={onPlayCard}
        onDiscardCard={vi.fn()}
      />
    );

    const playBtn = screen.getByTestId('deploy-card-btn-surge');
    fireEvent.click(playBtn);

    expect(onPlayCard).toHaveBeenCalledTimes(1);
    expect(onPlayCard).toHaveBeenCalledWith('surge');
  });

  it('should call onDiscardCard when Discard button is clicked', () => {
    const state = createInitialState(4242);
    state.phase = 'PLAYER_PLAN';
    state.hands.PLAYER = [
      {
        id: 'timeout',
        name: 'Timeout',
        dim: 'COMPOSURE',
        momentumCost: 1,
        targetType: 'NONE',
        effect: 'timeout',
        description: 'Pause timer',
      },
    ];

    const onDiscardCard = vi.fn();
    render(
      <Hand
        state={state}
        side="PLAYER"
        onPlayCard={vi.fn()}
        onDiscardCard={onDiscardCard}
      />
    );

    const discardBtn = screen.getByTestId('discard-card-btn-timeout');
    fireEvent.click(discardBtn);

    expect(onDiscardCard).toHaveBeenCalledTimes(1);
    expect(onDiscardCard).toHaveBeenCalledWith('timeout');
  });

  it('should render hand limit badge and warning when exceeding limit', () => {
    const state = createInitialState(4242);
    // Put 5 cards in hand when limit is 3
    state.hands.PLAYER = Array.from({ length: 5 }, (_, i) => ({
      id: `card_${i}`,
      name: `Card ${i}`,
      dim: 'RESOURCE',
      momentumCost: 1,
      targetType: 'NONE',
      effect: 'surge',
      description: 'Test',
    }));

    render(
      <Hand
        state={state}
        side="PLAYER"
        onPlayCard={vi.fn()}
        onDiscardCard={vi.fn()}
      />
    );

    const badge = screen.getByTestId('hand-limit-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('Hand: 5/3');
    expect(screen.getByText(/Hand is at 5\/3/)).toBeDefined();
  });
});
