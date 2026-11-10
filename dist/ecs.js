/** Minimal deterministic ECS storage, independent of DOM and rendering. */
export class ComponentWorld {
  #nextId = 1;
  #entities = new Set();
  #tables = new Map();

  createEntity() {
    const id = this.#nextId++;
    this.#entities.add(id);
    return id;
  }

  addComponent(id, type, data) {
    if (!this.#entities.has(id)) throw new RangeError('Entity does not exist');
    if (typeof type !== 'string' || !type.trim()) throw new TypeError('Component type is required');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Component data must be an object');
    let table = this.#tables.get(type);
    if (!table) {
      table = new Map();
      this.#tables.set(type, table);
    }
    if (table.has(id)) throw new Error('Duplicate component');
    table.set(id, data);
    return data;
  }

  getComponent(id, type) {
    return this.#tables.get(type)?.get(id);
  }

  removeComponent(id, type) {
    return this.#tables.get(type)?.delete(id) ?? false;
  }

  destroyEntity(id) {
    if (!this.#entities.delete(id)) return false;
    for (const table of this.#tables.values()) table.delete(id);
    return true;
  }

  *query(...types) {
    for (const id of this.#entities) {
      if (types.every(type => this.#tables.get(type)?.has(id))) yield id;
    }
  }
}

/**
 * Transition seam for existing combat and renderer consumers of game.player.
 * Position, vitals and movement components own the values; the original
 * player shape remains a live, enumerable view of those components.
 */
export function createPlayerEntity(world, {x, y, radius, hp, maxHp, speed, facing}) {
  const id = world.createEntity();
  const components = {
    position: world.addComponent(id, 'position', {x, y, radius}),
    vitals: world.addComponent(id, 'vitals', {hp, maxHp}),
    movement: world.addComponent(id, 'movement', {speed, facing})
  };
  const player = {};
  for (const [field, type] of [
    ['x', 'position'], ['y', 'position'], ['radius', 'position'],
    ['hp', 'vitals'], ['maxHp', 'vitals'], ['speed', 'movement'], ['facing', 'movement']
  ]) {
    const data = components[type];
    Object.defineProperty(player, field, {
      enumerable: true,
      configurable: true,
      get() { return data[field]; },
      set(value) { data[field] = value; }
    });
  }
  return {id, player};
}

/**
 * Migrates enemy position, vitals, movement and combat state into the same ECS world as the
 * player without changing existing Engine/Renderer enemy object consumers.
 * Legacy IDs are not ECS IDs; ecsEntityId is hidden from serialized snapshots.
 */
export function createEnemyEntity(world, initial) {
  const id = world.createEntity();
  const combatFields = ['damage', 'shootTimer', 'warning', 'aimAngle', 'aimAngles', 'hit'];
  const components = {
    position: world.addComponent(id, 'position', {
      x: initial.x, y: initial.y, radius: initial.radius
    }),
    vitals: world.addComponent(id, 'vitals', {
      hp: initial.hp, maxHp: initial.maxHp
    }),
    movement: world.addComponent(id, 'movement', {
      speed: initial.speed,
      ...(Object.hasOwn(initial, 'slowTimer') ? {slowTimer: initial.slowTimer} : {})
    }),
    // Attack cadence, telegraph and hit feedback are now authoritative ECS
    // state. Keep only fields present on input so generic callers retain the
    // exact shape of their existing serializable enemy view.
    combat: world.addComponent(id, 'combat', Object.fromEntries(
      combatFields.filter(field => Object.hasOwn(initial, field))
        .map(field => [field, initial[field]])
    ))
  };
  world.addComponent(id, 'enemy', {id: initial.id, type: initial.type});
  const enemy = {...initial};
  for (const [field, type] of [
    ['x', 'position'], ['y', 'position'], ['radius', 'position'],
    ['hp', 'vitals'], ['maxHp', 'vitals'], ['speed', 'movement'],
    ...combatFields.filter(field => Object.hasOwn(initial, field)).map(field => [field, 'combat'])
  ]) {
    const data = components[type];
    Object.defineProperty(enemy, field, {
      enumerable: true, configurable: true,
      get() { return data[field]; },
      set(value) { data[field] = value; }
    });
  }
  // Historically slowTimer is absent until a frost effect or the first update.
  // Keep JSON/Object.keys stable while owning the timer in ECS movement state.
  const hadSlowTimer = Object.hasOwn(initial, 'slowTimer');
  Object.defineProperty(enemy, 'slowTimer', {
    enumerable: hadSlowTimer, configurable: true,
    get() { return components.movement.slowTimer; },
    set(value) {
      components.movement.slowTimer = value;
      if (!Object.prototype.propertyIsEnumerable.call(enemy, 'slowTimer')) {
        Object.defineProperty(enemy, 'slowTimer', {enumerable: true});
      }
    }
  });
  Object.defineProperty(enemy, 'ecsEntityId', {value: id});
  return {id, enemy};
}


/**
 * Player-owned skill and spell timers. The engine continues to expose its
 * historical enumerable fields as live views, preserving save-independent
 * deterministic snapshots and existing renderer/HUD consumers.
 */
export function createPlayerCombatState(world, playerId) {
  return {
    ability: world.addComponent(playerId, 'ability', {
      cooldown: 0, duration: 0, dashDirection: {x: 1, y: 0}
    }),
    spells: world.addComponent(playerId, 'spells', {
      attackTimer: 0, orbTimer: 0, lightningTimer: 2
    })
  };
}

/** Bind an existing public engine field to an ECS-owned component field. */
export function exposeComponentField(target, field, component, key = field) {
  Object.defineProperty(target, field, {
    enumerable: true, configurable: true,
    get() { return component[key]; },
    set(value) { component[key] = value; }
  });
}
