// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfigTuner } from '../../src/ui/ConfigTuner';
import { DEFAULT_CONFIG } from '../../src/engine/setup';

describe('jsdom: <ConfigTuner /> Component', () => {
  it('should render AI engine selection modes when open', () => {
    render(
      <ConfigTuner
        config={DEFAULT_CONFIG}
        isOpen={true}
        onClose={vi.fn()}
        onApplyConfig={vi.fn()}
      />
    );

    expect(screen.getByText('NN_ACTIVE (ResNet CNN)')).toBeDefined();
    expect(screen.getByText('EPSILON GREEDY NN (75%)')).toBeDefined();
    expect(screen.getByText('MCTS_ONLY (Tree Search)')).toBeDefined();
  });

  it('should allow changing AI engine mode and applying config', () => {
    const onApplyConfig = vi.fn();
    const onClose = vi.fn();

    render(
      <ConfigTuner
        config={DEFAULT_CONFIG}
        isOpen={true}
        onClose={onClose}
        onApplyConfig={onApplyConfig}
      />
    );

    // Click on NN_ACTIVE
    const nnActiveCard = screen.getByText('NN_ACTIVE (ResNet CNN)');
    fireEvent.click(nnActiveCard);

    // Click Apply Config to Match
    const applyBtn = screen.getByText('Apply Config to Match');
    fireEvent.click(applyBtn);

    expect(onApplyConfig).toHaveBeenCalledTimes(1);
    const appliedConfig = onApplyConfig.mock.calls[0][0];
    expect(appliedConfig.ai.aiEngineMode).toBe('NN_ACTIVE');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should render epsilon exploitation rate slider when Epsilon Greedy mode is selected', () => {
    render(
      <ConfigTuner
        config={DEFAULT_CONFIG}
        isOpen={true}
        onClose={vi.fn()}
        onApplyConfig={vi.fn()}
      />
    );

    // By default DEFAULT_CONFIG has EPSILON_GREEDY_NN
    expect(screen.getByText(/Epsilon Exploitation Rate/)).toBeDefined();
    expect(screen.getByText('75% (Default)')).toBeDefined();
  });

  it('should render 64-LAYER RESNET default model size and allow switching to 32-LAYER RESNET', () => {
    const onApplyConfig = vi.fn();
    render(
      <ConfigTuner
        config={DEFAULT_CONFIG}
        isOpen={true}
        onClose={vi.fn()}
        onApplyConfig={onApplyConfig}
      />
    );

    expect(screen.getByText('64-LAYER RESNET (DEFAULT)')).toBeDefined();
    expect(screen.getByText('32-LAYER RESNET (LEGACY)')).toBeDefined();

    const legacyCard = screen.getByText('32-LAYER RESNET (LEGACY)');
    fireEvent.click(legacyCard);

    const applyBtn = screen.getByText('Apply Config to Match');
    fireEvent.click(applyBtn);

    expect(onApplyConfig).toHaveBeenCalledTimes(1);
    expect(onApplyConfig.mock.calls[0][0].ai.nnModelSize).toBe('32');
  });
});
