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
import CampaignMilestoneTest from './CampaignMilestoneTest';
import EncounterTest from './EncounterTest';
import ProgressionTest from './ProgressionTest';
import LLMDebug from './LLMDebug';
import ConversationManager from './ConversationManager';
import EncounterDebug from './EncounterDebug';
import CFWorkerDebug from './CFWorkerDebug';
import ItemIconsTest from './ItemIconsTest';
import EncounterVisualDebug from './EncounterVisualDebug';
import EncounterModalStates from './EncounterModalStates';
import BuildingSearchTest from './BuildingSearchTest';
import ImageGenDebug from './ImageGenDebug';

const sectionIcons = {
  'Terrain & Maps': '🗺️',
  'Encounters': '⚔️',
  'Game Systems': '🎲',
  'Backend & AI': '🔧',
};

const debugSections = [
  {
    title: 'Terrain & Maps',
    links: [
      { to: 'terrain-studio-v2', label: 'Terrain Studio V2' },
      { to: 'terrain-studio', label: 'Terrain Studio (Old)' },
      { to: 'town-map-test', label: 'Town Map Test' },
      { to: 'world-map-test', label: 'World Map Test' },
    ],
  },
  {
    title: 'Encounters',
    links: [
      { to: 'encounter-test', label: 'Encounter Test' },
      { to: 'encounter-debug', label: 'Encounter Debug' },
      { to: '/encounter-debug', label: 'Encounter Modal Test', external: true },
      { to: 'encounter-visual', label: 'Encounter Visual Debug' },
      { to: 'encounter-states', label: 'Modal States Test' },
    ],
  },
  {
    title: 'Game Systems',
    links: [
      { to: 'dice-test', label: 'Dice Test' },
      { to: 'npc-test', label: 'NPC Test' },
      { to: 'seed-debug-test', label: 'Seed Debug Test' },
      { to: 'milestone-test', label: 'Milestone Test (Markers)' },
      { to: 'campaign-milestone-test', label: 'Campaign Milestone Test' },
      { to: 'progression-test', label: 'Progression Test' },
      { to: 'item-icons', label: 'Item Icons Test' },
      { to: 'building-search', label: 'Building Search Test' },
    ],
  },
  {
    title: 'Backend & AI',
    links: [
      { to: 'llm-debug', label: 'LLM Pipeline Debug' },
      { to: 'conversation-manager', label: 'Conversation Manager' },
      { to: 'cf-worker', label: 'CF Worker AI Test' },
      { to: 'image-gen', label: 'Image Generation' },
    ],
  },
];

const DebugIndex = () => (
  <div>
    <h2 style={{ marginTop: 0, fontFamily: 'var(--header-font)' }}>Debug Tools</h2>
    {debugSections.map((section) => (
      <div key={section.title} style={{ marginBottom: 24 }}>
        <h3 style={{
          fontSize: 14,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-muted, #888)',
          marginBottom: 12,
        }}>
          {sectionIcons[section.title]} {section.title}
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}>
          {section.links.map((item) => {
            const target = item.external ? item.to : `/debug/${item.to}`;
            return (
              <Link
                key={item.to}
                to={target}
                style={{
                  textDecoration: 'none',
                  color: 'var(--text)',
                  padding: '16px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  backgroundColor: 'var(--surface)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  fontSize: 14,
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.boxShadow = '0 2px 8px var(--shadow)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

const DebugRoutes = () => {
  const location = useLocation();

  return (
    <div className="page-container" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
      <aside style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, height: 'fit-content' }}>
        <h3 style={{ marginTop: 0 }}>Debug Tools</h3>
        {debugSections.map((section) => (
          <div key={section.title} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted, #888)',
              marginBottom: 6,
            }}>
              {section.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {section.links.map((item) => {
                const target = item.external ? item.to : `/debug/${item.to}`;
                const isActive = location.pathname === target;
                return (
                  <Link
                    key={item.to}
                    to={target}
                    style={{
                      textDecoration: 'none',
                      color: isActive ? 'var(--primary)' : 'var(--text)',
                      fontWeight: isActive ? 700 : 400,
                      fontSize: 13,
                      paddingLeft: 8,
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </aside>
      <section style={{ minWidth: 0 }}>
        <Routes>
          <Route index element={<DebugIndex />} />
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
          <Route path="campaign-milestone-test" element={<CampaignMilestoneTest />} />
          <Route path="progression-test" element={<ProgressionTest />} />
          <Route path="llm-debug" element={<LLMDebug />} />
          <Route path="conversation-manager" element={<ConversationManager />} />
          <Route path="cf-worker" element={<CFWorkerDebug />} />
          <Route path="item-icons" element={<ItemIconsTest />} />
          <Route path="encounter-visual" element={<EncounterVisualDebug />} />
          <Route path="encounter-states" element={<EncounterModalStates />} />
          <Route path="building-search" element={<BuildingSearchTest />} />
          <Route path="image-gen" element={<ImageGenDebug />} />
          <Route path="*" element={<Navigate to="/debug" replace />} />
        </Routes>
      </section>
    </div>
  );
};

export default DebugRoutes;

