type Name = "feed" | "write" | "people" | "settings";
const paths: Record<Name, React.ReactNode> = {
  feed: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M7 8h10M7 12h10M7 16h6" />
    </>
  ),
  write: (
    <>
      <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M19 20v-2a6 6 0 0 0-3-5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </>
  ),
};
export function Icon({ name }: { name: Name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="icon">
      {paths[name]}
    </svg>
  );
}
