import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Sky } from '@react-three/drei';
import * as THREE from 'three';

// Color palette matching the reference image
const biomeColors = {
    deep_water: '#1a4e8a',
    water: '#4a90e2',
    beach: '#f0e68c',
    plains: '#c3e6cb',
    forest: '#2d5a27',
    mountain: '#8b8b8b'
};

const Terrain = ({ mapData }) => {
    const width = mapData[0].length;
    const height = mapData.length;
    const tiles = useMemo(() => mapData.flat(), [mapData]);

    const groundRef = useRef();
    const treeTrunkRef = useRef();
    const treeLeavesRef = useRef();
    const mountainRef = useRef();

    // Temporal dummy objects for matrix calculations
    const tempObject = useMemo(() => new THREE.Object3D(), []);
    const tempColor = useMemo(() => new THREE.Color(), []);

    useEffect(() => {
        if (!groundRef.current) return;

        // 1. Update Ground Instances (Blocks)
        tiles.forEach((tile, i) => {
            // Amplified Vertical Scale: multiplier increased from 1.6 to 2.4 for drama
            const h = tile.biome === 'deep_water' ? 0.2 : (tile.biome === 'water' ? 0.35 : (tile.height + 0.5) * 2.4);
            const color = biomeColors[tile.poi] || biomeColors[tile.biome] || biomeColors.plains;

            tempObject.position.set(tile.x - width / 2, h / 2 - 1.2, tile.y - height / 2);
            tempObject.scale.set(0.95, h, 0.95);
            tempObject.updateMatrix();
            groundRef.current.setMatrixAt(i, tempObject.matrix);
            groundRef.current.setColorAt(i, tempColor.set(color));
        });
        groundRef.current.instanceMatrix.needsUpdate = true;
        if (groundRef.current.instanceColor) groundRef.current.instanceColor.needsUpdate = true;

        // 2. Update Feature Instances
        let treeIdx = 0;
        let mountainIdx = 0;

        tiles.forEach((tile) => {
            const h = (tile.height + 0.5) * 2.4;
            const x = tile.x - width / 2;
            const z = tile.y - height / 2;

            if (tile.poi === 'forest') {
                // Trunk
                tempObject.position.set(x, h - 1.2 + 0.1, z);
                tempObject.scale.set(1, 1, 1);
                tempObject.updateMatrix();
                treeTrunkRef.current.setMatrixAt(treeIdx, tempObject.matrix);

                // Leaves
                tempObject.position.set(x, h - 1.2 + 0.35, z);
                tempObject.updateMatrix();
                treeLeavesRef.current.setMatrixAt(treeIdx, tempObject.matrix);

                treeIdx++;
            } else if (tile.poi === 'mountain') {
                // Reduced height by 2/3 as requested
                const mHeight = (0.5 + (tile.elevation || 0.5) * 0.7) * (2 / 3);
                tempObject.position.set(x, h - 1.2 + mHeight / 2, z);
                tempObject.scale.set(1, mHeight, 1); // coneGeometry base height is 1
                tempObject.updateMatrix();
                mountainRef.current.setMatrixAt(mountainIdx, tempObject.matrix);
                mountainIdx++;
            }
        });

        treeTrunkRef.current.count = treeIdx;
        treeLeavesRef.current.count = treeIdx;
        mountainRef.current.count = mountainIdx;

        treeTrunkRef.current.instanceMatrix.needsUpdate = true;
        treeLeavesRef.current.instanceMatrix.needsUpdate = true;
        mountainRef.current.instanceMatrix.needsUpdate = true;
    }, [tiles, width, height, tempObject, tempColor]);

    return (
        <group>
            {/* Ground Blocks */}
            <instancedMesh ref={groundRef} args={[null, null, tiles.length]} castShadow receiveShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial flatShading />
            </instancedMesh>

            {/* Trees - Trunks */}
            <instancedMesh ref={treeTrunkRef} args={[null, null, tiles.length]} castShadow>
                <cylinderGeometry args={[0.05, 0.05, 0.2, 8]} />
                <meshStandardMaterial color="#5d4037" />
            </instancedMesh>

            {/* Trees - Leaves */}
            <instancedMesh ref={treeLeavesRef} args={[null, null, tiles.length]} castShadow>
                <coneGeometry args={[0.2, 0.5, 8]} />
                <meshStandardMaterial color="#2d5a27" />
            </instancedMesh>

            {/* Mountains */}
            <instancedMesh ref={mountainRef} args={[null, null, tiles.length]} castShadow>
                <coneGeometry args={[0.5, 1, 4]} />
                <meshStandardMaterial color="#8b8b8b" flatShading />
            </instancedMesh>

            {/* Water Plane (Translucent) */}
            <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[width, height]} />
                <meshStandardMaterial
                    color="#4a90e2"
                    transparent
                    opacity={0.6}
                    metalness={0.1}
                    roughness={0.1}
                />
            </mesh>
        </group>
    );
};

const CameraControls = ({ mapWidth, isOrthographic }) => {
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

        // Panning Logic
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

        // Q/E for Rotation
        if (!isOrthographic) {
            if (keys.current['KeyQ']) controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + rotateSpeed);
            if (keys.current['KeyE']) controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() - rotateSpeed);
        }

        controlsRef.current.update();
    });

    return (
        <OrbitControls
            ref={controlsRef}
            args={[camera, gl.domElement]}
            enablePan={true}
            enableZoom={true}
            minDistance={5}
            maxDistance={mapWidth * 2}
            maxPolarAngle={isOrthographic ? 0 : Math.PI / 2.1}
            minPolarAngle={isOrthographic ? 0 : 0}
            enableRotate={!isOrthographic}
        />
    );
};

const WorldMapDisplay3D = ({ mapData, playerPosition, onTileClick, firstHero, isOrthographic = false }) => {
    if (!mapData || mapData.length === 0) return <div>Loading 3D Map...</div>;

    const mapWidth = mapData[0].length;
    const mapHeight = mapData.length;

    return (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden' }}>
            <Canvas shadows>
                {isOrthographic ? (
                    <orthographicCamera
                        makeDefault
                        position={[0, 50, 0]}
                        zoom={20}
                        near={0.1}
                        far={1000}
                    />
                ) : (
                    <PerspectiveCamera makeDefault position={[mapWidth, mapWidth, mapWidth]} fov={50} />
                )}

                <CameraControls mapWidth={mapWidth} isOrthographic={isOrthographic} />

                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} castShadow />
                <directionalLight
                    position={[-10, 20, 10]}
                    intensity={0.8}
                    castShadow
                    shadow-mapSize={[1024, 1024]}
                />

                <Sky sunPosition={[100, 20, 100]} />
                <Environment preset="city" />

                <Terrain mapData={mapData} />

                {/* Player Marker */}
                {playerPosition && (
                    <mesh position={[playerPosition.x - mapWidth / 2, 2, playerPosition.y - mapHeight / 2]}>
                        <sphereGeometry args={[0.3, 16, 16]} />
                        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={0.5} />
                    </mesh>
                )}
            </Canvas>
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', color: 'white', background: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '4px', pointerEvents: 'none' }}>
                Use Mouse to Rotate & Zoom
            </div>
        </div>
    );
};

export default WorldMapDisplay3D;
