// Queue policy is independent of DOM/audio and accounting.
export function nextIndex({ length, current, direction = 1, shuffle = false, repeat = 'off', ended = false, random = Math.random }) {
  if (!length) return -1;
  if (current < 0) return 0;
  if (ended && repeat === 'one') return current;
  if (shuffle && length > 1) {
    const other = Math.min(length - 2, Math.floor(random() * (length - 1)));
    return other >= current ? other + 1 : other;
  }
  const next = current + direction;
  if (next >= 0 && next < length) return next;
  return repeat === 'all' ? (next + length) % length : -1;
}
