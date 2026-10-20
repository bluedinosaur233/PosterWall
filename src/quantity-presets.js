// The same six capacity targets guide catalogue generation and the editor.
// Reserve room for later choices so sparse families never repeat a capacity.
export function selectQuantityPresets(values) {
  const counts = [...new Set(values)].filter(n => n > 0 && n <= 200).sort((a, b) => a - b);
  const targets = [9, 24, 48, 80, 120, 192];
  if (counts.length <= targets.length) return counts;
  const selected = [];
  for (const [index, target] of targets.entries()) {
    const remaining = counts.filter(n => n > (selected.at(-1) ?? 0));
    const choices = remaining.slice(0, remaining.length - (targets.length - index - 1));
    selected.push(choices.reduce((best, n) => Math.abs(n - target) < Math.abs(best - target) ? n : best));
  }
  return selected;
}
