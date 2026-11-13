/** Pure, stateless spell-combination rules; evaluated from current upgrade ranks.
 * Nothing is persisted, no random numbers are consumed, and inactive builds
 * retain their original cadence.
 */
export const SPELL_COMBOS = Object.freeze({
  thunderflame: Object.freeze({
    id: 'thunderflame',
    name: '雷焰共鳴',
    description: '聖焰環與雷霆誓約皆達第 3 階，雷霆施放間隔縮短 10%。',
    required: Object.freeze({orb: 3, lightning: 3}),
    lightningIntervalMultiplier: 0.9
  })
});

const rank = value => Number.isInteger(value) && value > 0 ? Math.min(5, value) : 0;

export function activeSpellCombos(upgrades) {
  if (!upgrades || typeof upgrades !== 'object') return [];
  return Object.values(SPELL_COMBOS).filter(combo =>
    Object.entries(combo.required).every(([id, level]) => rank(upgrades[id]) >= level));
}

export function lightningInterval(upgrades) {
  const base = rank(upgrades?.lightning) >= 5 ? 1.3 : 2;
  return activeSpellCombos(upgrades).reduce(
    (interval, combo) => interval * combo.lightningIntervalMultiplier, base);
}
