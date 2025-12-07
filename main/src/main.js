// -----------------------------------------------------------------------------
// IMPORTS
// -----------------------------------------------------------------------------
import * as THREE from 'three';
import './style.css';

import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass';


// -----------------------------------------------------------------------------
// GLOBALS
// -----------------------------------------------------------------------------
let camera, scene, renderer, controls;
const gltfLoader = new GLTFLoader();
const smartDevices = [];

// Entrance/kitchen ceiling lamps
let ceilingLampLight1 = null;
let ceilingLampLight2 = null;
let ceilingLampLight3 = null;
// Living room ceiling lamps
let livingLampLight1 = null;
let livingLampLight2 = null;
let livingLampLight3 = null;
let livingLampLight4 = null;
// Bedroom ceiling lamps
let bedroomLampLight = null;
// Bathroom ceiling lamps
let bathroomLampLight = null;

let ceilingLampHelper = null;

let capsuleHelper = null;

// Movement states
const keyStates = {};

// Physics (capsule + octree)
const worldOctree = new Octree();
const playerVelocity = new THREE.Vector3();
let playerOnFloor = false;

// Player capsule collider (spawn point)
const playerCollider = new Capsule(
    new THREE.Vector3(-2, 0.2, -4.5),
    new THREE.Vector3(-2, 2.8, -4.5),
    0.35,
);

// Post-processing
let composer;
let saoPass;
let outlinePass;


// -----------------------------------------------------------------------------
// INIT
// -----------------------------------------------------------------------------
init();

async function init() {

    // CAMERA
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(-2, 2.8, -4.5);
    camera.rotation.order = "YXZ"; // FPS rotation


    // SCENE
    scene = new THREE.Scene();


    // RENDERER
    renderer = new THREE.WebGLRenderer({
        canvas: document.querySelector("#bg"),
        antialias: true
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // POST-PROCESSING
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // SAO PASS  
    saoPass = new SAOPass(scene, camera);
    saoPass.params.saoBias = 0.5;
    saoPass.params.saoIntensity = 0.0007;
    saoPass.params.saoScale = 1;
    saoPass.params.saoKernelRadius = 60;
    composer.addPass(saoPass);

    // OUTLINE PASS
    outlinePass = new OutlinePass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        scene,
        camera
    );
    outlinePass.edgeStrength = 3.0;
    outlinePass.edgeGlow = 0.5;
    outlinePass.edgeThickness = 2.0;
    outlinePass.pulsePeriod = 2;
    outlinePass.visibleEdgeColor.set('#ffffff');
    outlinePass.hiddenEdgeColor.set('#190a05');
    composer.addPass(outlinePass);

    // GAMMA CORRECTION
    const gammaPass = new ShaderPass(GammaCorrectionShader);
    composer.addPass(gammaPass);

    // FINAL COPY PASS
    const copyPass = new ShaderPass(CopyShader);
    copyPass.renderToScreen = true;
    composer.addPass(copyPass);

    // capsuleHelper = createCapsuleHelper();

    // CONTROLS
    controls = new PointerLockControls(camera, document.body);

    document.getElementById("instructions").addEventListener("click", () => {
        controls.lock();
    });

    controls.addEventListener("lock", () => {
        document.getElementById("blocker").style.display = "none";
        document.getElementById("crosshair").classList.add("active");
    });

    controls.addEventListener("unlock", () => {
        document.getElementById("blocker").style.display = "block";
        document.getElementById("crosshair").classList.remove("active");
    });


    // --------------------------
    // LOAD APARTMENT MODEL
    // --------------------------
    await loadApartment();


    // --------------------------
    // LOAD SMART DEVICES
    // --------------------------
    await loadLightSwitch();


    // --------------------------
    // LOAD HDR ENVIRONMENT
    // --------------------------
    loadHDR();

    
    // KEYBOARD EVENTS
    document.addEventListener("keydown", e => {
        keyStates[e.code] = true;

        // JUMP:
        //if (e.code === "Space" && playerOnFloor) {
        //playerVelocity.y = 10;   // adjust strength if needed
        //}

        // INTERACTION:
        if (e.code === "KeyE") {
            handleInteraction();
        }
    });
    document.addEventListener("keyup", e => keyStates[e.code] = false);

    window.addEventListener("resize", onWindowResize);

    renderer.setAnimationLoop(animate);
}


// -----------------------------------------------------------------------------
// LOAD APARTMENT GLB + BUILD COLLISION OCTREE
// -----------------------------------------------------------------------------
async function loadApartment() {

    return new Promise((resolve, reject) => {

        gltfLoader.load('/models/2roomflat.glb', gltf => {

            const root = gltf.scene;
            scene.add(root);

            // Build collision octree
            worldOctree.fromGraphNode(root);
            const collisionGeometry = new THREE.Group();

            // Shadows
            root.traverse(obj => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                    // Handle transparent materials
                    if (obj.material) {
                        if (obj.material.opacity < 1 || obj.material.transparent) {
                            obj.material.transparent = true;
                            obj.material.depthWrite = false;
                            obj.material.side = THREE.DoubleSide;
                    
                            // Don't cast shadows from transparent objects
                            obj.castShadow = false;
                        }
                    }
                }
            });

            // Ceiling lamps (light off by default)
            // Entrance/kitchen ceiling lamps
            ceilingLampLight1 = new THREE.PointLight(0xfff1c3, 1.8, 0, 2);
            ceilingLampLight1.position.set(-1.23, 4.4, -2.955);
            ceilingLampLight1.castShadow = true;
            ceilingLampLight1.visible = false;
            ceilingLampLight1.shadow.camera.near = 0.1;
            ceilingLampLight1.shadow.camera.far = 10;
            ceilingLampLight1.shadow.bias = 0.0001;
            ceilingLampLight1.shadow.normalBias = 0.02;
            ceilingLampLight1.shadow.radius = 2;

            ceilingLampLight2 = ceilingLampLight1.clone();
            ceilingLampLight2.position.set(1.77, 4.4, -2.955);

            ceilingLampLight3 = ceilingLampLight1.clone();
            ceilingLampLight3.position.set(4.77, 4.4, -2.955);

            // Living room ceiling lamps
            livingLampLight1 = ceilingLampLight1.clone();
            livingLampLight1.position.set(3.6, 3.67, 2.86);
            livingLampLight2 = ceilingLampLight1.clone();
            livingLampLight2.position.set(3.3, 3.8, 2.58);
            livingLampLight3 = ceilingLampLight1.clone();
            livingLampLight3.position.set(3.6, 4, 2.28);
            livingLampLight4 = ceilingLampLight1.clone();
            livingLampLight4.position.set(3.88, 4.2, 2.58);

            // Bedroom ceiling lamp
            bedroomLampLight = ceilingLampLight1.clone();
            bedroomLampLight.position.set(-4.36, 4.4, 2.59);

            // Bathroom ceiling lamp
            bathroomLampLight = ceilingLampLight1.clone();
            bathroomLampLight.position.set(-5.56, 4.4, -3.12);

            scene.add(ceilingLampLight1);
            scene.add(ceilingLampLight2);
            scene.add(ceilingLampLight3);
            scene.add(livingLampLight1);
            scene.add(livingLampLight2);
            scene.add(livingLampLight3);
            scene.add(livingLampLight4);
            scene.add(bedroomLampLight);
            scene.add(bathroomLampLight);

            // Debug helper (keep but hidden)
            ceilingLampHelper = new THREE.PointLightHelper(bathroomLampLight, 0.15);
            ceilingLampHelper.visible = false;
            scene.add(ceilingLampHelper);

            resolve();
        }, undefined, reject);
    });
}


// -----------------------------------------------------------------------------
// LOAD LIGHT SWITCH
// -----------------------------------------------------------------------------
async function loadLightSwitch() {
    return new Promise((resolve, reject) => {
        // Load the model once
        gltfLoader.load('/models/Light Switch.glb', gltf => {
            const originalModel = gltf.scene;
            
            // Define all switch configurations
            const switchConfigs = [
                {   // Entrance/kitchen ceiling lamps
                    position: [-0.3, 2, -5.68],
                    rotation: [0, 0, 0],
                    scale: [3, 3, 3],
                    linkedLight: [ceilingLampLight1, ceilingLampLight2, ceilingLampLight3],
                    intensity: 1.8
                },
                {   // Bathroom ceiling lamps
                    position: [-3.35, 2, -1.975],
                    rotation: [0, Math.PI / 2, 0],
                    scale: [3, 3, 3],
                    linkedLight: [bathroomLampLight],
                    intensity: 1.8
                },
                {   // Living room ceiling lamps
                    position: [0.63, 2, -0.575],
                    rotation: [0, Math.PI, 0],
                    scale: [3, 3, 3],
                    linkedLight: [livingLampLight1, livingLampLight2, livingLampLight3, livingLampLight4],
                    intensity: 2.0
                },
                {   // Bedroom ceiling lamps
                    position: [-3.7, 2, -0.247],
                    rotation: [0, 0, 0],
                    scale: [3, 3, 3],
                    linkedLight: [bedroomLampLight],
                    intensity: 1.5
                }
            ];
            
            // Create switches from configs
            switchConfigs.forEach((config, index) => {
                // Clone the model (first one uses original, rest are clones)
                const model = index === 0 ? originalModel : originalModel.clone();
                
                scene.add(model);
                model.position.set(...config.position);
                model.rotation.set(...config.rotation);
                model.scale.set(...config.scale);
                
                model.deviceConfig = {
                    type: "lightSwitch",
                    isOn: false,
                    linkedLight: config.linkedLight,
                    intensity: config.intensity
                };
                
                smartDevices.push(model);
            });
            
            resolve();
        }, undefined, reject);
    });
}


// -----------------------------------------------------------------------------
// HDR ENVIRONMENT
// -----------------------------------------------------------------------------
function loadHDR() {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const hdrLoader = new HDRLoader();
    hdrLoader.load(
        './skybox/kloppenheim_02_1k.hdr',
        function (texture) { 
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            scene.background = envMap;

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
            scene.add(ambientLight);

            const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x000000, 0.1);
            scene.add(hemisphereLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
            directionalLight.position.set(20, 2.8, 17);
            directionalLight.target.position.set(4.2, 0, 5.74);
            directionalLight.castShadow = true;
            directionalLight.shadow.camera.near = 0.1;
            directionalLight.shadow.camera.far = 50;
            directionalLight.shadow.camera.left = -20;
            directionalLight.shadow.camera.right = 20;
            directionalLight.shadow.camera.top = 20;
            directionalLight.shadow.camera.bottom = -20;
            directionalLight.shadow.bias = -0.0001;
            directionalLight.shadow.normalBias = 0;
            directionalLight.shadow.mapSize.width = 2048;
            directionalLight.shadow.mapSize.height = 2048;
            scene.add(directionalLight.target);
            scene.add(directionalLight);
            
            texture.dispose();
            pmremGenerator.dispose();
        }
    )
}




// -----------------------------------------------------------------------------
// INTERACTION (Press E)
// -----------------------------------------------------------------------------
function handleInteraction() {

    const raycaster = new THREE.Raycaster();
    const dir = camera.getWorldDirection(new THREE.Vector3());
    raycaster.set(camera.position, dir);

    const hits = raycaster.intersectObjects(scene.children, true);

    if (hits.length === 0) return;

    for (const hit of hits) {

        let obj = hit.object;

        while (obj) {
            if (smartDevices.includes(obj)) {
                toggleLightSwitch(obj);
                return;
            }
            obj = obj.parent;
        }
    }
}


// Toggle lights connected to the light switch
function toggleLightSwitch(model) {

    model.deviceConfig.isOn = !model.deviceConfig.isOn;
    const isOn = model.deviceConfig.isOn;

    // Rotate switch
    model.rotation.z += Math.PI;

    // If linkedLight is an array
    if (model.deviceConfig.linkedLight && Array.isArray(model.deviceConfig.linkedLight)) {
        model.deviceConfig.linkedLight.forEach(light => {
            if (light) {
                light.visible = isOn;
                light.intensity = isOn ? model.deviceConfig.intensity : 0;
            }
        });
    } 
    // If linkedLight is a single light (backward compatibility)
    else if (model.deviceConfig.linkedLight) {
        model.deviceConfig.linkedLight.visible = isOn;
        model.deviceConfig.linkedLight.intensity = isOn ? model.deviceConfig.intensity : 0;
    }
}


// -----------------------------------------------------------------------------
// PLAYER MOVEMENT HELPERS
// -----------------------------------------------------------------------------
function getForwardVector() {
    const v = new THREE.Vector3();
    camera.getWorldDirection(v);
    v.y = 0;
    return v.normalize();
}

function getSideVector() {
    const v = new THREE.Vector3();
    camera.getWorldDirection(v);
    v.y = 0;
    v.normalize();
    v.cross(camera.up);
    return v;
}


// -----------------------------------------------------------------------------
// PLAYER PHYSICS (COLLISION + MOVEMENT)
// -----------------------------------------------------------------------------
function updatePlayer(deltaTime) {

    let damping = Math.exp(-10 * deltaTime) - 1;

    if (!playerOnFloor) {
        playerVelocity.y -= 15 * deltaTime;
        damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const speed = playerOnFloor ? 25 : 8;

    if (keyStates["KeyW"]) playerVelocity.addScaledVector(getForwardVector(), speed * deltaTime);
    if (keyStates["KeyS"]) playerVelocity.addScaledVector(getForwardVector(), -speed * deltaTime);
    if (keyStates["KeyA"]) playerVelocity.addScaledVector(getSideVector(), -speed * deltaTime);
    if (keyStates["KeyD"]) playerVelocity.addScaledVector(getSideVector(), speed * deltaTime);

    const deltaPos = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPos);

    playerCollisions();

    camera.position.copy(playerCollider.end);
}

// -----------------------------------------------------------------------------
// SMART DEVICE OUTLINE HIGHLIGHTING
// -----------------------------------------------------------------------------
function checkSmartDeviceHover() {
    const raycaster = new THREE.Raycaster();
    const dir = camera.getWorldDirection(new THREE.Vector3());
    raycaster.set(camera.position, dir);

    const hits = raycaster.intersectObjects(scene.children, true);

    // Clear outline by default
    outlinePass.selectedObjects = [];

    if (hits.length === 0) return;

    // Check if we hit a smart device
    for (const hit of hits) {
        let obj = hit.object;

        while (obj) {
            if (smartDevices.includes(obj)) {
                // Highlight this device
                outlinePass.selectedObjects = [obj];
                return;
            }
            obj = obj.parent;
        }
    }
}



// Capsule collision with octree
function playerCollisions() {

    const result = worldOctree.capsuleIntersect(playerCollider);

    playerOnFloor = false;

    if (result) {

        playerOnFloor = result.normal.y > 0;

        playerCollider.translate(result.normal.multiplyScalar(result.depth));

        if (!playerOnFloor) {
            playerVelocity.addScaledVector(
                result.normal,
                -result.normal.dot(playerVelocity)
            );
        }
    }
}


// -----------------------------------------------------------------------------
// MAIN LOOP
// -----------------------------------------------------------------------------
function animate(time) {
    if (!lastTime) lastTime = time;
    const delta = (time - lastTime) * 0.001; // Convert to seconds
    lastTime = time;
    
    if (controls.isLocked && delta < 0.1) {
        updatePlayer(delta);

        if (capsuleHelper) {
        const capsuleCenter = new THREE.Vector3()
            .addVectors(playerCollider.start, playerCollider.end)
            .multiplyScalar(0.5);
        capsuleHelper.position.copy(capsuleCenter);
    }
    }

    checkSmartDeviceHover()
    updateDebugHUD();
    composer.render();
}


// -----------------------------------------------------------------------------
// RESIZE
// -----------------------------------------------------------------------------
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);

    if (saoPass) {
        saoPass.setSize(window.innerWidth, window.innerHeight);
    }
    
    if (outlinePass) {
        outlinePass.setSize(window.innerWidth, window.innerHeight);
    }
}


// -----------------------------------------------------------------------------
// DEBUG HUD
// -----------------------------------------------------------------------------
let debugHudEnabled = true;
let frameCount = 0;
let lastTime = performance.now();
let fps = 60;

function updateDebugHUD() {
    if (!debugHudEnabled) return;
    
    // Camera position
    const pos = camera.position;
    document.getElementById('cam-pos').textContent = 
        `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`;
    
    // Camera rotation (just yaw/pitch for FPS, ignore roll)
    const rot = camera.rotation;
    const pitch = THREE.MathUtils.radToDeg(rot.x).toFixed(1);
    const yaw = THREE.MathUtils.radToDeg(rot.y).toFixed(1);
    document.getElementById('cam-rot').textContent = 
        `Pitch: ${pitch}°, Yaw: ${yaw}°`;
    
    // FPS calculation
    frameCount++;
    const currentTime = performance.now();
    if (currentTime >= lastTime + 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;
    }
    document.getElementById('fps').textContent = fps;
    
    // Player velocity (from your existing playerVelocity variable)
    document.getElementById('player-vel').textContent = 
        `${playerVelocity.x.toFixed(2)}, ${playerVelocity.y.toFixed(2)}, ${playerVelocity.z.toFixed(2)}`;
    
    // Player on floor state
    document.getElementById('player-floor').textContent = 
        playerOnFloor ? 'YES' : 'NO';
}

// -----------------------------------------------------------------------------
// CAPSULE VISUALIZATION (DEBUG)
// -----------------------------------------------------------------------------
function createCapsuleHelper() {
    const group = new THREE.Group();
    
    const capsuleHeight = playerCollider.end.y - playerCollider.start.y;
    const radius = playerCollider.radius;
    
    // Cylinder body
    const cylinderGeometry = new THREE.CylinderGeometry(
        radius, 
        radius, 
        capsuleHeight, 
        16
    );
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true
    });
    const cylinder = new THREE.Mesh(cylinderGeometry, wireframeMaterial);
    group.add(cylinder);
    
    // Top sphere
    const sphereGeometry = new THREE.SphereGeometry(radius, 16, 16);
    const topSphere = new THREE.Mesh(sphereGeometry, wireframeMaterial);
    topSphere.position.y = capsuleHeight / 2;
    group.add(topSphere);
    
    // Bottom sphere
    const bottomSphere = new THREE.Mesh(sphereGeometry, wireframeMaterial);
    bottomSphere.position.y = -capsuleHeight / 2;
    group.add(bottomSphere);
    
    scene.add(group);
    return group;
}