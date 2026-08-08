import React from 'react';

interface ControlShadingProps {
  controlMap: number[][][]; // [col][row][0=PLAYER, 1=AI]
  cols?: number;
  rows?: number;
}

export const ControlShading: React.FC<ControlShadingProps> = ({
  controlMap,
  cols = 11,
  rows = 11,
}) => {
  return (
    <div
      data-testid="control-shading-layer"
      className="absolute inset-0 pointer-events-none grid z-10"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const playerFactor = controlMap[c]?.[r]?.[0] || 0;
          const aiFactor = controlMap[c]?.[r]?.[1] || 0;

          if (playerFactor === 0 && aiFactor === 0) {
            return <div key={`${c}-${r}`} className="w-full h-full" />;
          }

          const isContested = playerFactor > 0 && aiFactor > 0;
          const playerOpacity = Math.min(0.65, playerFactor * 0.32);
          const aiOpacity = Math.min(0.65, aiFactor * 0.32);

          return (
            <div
              key={`${c}-${r}`}
              className="w-full h-full relative overflow-hidden transition-all duration-300"
            >
              {/* Hand-drawn Watercolor Player AoC Wash (Nautical Blue) */}
              {playerFactor > 0 && (
                <div
                  className="absolute inset-0.5 rounded-full transition-opacity duration-300"
                  style={{
                    backgroundColor: `rgba(37, 99, 235, ${playerOpacity})`,
                    boxShadow: playerFactor >= 1.0 ? 'inset 0 0 14px rgba(30, 64, 175, 0.45)' : undefined,
                    filter: 'blur(1px)',
                  }}
                />
              )}

              {/* Hand-drawn Watercolor AI AoC Wash (Pirate Crimson) */}
              {aiFactor > 0 && (
                <div
                  className="absolute inset-0.5 rounded-full transition-opacity duration-300"
                  style={{
                    backgroundColor: `rgba(220, 38, 38, ${aiOpacity})`,
                    boxShadow: aiFactor >= 1.0 ? 'inset 0 0 14px rgba(153, 27, 27, 0.45)' : undefined,
                    filter: 'blur(1px)',
                  }}
                />
              )}

              {/* Contested Zone Sketched Cross-hatch */}
              {isContested && (
                <div
                  className="absolute inset-0 border-2 border-dashed border-purple-800/40 rounded-sm"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(147, 51, 234, 0.2), rgba(147, 51, 234, 0.2) 4px, transparent 4px, transparent 8px)',
                  }}
                />
              )}

              {/* Hand-inked parchment AoC factor readout */}
              {(playerFactor >= 1.0 || aiFactor >= 1.0) && (
                <div className="absolute bottom-0.5 right-0.5 text-[8px] font-mono font-bold leading-none select-none bg-amber-100/90 text-amber-950 px-1 py-0.5 rounded border border-amber-800/40 shadow-sm">
                  {playerFactor > 0 && <span className="text-blue-800 font-extrabold">{playerFactor.toFixed(1)}P </span>}
                  {aiFactor > 0 && <span className="text-red-800 font-extrabold">{aiFactor.toFixed(1)}A</span>}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
