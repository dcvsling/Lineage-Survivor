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
  }),
  soulflare: Object.freeze({
    id: 'soulflare',
    name: '魂焰牽引',
    description: '裝備獵魂羅盤且聖焰環達第 3 階，聖焰環攻擊半徑增加 20。',
    required: Object.freeze({orb: 3}),
    requiredRelic: 'compass',
    orbRangeBonus: 20
  })
});

const rank = value => Number.isInteger(value) && value > 0 ? Math.min(5, value) : 0;
const SPELL_LABELS = Object.freeze({orb:'聖焰環', lightning:'雷霆誓約'});
const RELIC_LABELS = Object.freeze({compass:'獵魂羅盤'});

/** Read-only, per-condition unlock progress. No new simulation or save state. */
export function spellComboProgress(upgrades, relicId = 'none') {
  return Object.values(SPELL_COMBOS).map(combo => {
    const requirements = Object.entries(combo.required).map(([id, required]) => {
      const current = rank(upgrades?.[id]);
      return {id, name:SPELL_LABELS[id] ?? id, current, required, met:current >= required};
    });
    const missing = requirements.filter(req => !req.met)
      .map(req => `${req.name} ${req.current}/${req.required} 階`);
    const relicEquipped = !combo.requiredRelic || relicId === combo.requiredRelic;
    if (!relicEquipped) missing.push(`需裝備${RELIC_LABELS[combo.requiredRelic] ?? combo.requiredRelic}（下局出發前選擇）`);
    return {id:combo.id, name:combo.name, active:missing.length === 0,
      requirements, requiredRelic:combo.requiredRelic ?? null, relicEquipped, missing};
  });
}

export function activeSpellCombos(upgrades, relicId = 'none') {
  if (!upgrades || typeof upgrades !== 'object') return [];
  return Object.values(SPELL_COMBOS).filter(combo =>
    (!combo.requiredRelic || combo.requiredRelic === relicId) &&
    Object.entries(combo.required).every(([id, level]) => rank(upgrades[id]) >= level));
}

/** The range seen by combat and preview code is derived from one rule source. */
export function orbRange(upgrades, relicId = 'none') {
  const base = rank(upgrades?.orb) >= 5 ? 122 : 85;
  return activeSpellCombos(upgrades, relicId).reduce(
    (range, combo) => range + (combo.orbRangeBonus ?? 0), base);
}

export function lightningInterval(upgrades) {
  const base = rank(upgrades?.lightning) >= 5 ? 1.3 : 2;
  const interval = activeSpellCombos(upgrades).reduce(
    (value, combo) => value * (combo.lightningIntervalMultiplier ?? 1), base);
  return Math.round(interval * 1000) / 1000;
}
