import React from 'react';
import { WoodenStoolIllustration, CaptainBallIllustration } from './HandDrawnIllustrations';

/**
 * Expressive Cartoon Hand-Drawn Character Avatars matching the image reference:
 * Red team vs Blue team, dynamic athletic poses (reaching, passing, lunging).
 * Uniform, generic player designs with no legacy position letters on jerseys.
 */

interface CharacterProps {
  hasBall?: boolean;
  isCaptain?: boolean;
  energy?: number;
  jerseyNumber?: string | number;
  className?: string;
}

// 1. Blue Team Captain (On Stool, Arms Reaching to Catch)
export const CaptainPlayerIllustration: React.FC<CharacterProps> = ({
  hasBall = false,
  jerseyNumber = '★',
  className = 'w-full h-full',
}) => (
  <div className={`relative flex flex-col items-center justify-center ${className}`}>
    {/* Wooden Stool at Base */}
    <div className="absolute bottom-0 w-8 h-8 sm:w-10 sm:h-10 z-0">
      <WoodenStoolIllustration teamColor="PLAYER" className="w-full h-full" />
    </div>

    {/* Standing Cartoon Character atop stool */}
    <svg viewBox="0 0 100 120" className="w-full h-full relative z-10 overflow-visible" fill="none">
      {/* Dynamic Outstretched Arms (Raised high to catch) */}
      <path
        d="M24 48 Q10 28, 12 10 Q16 6, 22 12 Q28 26, 32 46"
        fill="#f8c291"
        stroke="#2c1810"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Left Hand Fingers reaching */}
      <circle cx="12" cy="8" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />
      <circle cx="16" cy="5" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />
      <circle cx="21" cy="7" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />

      {/* Right Arm reaching */}
      <path
        d="M76 48 Q90 28, 88 10 Q84 6, 78 12 Q72 26, 68 46"
        fill="#f8c291"
        stroke="#2c1810"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Right Hand Fingers reaching */}
      <circle cx="88" cy="8" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />
      <circle cx="84" cy="5" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />
      <circle cx="79" cy="7" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />

      {/* Legs Standing on Stool */}
      <path d="M40 76 L38 98 L30 100 L32 76" fill="#1e293b" stroke="#2c1810" strokeWidth="2" />
      <path d="M60 76 L62 98 L70 100 L68 76" fill="#1e293b" stroke="#2c1810" strokeWidth="2" />
      {/* Athletic Sneakers */}
      <ellipse cx="32" cy="102" rx="7" ry="3.5" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />
      <ellipse cx="68" cy="102" rx="7" ry="3.5" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />

      {/* Blue Athletic Jersey Body */}
      <path
        d="M30 46 L70 46 L66 78 L34 78 Z"
        fill="#2563eb"
        stroke="#1e3a8a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Golden Captain Crest on Jersey */}
      <circle cx="50" cy="62" r="9" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.8" />
      <text x="50" y="66" textAnchor="middle" fill="#854d0e" fontSize="11" fontWeight="900" fontFamily="serif">
        {jerseyNumber}
      </text>

      {/* Cartoon Head & Face */}
      <ellipse cx="50" cy="30" rx="14" ry="15" fill="#f8c291" stroke="#2c1810" strokeWidth="2.5" />
      {/* Expressive Cartoon Eyes */}
      <ellipse cx="44" cy="28" rx="2.5" ry="3.5" fill="#1e293b" />
      <ellipse cx="56" cy="28" rx="2.5" ry="3.5" fill="#1e293b" />
      <circle cx="43" cy="26.5" r="1" fill="#ffffff" />
      <circle cx="55" cy="26.5" r="1" fill="#ffffff" />
      {/* Smiling Mouth */}
      <path d="M44 36 Q50 42, 56 36" stroke="#2c1810" strokeWidth="2" strokeLinecap="round" fill="#d97706" />

      {/* Backwards Baseball Cap (Blue) */}
      <path
        d="M34 26 C34 14, 66 14, 66 26 Z"
        fill="#1d4ed8"
        stroke="#1e3a8a"
        strokeWidth="2.5"
      />
      {/* Backwards Cap Visor / Bill */}
      <path d="M60 25 Q74 24, 76 30 Q68 32, 60 28" fill="#1e40af" stroke="#1e3a8a" strokeWidth="2" />
    </svg>

    {/* Ball if Captain possesses */}
    {hasBall && (
      <div className="absolute -top-1 right-0 w-6 h-6 animate-bounce z-30">
        <CaptainBallIllustration className="w-full h-full" />
      </div>
    )}
  </div>
);

// 2. Blue Team Ball Carrier (Dynamic Winding-up Pose with Legible Jersey Number)
export const CarrierPlayerIllustration: React.FC<CharacterProps> = ({
  jerseyNumber = '1',
  className = 'w-full h-full',
}) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" fill="none">
      {/* Dynamic Legs */}
      <path d="M36 65 L28 85 L20 86 L30 65" fill="#1e293b" stroke="#2c1810" strokeWidth="2" />
      <path d="M58 65 L66 84 L76 83 L64 65" fill="#1e293b" stroke="#2c1810" strokeWidth="2" />
      <ellipse cx="22" cy="87" rx="6" ry="3" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />
      <ellipse cx="74" cy="85" rx="6" ry="3" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />

      {/* Blue Jersey */}
      <path
        d="M32 38 L68 38 L62 68 L36 68 Z"
        fill="#2563eb"
        stroke="#1e3a8a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Large Inked Jersey Number on Chest */}
      <circle cx="50" cy="53" r="8.5" fill="#ffffff" stroke="#1e3a8a" strokeWidth="1.8" />
      <text x="50" y="57.5" textAnchor="middle" fill="#1e3a8a" fontSize="12" fontWeight="900" fontFamily="serif">
        {jerseyNumber}
      </text>

      {/* Arms holding the ball up high to pass */}
      <path
        d="M34 42 Q20 28, 25 15 Q35 15, 40 36"
        fill="#f8c291"
        stroke="#2c1810"
        strokeWidth="2"
      />
      <path
        d="M66 42 Q80 26, 75 14 Q65 15, 60 36"
        fill="#f8c291"
        stroke="#2c1810"
        strokeWidth="2"
      />

      {/* Head & Expression */}
      <ellipse cx="50" cy="24" rx="12" ry="13" fill="#f8c291" stroke="#2c1810" strokeWidth="2.2" />
      <path d="M38 18 Q50 8, 62 18" stroke="#3d2314" strokeWidth="4" strokeLinecap="round" fill="#3d2314" />
      {/* Focused athletic eyes */}
      <ellipse cx="45" cy="23" rx="2.5" ry="3" fill="#1e293b" />
      <ellipse cx="55" cy="23" rx="2.5" ry="3" fill="#1e293b" />
      <path d="M46 30 Q50 34, 54 30" stroke="#2c1810" strokeWidth="1.8" strokeLinecap="round" />
    </svg>

    {/* Stitched Ball in Hands */}
    <div className="absolute -top-1.5 w-6 h-6 sm:w-7 sm:h-7 animate-bounce z-20">
      <CaptainBallIllustration className="w-full h-full" />
    </div>
  </div>
);

// 3. Blue Team Court Player / Cutter / Defender (Generic Athletic Runner with Jersey Number)
export const CutterPlayerIllustration: React.FC<CharacterProps> = ({
  hasBall = false,
  jerseyNumber = '2',
  className = 'w-full h-full',
}) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" fill="none">
      {/* Running Stance Legs */}
      <path d="M40 64 L24 82 L18 80 L34 62" fill="#1e293b" stroke="#2c1810" strokeWidth="2" />
      <path d="M58 64 L74 78 L80 84 L64 62" fill="#1e293b" stroke="#2c1810" strokeWidth="2" />
      <ellipse cx="20" cy="82" rx="6" ry="3.5" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />
      <ellipse cx="78" cy="85" rx="6" ry="3.5" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />

      {/* Blue Athletic Jersey */}
      <path
        d="M34 38 L66 38 L60 66 L36 66 Z"
        fill="#3b82f6"
        stroke="#1d4ed8"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Large Inked Jersey Number on Chest */}
      <circle cx="50" cy="52" r="8.5" fill="#ffffff" stroke="#1d4ed8" strokeWidth="1.8" />
      <text x="50" y="56.5" textAnchor="middle" fill="#1e3a8a" fontSize="12" fontWeight="900" fontFamily="serif">
        {jerseyNumber}
      </text>

      {/* Outstretched Receiving Arms */}
      <path d="M34 42 Q14 44, 16 30" stroke="#f8c291" strokeWidth="6" strokeLinecap="round" />
      <path d="M34 42 Q14 44, 16 30" stroke="#2c1810" strokeWidth="2" fill="none" />
      <circle cx="16" cy="30" r="3.5" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />

      <path d="M66 42 Q86 36, 84 24" stroke="#f8c291" strokeWidth="6" strokeLinecap="round" />
      <path d="M66 42 Q86 36, 84 24" stroke="#2c1810" strokeWidth="2" fill="none" />
      <circle cx="84" cy="24" r="3.5" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />

      {/* Head & Athletic Headband */}
      <ellipse cx="50" cy="24" rx="12" ry="13" fill="#f8c291" stroke="#2c1810" strokeWidth="2.2" />
      {/* Brown Hair with Ponytail / Shag */}
      <path d="M38 18 Q50 6, 62 18 Q66 10, 68 22 Q50 12, 38 18" fill="#5c3d2e" stroke="#2c1810" strokeWidth="1.5" />
      {/* Headband */}
      <path d="M38 20 Q50 18, 62 20" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      {/* Eyes & Smile */}
      <ellipse cx="45" cy="24" rx="2" ry="3" fill="#1e293b" />
      <ellipse cx="55" cy="24" rx="2" ry="3" fill="#1e293b" />
      <path d="M46 30 Q50 34, 54 30" stroke="#2c1810" strokeWidth="1.8" strokeLinecap="round" />
    </svg>

    {hasBall && (
      <div className="absolute -top-1.5 right-0 w-6 h-6 animate-bounce z-20">
        <CaptainBallIllustration className="w-full h-full" />
      </div>
    )}
  </div>
);

// 4. Red Team AI Captain (On Stool, Arms Up with Captain Crest)
export const CaptainAIIllustration: React.FC<CharacterProps> = ({
  hasBall = false,
  jerseyNumber = '★',
  className = 'w-full h-full',
}) => (
  <div className={`relative flex flex-col items-center justify-center ${className}`}>
    {/* Wooden Stool at Base */}
    <div className="absolute bottom-0 w-8 h-8 sm:w-10 sm:h-10 z-0">
      <WoodenStoolIllustration teamColor="AI" className="w-full h-full" />
    </div>

    <svg viewBox="0 0 100 120" className="w-full h-full relative z-10 overflow-visible" fill="none">
      {/* Raised Arms to catch */}
      <path
        d="M24 48 Q10 28, 12 10 Q16 6, 22 12 Q28 26, 32 46"
        fill="#f8c291"
        stroke="#2c1810"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="8" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />
      <circle cx="16" cy="5" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />

      <path
        d="M76 48 Q90 28, 88 10 Q84 6, 78 12 Q72 26, 68 46"
        fill="#f8c291"
        stroke="#2c1810"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="88" cy="8" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />
      <circle cx="84" cy="5" r="3" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />

      {/* Standing Legs */}
      <path d="M40 76 L38 98 L30 100 L32 76" fill="#3f1d1d" stroke="#2c1810" strokeWidth="2" />
      <path d="M60 76 L62 98 L70 100 L68 76" fill="#3f1d1d" stroke="#2c1810" strokeWidth="2" />
      <ellipse cx="32" cy="102" rx="7" ry="3.5" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />
      <ellipse cx="68" cy="102" rx="7" ry="3.5" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />

      {/* Red Jersey Body */}
      <path
        d="M30 46 L70 46 L66 78 L34 78 Z"
        fill="#dc2626"
        stroke="#991b1b"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Golden AI Captain Star Crest */}
      <circle cx="50" cy="62" r="9" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.8" />
      <text x="50" y="66" textAnchor="middle" fill="#991b1b" fontSize="11" fontWeight="900" fontFamily="serif">
        {jerseyNumber}
      </text>

      {/* Head */}
      <ellipse cx="50" cy="30" rx="14" ry="15" fill="#f8c291" stroke="#2c1810" strokeWidth="2.5" />
      {/* Pirate Bandana (Red) */}
      <path d="M34 26 C34 14, 66 14, 66 26 Z" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="2.5" />
      <circle cx="68" cy="28" r="4" fill="#b91c1c" stroke="#7f1d1d" strokeWidth="1.5" />
      {/* Expressive Eyes */}
      <ellipse cx="44" cy="28" rx="2.5" ry="3.5" fill="#1e293b" />
      <ellipse cx="56" cy="28" rx="2.5" ry="3.5" fill="#1e293b" />
      <path d="M44 36 Q50 42, 56 36" stroke="#2c1810" strokeWidth="2" strokeLinecap="round" fill="#b91c1c" />
    </svg>

    {hasBall && (
      <div className="absolute -top-1 right-0 w-6 h-6 animate-bounce z-30">
        <CaptainBallIllustration className="w-full h-full" />
      </div>
    )}
  </div>
);

// 5. Red Team AI Court Player / Cutter / Defender (Numbered 1-5)
export const PieceAIIllustration: React.FC<CharacterProps> = ({
  hasBall = false,
  jerseyNumber = '1',
  className = 'w-full h-full',
}) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" fill="none">
      {/* Athletic Stance */}
      <path d="M36 64 L22 84 L16 82 L30 64" fill="#3f1d1d" stroke="#2c1810" strokeWidth="2" />
      <path d="M64 64 L78 84 L84 82 L70 64" fill="#3f1d1d" stroke="#2c1810" strokeWidth="2" />
      <ellipse cx="18" cy="84" rx="6" ry="3" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />
      <ellipse cx="82" cy="84" rx="6" ry="3" fill="#f8fafc" stroke="#2c1810" strokeWidth="1.8" />

      {/* Red Jersey */}
      <path
        d="M32 38 L68 38 L62 66 L36 66 Z"
        fill="#ef4444"
        stroke="#b91c1c"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Large Inked Jersey Number on Chest */}
      <circle cx="50" cy="52" r="8.5" fill="#ffffff" stroke="#991b1b" strokeWidth="1.8" />
      <text x="50" y="56.5" textAnchor="middle" fill="#991b1b" fontSize="12" fontWeight="900" fontFamily="serif">
        {jerseyNumber}
      </text>

      {/* Hands Out */}
      <path d="M32 42 Q12 40, 14 50" stroke="#f8c291" strokeWidth="6" strokeLinecap="round" />
      <path d="M32 42 Q12 40, 14 50" stroke="#2c1810" strokeWidth="2" fill="none" />
      <circle cx="14" cy="50" r="3.5" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />

      <path d="M68 42 Q88 40, 86 50" stroke="#f8c291" strokeWidth="6" strokeLinecap="round" />
      <path d="M68 42 Q88 40, 86 50" stroke="#2c1810" strokeWidth="2" fill="none" />
      <circle cx="86" cy="50" r="3.5" fill="#f8c291" stroke="#2c1810" strokeWidth="1.8" />

      {/* Head */}
      <ellipse cx="50" cy="24" rx="12" ry="13" fill="#f8c291" stroke="#2c1810" strokeWidth="2.2" />
      <path d="M38 16 Q50 6, 62 16" fill="#1e293b" stroke="#2c1810" strokeWidth="2" />
      <ellipse cx="45" cy="24" rx="2" ry="3" fill="#1e293b" />
      <ellipse cx="55" cy="24" rx="2" ry="3" fill="#1e293b" />
      <path d="M46 30 Q50 33, 54 30" stroke="#2c1810" strokeWidth="1.8" strokeLinecap="round" />
    </svg>

    {hasBall && (
      <div className="absolute -top-1.5 right-0 w-6 h-6 animate-bounce z-20">
        <CaptainBallIllustration className="w-full h-full" />
      </div>
    )}
  </div>
);

// 6. Blue Team Designated Blocker / Goal Guard (Padded Goalkeeper Outfit & Shield)
export const BlockerPlayerIllustration: React.FC<CharacterProps> = ({
  hasBall = false,
  className = 'w-full h-full',
}) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" fill="none">
      {/* Wide Defensive Stance Legs */}
      <path d="M38 64 L20 84 L14 82 L28 64" fill="#0f172a" stroke="#2c1810" strokeWidth="2.2" />
      <path d="M62 64 L80 84 L86 82 L72 64" fill="#0f172a" stroke="#2c1810" strokeWidth="2.2" />
      <ellipse cx="16" cy="84" rx="7" ry="4" fill="#f8fafc" stroke="#2c1810" strokeWidth="2" />
      <ellipse cx="84" cy="84" rx="7" ry="4" fill="#f8fafc" stroke="#2c1810" strokeWidth="2" />

      {/* Padded Navy/Cyan Goalkeeper Jersey with Golden Accent Trim */}
      <path
        d="M28 38 L72 38 L66 68 L34 68 Z"
        fill="#0284c7"
        stroke="#0369a1"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      {/* Padded Shoulder Guards */}
      <path d="M26 38 Q32 32, 38 38" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M74 38 Q68 32, 62 38" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />

      {/* Golden Blocker Shield Crest on Chest */}
      <path
        d="M50 44 L58 48 C58 56, 50 62, 50 62 C50 62, 42 56, 42 48 Z"
        fill="#fef08a"
        stroke="#b45309"
        strokeWidth="2"
      />
      <text x="50" y="55" textAnchor="middle" fill="#78350f" fontSize="8.5" fontWeight="900" fontFamily="serif">
        🛡
      </text>

      {/* Wide Outstretched Padded Goalkeeper Blocking Gloves */}
      <path d="M30 42 Q10 36, 12 24" stroke="#f8c291" strokeWidth="6" strokeLinecap="round" />
      <path d="M30 42 Q10 36, 12 24" stroke="#2c1810" strokeWidth="2" fill="none" />
      {/* Padded Left Glove */}
      <rect x="6" y="16" width="12" height="14" rx="4" fill="#0284c7" stroke="#082f49" strokeWidth="2" />
      <circle cx="12" cy="14" r="2.5" fill="#f59e0b" />

      <path d="M70 42 Q90 36, 88 24" stroke="#f8c291" strokeWidth="6" strokeLinecap="round" />
      <path d="M70 42 Q90 36, 88 24" stroke="#2c1810" strokeWidth="2" fill="none" />
      {/* Padded Right Glove */}
      <rect x="82" y="16" width="12" height="14" rx="4" fill="#0284c7" stroke="#082f49" strokeWidth="2" />
      <circle cx="88" cy="14" r="2.5" fill="#f59e0b" />

      {/* Head & Goalkeeper Protective Headgear */}
      <ellipse cx="50" cy="24" rx="13" ry="14" fill="#f8c291" stroke="#2c1810" strokeWidth="2.2" />
      {/* Keeper Headgear (Navy with Gold Stripe) */}
      <path d="M36 22 C36 10, 64 10, 64 22 Z" fill="#0369a1" stroke="#082f49" strokeWidth="2.5" />
      <path d="M48 10 L48 22" stroke="#f59e0b" strokeWidth="3" />
      {/* Determined Blocker Eyes */}
      <ellipse cx="44" cy="24" rx="2.5" ry="3.5" fill="#082f49" />
      <ellipse cx="56" cy="24" rx="2.5" ry="3.5" fill="#082f49" />
      <path d="M44 32 Q50 36, 56 32" stroke="#2c1810" strokeWidth="2" strokeLinecap="round" />
    </svg>

    {hasBall && (
      <div className="absolute -top-1.5 right-0 w-6 h-6 animate-bounce z-20">
        <CaptainBallIllustration className="w-full h-full" />
      </div>
    )}
  </div>
);

// 7. Red Team Designated Blocker / Goal Guard (Padded Pirate Goalkeeper Outfit & Shield)
export const BlockerAIIllustration: React.FC<CharacterProps> = ({
  hasBall = false,
  className = 'w-full h-full',
}) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" fill="none">
      {/* Wide Defensive Stance Legs */}
      <path d="M38 64 L20 84 L14 82 L28 64" fill="#2d0606" stroke="#2c1810" strokeWidth="2.2" />
      <path d="M62 64 L80 84 L86 82 L72 64" fill="#2d0606" stroke="#2c1810" strokeWidth="2.2" />
      <ellipse cx="16" cy="84" rx="7" ry="4" fill="#f8fafc" stroke="#2c1810" strokeWidth="2" />
      <ellipse cx="84" cy="84" rx="7" ry="4" fill="#f8fafc" stroke="#2c1810" strokeWidth="2" />

      {/* Crimson Padded Pirate Keeper Tunic */}
      <path
        d="M28 38 L72 38 L66 68 L34 68 Z"
        fill="#991b1b"
        stroke="#450a0a"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      {/* Padded Iron Shoulder Plates */}
      <path d="M26 38 Q32 32, 38 38" stroke="#e2e8f0" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M74 38 Q68 32, 62 38" stroke="#e2e8f0" strokeWidth="3.5" strokeLinecap="round" />

      {/* Iron Pirate Blocker Shield Crest on Chest */}
      <path
        d="M50 44 L58 48 C58 56, 50 62, 50 62 C50 62, 42 56, 42 48 Z"
        fill="#cbd5e1"
        stroke="#334155"
        strokeWidth="2"
      />
      <text x="50" y="55" textAnchor="middle" fill="#0f172a" fontSize="8.5" fontWeight="900" fontFamily="serif">
        🛡
      </text>

      {/* Wide Heavy Blocking Keeper Gauntlets */}
      <path d="M30 42 Q10 36, 12 24" stroke="#f8c291" strokeWidth="6" strokeLinecap="round" />
      <path d="M30 42 Q10 36, 12 24" stroke="#2c1810" strokeWidth="2" fill="none" />
      {/* Left Pirate Gauntlet */}
      <rect x="6" y="16" width="12" height="14" rx="4" fill="#7f1d1d" stroke="#450a0a" strokeWidth="2" />
      <circle cx="12" cy="14" r="2.5" fill="#e2e8f0" />

      <path d="M70 42 Q90 36, 88 24" stroke="#f8c291" strokeWidth="6" strokeLinecap="round" />
      <path d="M70 42 Q90 36, 88 24" stroke="#2c1810" strokeWidth="2" fill="none" />
      {/* Right Pirate Gauntlet */}
      <rect x="82" y="16" width="12" height="14" rx="4" fill="#7f1d1d" stroke="#450a0a" strokeWidth="2" />
      <circle cx="88" cy="14" r="2.5" fill="#e2e8f0" />

      {/* Head & Pirate Keeper Helmet/Bandana */}
      <ellipse cx="50" cy="24" rx="13" ry="14" fill="#f8c291" stroke="#2c1810" strokeWidth="2.2" />
      {/* Pirate Keeper Bandana (Dark Crimson) */}
      <path d="M36 22 C36 10, 64 10, 64 22 Z" fill="#7f1d1d" stroke="#450a0a" strokeWidth="2.5" />
      <circle cx="66" cy="24" r="3.5" fill="#991b1b" stroke="#450a0a" strokeWidth="1.5" />
      {/* Fierce Eyes */}
      <ellipse cx="44" cy="24" rx="2.5" ry="3.5" fill="#1e293b" />
      <ellipse cx="56" cy="24" rx="2.5" ry="3.5" fill="#1e293b" />
      <path d="M44 32 Q50 36, 56 32" stroke="#2c1810" strokeWidth="2" strokeLinecap="round" />
    </svg>

    {hasBall && (
      <div className="absolute -top-1.5 right-0 w-6 h-6 animate-bounce z-20">
        <CaptainBallIllustration className="w-full h-full" />
      </div>
    )}
  </div>
);
