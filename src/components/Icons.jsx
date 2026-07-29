const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export function GearIcon() {
  return <svg {...base}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21h-4v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3v-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V3h4v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.1v4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>
}

export function BackIcon() {
  return <svg {...base}><path d="m15 18-6-6 6-6"/></svg>
}

export function BookIcon() {
  return <svg {...base}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H4Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H14v18a3 3 0 0 1 3-3h3Z"/></svg>
}

export function TaskIcon() {
  return <svg {...base}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
}

export function ClockIcon() {
  return <svg {...base}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
}

export function CloudDownIcon() {
  return <svg {...base}><path d="M7 18H6a4 4 0 0 1-.4-8A6.5 6.5 0 0 1 18 8.5a4.5 4.5 0 0 1 0 9H17"/><path d="m9 15 3 3 3-3M12 10v8"/></svg>
}

export function UploadIcon() {
  return <svg {...base}><path d="M7 18H6a4 4 0 0 1-.4-8A6.5 6.5 0 0 1 18 8.5a4.5 4.5 0 0 1 0 9H17"/><path d="m9 13 3-3 3 3M12 10v8"/></svg>
}

export function TrashIcon() {
  return <svg {...base}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>
}
