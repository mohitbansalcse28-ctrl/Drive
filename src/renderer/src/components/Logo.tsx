export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lumina-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="17" fill="url(#lumina-logo)" />
      <path d="M26 20.5v23c0 1.6 1.7 2.5 3 1.7l18-11.5a2 2 0 0 0 0-3.4L29 18.8c-1.3-.8-3 .1-3 1.7Z" fill="var(--on-accent)" />
    </svg>
  )
}
