// Chess# mark — a "sharp" (#) nested in the open curve of a C. Uses currentColor
// so it inherits the rail accent. Pair with the wordmark where space allows.
export function Logo({ size = 28, title = 'Chess#' }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* C — a thick arc opening to the right */}
      <path
        d="M34 12.5 A14 14 0 1 0 34 35.5"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* sharp ♯ nested in the C's mouth (slanted bars = modern/sharp feel) */}
      <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        <line x1="23" y1="15" x2="20.5" y2="34" />
        <line x1="31" y1="14" x2="28.5" y2="33" />
        <line x1="17" y1="22" x2="34" y2="19.5" />
        <line x1="16" y1="30" x2="33" y2="27.5" />
      </g>
    </svg>
  )
}

export default Logo
