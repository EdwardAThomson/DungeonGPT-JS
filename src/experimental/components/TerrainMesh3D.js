import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Sky, Environment } from '@react-three/drei';
import * as THREE from 'three';

// ─── Elevation → Color ────────────────────────────────────────────────────────
const colorStops = [
    { t: 0.00, color: new THREE.Color('#0a2a5e') }, // deep ocean
    { t: 0.15, color: new THREE.Color('#1a5fa0') }, // ocean
    { t: 0.28, color: new THREE.Color('#4a90d9') }, // shallow water
    { t: 0.32, color: new THREE.Color('#f0e6a8') }, // beach/sand
    { t: 0.38, color: new THREE.Color('#8bc34a') }, // lowland grass
    { t: 0.50, color: new THREE.Color('#4caf50') }, // plains
    { t: 0.62, color: new THREE.Color('#2d7d32') }, // forest
    { t: 0.75, color: new THREE.Color('#6d5c3e') }, // highland rock
    { t: 0.85, color: new THREE.Color('#8b8b8b') }, // mountain
    { t: 0.93, color: new THREE.Color('#c0c0c0') }, // high peak
    { t: 1.00, color: new THREE.Color('#f5f5f5') }, // snow
];

function elevationToColor(t, out) {
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
const SmoothTerrain = ({ heightmap, mapWidth, mapHeight, heightScale = 125 }) => {
    const meshRef = useRef();

    // Build a DataTexture for crisp per-pixel coloring
    const texture = useMemo(() => {
        const data = new Uint8Array(mapWidth * mapHeight * 4);

        let min = Infinity, max = -Infinity;
        for (let i = 0; i < heightmap.length; i++) {
            if (heightmap[i] < min) min = heightmap[i];
            if (heightmap[i] > max) max = heightmap[i];
        }
        const range = max - min || 1;

        // Calculate water threshold to paint underwater pixels uniformly
        const sorted = [...heightmap].sort((a, b) => a - b);
        const waterThreshold = sorted[Math.floor(sorted.length * 0.3)];
        const waterNorm = (waterThreshold - min) / range;

        const tmpColor = new THREE.Color();
        const waterColor = { r: 0.16, g: 0.42, b: 0.68 }; // uniform water blue

        for (let i = 0; i < mapWidth * mapHeight; i++) {
            const normalised = (heightmap[i] - min) / range;
            if (normalised <= waterNorm) {
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

        const tex = new THREE.DataTexture(data, mapWidth, mapHeight, THREE.RGBAFormat);
        tex.flipY = true;
        tex.needsUpdate = true;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
    }, [heightmap, mapWidth, mapHeight]);

    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(mapWidth, mapHeight, mapWidth - 1, mapHeight - 1);
        geo.rotateX(-Math.PI / 2);

        const positions = geo.attributes.position.array;

        // Calculate water threshold (30th percentile) to flatten terrain below water
        const sorted = [...heightmap].sort((a, b) => a - b);
        const waterThreshold = sorted[Math.floor(sorted.length * 0.3)];

        for (let i = 0; i < mapWidth * mapHeight; i++) {
            const h = heightmap[i];
            // Clamp terrain below water level to be flat
            positions[i * 3 + 1] = Math.max(h, waterThreshold) * heightScale;
        }

        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();

        return geo;
    }, [heightmap, mapWidth, mapHeight, heightScale]);

    return (
        <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial
                map={texture}
                flatShading
                roughness={0.85}
                metalness={0.05}
            />
        </mesh>
    );
};

// ─── Forest Layer ──────────────────────────────────────────────────────────────
const ForestLayer = ({ heightmap, forestMap, mapWidth, mapHeight, heightScale = 125, waterThreshold, treeDensity = 50, towns = [] }) => {
    const { trunkMesh, canopyMesh } = useMemo(() => {
        if (!forestMap || !heightmap || treeDensity <= 0) return { trunkMesh: null, canopyMesh: null };

        // treeDensity 0-100 maps to threshold: high density = low threshold
        const threshold = 0.7 - (treeDensity / 100) * 0.6; // range: 0.1 (dense) to 0.7 (sparse)
        // Also control sampling stride: more trees = tighter sampling
        const baseStride = Math.max(2, Math.floor(mapWidth / 80));
        const stride = Math.max(1, Math.round(baseStride * (1.3 - treeDensity / 100)));

        // Collect tree positions from the forest density map
        const positions = [];
        let rngState = 777;
        const rng = () => { rngState = (rngState * 9301 + 49297) % 233280; return rngState / 233280; };

        for (let y = stride; y < mapHeight - stride; y += stride) {
            for (let x = stride; x < mapWidth - stride; x += stride) {
                const density = forestMap[y * mapWidth + x];
                if (density < threshold) continue;

                // Jitter position for natural look
                const jx = x + (rng() - 0.5) * stride * 0.8;
                const jy = y + (rng() - 0.5) * stride * 0.8;
                const ix = Math.floor(Math.max(0, Math.min(mapWidth - 1, jx)));
                const iy = Math.floor(Math.max(0, Math.min(mapHeight - 1, jy)));

                const h = heightmap[iy * mapWidth + ix];
                const clampedH = Math.max(h, waterThreshold);

                // World position: PlaneGeometry centered at origin
                const wx = jx - mapWidth / 2;
                const wz = jy - mapHeight / 2;
                const wy = clampedH * heightScale;

                // Skip if underwater
                if (h < waterThreshold) continue;

                // Skip if inside a town radius (prevent tree-building overlap)
                let inTown = false;
                for (const t of towns) {
                    const config = { city: 8, town: 6, village: 4 };
                    const exclusionR = config[t.size] || 4;
                    const tdx = jx - t.x, tdy = jy - t.y;
                    if (tdx * tdx + tdy * tdy < exclusionR * exclusionR) { inTown = true; break; }
                }
                if (inTown) continue;

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
    }, [heightmap, forestMap, mapWidth, mapHeight, heightScale, waterThreshold, treeDensity, towns]);

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

const TownLayer = ({ towns, heightmap, mapWidth, mapHeight, heightScale = 125, waterThreshold, maxTowns = 8 }) => {
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
            const ix = Math.floor(Math.max(0, Math.min(mapWidth - 1, bx)));
            const iy = Math.floor(Math.max(0, Math.min(mapHeight - 1, by)));
            const h = heightmap[iy * mapWidth + ix];
            if (h < waterThreshold) return null;
            return Math.max(h, waterThreshold) * heightScale;
        };

        for (const town of visibleTowns) {
            const config = TOWN_CONFIG[town.size] || TOWN_CONFIG.village;

            // Place keep at town center for cities/towns
            if (config.hasKeep) {
                const wy = getTerrainY(town.x, town.y);
                if (wy !== null) {
                    const wx = town.x - mapWidth / 2;
                    const wz = town.y - mapHeight / 2;
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

            while (placed < config.buildings && attempts < config.buildings * 4) {
                attempts++;
                const angle = rng() * Math.PI * 2;
                const minDist = config.hasKeep ? 2.0 : 0;
                const dist = minDist + rng() * (config.radius - minDist);
                const bx = town.x + Math.cos(angle) * dist;
                const by = town.y + Math.sin(angle) * dist;

                const wy = getTerrainY(bx, by);
                if (wy === null) continue;

                // Check collision with already-placed buildings
                let collision = false;
                for (const p of placedPositions) {
                    const dx = bx - p.x, dy = by - p.y;
                    if (Math.sqrt(dx * dx + dy * dy) < 1.3) { collision = true; break; }
                }
                if (collision) continue;

                placedPositions.push({ x: bx, y: by, r: 0.6 });
                placed++;

                const wx = bx - mapWidth / 2;
                const wz = by - mapHeight / 2;

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
    }, [towns, heightmap, mapWidth, mapHeight, heightScale, waterThreshold, maxTowns]);

    return (
        <group>
            {wallMesh && <primitive object={wallMesh} />}
            {roofMesh && <primitive object={roofMesh} />}
            {keepGroup && <primitive object={keepGroup} />}
        </group>
    );
};

// ─── Water Plane ───────────────────────────────────────────────────────────────
const WaterPlane = ({ size, level }) => (
    <mesh position={[0, level + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial
            color="#3a7dd8"
            transparent
            opacity={0.92}
            metalness={0.02}
            roughness={0.4}
        />
    </mesh>
);

// ─── Camera Controls ───────────────────────────────────────────────────────────
const CameraControls = ({ mapSize, isOrthographic }) => {
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
        const moveSpeed = 20 * delta;
        const rotateSpeed = 1.5 * delta;

        if (keys.current['KeyW'] || keys.current['ArrowUp']) {
            controlsRef.current.target.z -= moveSpeed;
            camera.position.z -= moveSpeed;
        }
        if (keys.current['KeyS'] || keys.current['ArrowDown']) {
            controlsRef.current.target.z += moveSpeed;
            camera.position.z += moveSpeed;
        }
        if (keys.current['KeyA'] || keys.current['ArrowLeft']) {
            controlsRef.current.target.x -= moveSpeed;
            camera.position.x -= moveSpeed;
        }
        if (keys.current['KeyD'] || keys.current['ArrowRight']) {
            controlsRef.current.target.x += moveSpeed;
            camera.position.x += moveSpeed;
        }
        if (!isOrthographic) {
            if (keys.current['KeyQ']) controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + rotateSpeed);
            if (keys.current['KeyE']) controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() - rotateSpeed);
        }
        controlsRef.current.update();

        // Enforce minimum camera height so it never goes through the terrain
        const minY = 5;
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
            minDistance={15}
            maxDistance={mapSize * 2.5}
            maxPolarAngle={isOrthographic ? 0 : Math.PI / 2.4}
            minPolarAngle={isOrthographic ? 0 : 0.1}
            enableRotate={!isOrthographic}
        />
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const TerrainMesh3D = ({ terrainData, isOrthographic = false, treeDensity = 50, maxTowns = 8 }) => {
    const heightmap = terrainData?.heightmap;
    const forestMap = terrainData?.forestMap;
    const towns = terrainData?.towns;
    const width = terrainData?.width || 1;
    const height = terrainData?.height || 1;
    const mapSize = Math.max(width, height);

    const { waterY, waterThreshold } = useMemo(() => {
        if (!heightmap) return { waterY: 0, waterThreshold: 0 };
        const sorted = [...heightmap].sort((a, b) => a - b);
        const threshold = sorted[Math.floor(sorted.length * 0.3)];
        return { waterY: threshold * 125, waterThreshold: threshold };
    }, [heightmap]);

    if (!terrainData || !heightmap) return <div>Loading Terrain...</div>;

    return (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden' }}>
            <Canvas shadows gl={{ antialias: true }}>
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

                <CameraControls mapSize={mapSize} isOrthographic={isOrthographic} />

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
                />

                <ForestLayer
                    heightmap={heightmap}
                    forestMap={forestMap}
                    mapWidth={width}
                    mapHeight={height}
                    waterThreshold={waterThreshold}
                    treeDensity={treeDensity}
                    towns={towns || []}
                />

                <TownLayer
                    towns={towns}
                    heightmap={heightmap}
                    mapWidth={width}
                    mapHeight={height}
                    waterThreshold={waterThreshold}
                    maxTowns={maxTowns}
                />

                <WaterPlane size={mapSize * 1.5} level={waterY} />
            </Canvas>
        </div>
    );
};

export default TerrainMesh3D;
