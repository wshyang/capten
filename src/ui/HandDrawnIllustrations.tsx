import React from 'react';

/**
 * Hand-drawn Cartoon Illustrated Elements matching the vintage pirate /
 * tropical beach parchment aesthetic.
 */

// 1. Pirate Jolly Roger Flag with Bamboo Pole, Tropical Leaves & Starfish
export const PirateFlagIllustration: React.FC<{ className?: string }> = ({ className = 'w-24 h-24' }) => (
  <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Wooden Pole */}
    <path
      d="M25 150 L32 15 L28 15 L21 150 Z"
      fill="#6b4423"
      stroke="#3d2314"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path d="M25 40 L31 42 M24 80 L30 82 M23 120 L29 122" stroke="#4a2e18" strokeWidth="2" strokeLinecap="round" />
    <circle cx="30" cy="14" r="6" fill="#c99738" stroke="#5c3d10" strokeWidth="2" />

    {/* Pirate Flag Fabric with Waving Organic Hem */}
    <path
      d="M32 20 Q70 12, 110 24 Q140 32, 145 28 C140 50, 148 70, 142 90 Q110 78, 70 92 Q45 84, 30 92 Z"
      fill="#1c2430"
      stroke="#0f141c"
      strokeWidth="3"
      strokeLinejoin="round"
    />
    {/* Flag folds & texture */}
    <path d="M70 18 Q72 55, 68 90" stroke="#2d3748" strokeWidth="2" strokeDasharray="3 2" fill="none" />
    <path d="M110 24 Q108 55, 112 82" stroke="#2d3748" strokeWidth="2" strokeDasharray="3 2" fill="none" />

    {/* Jolly Roger Skull */}
    <g transform="translate(68, 36) scale(0.75)">
      {/* Crossed Bones */}
      <path
        d="M5 5 L45 45 M45 5 L5 45"
        stroke="#e2e8f0"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="5" cy="5" r="3" fill="#e2e8f0" />
      <circle cx="45" cy="45" r="3" fill="#e2e8f0" />
      <circle cx="45" cy="5" r="3" fill="#e2e8f0" />
      <circle cx="5" cy="45" r="3" fill="#e2e8f0" />

      {/* Skull Head */}
      <path
        d="M25 8 C14 8, 8 16, 8 26 C8 34, 14 38, 18 40 L18 46 L32 46 L32 40 C36 38, 42 34, 42 26 C42 16, 36 8, 25 8 Z"
        fill="#f8fafc"
        stroke="#1e293b"
        strokeWidth="2.5"
      />
      {/* Eye Sockets & Nose */}
      <ellipse cx="18" cy="24" rx="4" ry="5" fill="#1e293b" />
      <ellipse cx="32" cy="24" rx="4" ry="5" fill="#1e293b" />
      <path d="M25 30 L23 34 L27 34 Z" fill="#1e293b" />
      {/* Teeth Lines */}
      <line x1="22" y1="41" x2="22" y2="46" stroke="#1e293b" strokeWidth="1.5" />
      <line x1="25" y1="41" x2="25" y2="46" stroke="#1e293b" strokeWidth="1.5" />
      <line x1="28" y1="41" x2="28" y2="46" stroke="#1e293b" strokeWidth="1.5" />
    </g>

    {/* Tropical Monstera / Palm Leaves at Base */}
    <path
      d="M10 135 C5 110, 25 95, 45 105 C55 110, 50 130, 40 145 Z"
      fill="#2d6a4f"
      stroke="#1b4332"
      strokeWidth="2"
    />
    <path d="M12 130 Q30 115, 42 110" stroke="#52b788" strokeWidth="2" fill="none" />
    <path
      d="M5 145 C-5 130, 8 115, 25 125 C30 130, 32 145, 20 152 Z"
      fill="#40916c"
      stroke="#1b4332"
      strokeWidth="1.5"
    />

    {/* Starfish */}
    <path
      d="M48 140 L52 147 L60 148 L54 153 L56 160 L49 155 L42 160 L44 153 L38 148 L46 147 Z"
      fill="#e76f51"
      stroke="#9d0208"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// 2. Rolled Antique Treasure Map Scroll
export const TreasureMapScrollIllustration: React.FC<{ className?: string }> = ({ className = 'w-24 h-24' }) => (
  <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Palm Leaves Behind */}
    <path
      d="M110 20 C135 15, 155 35, 145 60 C135 70, 115 65, 105 45 Z"
      fill="#2d6a4f"
      stroke="#1b4332"
      strokeWidth="2"
    />
    <path d="M115 30 Q135 40, 140 55" stroke="#52b788" strokeWidth="2" fill="none" />

    {/* Rolled Scroll Body */}
    <g transform="rotate(15 80 80)">
      {/* Scroll Back curl */}
      <path
        d="M30 45 C25 40, 20 55, 25 70 L115 95 C125 98, 130 85, 125 70 Z"
        fill="#d4a373"
        stroke="#8b5e34"
        strokeWidth="2.5"
      />
      {/* Main Parchment Surface */}
      <path
        d="M25 50 Q75 60, 125 70 L110 130 Q60 120, 15 110 Z"
        fill="#faedcd"
        stroke="#8b5e34"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Scroll Roll ends */}
      <ellipse cx="25" cy="50" rx="8" ry="12" fill="#e9edc9" stroke="#8b5e34" strokeWidth="2" />
      <ellipse cx="110" cy="130" rx="10" ry="14" fill="#d4a373" stroke="#8b5e34" strokeWidth="2" />

      {/* Map Drawings: Dashed Path & Red X */}
      <path d="M35 75 Q55 70, 65 90 T95 95" stroke="#b08968" strokeWidth="2" strokeDasharray="3 3" fill="none" />
      <path d="M90 90 L102 102 M102 90 L90 102" stroke="#d90429" strokeWidth="3" strokeLinecap="round" />
      {/* Tiny Mountain sketch */}
      <path d="M45 95 L52 82 L59 95 M56 95 L62 87 L68 95" stroke="#8b5e34" strokeWidth="1.5" fill="none" />
    </g>

    {/* Seashell beside scroll */}
    <path
      d="M130 110 C145 105, 155 120, 145 135 C135 145, 120 135, 125 120 Z"
      fill="#fefae0"
      stroke="#bc6c25"
      strokeWidth="2"
    />
    <path d="M132 115 L140 130 M138 112 L143 128" stroke="#dda15e" strokeWidth="1.5" />
  </svg>
);

// 3. Pirate Wooden Treasure Chest with Brass Fittings & Rope
export const TreasureChestIllustration: React.FC<{ className?: string }> = ({ className = 'w-28 h-28' }) => (
  <svg viewBox="0 0 180 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Tropical Foliage Backing */}
    <path
      d="M15 110 C-5 80, 10 50, 40 60 C55 65, 50 95, 35 120 Z"
      fill="#1b4332"
      stroke="#081c15"
      strokeWidth="2"
    />
    <path
      d="M30 130 C15 100, 35 75, 60 85 C75 90, 70 120, 50 140 Z"
      fill="#2d6a4f"
      stroke="#1b4332"
      strokeWidth="2"
    />

    {/* Hemp Rope Coils */}
    <g transform="translate(10, 100)">
      <path
        d="M10 35 C5 25, 25 15, 45 22 C65 30, 55 48, 35 45 C15 42, 10 55, 30 58 C50 60, 60 45, 55 35"
        stroke="#c68a4c"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M10 35 C5 25, 25 15, 45 22 C65 30, 55 48, 35 45 C15 42, 10 55, 30 58 C50 60, 60 45, 55 35"
        stroke="#84501a"
        strokeWidth="5"
        strokeDasharray="3 3"
        strokeLinecap="round"
        fill="none"
      />
    </g>

    {/* Treasure Chest Main Base */}
    <path
      d="M45 75 L145 75 L140 135 L50 135 Z"
      fill="#6f4e37"
      stroke="#3d2616"
      strokeWidth="3.5"
      strokeLinejoin="round"
    />
    {/* Wood Planks Lines */}
    <line x1="48" y1="95" x2="142" y2="95" stroke="#4a2e1b" strokeWidth="2" />
    <line x1="49" y1="115" x2="141" y2="115" stroke="#4a2e1b" strokeWidth="2" />

    {/* Curved Chest Lid */}
    <path
      d="M40 75 C40 45, 150 45, 150 75 Z"
      fill="#8b5a2b"
      stroke="#3d2616"
      strokeWidth="3.5"
      strokeLinejoin="round"
    />
    <path d="M42 62 Q95 48, 148 62" stroke="#5c3a1e" strokeWidth="2" fill="none" />

    {/* Brass Bands (Vertical straps) */}
    <path d="M60 48 C60 48, 62 65, 62 75 L64 135 L74 135 L72 75 C72 65, 70 48, 70 48 Z" fill="#d4af37" stroke="#78590c" strokeWidth="2" />
    <path d="M120 48 C120 48, 118 65, 118 75 L116 135 L126 135 L128 75 C128 65, 130 48, 130 48 Z" fill="#d4af37" stroke="#78590c" strokeWidth="2" />

    {/* Rivets on Brass Bands */}
    <circle cx="67" cy="58" r="1.5" fill="#583d04" />
    <circle cx="68" cy="85" r="1.5" fill="#583d04" />
    <circle cx="69" cy="105" r="1.5" fill="#583d04" />
    <circle cx="70" cy="125" r="1.5" fill="#583d04" />

    <circle cx="123" cy="58" r="1.5" fill="#583d04" />
    <circle cx="122" cy="85" r="1.5" fill="#583d04" />
    <circle cx="121" cy="105" r="1.5" fill="#583d04" />
    <circle cx="120" cy="125" r="1.5" fill="#583d04" />

    {/* Golden Lock Clasp Plate */}
    <rect x="85" y="68" width="20" height="22" rx="3" fill="#f59e0b" stroke="#78350f" strokeWidth="2" />
    <circle cx="95" cy="76" r="3" fill="#3d2616" />
    <path d="M94 77 L93 84 L97 84 L96 77 Z" fill="#3d2616" />

    {/* Sea Shell in Front */}
    <g transform="translate(130, 120)">
      <path
        d="M10 10 C25 5, 35 20, 25 35 C15 40, 5 30, 10 10 Z"
        fill="#faedcd"
        stroke="#bc6c25"
        strokeWidth="2"
      />
      <path d="M12 12 L22 30 M18 10 L25 25" stroke="#d4a373" strokeWidth="1.5" />
    </g>
  </svg>
);

// 4. Detailed Hand-drawn Ocean Waves with Crested Sea Foam & Sea Life
export const OceanWavesIllustration: React.FC<{ className?: string }> = ({ className = 'w-full h-16' }) => (
  <svg viewBox="0 0 800 120" className={className} preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Deep Ocean Blue Backing */}
    <path
      d="M0 60 Q100 20, 200 55 T400 45 T600 55 T800 40 L800 120 L0 120 Z"
      fill="#1d4e89"
    />
    {/* Mid-Tone Cyan Wave Layer */}
    <path
      d="M0 70 Q60 35, 130 65 Q200 95, 270 50 Q340 10, 410 55 Q480 95, 550 45 Q620 10, 690 55 Q740 85, 800 60 L800 120 L0 120 Z"
      fill="#0096c7"
      stroke="#023e8a"
      strokeWidth="2.5"
    />
    {/* Foreground Churning Waves with Crests */}
    <path
      d="M0 85 C40 60, 70 60, 100 80 C130 100, 160 50, 210 75 C260 100, 300 45, 350 70 C400 95, 440 50, 490 75 C540 100, 580 45, 630 70 C680 95, 720 55, 770 80 L800 85 L800 120 L0 120 Z"
      fill="#48cae4"
      stroke="#0077b6"
      strokeWidth="2.5"
    />

    {/* White Foaming Wave Crests & Sea Foam Spray */}
    <path
      d="M80 65 C95 50, 115 55, 125 68 C135 60, 150 55, 165 72
         M230 60 C245 45, 265 50, 280 65 C295 55, 310 50, 325 68
         M430 55 C445 40, 465 45, 480 60 C495 50, 515 45, 530 68
         M615 55 C630 40, 650 45, 665 60 C680 50, 700 45, 715 65"
      stroke="#ffffff"
      strokeWidth="4.5"
      strokeLinecap="round"
      fill="none"
    />

    {/* Individual Foam Dots / Bubbles */}
    <circle cx="110" cy="52" r="3" fill="#ffffff" />
    <circle cx="120" cy="48" r="2" fill="#ffffff" />
    <circle cx="140" cy="56" r="2.5" fill="#ffffff" />
    <circle cx="260" cy="48" r="3" fill="#ffffff" />
    <circle cx="275" cy="44" r="2" fill="#ffffff" />
    <circle cx="460" cy="42" r="3.5" fill="#ffffff" />
    <circle cx="475" cy="38" r="2" fill="#ffffff" />
    <circle cx="645" cy="42" r="3" fill="#ffffff" />
    <circle cx="660" cy="38" r="2" fill="#ffffff" />

    {/* Starfish in the Surf */}
    <g transform="translate(560, 82) scale(0.65)">
      <path
        d="M20 5 L24 16 L36 17 L27 25 L30 36 L20 29 L10 36 L13 25 L4 17 L16 16 Z"
        fill="#e63946"
        stroke="#9e2a2b"
        strokeWidth="2"
      />
    </g>

    {/* Spiral Shell in Surf */}
    <g transform="translate(620, 85) scale(0.6)">
      <path
        d="M10 10 C25 5, 35 20, 25 35 C15 40, 5 30, 10 10 Z"
        fill="#fefae0"
        stroke="#d4a373"
        strokeWidth="2"
      />
      <path d="M12 12 L22 30" stroke="#bc6c25" strokeWidth="1.5" />
    </g>
  </svg>
);

// 5. Antique Mariner's Compass / Navigational Astrolabe
export const MarinerCompassIllustration: React.FC<{ className?: string }> = ({ className = 'w-24 h-24' }) => (
  <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Palm leaves behind */}
    <path
      d="M130 110 C155 115, 160 145, 140 155 C125 160, 110 140, 115 125 Z"
      fill="#2d6a4f"
      stroke="#1b4332"
      strokeWidth="2"
    />
    <path d="M125 120 Q145 130, 148 145" stroke="#52b788" strokeWidth="2" fill="none" />

    {/* Outer Brass Housing */}
    <circle cx="80" cy="80" r="65" fill="#b45309" stroke="#78350f" strokeWidth="4" />
    <circle cx="80" cy="80" r="58" fill="#d97706" stroke="#92400e" strokeWidth="2.5" />
    <circle cx="80" cy="80" r="52" fill="#faedcd" stroke="#854d0e" strokeWidth="3" />

    {/* Degree Ticks around perimeter */}
    {Array.from({ length: 16 }).map((_, i) => {
      const angle = (i * 360) / 16;
      return (
        <line
          key={i}
          x1="80"
          y1="30"
          x2="80"
          y2={i % 4 === 0 ? '36' : '33'}
          stroke="#78350f"
          strokeWidth={i % 4 === 0 ? '2' : '1'}
          transform={`rotate(${angle} 80 80)`}
        />
      );
    })}

    {/* 8-Point Compass Rose */}
    {/* North Point (Red/Gold) */}
    <polygon points="80,32 85,75 80,80" fill="#dc2626" stroke="#991b1b" strokeWidth="1" />
    <polygon points="80,32 75,75 80,80" fill="#ef4444" stroke="#991b1b" strokeWidth="1" />

    {/* South Point (Charcoal/Gold) */}
    <polygon points="80,128 85,85 80,80" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
    <polygon points="80,128 75,85 80,80" fill="#334155" stroke="#0f172a" strokeWidth="1" />

    {/* East Point */}
    <polygon points="128,80 85,85 80,80" fill="#b45309" stroke="#78350f" strokeWidth="1" />
    <polygon points="128,80 85,75 80,80" fill="#d97706" stroke="#78350f" strokeWidth="1" />

    {/* West Point */}
    <polygon points="32,80 75,85 80,80" fill="#b45309" stroke="#78350f" strokeWidth="1" />
    <polygon points="32,80 75,75 80,80" fill="#d97706" stroke="#78350f" strokeWidth="1" />

    {/* Diagonal 4 Points */}
    <polygon points="114,46 83,77 80,80" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
    <polygon points="114,46 77,83 80,80" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
    <polygon points="46,114 83,77 80,80" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
    <polygon points="46,114 77,83 80,80" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />

    {/* Cardinal Direction Letters */}
    <text x="80" y="47" fill="#991b1b" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="serif">N</text>
    <text x="80" y="122" fill="#1e293b" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="serif">S</text>
    <text x="120" y="84" fill="#78350f" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="serif">E</text>
    <text x="40" y="84" fill="#78350f" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="serif">W</text>

    {/* Center Brass Pivot Cap */}
    <circle cx="80" cy="80" r="7" fill="#f59e0b" stroke="#78350f" strokeWidth="2" />
    <circle cx="80" cy="80" r="3" fill="#78350f" />

    {/* Glass Bevel Highlight */}
    <path
      d="M36 55 C45 40, 70 30, 95 32 C65 40, 45 55, 36 55 Z"
      fill="#ffffff"
      opacity="0.4"
    />
  </svg>
);

// 6. Vintage Wooden 4-Legged Stool for the Captains
export const WoodenStoolIllustration: React.FC<{ className?: string; teamColor?: 'PLAYER' | 'AI' }> = ({
  className = 'w-10 h-10',
  teamColor = 'PLAYER',
}) => (
  <svg viewBox="0 0 80 80" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Stool Shadow */}
    <ellipse cx="40" cy="74" rx="26" ry="6" fill="rgba(0,0,0,0.25)" />

    {/* 4 Wooden Splayed Legs */}
    {/* Back Left Leg */}
    <path d="M28 32 L20 68 L24 69 L31 34 Z" fill="#6f4e37" stroke="#3d2616" strokeWidth="1.5" />
    {/* Back Right Leg */}
    <path d="M52 32 L60 68 L56 69 L49 34 Z" fill="#6f4e37" stroke="#3d2616" strokeWidth="1.5" />

    {/* Lower Cross Rungs */}
    <path d="M22 55 L58 55 L58 58 L22 58 Z" fill="#8b5a2b" stroke="#3d2616" strokeWidth="1.2" />
    <path d="M26 42 L54 42 L54 45 L26 45 Z" fill="#8b5a2b" stroke="#3d2616" strokeWidth="1.2" />

    {/* Front Left Leg */}
    <path d="M24 30 L14 70 L19 71 L28 32 Z" fill="#8b5a2b" stroke="#3d2616" strokeWidth="1.8" />
    {/* Front Right Leg */}
    <path d="M56 30 L66 70 L61 71 L52 32 Z" fill="#8b5a2b" stroke="#3d2616" strokeWidth="1.8" />

    {/* Stool Top Seat (Round Wood Slab with Team Tint) */}
    <ellipse cx="40" cy="30" rx="28" ry="11" fill="#b07d4b" stroke="#3d2616" strokeWidth="2.5" />
    <ellipse cx="40" cy="27" rx="26" ry="9" fill={teamColor === 'PLAYER' ? '#d4a373' : '#c87d55'} stroke="#5c3a1e" strokeWidth="1.5" />

    {/* Wood grain rings on seat */}
    <ellipse cx="40" cy="27" rx="16" ry="5" stroke="#8b5a2b" strokeWidth="1" strokeDasharray="4 3" fill="none" />
    <ellipse cx="40" cy="27" rx="7" ry="2.5" stroke="#8b5a2b" strokeWidth="1" fill="none" />

    {/* Metal screw rivets on seat rim */}
    <circle cx="20" cy="28" r="1.5" fill="#3d2616" />
    <circle cx="60" cy="28" r="1.5" fill="#3d2616" />
  </svg>
);

// 7. Stitched Vintage Leather Captain's Ball
export const CaptainBallIllustration: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg viewBox="0 0 60 60" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Ball Drop Shadow */}
    <circle cx="30" cy="30" r="26" fill="#b45309" stroke="#78350f" strokeWidth="3" />
    {/* Ball Texture Gradient */}
    <circle cx="30" cy="30" r="24" fill="#f59e0b" />

    {/* 8-Panel Basketball / Volleyball Seam Curves */}
    <path
      d="M30 6 Q16 20, 16 30 Q16 40, 30 54"
      stroke="#78350f"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M30 6 Q44 20, 44 30 Q44 40, 30 54"
      stroke="#78350f"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
    <line x1="6" y1="30" x2="54" y2="30" stroke="#78350f" strokeWidth="2.2" strokeLinecap="round" />

    {/* Stitching Marks along seams */}
    <path
      d="M14 26 L18 26 M14 34 L18 34 M42 26 L46 26 M42 34 L46 34 M26 14 L26 18 M34 14 L34 18 M26 42 L26 46 M34 42 L34 46"
      stroke="#92400e"
      strokeWidth="1.2"
    />

    {/* Highlight Specular Glint */}
    <ellipse cx="22" cy="18" rx="6" ry="3.5" transform="rotate(-30 22 18)" fill="#fef3c7" opacity="0.7" />
  </svg>
);
