# Feature: Shops (buy / sell)

Give gold a purpose: let the party **buy** goods and **sell** loot at commercial buildings.
Today merchants exist as buildings but there's no trade UI, so gold only accumulates.

## Player-facing behaviour
- At **shop**, **market**, **blacksmith**, and **alchemist** buildings, the building modal
  shows a **"Wares"** section:
  - **Buy**: a list of that shop's stock with prices; clicking Buy deducts gold (if the
    party can afford it) and adds the item to the lead hero's inventory.
  - **Sell**: the lead hero's sellable inventory items with a sell price; clicking Sell
    removes the item and adds gold.
- Party gold is shown; Buy is disabled when unaffordable. Quest items are not sellable.

## Pricing
- **Buy price** = `ITEM_CATALOG[key].value`.
- **Sell price** = `round(value * 0.5)`.
- Shop stock is themed by building type (see data below). Stock is **static per visit**
  (no restock timer — non-goal).

## Data model
- **NEW `src/data/shopStock.js`** — `SHOP_STOCK = { shop:[keys], market:[keys],
  blacksmith:[keys], alchemist:[keys] }` using existing `ITEM_CATALOG` keys only (no new
  items, no new art). E.g. shop/market: rations, torch, rope, healing_potion; blacksmith:
  silver_dagger, magic_weapon, hard_leather; alchemist: healing_potion,
  greater_healing_potion, antidote.

## Files (owned by this stream)
- **NEW `src/data/shopStock.js`** — stock lists + `getShopStock(buildingType)`.
- **NEW `src/game/shopController.js`** — PURE, testable transaction logic:
  - `canAfford(party, key)`, `buyItem(party, key)` → `{ party, ok, reason }`,
  - `sellItem(party, key)` → `{ party, gold, ... }`, `buyPrice(key)`, `sellPrice(key)`.
  Operates on the party array (spends from / credits the lead hero, or pooled gold —
  match how gold is stored; reuse `addGold`/`addItem`/`removeItem` from inventorySystem).
- **`src/components/BuildingModal.js`** — the Wares (buy/sell) section for the shop types.
- **`src/pages/Game.js`** — `handleBuy(key)` / `handleSell(key)` that call shopController +
  `setSelectedHeroes`, threaded to BuildingModal.

## Coordinate (shared files)
- `BuildingModal.js` already has quest "Rumours & Tasks" + "Completed Tasks" sections —
  ADD the Wares section alongside them; don't disturb existing ones.
- `Game.js` + the prop chain (`GameModals` → `MapModal` → `TownMapDisplay` → `BuildingModal`)
  already thread `onRest`, `sideQuests`, `onAcceptSideQuest`, `onTurnInQuest`, `party`. Add
  `onBuy`/`onSell` (and reuse the existing `party` prop) the SAME way — additive only.
- Use `inventorySystem` read-only / via its existing exports (`addGold`, `addItem`,
  `removeItem`, `ITEM_CATALOG`); don't change its signatures.

## Tests (`src/game/shopController.test.js`)
- buyPrice/sellPrice from catalog; buy deducts gold + adds item; buy blocked when broke
  (party unchanged); sell adds gold + removes item; quest items can't be sold.

## Back-compat
New feature; nothing to migrate. Shops only appear where those building types exist.

## Non-goals
Haggling, reputation pricing, timed restock, buyback, stolen-goods/fencing.

## Verify
`CI=true npx react-scripts test --watchAll=false` and `CI=false npx react-scripts build`
both green. Do NOT commit or push.
