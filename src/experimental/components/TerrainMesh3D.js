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

        const tmpColor = new THREE.Color();
        for (let i = 0; i < mapWidth * mapHeight; i++) {
            const normalised = (heightmap[i] - min) / range;
            elevationToColor(normalised, tmpColor);
            // DataTexture is bottom-to-top, but PlaneGeometry UVs match, so write in order
            data[i * 4 + 0] = Math.floor(tmpColor.r * 255);
            data[i * 4 + 1] = Math.floor(tmpColor.g * 255);
            data[i * 4 + 2] = Math.floor(tmpColor.b * 255);
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

// ─── Water Plane ───────────────────────────────────────────────────────────────
const WaterPlane = ({ size, level }) => (
    <mesh position={[0, level, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial
            color="#3a7dd8"
            transparent
            opacity={0.55}
            metalness={0.2}
            roughness={0.1}
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
const TerrainMesh3D = ({ terrainData, isOrthographic = false }) => {
    const heightmap = terrainData?.heightmap;
    const width = terrainData?.width || 1;
    const height = terrainData?.height || 1;
    const mapSize = Math.max(width, height);

    // Calculate water level from heightmap
    const waterY = useMemo(() => {
        if (!heightmap) return 0;
        // Place water plane at ~30th percentile of elevation
        const sorted = [...heightmap].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length * 0.3)] * 75;
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
                <Environment preset="city" />

                <SmoothTerrain
                    heightmap={heightmap}
                    mapWidth={width}
                    mapHeight={height}
                />

                <WaterPlane size={mapSize * 1.5} level={waterY} />
            </Canvas>
        </div>
    );
};

export default TerrainMesh3D;
