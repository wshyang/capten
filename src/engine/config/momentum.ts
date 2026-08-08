export const MOMENTUM_CONFIG = {
  startMomentum: 2,
  regenPerTurn: 1,
  maxMomentum: 6,
  handLimit: 3,
  
  // Momentum earning triggers
  cleanAssistEarn: 2,
  interceptionBaseEarn: 2,
  interceptionRestStreakMultiplier: 0.5,
  interceptionEarnCap: 4,
};

export function calculateInterceptionMomentumEarn(restStreak: number): number {
  const bonus = restStreak * MOMENTUM_CONFIG.interceptionRestStreakMultiplier;
  return Math.min(MOMENTUM_CONFIG.interceptionEarnCap, MOMENTUM_CONFIG.interceptionBaseEarn + bonus);
}
