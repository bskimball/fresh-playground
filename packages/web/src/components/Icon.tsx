const paths = {
  leaf: "M20 4C9 2 3 7 5 14c2 7 13 6 15-10ZM4 21 15 10M9 16v-5m0 5h5",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
  drop: "M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12ZM8 15c0 2 1 3 3 3",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  monitor: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 21h8m-4-4v4",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
