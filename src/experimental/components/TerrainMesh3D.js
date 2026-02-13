import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Sky, Environment, Html, Line } from '@react-three/drei';
import * as THREE from 'three';

// ─── Styles ───────────────────────────────────────────────────────────────────
const PARCHMENT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600&display=swap');
  
  .town-parchment {
    position: relative;
    background: radial-gradient(circle, #f4e4bc 0%, #e8d4a8 100%);
    color: #4a2c1d;
    padding: 6px 36px;
    font-family: 'Cinzel', serif;
    font-weight: 600;
    font-size: 26px;
    white-space: nowrap;
    box-shadow: 0 6px 16px rgba(0,0,0,0.4);
    pointer-events: none;
    user-select: none;
    border-top: 1px solid rgba(255,255,255,0.3);
    border-bottom: 2px solid rgba(0,0,0,0.2);
  }

  .town-parchment::before,
  .town-parchment::after {
    content: '';
    position: absolute;
    top: 10px;
    bottom: -10px;
    width: 24px;
    background: #cbb98f;
    box-shadow: inset 0 0 10px rgba(0,0,0,0.3);
    z-index: -1;
  }

  .town-parchment::before {
    left: -16px;
    border-radius: 8px 0 0 8px;
    transform: perspective(200px) rotateY(-30deg);
  }

  .town-parchment::after {
    right: -16px;
    border-radius: 0 8px 8px 0;
    transform: perspective(200px) rotateY(30deg);
  }
`;

// ─── Shared Constants ──────────────────────────────────────────────────────────
// HEIGHT_SCALE is now dynamic based on resolution (75 at 256px, 100 at 512px)
// ─── Elevation → Color ────────────────────────────────────────────────────────
export const colorStops = [
    { t: 0.00, color: new THREE.Color('#0a2a5e') }, // deep ocean
    { t: 0.15, color: new THREE.Color('#1a5fa0') }, // ocean
    { t: 0.28, color: new THREE.Color('#4a90d9') }, // shallow water
    { t: 0.29, color: new THREE.Color('#f0e6a8') }, // beach/sand (Sharpened transition)
    { t: 0.35, color: new THREE.Color('#8bc34a') }, // lowland grass
    { t: 0.50, color: new THREE.Color('#4caf50') }, // plains
    { t: 0.62, color: new THREE.Color('#2d7d32') }, // forest
    { t: 0.75, color: new THREE.Color('#6d5c3e') }, // highland rock
    { t: 0.85, color: new THREE.Color('#8b8b8b') }, // mountain
    { t: 0.93, color: new THREE.Color('#c0c0c0') }, // high peak
    { t: 1.00, color: new THREE.Color('#f5f5f5') }, // snow
];

export function elevationToColor(t, out) {
    const clamped = Math.max(0, Math.min(1, t));
    const target = out || new THREE.Color();
    for (let i = 1; i < colorStops.length; i++) {
        if (clamped <= colorStops[i].t) {
            const a = colorStops[i - 1];
            const b = colorStops[i];
            const frac = (clamped - a.t) / (b.t - a.t);
            target.lerpColors(a.color, b.color, frac);
            return target;
        }
    }
    target.copy(colorStops[colorStops.length - 1].color);
    return target;
}

// ─── Terrain Mesh ──────────────────────────────────────────────────────────────
const SmoothTerrain = ({ heightmap, mapWidth, mapHeight, heightScale, towns = [], terrainDataWaterThreshold }) => {
    const meshRef = useRef();
    // heightScale can affect mountain height I think

    // Build a DataTexture for crisp per-pixel coloring
    const texture = useMemo(() => {
        const data = new Uint8Array(mapWidth * mapHeight * 4);

        let min = Infinity, max = -Infinity;
        for (let i = 0; i < heightmap.length; i++) {
            if (heightmap[i] < min) min = heightmap[i];
            if (heightmap[i] > max) max = heightmap[i];
        }
        const range = max - min || 1;

        // Use the threshold provided by the generator for perfect synchronization.
        const waterThreshold = terrainDataWaterThreshold;
        const waterNorm = (waterThreshold - min) / range;

        const tmpColor = new THREE.Color();
        const waterColor = { r: 0.16, g: 0.42, b: 0.68 }; // uniform water blue

        for (let i = 0; i < mapWidth * mapHeight; i++) {
            const h = heightmap[i];
            const normalised = (h - min) / range;
            if (h <= waterThreshold) {
                // Uniform color for all underwater terrain
                data[i * 4 + 0] = Math.floor(waterColor.r * 255);
                data[i * 4 + 1] = Math.floor(waterColor.g * 255);
                data[i * 4 + 2] = Math.floor(waterColor.b * 255);
            } else {
                elevationToColor(normalised, tmpColor);
                data[i * 4 + 0] = Math.floor(tmpColor.r * 255);
                data[i * 4 + 1] = Math.floor(tmpColor.g * 255);
                data[i * 4 + 2] = Math.floor(tmpColor.b * 255);
            }
            data[i * 4 + 3] = 255;
        }

        // Splat town dirt texture (pure dirt, no paving)
        const dirtColor = { r: 139, g: 69, b: 19 }; // SaddleBrown

        towns.forEach(t => {
            // Increased radius to cover more buildings
            const r = t.size === 'city' ? 12 : (t.size === 'town' ? 9 : 6);
            const cx = Math.floor(t.x);
            const cy = Math.floor(t.y);

            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist <= r) {
                            const idx = (ny * mapWidth + nx) * 4;
                            // Ensure we don't paint over water
                            const isWater = data[idx] === Math.floor(waterColor.r * 255) &&
                                data[idx + 1] === Math.floor(waterColor.g * 255) &&
                                data[idx + 2] === Math.floor(waterColor.b * 255);

                            if (!isWater) {
                                const factor = (1 - dist / r); // 1 at center, 0 at edge

                                // Blend
                                data[idx] = data[idx] * (1 - factor) + dirtColor.r * factor * 0.9;
                                data[idx + 1] = data[idx + 1] * (1 - factor) + dirtColor.g * factor * 0.9;
                                data[idx + 2] = data[idx + 2] * (1 - factor) + dirtColor.b * factor * 0.9;
                            }
                        }
                    }
                }
            }
        });

        const tex = new THREE.DataTexture(data, mapWidth, mapHeight, THREE.RGBAFormat);
        tex.flipY = true;
        tex.needsUpdate = true;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
    }, [heightmap, mapWidth, mapHeight, towns]);

    const geometry = useMemo(() => {
        // Pixel-perfect alignment: mesh width is (pixels - 1) so each segment is exactly 1 unit.
        const geo = new THREE.PlaneGeometry(mapWidth - 1, mapHeight - 1, mapWidth - 1, mapHeight - 1);
        geo.rotateX(-Math.PI / 2);

        const positions = geo.attributes.position;

        // Use the threshold provided by the generator
        const waterThreshold = terrainDataWaterThreshold;

        for (let i = 0; i < mapWidth * mapHeight; i++) {
            const h = heightmap[i];
            const finalY = Math.max(h, waterThreshold) * heightScale;
            positions.setY(i, finalY);
        }

        positions.needsUpdate = true;
        geo.computeVertexNormals();
        return geo;
    }, [heightmap, mapWidth, mapHeight, terrainDataWaterThreshold, heightScale]);

    const skirtGeometries = useMemo(() => {
        if (!heightmap) return [];
        const base = -10; // depth of the skirt base

        const waterThreshold = terrainDataWaterThreshold;

        // Define the 4 sides: [North, South, West, East]
        // Alignment is now precise to (mapWidth-1)/2
        const wLimit = (mapWidth - 1) / 2;
        const hLimit = (mapHeight - 1) / 2;

        const sideConfigs = [
            { name: 'N', axis: 'x', segments: mapWidth - 1, length: mapWidth - 1, mapY: 0, rotY: Math.PI, pos: [0, 0, -hLimit] },
            { name: 'S', axis: 'x', segments: mapWidth - 1, length: mapWidth - 1, mapY: mapHeight - 1, rotY: 0, pos: [0, 0, hLimit] },
            { name: 'W', axis: 'y', segments: mapHeight - 1, length: mapHeight - 1, mapX: 0, rotY: -Math.PI / 2, pos: [-wLimit, 0, 0] },
            { name: 'E', axis: 'y', segments: mapHeight - 1, length: mapHeight - 1, mapX: mapWidth - 1, rotY: Math.PI / 2, pos: [wLimit, 0, 0] }
        ];

        return sideConfigs.map(side => {
            const geo = new THREE.PlaneGeometry(side.length, 1, side.segments, 1);
            const pos = geo.attributes.position;

            for (let i = 0; i <= side.segments; i++) {
                // Correct sampling logic for each side
                const sampleIdx = (side.name === 'N' || side.name === 'E') ? side.segments - i : i;
                const x = side.axis === 'x' ? sampleIdx : (side.mapX || 0);
                const y = side.axis === 'y' ? sampleIdx : (side.mapY || 0);
                const h = Math.max(heightmap[y * mapWidth + x], waterThreshold) * heightScale;

                // Correcting vertex ordering: 
                // In PlaneGeometry(..., segments, 1), vertices 0..segments are Row 0 (TOP)
                // and vertices segments+1..2*segments+1 are Row 1 (BOTTOM).
                pos.setY(i, h); // Map terrain height to top edge
                pos.setY(i + side.segments + 1, base); // Map base depth to bottom edge
            }
            geo.computeVertexNormals();
            return { geo, pos: side.pos, rotY: side.rotY };
        });
    }, [heightmap, mapWidth, mapHeight, terrainDataWaterThreshold, heightScale]);

    const skirtMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#4d3a2b',
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide // Ensure visibility from all angles
    }), []);

    return (
        <group>
            <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
                <meshStandardMaterial
                    map={texture}
                    flatShading
                    roughness={0.85}
                    metalness={0.05}
                />
            </mesh>
            {/* Skirt Walls */}
            {skirtGeometries.map((s, i) => (
                <mesh key={i} geometry={s.geo} material={skirtMaterial} position={s.pos} rotation={[0, s.rotY, 0]} />
            ))}
        </group>
    );
};

// ─── Forest Layer ──────────────────────────────────────────────────────────────
const ForestLayer = ({ heightmap, forestMap, mapWidth, mapHeight, waterThreshold, heightScale, treeDensity = 50, towns = [], roadMap = null }) => {
    const { trunkMesh, canopyMesh } = useMemo(() => {
        if (!forestMap || !heightmap || treeDensity <= 0) return { trunkMesh: null, canopyMesh: null };

        // treeDensity 0-100 maps to threshold: high density = low threshold
        // Adjusted threshold range (0.6 to 0.15) to restore visibility
        // Product of suitability * noise peaks at 0.5-0.6, so 0.85 was too high.
        const threshold = 0.70 - (treeDensity / 100) * 0.45;

        // Stride: Keep it very low (1-2) so trees are always packed tightly within clumps
        const stride = treeDensity > 75 ? 1 : 2;

        // Collect tree positions from the forest density map
        const positions = [];
        let rngState = 777;
        const rng = () => { rngState = (rngState * 9301 + 49297) % 233280; return rngState / 233280; };

        // Bilinear helper for smooth height sampling
        const getInterpHeight = (px, py) => {
            const fx = Math.max(0, Math.min(mapWidth - 1.001, px));
            const fy = Math.max(0, Math.min(mapHeight - 1.001, py));
            const ix = Math.floor(fx), iy = Math.floor(fy);
            const tx = fx - ix, ty = fy - iy;
            const h00 = heightmap[iy * mapWidth + ix];
            const h10 = heightmap[iy * mapWidth + ix + 1];
            const h01 = heightmap[(iy + 1) * mapWidth + ix];
            const h11 = heightmap[(iy + 1) * mapWidth + ix + 1];
            return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
        };

        for (let y = stride; y < mapHeight - stride; y += stride) {
            for (let x = stride; x < mapWidth - stride; x += stride) {
                const density = forestMap[y * mapWidth + x];
                if (density < threshold) continue;

                // Jitter position for natural look
                const jx = x + (rng() - 0.5) * stride * 0.8;
                const jy = y + (rng() - 0.5) * stride * 0.8;

                // Use interpolated height at the jittered position
                const h = getInterpHeight(jx, jy);

                // Skip if underwater or TOO close to water (shoreline check)
                // We add a +0.1 buffer to h vs waterThreshold to prevent visually submerged bases
                if (h <= waterThreshold + 0.005) continue;

                // World position: PlaneGeometry centered at origin
                const wx = jx - (mapWidth - 1) / 2;
                const wz = jy - (mapHeight - 1) / 2;
                const wy = h * heightScale;

                // Skip if inside a town radius (prevent tree-building overlap)
                let inTown = false;
                for (const t of towns) {
                    const config = { city: 8, town: 6, village: 4 };
                    const exclusionR = config[t.size] || 4;
                    const tdx = jx - t.x, tdy = jy - t.y;
                    if (tdx * tdx + tdy * tdy < exclusionR * exclusionR) { inTown = true; break; }
                }
                if (inTown) continue;

                // Skip if on or near a road
                if (roadMap) {
                    const ix = Math.floor(Math.max(0, Math.min(mapWidth - 1, jx)));
                    const iy = Math.floor(Math.max(0, Math.min(mapHeight - 1, jy)));
                    let onRoad = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = ix + dx, ny = iy + dy;
                            if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
                                if (roadMap[ny * mapWidth + nx]) { onRoad = true; break; }
                            }
                        }
                        if (onRoad) break;
                    }
                    if (onRoad) continue;
                }

                const scale = 0.6 + rng() * 0.8; // tree size variation
                const rotation = rng() * Math.PI * 2;
                positions.push({ x: wx, y: wy, z: wz, scale, rotation });
            }
        }

        if (positions.length === 0) return { trunkMesh: null, canopyMesh: null };

        // Trunk geometry
        const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 1.5, 5);
        trunkGeo.translate(0, 0.75, 0);
        const trunkMat = new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.9 });
        const tMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);

        // Canopy geometry
        const canopyGeo = new THREE.ConeGeometry(1.2, 2.5, 6);
        canopyGeo.translate(0, 2.8, 0);
        const canopyMat = new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.8 });
        const cMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, positions.length);

        const dummy = new THREE.Object3D();
        positions.forEach((pos, i) => {
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.scale.setScalar(pos.scale);
            dummy.rotation.set(0, pos.rotation, 0);
            dummy.updateMatrix();
            tMesh.setMatrixAt(i, dummy.matrix);
            cMesh.setMatrixAt(i, dummy.matrix);
        });
        tMesh.instanceMatrix.needsUpdate = true;
        cMesh.instanceMatrix.needsUpdate = true;

        return { trunkMesh: tMesh, canopyMesh: cMesh };
    }, [heightmap, forestMap, mapWidth, mapHeight, waterThreshold, treeDensity, towns, roadMap]);

    if (!trunkMesh || !canopyMesh) return null;

    return (
        <group>
            <primitive object={trunkMesh} />
            <primitive object={canopyMesh} />
        </group>
    );
};

// ─── Town Layer ────────────────────────────────────────────────────────────────
const TOWN_CONFIG = {
    city: { buildings: 10, radius: 7, maxStoreys: 3, hasKeep: true },
    town: { buildings: 7, radius: 5, maxStoreys: 2, hasKeep: true },
    village: { buildings: 4, radius: 3, maxStoreys: 1, hasKeep: false }
};

const FLOOR_HEIGHT = 0.6;

const STONE_COLORS = ['#b0b0b0', '#a3a3a3', '#999999', '#b8b8b8', '#ababab', '#9e9e9e', '#c0c0c0'];
const ROOF_COLORS = ['#8b4513', '#6b3410', '#7a3d15', '#5c2e0e', '#944a18'];

const TownLayer = ({ towns, heightmap, roadMap, mapWidth, mapHeight, waterThreshold, heightScale, maxTowns = 8, showTownNames = true }) => {
    const { wallMesh, roofMesh, keepGroup } = useMemo(() => {
        if (!towns || towns.length === 0 || !heightmap || maxTowns <= 0)
            return { wallMesh: null, roofMesh: null, keepGroup: null };

        const visibleTowns = towns.slice(0, maxTowns);
        const walls = [];   // box buildings
        const roofs = [];   // pyramid roofs
        const keeps = [];   // keep/tower buildings

        let rngState = 999;
        const rng = () => { rngState = (rngState * 9301 + 49297) % 233280; return rngState / 233280; };

        const getTerrainY = (bx, by) => {
            const cx = Math.floor(Math.max(0, Math.min(mapWidth - 1, bx)));
            const cy = Math.floor(Math.max(0, Math.min(mapHeight - 1, by)));

            // Reject if on road (check 3x3 area to avoid corner clipping)
            if (roadMap) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
                            if (roadMap[ny * mapWidth + nx]) return null;
                        }
                    }
                }
            }

            const h = heightmap[cy * mapWidth + cx];
            // Reject if at or near water — buffer zone prevents shore-edge buildings
            const buffer = waterThreshold * 1.05;
            if (h <= buffer) return null;
            return h * heightScale;
        };

        for (const town of visibleTowns) {
            const config = TOWN_CONFIG[town.size] || TOWN_CONFIG.village;
            const buildings = config.buildings;
            const radius = config.radius;

            // Place keep at town center for cities/towns
            if (config.hasKeep) {
                const wy = getTerrainY(town.x, town.y);
                if (wy !== null) {
                    const wx = town.x - (mapWidth - 1) / 2;
                    const wz = town.y - (mapHeight - 1) / 2;
                    const keepStoreys = town.size === 'city' ? 4 : 3;
                    const keepH = keepStoreys * FLOOR_HEIGHT;
                    const keepW = 1.2;
                    keeps.push({
                        x: wx, y: wy, z: wz,
                        height: keepH, width: keepW, depth: keepW,
                        rotation: rng() * Math.PI * 0.25,
                        roofHeight: keepH * 0.5
                    });
                }
            }

            // Place buildings around the town (with collision avoidance)
            const placedPositions = []; // track placed building centers in map space
            if (config.hasKeep) placedPositions.push({ x: town.x, y: town.y, r: 1.0 });
            let attempts = 0;
            let placed = 0;

            // Increased attempts significantly to ensure density
            while (placed < buildings && attempts < buildings * 20) {
                attempts++;
                const angle = rng() * Math.PI * 2;
                const minDist = config.hasKeep ? 2.0 : 0;
                // Square root distribution for uniform area coverage, but biased slightly outward
                const dist = minDist + Math.sqrt(rng()) * radius;

                let bx = town.x + Math.cos(angle) * dist;
                let by = town.y + Math.sin(angle) * dist;

                let wy = getTerrainY(bx, by);

                // Nudge logic: if initial spot is bad (e.g. road), try nearby offsets
                if (wy === null) {
                    const offsets = [
                        [2, 0], [-2, 0], [0, 2], [0, -2],
                        [1.5, 1.5], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5]
                    ];
                    for (const o of offsets) {
                        const nbx = bx + o[0];
                        const nby = by + o[1];
                        const nwy = getTerrainY(nbx, nby);
                        if (nwy !== null) {
                            bx = nbx; by = nby; wy = nwy;
                            break; // Found a valid spot
                        }
                    }
                }

                if (wy === null) continue;

                // Extra check for roads at building center
                if (roadMap) {
                    const ix = Math.floor(Math.max(0, Math.min(mapWidth - 1, bx)));
                    const iy = Math.floor(Math.max(0, Math.min(mapHeight - 1, by)));
                    if (roadMap[iy * mapWidth + ix]) continue;
                }

                // Check collision with already-placed buildings
                let collision = false;
                for (const p of placedPositions) {
                    const dx = bx - p.x, dy = by - p.y;
                    if (Math.sqrt(dx * dx + dy * dy) < 1.3) { collision = true; break; }
                }
                if (collision) continue;

                placedPositions.push({ x: bx, y: by, r: 0.6 });
                placed++;

                const wx = bx - (mapWidth - 1) / 2;
                const wz = by - (mapHeight - 1) / 2;

                // Discrete storey count: 1, 2, or rarely 3
                let storeys;
                const roll = rng();
                if (config.maxStoreys >= 3 && roll > 0.85) storeys = 3;
                else if (config.maxStoreys >= 2 && roll > 0.4) storeys = 2;
                else storeys = 1;

                const bHeight = storeys * FLOOR_HEIGHT;
                const bWidth = 0.7 + rng() * 0.5;   // thicker (0.7–1.2)
                const bDepth = 0.7 + rng() * 0.5;
                const rotation = rng() * Math.PI * 0.5;
                const colorIdx = Math.floor(rng() * STONE_COLORS.length);
                const roofColorIdx = Math.floor(rng() * ROOF_COLORS.length);

                walls.push({
                    x: wx, y: wy, z: wz,
                    height: bHeight, width: bWidth, depth: bDepth,
                    rotation, colorIdx
                });

                // Roof: pyramid sitting on top of the building (matches building footprint)
                roofs.push({
                    x: wx, y: wy + bHeight, z: wz,
                    width: bWidth, depth: bDepth,
                    height: 0.5 + rng() * 0.3,
                    rotation, colorIdx: roofColorIdx
                });
            }
        }

        // ── Build wall instances ──
        let wallResult = null;
        if (walls.length > 0) {
            const wallGeo = new THREE.BoxGeometry(1, 1, 1);
            wallGeo.translate(0, 0.5, 0);
            const wallMat = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.9, metalness: 0.05 });
            const wMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
            const wallColors = new Float32Array(walls.length * 3);
            const tmpC = new THREE.Color();
            const dummy = new THREE.Object3D();

            walls.forEach((w, i) => {
                dummy.position.set(w.x, w.y, w.z);
                dummy.scale.set(w.width, w.height, w.depth);
                dummy.rotation.set(0, w.rotation, 0);
                dummy.updateMatrix();
                wMesh.setMatrixAt(i, dummy.matrix);
                tmpC.set(STONE_COLORS[w.colorIdx]);
                wallColors[i * 3] = tmpC.r;
                wallColors[i * 3 + 1] = tmpC.g;
                wallColors[i * 3 + 2] = tmpC.b;
            });
            wMesh.instanceMatrix.needsUpdate = true;
            wMesh.instanceColor = new THREE.InstancedBufferAttribute(wallColors, 3);
            wallResult = wMesh;
        }

        // ── Build roof instances ──
        let roofResult = null;
        if (roofs.length > 0) {
            const roofGeo = new THREE.ConeGeometry(0.5 * Math.SQRT2, 1, 4); // sqrt(2) radius so pyramid edges align with box faces
            roofGeo.translate(0, 0.5, 0);
            roofGeo.rotateY(Math.PI / 4); // align edges with box faces
            const roofMat = new THREE.MeshStandardMaterial({ color: '#7a3d15', roughness: 0.85, metalness: 0.0 });
            const rMesh = new THREE.InstancedMesh(roofGeo, roofMat, roofs.length);
            const roofColors = new Float32Array(roofs.length * 3);
            const tmpC = new THREE.Color();
            const dummy = new THREE.Object3D();

            roofs.forEach((r, i) => {
                dummy.position.set(r.x, r.y, r.z);
                dummy.scale.set(r.width, r.height, r.depth);
                dummy.rotation.set(0, r.rotation, 0);
                dummy.updateMatrix();
                rMesh.setMatrixAt(i, dummy.matrix);
                tmpC.set(ROOF_COLORS[r.colorIdx]);
                roofColors[i * 3] = tmpC.r;
                roofColors[i * 3 + 1] = tmpC.g;
                roofColors[i * 3 + 2] = tmpC.b;
            });
            rMesh.instanceMatrix.needsUpdate = true;
            rMesh.instanceColor = new THREE.InstancedBufferAttribute(roofColors, 3);
            roofResult = rMesh;
        }

        // ── Build keep meshes (small count, use individual meshes in a group) ──
        let keepResult = null;
        if (keeps.length > 0) {
            const group = new THREE.Group();
            keeps.forEach(k => {
                // Tower body
                const towerGeo = new THREE.BoxGeometry(k.width, k.height, k.depth);
                towerGeo.translate(0, k.height / 2, 0);
                const towerMat = new THREE.MeshStandardMaterial({ color: '#5a5a5a', roughness: 0.95 });
                const tower = new THREE.Mesh(towerGeo, towerMat);
                tower.position.set(k.x, k.y, k.z);
                tower.rotation.set(0, k.rotation, 0);
                group.add(tower);

                // Keep roof — taller pointed cone
                const keepRoofGeo = new THREE.ConeGeometry(k.width * 0.7, k.roofHeight, 4);
                keepRoofGeo.translate(0, k.height + k.roofHeight / 2, 0);
                const keepRoofMat = new THREE.MeshStandardMaterial({ color: '#4a3520', roughness: 0.85 });
                const keepRoof = new THREE.Mesh(keepRoofGeo, keepRoofMat);
                keepRoof.position.set(k.x, k.y, k.z);
                keepRoof.rotation.set(0, k.rotation + Math.PI / 4, 0);
                group.add(keepRoof);
            });
            keepResult = group;
        }

        return { wallMesh: wallResult, roofMesh: roofResult, keepGroup: keepResult };
    }, [towns, heightmap, roadMap, mapWidth, mapHeight, waterThreshold, maxTowns, heightScale]);

    return (
        <group>
            {wallMesh && <primitive object={wallMesh} />}
            {roofMesh && <primitive object={roofMesh} />}
            {keepGroup && <primitive object={keepGroup} />}
            {showTownNames && towns.slice(0, maxTowns).map((t, i) => (
                <Html
                    key={i}
                    position={[
                        t.x - (mapWidth - 1) / 2,
                        (heightmap[Math.floor(t.y) * mapWidth + Math.floor(t.x)] * heightScale) + 18,
                        t.y - (mapHeight - 1) / 2
                    ]}
                    center
                    distanceFactor={35}
                >
                    <div className="town-parchment">
                        {t.name || `Settlement ${i}`}
                    </div>
                </Html>
            ))}
        </group>
    );
};

// ─── Road Layer ────────────────────────────────────────────────────────────────
const ROAD_WIDTH = 0.3;
const ROAD_Y_OFFSET = 0.05; // grounded, using polygonOffset for Z-fighting

const RoadLayer = ({ roads, ports, heightmap, mapWidth, mapHeight, waterThreshold, heightScale, towns = [] }) => {
    const roadGroup = useMemo(() => {
        if (!roads || roads.length === 0 || !heightmap) return null;

        const group = new THREE.Group();

        // Bilinear interpolation for smooth height sampling
        const sampleHeight = (px, py) => {
            const fx = Math.max(0, Math.min(mapWidth - 1.001, px));
            const fy = Math.max(0, Math.min(mapHeight - 1.001, py));
            const ix = Math.floor(fx), iy = Math.floor(fy);
            const tx = fx - ix, ty = fy - iy;
            const ix1 = Math.min(ix + 1, mapWidth - 1);
            const iy1 = Math.min(iy + 1, mapHeight - 1);

            const h00 = heightmap[iy * mapWidth + ix];
            const h10 = heightmap[iy * mapWidth + ix1];
            const h01 = heightmap[iy1 * mapWidth + ix];
            const h11 = heightmap[iy1 * mapWidth + ix1];

            return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) +
                h01 * (1 - tx) * ty + h11 * tx * ty;
        };

        const getY = (px, py) => {
            const h = sampleHeight(px, py);
            return Math.max(h, waterThreshold) * heightScale + ROAD_Y_OFFSET;
        };

        // Water segments need to sit slightly below the water plane (at +0.3) for a submerged ripple effect
        const getWaterY = () => waterThreshold * heightScale + 0.2;

        const isWaterAt = (px, py) => {
            const h = sampleHeight(px, py);
            return h <= waterThreshold;
        };

        // Helper: check if point is near any town center
        // (Unused but kept as reference for future clipping)
        // const isNearTown = (px, py) => {
        //     for (const t of towns) {
        //         const dx = px - t.x;
        //         const dy = py - t.y;
        //         if (dx * dx + dy * dy < 16) return true; 
        //     }
        //     return false;
        // };

        const roadMat = new THREE.MeshStandardMaterial({
            color: '#795548', // Brown (Material 500)
            roughness: 0.9,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const waterRoadMat = new THREE.MeshStandardMaterial({
            color: '#607090', roughness: 0.6, metalness: 0.1,
            transparent: true, opacity: 0.6,
            side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1
        });

        // Build a flat ribbon mesh from a list of 3D points
        const buildRibbon = (points, material) => {
            if (points.length < 2) return null;

            const positions = [];
            const indices = [];

            for (let i = 0; i < points.length; i++) {
                const cur = points[i];

                // Direction vector (forward along path)
                let dx, dz;
                if (i === 0) {
                    dx = points[1].x - cur.x;
                    dz = points[1].z - cur.z;
                } else if (i === points.length - 1) {
                    dx = cur.x - points[i - 1].x;
                    dz = cur.z - points[i - 1].z;
                } else {
                    dx = points[i + 1].x - points[i - 1].x;
                    dz = points[i + 1].z - points[i - 1].z;
                }

                // Perpendicular (rotate 90°)
                const len = Math.sqrt(dx * dx + dz * dz) || 1;
                const px = -dz / len * ROAD_WIDTH;
                const pz = dx / len * ROAD_WIDTH;

                // Two vertices: left and right of center
                positions.push(cur.x - px, cur.y, cur.z - pz);
                positions.push(cur.x + px, cur.y, cur.z + pz);
            }

            // Build triangle strip indices
            for (let i = 0; i < points.length - 1; i++) {
                const bl = i * 2, br = i * 2 + 1;
                const tl = (i + 1) * 2, tr = (i + 1) * 2 + 1;
                indices.push(bl, tl, br);
                indices.push(br, tl, tr);
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setIndex(indices);
            geo.computeVertexNormals();

            return new THREE.Mesh(geo, material);
        };

        roads.forEach(path => {
            if (path.length < 2) return;

            // Create a curve for smoothing
            const curvePoints = path.map(p => new THREE.Vector3(p.x, 0, p.y));
            const curve = new THREE.CatmullRomCurve3(curvePoints);

            const pointsCount = path.length * 4; // 4 samples per tile
            const sp = curve.getPoints(pointsCount);

            const segments = [];
            let currentSegmentPoints = [];
            let currentSegmentIsWater = false;
            // let lastPointWasClipped = false;

            for (let i = 0; i < sp.length; i++) {
                const p = sp[i];

                const water = isWaterAt(p.x, p.z);
                const wx = p.x - (mapWidth - 1) / 2;
                const wz = p.z - (mapHeight - 1) / 2;
                const wy = water ? getWaterY() : getY(p.x, p.z);
                const pt = { x: wx, y: wy, z: wz };

                if (currentSegmentPoints.length > 0 && water !== currentSegmentIsWater) {
                    // If water status changed, close current segment and start new one
                    // Share the transition point
                    currentSegmentPoints.push(pt);
                    if (currentSegmentPoints.length > 1) {
                        segments.push({ points: currentSegmentPoints, isWater: currentSegmentIsWater });
                    }
                    currentSegmentPoints = [pt];
                    currentSegmentIsWater = water;
                } else {
                    currentSegmentPoints.push(pt);
                    if (currentSegmentPoints.length === 1) currentSegmentIsWater = water;
                }
            }

            // Add the last segment if it has points
            if (currentSegmentPoints.length > 1) {
                segments.push({ points: currentSegmentPoints, isWater: currentSegmentIsWater });
            }

            // Build ribbon mesh for each segment
            for (const seg of segments) {
                const mat = seg.isWater ? waterRoadMat : roadMat;
                const ribbon = buildRibbon(seg.points, mat);
                if (ribbon) group.add(ribbon);
            }
        });

        // Port markers
        if (ports && ports.length > 0) {
            const portGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
            portGeo.translate(0, 0.25, 0);
            const portMat = new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.9 });
            const portRoofGeo = new THREE.ConeGeometry(0.4 * Math.SQRT2, 0.35, 4);
            portRoofGeo.translate(0, 0.5 + 0.175, 0);
            portRoofGeo.rotateY(Math.PI / 4);
            const portRoofMat = new THREE.MeshStandardMaterial({ color: '#4a3520', roughness: 0.85 });

            for (const port of ports) {
                const wx = port.x - (mapWidth - 1) / 2;
                const wz = port.y - (mapHeight - 1) / 2;
                const wy = getY(port.x, port.y);

                const pm = new THREE.Mesh(portGeo, portMat);
                pm.position.set(wx, wy, wz);
                group.add(pm);

                const rm = new THREE.Mesh(portRoofGeo, portRoofMat);
                rm.position.set(wx, wy, wz);
                group.add(rm);
            }
        }

        return group;
    }, [roads, ports, heightmap, mapWidth, mapHeight, waterThreshold, towns]);

    if (!roadGroup) return null;
    return <primitive object={roadGroup} />;
};

// ─── Water Plane ───────────────────────────────────────────────────────────────
const WaterPlane = ({ sizeX, sizeZ, level }) => (
    <mesh position={[0, level + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[sizeX, sizeZ]} />
        <meshStandardMaterial
            color="#3a7dd8"
            transparent
            opacity={0.92}
            metalness={0.02}
            roughness={0.4}
        />
    </mesh>
);

// ─── Terrain Grid ───────────────────────────────────────────────────────────────
const TerrainGrid = ({ heightmap, mapWidth, mapHeight, waterThreshold, heightScale, color = '#ffffff', opacity = 0.4 }) => {
    const gridLines = useMemo(() => {
        if (!heightmap) return [];
        const lines = [];
        const w = mapWidth - 1;
        const h = mapHeight - 1;
        const wCenter = w / 2;
        const hCenter = h / 2;
        const cells = 5;

        // Vertical lines (constant X)
        for (let i = 0; i <= cells; i++) {
            const frac = i / cells;
            const mapX = Math.round(frac * (mapWidth - 1));
            const worldX = mapX - wCenter;
            const points = [];
            // Subdivide the line to follow terrain
            for (let j = 0; j < mapHeight; j++) {
                const terrainH = Math.max(heightmap[j * mapWidth + mapX], waterThreshold) * heightScale;
                points.push(new THREE.Vector3(worldX, terrainH + 0.1, j - hCenter));
            }
            lines.push(points);
        }

        // Horizontal lines (constant Z)
        for (let i = 0; i <= cells; i++) {
            const frac = i / cells;
            const mapY = Math.round(frac * (mapHeight - 1));
            const worldZ = mapY - hCenter;
            const points = [];
            for (let j = 0; j < mapWidth; j++) {
                const terrainH = Math.max(heightmap[mapY * mapWidth + j], waterThreshold) * heightScale;
                points.push(new THREE.Vector3(j - wCenter, terrainH + 0.1, worldZ));
            }
            lines.push(points);
        }
        return lines;
    }, [heightmap, mapWidth, mapHeight, waterThreshold]);

    return (
        <group>
            {gridLines.map((points, i) => (
                <Line
                    key={i}
                    points={points}
                    color={color}
                    lineWidth={1.5}
                    transparent
                    opacity={opacity}
                    depthTest={true}
                />
            ))}
        </group>
    );
};

// ─── Camera Controls ───────────────────────────────────────────────────────────
const CameraControls = ({ mapSize, isOrthographic, heightmap, mapWidth, mapHeight, heightScale }) => {
    const { camera, gl } = useThree();
    const controlsRef = useRef();
    const keys = useRef({});

    useEffect(() => {
        const handleKeyDown = (e) => { keys.current[e.code] = true; };
        const handleKeyUp = (e) => { keys.current[e.code] = false; };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useFrame((state, delta) => {
        if (!controlsRef.current) return;
        const moveSpeed = 25 * delta;
        const rotateSpeed = 2.5 * delta;
        const zoomSpeed = 40 * delta;

        // Panning (Camera-Relative)
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0; // Keep movement on the X/Z plane
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, camera.up).normalize();

        if (keys.current['KeyW'] || keys.current['ArrowUp']) {
            const move = forward.clone().multiplyScalar(moveSpeed);
            controlsRef.current.target.add(move);
            camera.position.add(move);
        }
        if (keys.current['KeyS'] || keys.current['ArrowDown']) {
            const move = forward.clone().multiplyScalar(-moveSpeed);
            controlsRef.current.target.add(move);
            camera.position.add(move);
        }
        if (keys.current['KeyA'] || keys.current['ArrowLeft']) {
            const move = right.clone().multiplyScalar(-moveSpeed);
            controlsRef.current.target.add(move);
            camera.position.add(move);
        }
        if (keys.current['KeyD'] || keys.current['ArrowRight']) {
            const move = right.clone().multiplyScalar(moveSpeed);
            controlsRef.current.target.add(move);
            camera.position.add(move);
        }

        if (!isOrthographic) {
            // Horizontal Rotation
            if (keys.current['KeyQ']) controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() - rotateSpeed);
            if (keys.current['KeyE']) controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + rotateSpeed);

            // Vertical Rotation (Pitch)
            if (keys.current['KeyR']) controlsRef.current.setPolarAngle(Math.max(0.1, controlsRef.current.getPolarAngle() - rotateSpeed * 0.6));
            if (keys.current['KeyF']) controlsRef.current.setPolarAngle(Math.min(Math.PI / 2.1, controlsRef.current.getPolarAngle() + rotateSpeed * 0.6));

            // Keyboard Zooming
            if (keys.current['KeyZ'] || keys.current['KeyX']) {
                const direction = new THREE.Vector3();
                direction.subVectors(camera.position, controlsRef.current.target).normalize();
                const zoomDir = keys.current['KeyZ'] ? -1 : 1;

                // Proposed new position
                const newPos = camera.position.clone().add(direction.multiplyScalar(zoomDir * zoomSpeed));
                const newDist = newPos.distanceTo(controlsRef.current.target);

                // Clamp distance
                if (newDist >= 8 && newDist <= mapSize * 2.5) {
                    camera.position.copy(newPos);
                }
            }
        }

        controlsRef.current.update();

        // Enforce dynamic minimum camera height based on terrain
        let groundY = 0;
        if (heightmap && mapWidth && mapHeight) {
            const tx = Math.floor(camera.position.x + (mapWidth - 1) / 2);
            const tz = Math.floor(camera.position.z + (mapHeight - 1) / 2);
            if (tx >= 0 && tx < mapWidth && tz >= 0 && tz < mapHeight) {
                groundY = heightmap[tz * mapWidth + tx] * heightScale;
            }
        }

        const safetyBuffer = 3;
        const minY = groundY + safetyBuffer;
        if (camera.position.y < minY) {
            camera.position.y = minY;
        }
    });

    return (
        <OrbitControls
            ref={controlsRef}
            args={[camera, gl.domElement]}
            enablePan
            enableZoom
            minDistance={8}
            maxDistance={mapSize * 2.5}
            maxPolarAngle={isOrthographic ? 0 : Math.PI / 2.1}
            minPolarAngle={isOrthographic ? 0 : 0.1}
            enableRotate={!isOrthographic}
        />
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const TerrainMesh3D = ({ terrainData, isOrthographic = false, treeDensity = 50, maxTowns = 8, showTownNames = true, showGrid = false }) => {
    const heightmap = terrainData?.heightmap;
    const forestMap = terrainData?.forestMap;
    const towns = terrainData?.towns;
    const roads = terrainData?.roads;
    const ports = terrainData?.ports;
    const width = terrainData?.width || 1;
    const height = terrainData?.height || 1;
    const mapSize = Math.max(width, height);

    // Higher resolution = taller mountains (75 at 256px, 100 at 512px)
    // quick find scale height / heightScale -- do not delete line
    const heightScale = useMemo(() => 50 + (width / 256) * 25, [width]);

    const { waterY, waterThreshold } = useMemo(() => {
        if (!heightmap) return { waterY: 0, waterThreshold: 0 };
        // Use the threshold provided by the generator for perfect synchronization.
        // Fallback to 30% percentile only if missing.
        let threshold = terrainData.waterThreshold;
        if (threshold === undefined) {
            const sorted = [...heightmap].sort((a, b) => a - b);
            threshold = sorted[Math.floor(sorted.length * 0.3)];
        }
        return { waterY: threshold * heightScale, waterThreshold: threshold };
    }, [heightmap, terrainData.waterThreshold, heightScale]);

    if (!terrainData || !heightmap) return <div>Loading Terrain...</div>;

    return (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden' }}>
            <style>{PARCHMENT_STYLES}</style>
            <Canvas shadows gl={{ antialias: true }} dpr={[1, 2]}>
                {isOrthographic ? (
                    <orthographicCamera
                        makeDefault
                        position={[0, 80, 0]}
                        zoom={8}
                        near={0.1}
                        far={1000}
                    />
                ) : (
                    <PerspectiveCamera makeDefault position={[mapSize * 0.7, mapSize * 0.5, mapSize * 0.7]} fov={50} />
                )}

                <CameraControls
                    mapSize={mapSize}
                    isOrthographic={isOrthographic}
                    heightmap={heightmap}
                    mapWidth={width}
                    mapHeight={height}
                    heightScale={heightScale}
                />

                <ambientLight intensity={0.4} />
                <directionalLight
                    position={[-30, 40, 20]}
                    intensity={1.0}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                />
                <pointLight position={[20, 20, 20]} intensity={0.3} />

                <Sky sunPosition={[100, 30, 100]} />
                <Environment preset="forest" />

                <SmoothTerrain
                    heightmap={heightmap}
                    mapWidth={width}
                    mapHeight={height}
                    heightScale={heightScale}
                    towns={towns}
                    terrainDataWaterThreshold={waterThreshold}
                />

                <ForestLayer
                    heightmap={heightmap}
                    forestMap={forestMap}
                    mapWidth={width}
                    mapHeight={height}
                    waterThreshold={waterThreshold}
                    heightScale={heightScale}
                    treeDensity={treeDensity}
                    towns={towns || []}
                    roadMap={terrainData?.roadMap}
                />

                <TownLayer
                    towns={towns}
                    heightmap={heightmap}
                    roadMap={terrainData?.roadMap}
                    mapWidth={width}
                    mapHeight={height}
                    waterThreshold={waterThreshold}
                    heightScale={heightScale}
                    maxTowns={maxTowns}
                    showTownNames={showTownNames}
                />

                <RoadLayer
                    roads={roads}
                    ports={ports}
                    heightmap={heightmap}
                    mapWidth={width}
                    mapHeight={height}
                    waterThreshold={waterThreshold}
                    heightScale={heightScale}
                    towns={towns}
                />

                <WaterPlane sizeX={width - 1} sizeZ={height - 1} level={waterY} />
                {showGrid && (
                    <TerrainGrid
                        heightmap={heightmap}
                        mapWidth={width}
                        mapHeight={height}
                        waterThreshold={waterThreshold}
                        heightScale={heightScale}
                    />
                )}
            </Canvas>
        </div>
    );
};

export default TerrainMesh3D;
