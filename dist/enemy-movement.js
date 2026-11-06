/** Deterministic enemy movement system over ECS-backed enemy views.
 * Returns pre-move distance, preserving contact timing in Engine.
 */
export function stepEnemyMovement(enemy, player, dt) {
  enemy.slowTimer = Math.max(0, (enemy.slowTimer || 0) - dt);
  const slow = enemy.slowTimer > 0 ? .4 : 1;
  const dx = player.x - enemy.x, dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const approach = enemy.type === 'ranged'
    ? (distance > 260 ? 1 : distance < 170 ? -.6 : 0) : 1;
  enemy.x = Math.max(15, Math.min(2385,
    enemy.x + dx / distance * enemy.speed * slow * approach * dt));
  enemy.y = Math.max(15, Math.min(2385,
    enemy.y + dy / distance * enemy.speed * slow * approach * dt));
  return distance;
}
