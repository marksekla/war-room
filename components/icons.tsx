// Line icons (24px grid, 1.75 stroke, round joins) drawn to match each other. They take the
// current text color, so they follow the theme.

type P = { className?: string; size?: number; strokeWidth?: number };

function Svg({ className = "", size = 18, strokeWidth = 1.75, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
  </Svg>
);
export const IconSparkles = (p: P) => (
  <Svg {...p}>
    <path d="M11 3.5l1.6 4.4 4.4 1.6-4.4 1.6L11 15.5l-1.6-4.4L5 9.5l4.4-1.6z" />
    <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </Svg>
);
export const IconTrade = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h15M15.5 4.5L19 8l-3.5 3.5" />
    <path d="M20 16H5M8.5 12.5L5 16l3.5 3.5" />
  </Svg>
);
export const IconUserPlus = (p: P) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
    <path d="M19 8v6M16 11h6" />
  </Svg>
);
export const IconLineup = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="4" width="15" height="17" rx="2" />
    <path d="M9 3h6v2.5H9z" />
    <path d="M8.5 11h7M8.5 15h7M8.5 18.5h4" />
  </Svg>
);
export const IconPulse = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h4l2.5-6.5 5 13L17 12h4" />
  </Svg>
);
export const IconLayers = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
    <path d="M3.5 12.5l8.5 4.5 8.5-4.5" />
    <path d="M3.5 16.5l8.5 4.5 8.5-4.5" />
  </Svg>
);
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
    <circle cx="15" cy="6.5" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="17.5" r="2" />
  </Svg>
);
export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </Svg>
);
export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z" />
  </Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 4.5V9h-4.5" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);
export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
);
export const IconUnlock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 7.6-1.7" />
  </Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.2" />
  </Svg>
);
export const IconSwapVertical = (p: P) => (
  <Svg {...p}>
    <path d="M8 4v16M4.5 7.5L8 4l3.5 3.5" />
    <path d="M16 20V4M12.5 16.5L16 20l3.5-3.5" />
  </Svg>
);
export const IconBarChart = (p: P) => (
  <Svg {...p}>
    <path d="M5 20v-8M10 20V5M15 20v-6M20 20V9" />
  </Svg>
);
export const IconTarget = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" />
  </Svg>
);
export const IconTrophy = (p: P) => (
  <Svg {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 5.5H5.5a2.5 2.5 0 0 0 2.6 3.9M16 5.5h2.5a2.5 2.5 0 0 1-2.6 3.9" />
    <path d="M12 13v3.5M8.5 20h7M9.5 16.5h5V20h-5z" />
  </Svg>
);
export const IconTrendUp = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 16.5l5.5-5.5 4 4 7.5-7.5" />
    <path d="M15 7.5h5.5V13" />
  </Svg>
);
export const IconListOrdered = (p: P) => (
  <Svg {...p}>
    <path d="M10 6.5h10M10 12h10M10 17.5h10" />
    <path d="M4.5 5.5l1-.5v3M4 11.5c.4-.6 1.8-.7 1.8.3 0 .7-1.8 1.6-1.8 2.2h2M4 16.2c.5-.5 2-.5 2 .4 0 .5-.4.7-.9.8.6.1 1 .4 1 .9 0 .9-1.5 1-2.1.4" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l9 15.5H3z" />
    <path d="M12 10v4.5M12 17v.2" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconSwitch = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h14.5M15 4.5L18.5 8 15 11.5" />
    <path d="M20 16H5.5M9 12.5L5.5 16 9 19.5" />
  </Svg>
);
export const IconWind = (p: P) => (
  <Svg {...p}>
    <path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7" />
  </Svg>
);
export const IconRain = (p: P) => (
  <Svg {...p}>
    <path d="M7 15a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.2 2 3.5 3.5 0 0 1-.8 7z" />
    <path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" />
  </Svg>
);
export const IconSnow = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
  </Svg>
);
