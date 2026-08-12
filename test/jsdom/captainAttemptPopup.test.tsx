// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from '../../src/App';

describe('jsdom: <App /> & Captain Attempt Popup Modal', () => {
  it('should render main app header, scoreboard, and controls in jsdom', () => {
    render(<App />);

    expect(screen.getByText(/THE CAPTAIN'S COMBINE/)).toBeDefined();
    expect(screen.getByTestId('header-score-player')).toBeDefined();
    expect(screen.getByTestId('header-score-ai')).toBeDefined();
    expect(screen.getByTestId('btn-tutorial')).toBeDefined();
    expect(screen.getByTestId('btn-config')).toBeDefined();
  });

  it('should open Config Tuner modal when Config button is clicked', () => {
    render(<App />);

    const configBtn = screen.getByTestId('btn-config');
    fireEvent.click(configBtn);

    expect(screen.getByText('ENGINE & AI CONFIG TUNER (v3.2)')).toBeDefined();
  });

  it('should open Tutorial Academy overlay when Tutorial button is clicked', () => {
    render(<App />);

    const tutorialBtn = screen.getByTestId('btn-tutorial');
    fireEvent.click(tutorialBtn);

    expect(screen.getByTestId('tutorial-step-overlay')).toBeDefined();
  });

  it('should open Primer and Rulebook modal when Help button is clicked', () => {
    render(<App />);

    const helpBtn = screen.getByTestId('btn-help');
    fireEvent.click(helpBtn);

    expect(screen.getByText(/Tactical Tabletop Guide/)).toBeDefined();
  });

  it('should complete jump ball and enter player turn', async () => {
    render(<App />);

    const releaseBtn = screen.getByText(/RELEASE NOW ON BLUE PULSE!|HOLD & RELEASE TO STRIKE/i);
    fireEvent.pointerDown(releaseBtn);
    fireEvent.pointerUp(releaseBtn);

    // After pointerUp, JumpBall completes and displays result banner
    expect(screen.getByText(/OPENING POSSESSION!|SECURED BALL/i)).toBeDefined();
  });
});
