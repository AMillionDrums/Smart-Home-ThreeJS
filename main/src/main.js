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


// -----------------------------------------------------------------------------
// GLOBALS
// -----------------------------------------------------------------------------
let camera, scene, renderer, controls;
const gltfLoader = new GLTFLoader();
const smartDevices = [];

let ceilingLampLight = null;
let ceilingLampHelper = null;

// Movement states
const keyStates = {};

// Physics (capsule + octree)
const worldOctree = new Octree();
const playerVelocity = new THREE.Vector3();
let playerOnFloor = false;

// Player capsule collider (spawn point)
const playerCollider = new Capsule(
    new THREE.Vector3(-2, 3.2 - 1.2, -4.5), // bottom
    new THREE.Vector3(-2, 4.5, -4.5),       // top (camera height)
    0.35                                    // radius
);


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


    // CONTROLS
    controls = new PointerLockControls(camera, document.body);

    document.getElementById("instructions").addEventListener("click", () => {
        controls.lock();
    });

    controls.addEventListener("lock", () => {
        document.getElementById("blocker").style.display = "none";
    });

    controls.addEventListener("unlock", () => {
        document.getElementById("blocker").style.display = "block";
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

            // Shadows
            root.traverse(obj => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });

            // Ceiling lamp (light off by default)
            ceilingLampLight = new THREE.PointLight(0xfff1c3, 1, 0, 2);
            ceilingLampLight.position.set(-1.23, 4.4, -3.47);

            ceilingLampLight.castShadow = true;
            ceilingLampLight.visible = false;

            scene.add(ceilingLampLight);

            // Debug helper (keep but hidden)
            ceilingLampHelper = new THREE.PointLightHelper(ceilingLampLight, 0.15);
            ceilingLampHelper.visible = true;
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

        gltfLoader.load('/models/Light Switch.glb', gltf => {

            const model = gltf.scene;
            scene.add(model);

            model.position.set(-0.3, 2, -5.68);
            model.scale.set(3, 3, 3);

            model.deviceConfig = {
                type: "lightSwitch",
                isOn: false,
                linkedLight: ceilingLampLight,
                intensity: 1.8
            };

            smartDevices.push(model);
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
            scene.environment = envMap;
            scene.environmentIntensity = 0.1;
            
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


// Toggle the lamp
function toggleLightSwitch(model) {

    model.deviceConfig.isOn = !model.deviceConfig.isOn;
    const isOn = model.deviceConfig.isOn;

    // Rotate switch
    model.rotation.z += Math.PI;

    // Light toggling
    if (model.deviceConfig.linkedLight) {
        model.deviceConfig.linkedLight.visible = isOn;
        model.deviceConfig.linkedLight.intensity =
            isOn ? model.deviceConfig.intensity : 0;
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
function animate() {

    if (controls.isLocked) {
        const delta = 0.016; // ~60fps
        updatePlayer(delta);
    }

    renderer.render(scene, camera);
}


// -----------------------------------------------------------------------------
// RESIZE
// -----------------------------------------------------------------------------
function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
