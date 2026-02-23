/**
 * InventoryPanel — displays party inventory with per-hero tabs.
 *
 * Shows items with rarity colors, gold, and consumable "Use" buttons.
 */

import { useCallback, useState } from "react";

import type { InventoryItem } from "@/game/inventory/index";
import type { HeroMechanicalState } from "@/stores/game-store";
import type { Character } from "@dungeongpt/shared";

import { Button } from "@/design-system/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/design-system/ui/tabs";
import { rollDice } from "@/game/dice/index";
import { applyHealing } from "@/game/health/index";
import {
  ITEM_CATALOG,
  getRarityColor,
  removeItem,
} from "@/game/inventory/index";
import { useGameStore } from "@/stores/game-store";

/** Parse dice notation like "2d4+2" into {count, sides, bonus}. */
function parseDiceNotation(notation: string): {
  count: number;
  sides: number;
  bonus: number;
} {
  const plusIdx = notation.indexOf("+");
  const hasPlus = plusIdx !== -1;
  const bonusPart = hasPlus ? notation.slice(plusIdx + 1) : "";
  const dicePart = hasPlus ? notation.slice(0, plusIdx) : notation;
  const dIdx = dicePart.indexOf("d");
  if (dIdx === -1) return { count: 1, sides: 4, bonus: 0 };
  return {
    count: Number.parseInt(dicePart.slice(0, dIdx), 10) || 1,
    sides: Number.parseInt(dicePart.slice(dIdx + 1), 10) || 4,
    bonus: bonusPart ? Number.parseInt(bonusPart, 10) || 0 : 0,
  };
}

export function InventoryPanel() {
  const selectedHeroes = useGameStore((s) => s.selectedHeroes);
  const heroStates = useGameStore((s) => s.heroStates);
  const updateHeroState = useGameStore((s) => s.updateHeroState);
  const addMessage = useGameStore((s) => s.addMessage);

  const [activeTab, setActiveTab] = useState<string>("all");

  const handleUseItem = useCallback(
    (heroId: string, itemKey: string) => {
      const state = heroStates[heroId];
      if (!state) return;

      const itemDef = ITEM_CATALOG[itemKey];
      if (!itemDef?.effect || itemDef.effect !== "heal" || !itemDef.amount)
        return;

      // Roll healing amount
      const { count, sides, bonus } = parseDiceNotation(itemDef.amount);
      const rollResult = rollDice(count, sides);
      const healAmount = rollResult.total + bonus;

      // Apply healing
      const healed = applyHealing(
        { currentHP: state.currentHP, maxHP: state.maxHP },
        healAmount,
      );

      // Remove item
      const newInventory = removeItem(state.inventory, itemKey);

      // Find hero name
      const hero = selectedHeroes.find(
        (h) => (h.characterId) === heroId,
      );
      const heroName = hero?.characterName ?? "Hero";

      updateHeroState(heroId, {
        currentHP: healed.currentHP,
        inventory: newInventory,
      });

      addMessage({
        role: "system",
        content: `${heroName} uses ${itemDef.name} and heals for ${String(healAmount)} HP. (${String(healed.currentHP)}/${String(state.maxHP)} HP)`,
      });
    },
    [heroStates, selectedHeroes, updateHeroState, addMessage],
  );

  const heroEntries = selectedHeroes.map((hero) => {
    const id = hero.characterId;
    return { hero, id, state: heroStates[id] };
  });

  const allItems = heroEntries.flatMap(({ id, state }) =>
    (state?.inventory ?? []).map((item) => ({ ...item, heroId: id })),
  );

  const totalGold = heroEntries.reduce(
    (sum, { state }) => sum + (state?.gold ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      {/* Gold display */}
      <div className="flex items-center gap-2 text-lg font-bold">
        <span>&#x1FA99;</span>
        <span>{totalGold} Gold</span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {heroEntries.map(({ hero, id }) => (
            <TabsTrigger key={id} value={id}>
              {hero.characterName}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* All items tab */}
        <TabsContent value="all">
          <ItemList
            items={allItems}
            heroStates={heroStates}
            selectedHeroes={selectedHeroes}
            onUseItem={handleUseItem}
            showHeroName
          />
        </TabsContent>

        {/* Per-hero tabs */}
        {heroEntries.map(({ hero, id, state }) => (
          <TabsContent key={id} value={id}>
            <div className="mb-2 text-sm text-[var(--text-secondary)]">
              {hero.characterName} — {state?.gold ?? 0} gold
            </div>
            <ItemList
              items={(state?.inventory ?? []).map((item) => ({
                ...item,
                heroId: id,
              }))}
              heroStates={heroStates}
              selectedHeroes={selectedHeroes}
              onUseItem={handleUseItem}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ItemList({
  items,
  heroStates,
  selectedHeroes,
  onUseItem,
  showHeroName = false,
}: {
  readonly items: readonly (InventoryItem & { heroId: string })[];
  readonly heroStates: Record<string, HeroMechanicalState>;
  readonly selectedHeroes: readonly Character[];
  readonly onUseItem: (heroId: string, itemKey: string) => void;
  readonly showHeroName?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
        No items in inventory.
      </p>
    );
  }

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {items.map((item, idx) => {
        const isConsumable =
          ITEM_CATALOG[item.key]?.effect === "heal" &&
          !!ITEM_CATALOG[item.key]?.amount;
        const state = heroStates[item.heroId];
        const needsHealing =
          state ? state.currentHP < state.maxHP : false;
        const heroName = showHeroName
          ? selectedHeroes.find(
              (h) =>
                (h.characterId) === item.heroId,
            )?.characterName
          : undefined;

        return (
          <div
            key={`${item.heroId}-${item.key}-${String(idx)}`}
            className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--surface-hover)]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-sm font-medium"
                style={{ color: getRarityColor(item.rarity) }}
              >
                {item.name}
              </span>
              {item.quantity > 1 && (
                <span className="text-xs text-[var(--text-secondary)]">
                  x{item.quantity}
                </span>
              )}
              {item.value > 0 && (
                <span className="text-xs text-[var(--text-secondary)]">
                  ({item.value}g)
                </span>
              )}
              {heroName && (
                <span className="text-xs text-[var(--text-secondary)]">
                  [{heroName}]
                </span>
              )}
            </div>
            {isConsumable && needsHealing && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6"
                onClick={() => {
                  onUseItem(item.heroId, item.key);
                }}
              >
                Use
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
