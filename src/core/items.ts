/**
 * Consumables: things a player spends, as opposed to parts they build with.
 *
 * A gene part is an ingredient - it goes into a fusion or a ソウルメイク and
 * comes out as a feature on a creature. A consumable is used, and what it
 * does is its own rule. They are counted separately because they are spent in
 * different places and a screen that mixes them would have to know which is
 * which.
 *
 * There is one of them so far. The catalogue exists anyway, because the
 * second one should not require reshaping an inventory.
 */

import type { GenePart } from './parts.ts';

export type ConsumableId = 'dokuro-geso';

export interface Consumable {
  readonly id: ConsumableId;
  /** Japanese, shown as-is. */
  readonly name: string;
  /** One line, shown as-is. */
  readonly description: string;
}

/** 「ドクロゲソ」: the player's own name for it, and their own rule. */
export const DOKURO_GESO: Consumable = {
  id: 'dokuro-geso',
  name: 'ドクロゲソ',
  description: '戦っている相手を仲間にする。ボスにも使える。',
};

export const CONSUMABLES: Readonly<Record<ConsumableId, Consumable>> = {
  'dokuro-geso': DOKURO_GESO,
};

export function consumableById(id: string): Consumable | undefined {
  return CONSUMABLES[id as ConsumableId];
}

export interface ItemStack {
  readonly item: Consumable;
  readonly count: number;
}

export interface ItemInventory {
  readonly stacks: readonly ItemStack[];
}

export function createItemInventory(stacks: readonly ItemStack[] = []): ItemInventory {
  return { stacks: stacks.filter((stack) => stack.count > 0).map((stack) => ({ ...stack })) };
}

export function itemCount(inventory: ItemInventory, id: ConsumableId): number {
  return inventory.stacks.find((stack) => stack.item.id === id)?.count ?? 0;
}

/** Adds items. Returns a new inventory; the input is untouched. */
export function addItem(
  inventory: ItemInventory,
  item: Consumable,
  count = 1,
): ItemInventory {
  if (count <= 0) return inventory;
  const stacks = inventory.stacks.map((stack) => ({ ...stack }));
  const existing = stacks.find((stack) => stack.item.id === item.id);
  if (existing) {
    stacks[stacks.indexOf(existing)] = { item: existing.item, count: existing.count + count };
  } else {
    stacks.push({ item, count });
  }
  return { ...inventory, stacks };
}

/** Spends items. Returns null when there are not enough, so the caller stops. */
export function removeItem(
  inventory: ItemInventory,
  id: ConsumableId,
  count = 1,
): ItemInventory | null {
  if (itemCount(inventory, id) < count) return null;
  return {
    ...inventory,
    stacks: inventory.stacks
      .map((stack) => (stack.item.id === id ? { item: stack.item, count: stack.count - count } : { ...stack }))
      .filter((stack) => stack.count > 0),
  };
}

/** What the player is holding, flattened for a list. */
export function listItems(
  inventory: ItemInventory,
): readonly { id: ConsumableId; name: string; description: string; count: number }[] {
  return inventory.stacks
    .filter((stack) => stack.count > 0)
    .map((stack) => ({
      id: stack.item.id,
      name: stack.item.name,
      description: stack.item.description,
      count: stack.count,
    }));
}

/** Parts and consumables are different things; this says so in one place. */
export function isConsumable(value: Consumable | GenePart): value is Consumable {
  return !('locus' in value);
}
