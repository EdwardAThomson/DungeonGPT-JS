import React from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import TownMapTest from './TownMapTest';
import DiceTest from './DiceTest';
import NPCTest from './NPCTest';
import SeedDebugTest from './SeedDebugTest';
import WorldMapTest from './WorldMapTest';
import TerrainStudio from './TerrainStudio';
import TerrainStudioV2 from './TerrainStudioV2';
import MilestoneTest from './MilestoneTest';
import EncounterTest from './EncounterTest';
import ProgressionTest from './ProgressionTest';
import LLMDebug from './LLMDebug';
import ConversationManager from './ConversationManager';
import EncounterDebug from './EncounterDebug';
import CFWorkerDebug from './CFWorkerDebug';

const debugLinks = [
  { to: 'terrain-studio-v2', label: 'Terrain Studio V2' },
  { to: 'terrain-studio', label: 'Terrain Studio (Old)' },
  { to: 'encounter-test', label: 'Encounter Test' },
  { to: 'encounter-debug', label: 'Encounter Debug' },
  { to: 'dice-test', label: 'Dice Test' },
  { to: 'town-map-test', label: 'Town Map Test' },
  { to: 'world-map-test', label: 'World Map Test' },
  { to: 'npc-test', label: 'NPC Test' },
  { to: 'seed-debug-test', label: 'Seed Debug Test' },
  { to: 'milestone-test', label: 'Milestone Test' },
  { to: 'progression-test', label: 'Progression Test' },
  { to: 'llm-debug', label: 'LLM Pipeline Debug' },
  { to: 'conversation-manager', label: 'Conversation Manager' },
  { to: 'cf-worker', label: 'CF Worker AI Test' },
];

const DebugRoutes = () => {
  const location = useLocation();

  return (
    <div className="page-container" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      <aside style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, height: 'fit-content' }}>
        <h3 style={{ marginTop: 0 }}>Debug Tools</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {debugLinks.map((item) => {
            const target = `/debug/${item.to}`;
            const isActive = location.pathname === target;
            return (
              <Link
                key={item.to}
                to={target}
                style={{
                  textDecoration: 'none',
                  color: isActive ? 'var(--primary)' : 'var(--text)',
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>
      <section style={{ minWidth: 0 }}>
        <Routes>
          <Route index element={<Navigate to="llm-debug" replace />} />
          <Route path="terrain-studio-v2" element={<TerrainStudioV2 />} />
          <Route path="terrain-studio" element={<TerrainStudio />} />
          <Route path="encounter-test" element={<EncounterTest />} />
          <Route path="encounter-debug" element={<EncounterDebug />} />
          <Route path="dice-test" element={<DiceTest />} />
          <Route path="town-map-test" element={<TownMapTest />} />
          <Route path="world-map-test" element={<WorldMapTest />} />
          <Route path="npc-test" element={<NPCTest />} />
          <Route path="seed-debug-test" element={<SeedDebugTest />} />
          <Route path="milestone-test" element={<MilestoneTest />} />
          <Route path="progression-test" element={<ProgressionTest />} />
          <Route path="llm-debug" element={<LLMDebug />} />
          <Route path="conversation-manager" element={<ConversationManager />} />
          <Route path="cf-worker" element={<CFWorkerDebug />} />
          <Route path="*" element={<Navigate to="llm-debug" replace />} />
        </Routes>
      </section>
    </div>
  );
};

export default DebugRoutes;

