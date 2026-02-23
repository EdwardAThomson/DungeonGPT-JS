/**
 * EncounterDebugPage — encounter system testing and simulation.
 *
 * Ported from src/pages/EncounterDebug.js (477 lines).
 * Functional port — minimal refactoring, uses ported game engine modules.
 * Tests encounter probability, trigger rates, and game flow simulation.
 */

import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { RolledEncounter } from "@/game/encounters/generator";

import { PageCard, PageLayout } from "@/design-system/layouts/page-layout";
import { Button } from "@/design-system/ui/button";
import {
  biomeEncounterChance,
  revisitEncounterMultiplier,
} from "@/game/encounters/data/encounter-tables";
import { checkForEncounter } from "@/game/encounters/generator";
import { cn } from "@/lib/utils";
import { MainNav } from "@/pages/home/main-nav";


// ── Types ───────────────────────────────────────────────────────────────────

interface TrialResult {
  readonly trial: number;
  readonly triggered: boolean;
  readonly name?: string;
  readonly type?: string;
  readonly tier?: string;
  readonly hostile?: boolean;
}

interface TestSummary {
  readonly totalTrials: number;
  readonly triggered: number;
  readonly triggerRate: string;
  readonly encounterTypes: Record<string, number>;
}

interface TestResults {
  readonly summary: TestSummary;
  readonly details: readonly TrialResult[];
  readonly expectedChance: string;
}

interface MoveLogEntry {
  readonly moveNum: number;
  readonly biome: string;
  readonly isFirstVisit: boolean;
  readonly movesSinceLastEncounter: number;
  readonly encounterTriggered: boolean;
  readonly encounterName: string | undefined;
  readonly encounterTier: string | undefined;
  readonly encounterType: string | undefined;
  readonly flow: string;
}

interface GameFlowResults {
  readonly totalMoves: number;
  readonly totalEncounters: number;
  readonly immediateEncounters: number;
  readonly narrativeEncounters: number;
  readonly encounterRate: string;
  readonly moveLog: readonly MoveLogEntry[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const BIOMES = ["plains", "forest", "mountain", "beach", "town", "water"] as const;
const GRIMNESS_LEVELS = ["Noble", "Neutral", "Bleak", "Grim"] as const;

// Grimness modifier — ported from encounterGenerator.js
const grimnessModifier: Record<string, number> = {
  Noble: 0.8,
  Neutral: 1,
  Bleak: 1.2,
  Grim: 1.4,
};

// ── Component ───────────────────────────────────────────────────────────────

export function EncounterDebugPage() {
  // Test parameters
  const [biome, setBiome] = useState("plains");
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const [grimnessLevel, setGrimnessLevel] = useState("Neutral");
  const [movesSince, setMovesSince] = useState(0);
  const [numTrials, setNumTrials] = useState(100);
  const [numMoves, setNumMoves] = useState(20);

  // Results
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [gameFlowResults, setGameFlowResults] =
    useState<GameFlowResults | null>(null);

  const calculateExpectedChance = (): string => {
    const biomeKey = biome === "town" ? "town" : biome;
    let chance = biomeEncounterChance[biomeKey] ?? 0.25;

    if (!isFirstVisit) {
      const multiplier = revisitEncounterMultiplier[biomeKey] ?? 0.3;
      chance *= multiplier;
    }

    chance *= grimnessModifier[grimnessLevel] ?? 1;

    if (movesSince >= 3) chance += 0.1;
    if (movesSince >= 5) chance += 0.15;

    chance = Math.min(chance, 0.7);

    return (chance * 100).toFixed(1);
  };

  const runEncounterTest = () => {
    setIsRunning(true);
    setTestResults(null);

    const tile =
      biome === "town"
        ? { biome: "plains", poi: "town" }
        : { biome };

    const settings = { grimnessLevel };

    let triggered = 0;
    const encounterTypes: Record<string, number> = {};
    const details: TrialResult[] = [];

    for (let i = 0; i < numTrials; i++) {
      const encounter: RolledEncounter | null = checkForEncounter(
        tile,
        isFirstVisit,
        settings,
        movesSince,
      );

      if (encounter) {
        triggered++;
        const type = encounter.templateKey;
        encounterTypes[type] = (encounterTypes[type] ?? 0) + 1;
        details.push({
          trial: i + 1,
          triggered: true,
          name: encounter.name,
          type,
          tier: encounter.encounterTier,
          hostile: encounter.isHostile,
        });
      } else {
        details.push({ trial: i + 1, triggered: false });
      }
    }

    setTestResults({
      summary: {
        totalTrials: numTrials,
        triggered,
        triggerRate: ((triggered / numTrials) * 100).toFixed(1),
        encounterTypes,
      },
      details,
      expectedChance: calculateExpectedChance(),
    });

    setIsRunning(false);
  };

  const runGameFlowSimulation = () => {
    setIsRunning(true);
    setGameFlowResults(null);

    const settings = { grimnessLevel };
    const moveLog: MoveLogEntry[] = [];
    let currentMovesSinceEncounter = 0;
    let totalEncounters = 0;
    let immediateEncounters = 0;
    let narrativeEncounters = 0;
    const visitedTiles = new Set<string>();

    for (let moveNum = 1; moveNum <= numMoves; moveNum++) {
      const randomBiome = BIOMES[Math.floor(Math.random() * BIOMES.length)] ?? "plains";
      const tileKey = `${String(moveNum % 10)},${String(Math.floor(moveNum / 10))}`;
      const isFirstVisitToTile = !visitedTiles.has(tileKey);
      visitedTiles.add(tileKey);

      const tile =
        randomBiome === "town"
          ? { biome: "plains" as const, poi: "town" }
          : { biome: randomBiome };

      const encounter = checkForEncounter(
        tile,
        isFirstVisitToTile,
        settings,
        currentMovesSinceEncounter,
      );

      let flow: string;
      if (encounter) {
        totalEncounters++;
        if (encounter.encounterTier === "immediate") {
          immediateEncounters++;
          flow = "IMMEDIATE -> Modal shown, AI narrative deferred";
        } else {
          narrativeEncounters++;
          flow = "NARRATIVE -> Injected into AI prompt";
        }
        currentMovesSinceEncounter = 0;
      } else {
        currentMovesSinceEncounter++;
        flow = "No encounter -> AI narrative generated normally";
      }

      moveLog.push({
        moveNum,
        biome: randomBiome,
        isFirstVisit: isFirstVisitToTile,
        movesSinceLastEncounter: currentMovesSinceEncounter,
        encounterTriggered: encounter !== null,
        encounterName: encounter?.name,
        encounterTier: encounter?.encounterTier,
        encounterType: encounter?.templateKey,
        flow,
      });
    }

    setGameFlowResults({
      totalMoves: numMoves,
      totalEncounters,
      immediateEncounters,
      narrativeEncounters,
      encounterRate: ((totalEncounters / numMoves) * 100).toFixed(1),
      moveLog,
    });

    setIsRunning(false);
  };

  return (
    <PageLayout nav={<MainNav />}>
      <PageCard>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/debug">Back to Debug</Link>
          </Button>
          <h1 className="text-xl m-0">Encounter System Debug</h1>
        </div>

        <TestParameters
          biome={biome}
          isFirstVisit={isFirstVisit}
          grimnessLevel={grimnessLevel}
          movesSince={movesSince}
          numTrials={numTrials}
          numMoves={numMoves}
          isRunning={isRunning}
          onBiomeChange={setBiome}
          onFirstVisitChange={setIsFirstVisit}
          onGrimnessChange={setGrimnessLevel}
          onMovesSinceChange={setMovesSince}
          onNumTrialsChange={setNumTrials}
          onNumMovesChange={setNumMoves}
          onRunEncounterTest={runEncounterTest}
          onRunGameFlow={runGameFlowSimulation}
        />

        {testResults ? <EncounterTestResults results={testResults} /> : null}
        {gameFlowResults ? (
          <GameFlowResultsDisplay results={gameFlowResults} />
        ) : null}

        <ReferenceData />
      </PageCard>
    </PageLayout>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TestParameters({
  biome,
  isFirstVisit,
  grimnessLevel,
  movesSince,
  numTrials,
  numMoves,
  isRunning,
  onBiomeChange,
  onFirstVisitChange,
  onGrimnessChange,
  onMovesSinceChange,
  onNumTrialsChange,
  onNumMovesChange,
  onRunEncounterTest,
  onRunGameFlow,
}: {
  readonly biome: string;
  readonly isFirstVisit: boolean;
  readonly grimnessLevel: string;
  readonly movesSince: number;
  readonly numTrials: number;
  readonly numMoves: number;
  readonly isRunning: boolean;
  readonly onBiomeChange: (v: string) => void;
  readonly onFirstVisitChange: (v: boolean) => void;
  readonly onGrimnessChange: (v: string) => void;
  readonly onMovesSinceChange: (v: number) => void;
  readonly onNumTrialsChange: (v: number) => void;
  readonly onNumMovesChange: (v: number) => void;
  readonly onRunEncounterTest: () => void;
  readonly onRunGameFlow: () => void;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-5">
      <h2 className="mt-0">Test Parameters</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="debug-biome" className="block mb-1 text-[0.85rem]">Biome:</label>
          <select
            id="debug-biome"
            value={biome}
            onChange={(e) => { onBiomeChange(e.target.value); }}
            className="w-full p-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)]"
          >
            {BIOMES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="debug-grimness" className="block mb-1 text-[0.85rem]">Grimness Level:</label>
          <select
            id="debug-grimness"
            value={grimnessLevel}
            onChange={(e) => { onGrimnessChange(e.target.value); }}
            className="w-full p-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)]"
          >
            {GRIMNESS_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="debug-first-visit" className="block mb-1 text-[0.85rem]">First Visit:</label>
          <input
            id="debug-first-visit"
            type="checkbox"
            checked={isFirstVisit}
            onChange={(e) => { onFirstVisitChange(e.target.checked); }}
          />
        </div>

        <div>
          <label htmlFor="debug-moves-since" className="block mb-1 text-[0.85rem]">
            Moves Since Last Encounter:
          </label>
          <input
            id="debug-moves-since"
            type="number"
            value={movesSince}
            onChange={(e) => {
              onMovesSinceChange(Number.parseInt(e.target.value, 10) || 0);
            }}
            className="w-full p-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)]"
            min="0"
          />
        </div>

        <div>
          <label htmlFor="debug-num-trials" className="block mb-1 text-[0.85rem]">
            Number of Trials:
          </label>
          <input
            id="debug-num-trials"
            type="number"
            value={numTrials}
            onChange={(e) => {
              onNumTrialsChange(Number.parseInt(e.target.value, 10) || 100);
            }}
            className="w-full p-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)]"
            min="10"
            max="1000"
          />
        </div>

        <div>
          <label htmlFor="debug-num-moves" className="block mb-1 text-[0.85rem]">
            Number of Moves (game flow):
          </label>
          <input
            id="debug-num-moves"
            type="number"
            value={numMoves}
            onChange={(e) => {
              onNumMovesChange(Number.parseInt(e.target.value, 10) || 20);
            }}
            className="w-full p-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)]"
            min="5"
            max="100"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <Button onClick={onRunEncounterTest} disabled={isRunning}>
          {isRunning ? "Running..." : "Run Encounter Test"}
        </Button>
        <Button
          onClick={onRunGameFlow}
          disabled={isRunning}
          className="bg-[#4CAF50]"
        >
          {isRunning ? "Running..." : "Simulate Game Flow"}
        </Button>
      </div>
    </div>
  );
}

function EncounterTestResults({
  results,
}: {
  readonly results: TestResults;
}) {
  const { summary, details, expectedChance } = results;

  return (
    <>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-5">
        <h2 className="mt-0">Test Results</h2>
        <div className="mb-4">
          <p>
            <strong>Expected Trigger Chance:</strong> {expectedChance}%
          </p>
          <p>
            <strong>Actual Trigger Rate:</strong> {summary.triggerRate}% (
            {summary.triggered} / {summary.totalTrials})
          </p>
        </div>

        <h3>Encounter Types Rolled:</h3>
        {Object.keys(summary.encounterTypes).length > 0 ? (
          <ul>
            {Object.entries(summary.encounterTypes).map(([type, count]) => (
              <li key={type}>
                <strong>{type}:</strong> {count} times (
                {((count / summary.triggered) * 100).toFixed(1)}% of
                encounters)
              </li>
            ))}
          </ul>
        ) : (
          <p>No encounters triggered</p>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-5">
        <h3 className="mt-0">Detailed Results (showing first 20):</h3>
        <div className="max-h-[400px] overflow-y-auto text-[0.85rem]">
          {details.slice(0, 20).map((result) => (
            <div
              key={`trial-${String(result.trial)}`}
              className={cn(
                "p-2 mb-1 rounded",
                result.triggered
                  ? "bg-[rgba(76,175,80,0.15)]"
                  : "bg-[var(--bg)]",
              )}
            >
              <strong>Trial {result.trial}:</strong>{" "}
              {result.triggered ? (
                <>
                  {"+ "}
                  <strong>{result.name}</strong> ({result.type}) - Tier:{" "}
                  {result.tier}, Hostile: {result.hostile ? "Yes" : "No"}
                </>
              ) : (
                "- No encounter"
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function GameFlowResultsDisplay({
  results,
}: {
  readonly results: GameFlowResults;
}) {
  return (
    <>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-5">
        <h2 className="mt-0">Game Flow Simulation Results</h2>
        <div className="mb-4">
          <p>
            <strong>Total Moves:</strong> {results.totalMoves}
          </p>
          <p>
            <strong>Total Encounters:</strong> {results.totalEncounters} (
            {results.encounterRate}%)
          </p>
          <p>
            <strong>Immediate Encounters:</strong>{" "}
            {results.immediateEncounters} (show modal, defer AI)
          </p>
          <p>
            <strong>Narrative Encounters:</strong>{" "}
            {results.narrativeEncounters} (inject into AI prompt)
          </p>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-5">
        <h3 className="mt-0">Move-by-Move Log:</h3>
        <div className="max-h-[500px] overflow-y-auto text-[0.8rem]">
          {results.moveLog.map((move) => (
            <div
              key={`move-${String(move.moveNum)}`}
              className={cn(
                "p-2.5 mb-1 rounded",
                move.encounterTriggered
                  ? "bg-[rgba(76,175,80,0.15)] border-l-4 border-l-[#4CAF50]"
                  : "bg-[var(--bg)] border-l-4 border-l-[var(--border)]",
              )}
            >
              <div className="mb-1">
                <strong>Move {move.moveNum}:</strong> {move.biome}
                {move.isFirstVisit ? (
                  <span className="text-[#64b5f6] ml-2">(first visit)</span>
                ) : null}
                <span className="text-[var(--text-secondary)] ml-2.5">
                  Moves since last: {move.movesSinceLastEncounter}
                </span>
              </div>
              {move.encounterTriggered ? (
                <div className="ml-4">
                  <div className="text-[#4CAF50]">
                    + <strong>{move.encounterName}</strong> (
                    {move.encounterType})
                  </div>
                  <div className="text-[#FFA726] text-[0.75rem] mt-0.5">
                    Tier: {move.encounterTier} -- {move.flow}
                  </div>
                </div>
              ) : (
                <div className="ml-4 text-[var(--text-secondary)]">
                  - {move.flow}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ReferenceData() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
      <h3 className="mt-0">
        Base Encounter Chances (before modifiers):
      </h3>
      <ul className="text-[0.85rem]">
        <li>
          <strong>Plains:</strong>{" "}
          {((biomeEncounterChance["plains"] ?? 0) * 100).toFixed(0)}%
        </li>
        <li>
          <strong>Forest:</strong>{" "}
          {((biomeEncounterChance["forest"] ?? 0) * 100).toFixed(0)}%
        </li>
        <li>
          <strong>Mountain:</strong>{" "}
          {((biomeEncounterChance["mountain"] ?? 0) * 100).toFixed(0)}%
        </li>
        <li>
          <strong>Beach:</strong>{" "}
          {((biomeEncounterChance["beach"] ?? 0) * 100).toFixed(0)}%
        </li>
        <li>
          <strong>Town:</strong>{" "}
          {((biomeEncounterChance["town"] ?? 0) * 100).toFixed(0)}%
        </li>
        <li>
          <strong>Water:</strong> 0% (no encounters)
        </li>
      </ul>

      <h3>Revisit Multipliers:</h3>
      <ul className="text-[0.85rem]">
        <li>
          <strong>Plains:</strong> {revisitEncounterMultiplier["plains"]}x
        </li>
        <li>
          <strong>Forest:</strong> {revisitEncounterMultiplier["forest"]}x
        </li>
        <li>
          <strong>Mountain:</strong>{" "}
          {revisitEncounterMultiplier["mountain"]}x
        </li>
        <li>
          <strong>Beach:</strong> {revisitEncounterMultiplier["beach"]}x
        </li>
        <li>
          <strong>Town:</strong> {revisitEncounterMultiplier["town"]}x
        </li>
      </ul>

      <h3>Game Flow Logic:</h3>
      <ul className="text-[0.85rem]">
        <li>
          <strong>Immediate encounters:</strong> Modal shown first, AI
          narrative deferred until after resolution
        </li>
        <li>
          <strong>Narrative encounters:</strong> Context injected into AI
          prompt, no modal interruption
        </li>
        <li>
          <strong>No encounter:</strong> AI narrative generated normally
          with surrounding terrain
        </li>
        <li>
          <strong>movesSinceEncounter:</strong> Resets to 0 on any encounter,
          increments on peaceful moves
        </li>
      </ul>
    </div>
  );
}
