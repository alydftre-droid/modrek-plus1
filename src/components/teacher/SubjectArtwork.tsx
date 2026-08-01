import type { SubjectPattern } from "@/lib/teacherSubjectVisuals";

/**
 * Decorative SVG patterns per subject. Pure presentation.
 */
export function SubjectArtwork({ pattern, className = "" }: { pattern: SubjectPattern; className?: string }) {
  const common = "absolute inset-0 w-full h-full pointer-events-none opacity-60 mix-blend-overlay";
  switch (pattern) {
    case "bio":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <g stroke="white" strokeWidth="1.4" fill="none" opacity="0.7">
            <path d="M 30 10 Q 80 60 30 110" />
            <path d="M 60 10 Q 10 60 60 110" />
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={i} x1={30 + i * 0.3} y1={20 + i * 11} x2={60 - i * 0.3} y2={20 + i * 11} />
            ))}
          </g>
          <circle cx="150" cy="40" r="14" fill="white" opacity="0.25" />
          <circle cx="150" cy="40" r="6" fill="white" opacity="0.5" />
          <circle cx="175" cy="85" r="10" fill="white" opacity="0.2" />
        </svg>
      );
    case "geology":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <polygon points="20,110 60,40 100,110" fill="white" opacity="0.25" />
          <polygon points="80,110 130,55 180,110" fill="white" opacity="0.18" />
          <circle cx="150" cy="30" r="8" fill="white" opacity="0.4" />
        </svg>
      );
    case "history":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <g fill="white" opacity="0.45">
            <rect x="30" y="60" width="6" height="50" />
            <rect x="50" y="60" width="6" height="50" />
            <rect x="70" y="60" width="6" height="50" />
            <polygon points="20,60 86,60 53,30" />
          </g>
          <text x="120" y="60" fill="white" fontSize="14" fontWeight="700" opacity="0.5" fontFamily="serif">MMXXVI</text>
        </svg>
      );
    case "geography":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <circle cx="100" cy="60" r="42" fill="none" stroke="white" strokeWidth="1.4" opacity="0.7" />
          <ellipse cx="100" cy="60" rx="42" ry="14" fill="none" stroke="white" strokeWidth="1" opacity="0.5" />
          <line x1="100" y1="18" x2="100" y2="102" stroke="white" strokeWidth="1" opacity="0.5" />
          <path d="M 78 45 Q 95 35 110 50 Q 120 65 100 78 Q 85 80 78 65 Z" fill="white" opacity="0.35" />
        </svg>
      );
    case "philosophy":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <circle cx="60" cy="55" r="25" fill="none" stroke="white" strokeWidth="1.4" opacity="0.6" />
          <circle cx="60" cy="55" r="14" fill="none" stroke="white" strokeWidth="1" opacity="0.5" />
          <text x="120" y="70" fill="white" fontSize="34" fontWeight="700" opacity="0.5" fontFamily="serif">?</text>
        </svg>
      );
    case "math":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <pattern id="math-grid" width="14" height="14" patternUnits="userSpaceOnUse">
              <path d="M 14 0 L 0 0 0 14" fill="none" stroke="white" strokeWidth="0.4" opacity="0.4" />
            </pattern>
          </defs>
          <rect width="200" height="120" fill="url(#math-grid)" />
          <text x="14" y="34" fill="white" fontSize="20" fontWeight="700" opacity="0.55">∑</text>
          <text x="160" y="60" fill="white" fontSize="22" fontWeight="700" opacity="0.55">π</text>
          <text x="40" y="100" fill="white" fontSize="18" fontWeight="700" opacity="0.5">√x</text>
          <text x="110" y="105" fill="white" fontSize="16" fontWeight="700" opacity="0.5">∫</text>
          <text x="170" y="108" fill="white" fontSize="14" fontWeight="700" opacity="0.4">a²+b²</text>
        </svg>
      );
    case "physics":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <g stroke="white" strokeWidth="1.2" fill="none" opacity="0.7">
            <circle cx="60" cy="60" r="6" fill="white" />
            <ellipse cx="60" cy="60" rx="40" ry="14" transform="rotate(20 60 60)" />
            <ellipse cx="60" cy="60" rx="40" ry="14" transform="rotate(80 60 60)" />
            <ellipse cx="60" cy="60" rx="40" ry="14" transform="rotate(140 60 60)" />
          </g>
          <circle cx="160" cy="30" r="3" fill="white" opacity="0.8" />
          <circle cx="180" cy="90" r="2" fill="white" opacity="0.7" />
          <circle cx="20" cy="100" r="2" fill="white" opacity="0.7" />
        </svg>
      );
    case "chem":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <g fill="none" stroke="white" strokeWidth="1.5" opacity="0.7">
            <path d="M 30 30 L 30 65 L 14 95 L 60 95 L 46 65 L 46 30 Z" />
            <path d="M 26 30 L 50 30" strokeWidth="2.5" />
            <circle cx="30" cy="78" r="2.5" fill="white" />
            <circle cx="40" cy="86" r="2" fill="white" />
            <path d="M 110 60 m -22,0 a 22,22 0 1,0 44,0 a 22,22 0 1,0 -44,0" />
            <path d="M 110 60 m -22,0 a 22,12 0 1,0 44,0 a 22,12 0 1,0 -44,0" />
            <circle cx="110" cy="60" r="3" fill="white" />
          </g>
          <text x="160" y="40" fill="white" fontSize="14" fontWeight="700" opacity="0.55">H₂O</text>
          <text x="160" y="80" fill="white" fontSize="14" fontWeight="700" opacity="0.55">O₂</text>
        </svg>
      );
    case "arabic":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <text x="14" y="55" fill="white" fontSize="30" fontWeight="700" opacity="0.55" fontFamily="serif">ا ب ت</text>
          <text x="14" y="100" fill="white" fontSize="20" fontWeight="600" opacity="0.45" fontFamily="serif">قرأ • كتب</text>
          <path d="M 130 20 Q 180 60 130 100" stroke="white" strokeWidth="1.8" fill="none" opacity="0.5" />
          <circle cx="170" cy="60" r="5" fill="white" opacity="0.5" />
        </svg>
      );
    case "english":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <text x="14" y="50" fill="white" fontSize="28" fontWeight="800" opacity="0.55">ABC</text>
          <text x="14" y="95" fill="white" fontSize="18" fontWeight="600" opacity="0.45">Hello!</text>
          <g stroke="white" strokeWidth="1.5" fill="none" opacity="0.5">
            <rect x="130" y="20" width="55" height="36" rx="2" />
            <line x1="130" y1="38" x2="185" y2="38" />
            <line x1="158" y1="20" x2="158" y2="56" />
          </g>
        </svg>
      );
    case "french":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <text x="14" y="50" fill="white" fontSize="26" fontWeight="800" opacity="0.55">Bonjour</text>
          <text x="14" y="90" fill="white" fontSize="16" fontWeight="600" opacity="0.45">à bientôt</text>
          <g fill="white" opacity="0.5">
            <rect x="150" y="20" width="12" height="36" />
            <rect x="162" y="20" width="12" height="36" />
            <rect x="174" y="20" width="12" height="36" />
          </g>
        </svg>
      );
    case "sharia":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <g fill="white" opacity="0.55">
            <path d="M 100 30 a 8 8 0 1 1 0.001 0 Z" />
            <path d="M 80 60 Q 100 35 120 60 L 120 95 L 80 95 Z" />
            <rect x="98" y="20" width="4" height="14" />
            <circle cx="100" cy="14" r="3" />
            <path d="M 60 95 L 60 70 Q 70 65 70 75 L 70 95 Z" />
            <path d="M 140 95 L 140 70 Q 130 65 130 75 L 130 95 Z" />
          </g>
          <text x="14" y="40" fill="white" fontSize="18" fontWeight="700" opacity="0.45" fontFamily="serif">﷽</text>
        </svg>
      );
    case "studies":
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <g fill="white" opacity="0.5">
            <circle cx="50" cy="60" r="32" fill="none" stroke="white" strokeWidth="1.5" />
            <path d="M 18 60 Q 50 30 82 60 Q 50 90 18 60 Z" fill="none" stroke="white" strokeWidth="1" />
            <line x1="50" y1="28" x2="50" y2="92" stroke="white" strokeWidth="1" />
          </g>
          <path d="M 130 30 L 170 25 L 185 50 L 145 95 L 120 80 Z" fill="white" opacity="0.25" stroke="white" strokeWidth="1" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 200 120" className={`${common} ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <circle cx="40" cy="40" r="20" fill="white" opacity="0.2" />
          <circle cx="160" cy="80" r="28" fill="white" opacity="0.15" />
          <circle cx="100" cy="60" r="6" fill="white" opacity="0.4" />
        </svg>
      );
  }
}
