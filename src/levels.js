import { levelLayout as nativeLayout, availableLevels as nativeLevels } from './native-bands.js';
import { mosaicLayout } from './mosaic.js';

export const COUNT_PRESETS = [96, 216, 384, 600];
export function quantityOptions(sourceCount, repeat) {
  return repeat ? COUNT_PRESETS : [...new Set([.25, .5, .75, 1].map(n => Math.max(1, Math.round(sourceCount * n))))];
}
export function posterCapacity(sourceCount, shape, repeat, requested = null) {
  const value = repeat ? Math.max(sourceCount, requested ?? 216) : Math.min(sourceCount, requested ?? sourceCount);
  return { min: 1, max: repeat ? 600 : sourceCount, step: 1, value: sourceCount ? value : 0 };
}
export function availableLevels(ratios, shape, repeat, requested = null) {
  return repeat ? 4 : nativeLevels(ratios, shape, false, requested);
}
export function levelLayout(count, box, settings, shape, ratios, level, repeat, posterCount) {
  if (!count) return [];
  if (!repeat) return nativeLayout(count, box, { ...settings, gap: 0 }, shape, ratios, level, false, posterCount);
  const budget = posterCapacity(count, shape, true, posterCount).value;
  const groups = new Set(ratios.map(ratio => ratio.toPrecision(12)));
  if (groups.size > 10) return nativeLayout(count, box, { ...settings, gap: 0 }, shape, ratios, level, true, posterCount);
  const plan = mosaicLayout(ratios, shape, level, budget, settings.seed, box.w / box.h);
  if (!plan.complete || plan.levels !== level || plan.blocks.length > Math.max(800, budget * 1.8)) return nativeLayout(count, box, { ...settings, gap: 0 }, shape, ratios, level, true, posterCount);
  const unit = Math.min(box.w / plan.width, box.h / plan.height);
  const left = box.x + (box.w - plan.width * unit) / 2, top = box.y + (box.h - plan.height * unit) / 2;
  return plan.blocks.map((tile, instance) => ({ index: tile.index, instance, level: tile.h,
    x: left + tile.x * unit, y: top + tile.y * unit, w: tile.w * unit, h: tile.h * unit }));
}
