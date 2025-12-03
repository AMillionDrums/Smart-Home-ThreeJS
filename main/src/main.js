import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './style.css'
import * as THREE from 'three';

let camera, scene, renderer, controls, composer;

// Movement variables
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

// Velocity and direction
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// For collision detection
const normalObjects = []; // Array to hold collidable objects (flat, furniture, etc.)
let raycaster;

// For interaction raycasting
const interactionRaycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const smartDevices = []; // Array to hold smart home device objects (NO OBJECTS ADDED YET)

let debugEl;
let debugRaycastLine; // Visual representation of the raycast
const DEBUG_RAYCAST = false; // Toggle debug visualization

let ceilingLampLight; // dynamic light for baked-in ceiling lamp (position set manually)
let ceilingLampHelper;

const gltfLoader = new GLTFLoader();

init();

async function init() { 
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-2, 2.8, -4.5);

    debugEl = document.createElement('div');
    debugEl.id = 'camera-debug';
    Object.assign(debugEl.style, {
        position: 'absolute',
        top: '8px',
        left: '8px',
        color: '#fff',
        background: 'rgba(0,0,0,0.5)',
        padding: '6px',
        fontFamily: 'monospace',
        fontSize: '12px',
        whiteSpace: 'pre',
        zIndex: 1000,
        pointerEvents: 'none'
    });
    document.body.appendChild(debugEl);

    scene = new THREE.Scene();

    if (DEBUG_RAYCAST) {
        const rayGeometry = new THREE.BufferGeometry();
        const rayMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
        debugRaycastLine = new THREE.Line(rayGeometry, rayMaterial);
        scene.add(debugRaycastLine);
    }

    controls = new PointerLockControls(camera, document.body);

    const blocker = document.getElementById('blocker');
    const instructions = document.getElementById('instructions');

    instructions.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        instructions.style.display = 'none';
        blocker.style.display = 'none';
    });
    
    controls.addEventListener('unlock', function () {
        blocker.style.display = 'block';
        instructions.style.display = '';
    });
    
    scene.add(controls.object);

    const gltfLoader = new GLTFLoader();
    const url = './models/2roomflat.glb';
    gltfLoader.load(url, (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => { 
            if (child.isMesh) {
                if (child.material && !child.material.transparent) {
                    child.castShadow = true;
                }
                child.receiveShadow = true;
            }
        });
        scene.add(root);

        // Create a dynamic light for a baked-in ceiling lamp.
        // Adjust the position below to match the baked lamp location inside the flat model.
        // You can tweak color, intensity and distance to match your scene.
        ceilingLampLight = new THREE.SpotLight(0xfff1c3, 3, 10, Math.PI, 0.5, 1);
        // Set this to the lamp position in world coordinates (edit these values)
        ceilingLampLight.position.set(-1.23, 4.6, -3.47);
        ceilingLampLight.target.position.set(-1.23, 0, -3.47);
        scene.add(ceilingLampLight.target);
        ceilingLampLight.castShadow = true;
        ceilingLampLight.visible = false; // start off
        scene.add(ceilingLampLight);

        // Optional small visual helper for debugging the light position
        ceilingLampHelper = new THREE.PointLightHelper(ceilingLampLight, 0.15);
        ceilingLampHelper.visible = false; // turn true to debug
        scene.add(ceilingLampHelper);
    });

    await loadAllModels();

    const onKeyDown = function ( event ) {
		switch ( event.code ) {
			case 'KeyW':
				moveForward = true;
				break;
			case 'KeyA':
				moveLeft = true;
				break;
			case 'KeyS':
				moveBackward = true;
				break;
			case 'KeyD':
				moveRight = true;
				break;
            case 'KeyE':
                handleInteraction();
                break;
		}
	};

    const onKeyUp = function ( event ) {
		switch ( event.code ) {
			case 'KeyW':
				moveForward = false;
				break;
			case 'KeyA':
				moveLeft = false;
				break;
			case 'KeyS':
				moveBackward = false;
				break;
			case 'KeyD':
				moveRight = false;
				break;
		}
	};

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Initialize raycaster for collision detection
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas: document.querySelector('#bg'),
    });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const hdrLoader = new HDRLoader();
    hdrLoader.load(
        './skybox/kloppenheim_02_1k.hdr',
        function (texture) { 
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            scene.background = envMap;
            scene.environment = envMap;
            scene.environmentIntensity = 0.4;
            
            texture.dispose();
            pmremGenerator.dispose();
        }
    )
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
        light.position.set(15, 15, 10); // Adjust to match HDR lighting
        light.castShadow = true;
        light.shadow.mapSize.width = 2048;
        light.shadow.mapSize.height = 2048;
        light.shadow.camera.far = 100;
        light.shadow.camera.left = -50;
        light.shadow.camera.right = 50;
        light.shadow.camera.top = 50;
        light.shadow.camera.bottom = -50;
        scene.add(light);

	renderer.setAnimationLoop(animate);
    
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) {
        composer.setSize(window.innerWidth, window.innerHeight); 
    }
}

// Helper: find the smart device root for an intersected object
function findSmartDeviceRoot(obj) {
    let current = obj;
    while (current) {
        if (smartDevices.includes(current)) return current;
        current = current.parent;
    }
    return null;
}

function handleInteraction() {
    // Cast a ray from the camera forward
    const rayOrigin = camera.position.clone();
    const rayDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    
    interactionRaycaster.set(rayOrigin, rayDirection);
    
    // Visualize the raycast for debugging
    if (DEBUG_RAYCAST && debugRaycastLine) {
        const rayLength = 50;
        const rayEnd = rayOrigin.clone().addScaledVector(rayDirection, rayLength);
        const positions = new Float32Array([
            rayOrigin.x, rayOrigin.y, rayOrigin.z,
            rayEnd.x, rayEnd.y, rayEnd.z
        ]);
        debugRaycastLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }
    
    // Raycast against all objects in the scene
    const intersects = interactionRaycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        console.log(`Hit ${intersects.length} objects`);
        // Find the closest smart device in the intersection results
        for (let intersection of intersects) {
            const obj = intersection.object;
            
            // Walk up the hierarchy to find the smart device root
            const smartDevice = findSmartDeviceRoot(obj);
            if (smartDevice && smartDevice.deviceConfig) {
                console.log(`Interacted with: ${smartDevice.deviceConfig.type}`);
                smartDevice.deviceConfig.onInteract(smartDevice);
                break;
            }
        }
    } else {
        console.log('No objects hit by raycast');
    }
}

function animate() {
    const time = performance.now();

    if (controls.isLocked === true) {
        // Movement physics
        raycaster.ray.origin.copy(controls.object.position);
        raycaster.ray.origin.y -= 10;

        const delta = (time - prevTime) / 1000;

        // Apply damping and gravity
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta;

        // Calculate movement direction
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        // Apply movement forces
        if (moveForward || moveBackward) velocity.z -= direction.z * 50 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 50 * delta;

        // Move the camera based on velocity
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Keep camera at a constant height
        controls.object.position.y = 2.8;
        
        // TODO: remove after project is finished
        if (debugEl && camera) {
        const p = camera.position;
        const r = camera.rotation;
        debugEl.textContent =
            `pos: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}\n` +
            `rot: ${THREE.MathUtils.radToDeg(r.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(r.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(r.z).toFixed(1)}°`;
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}

async function loadAllModels() {
    try {
        await loadModel('./models/2roomflat.glb', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1);
        await loadModel('./models/Light Switch.glb', { x: -0.3, y: 2, z: -5.68 }, { x: 0, y: 0, z: 0 }, 3, {
            type: 'lightSwitch',
            isOn: false,
            onInteract: toggleLightSwitch,
            // Link the ceiling lamp light (created in init after flat is loaded)
            linkedLight: ceilingLampLight,
            linkedLightHelper: ceilingLampHelper,
            // desired intensity when ON
            lightIntensity: 1.8
        });
        // TODO: add more models as needed
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

function loadModel(url, position = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0 }, scale = 1, deviceConfig = null) {
    return new Promise((resolve, reject) => {
        gltfLoader.load(url, (gltf) => {
            const model = gltf.scene;
                
            // Set position and scale
            model.position.set(position.x, position.y, position.z);
            model.rotation.set(rotation.x, rotation.y, rotation.z);
            model.scale.set(scale, scale, scale);
                
            // Configure shadows and materials
            model.traverse((child) => {
                if (child.isMesh) {
                    if (child.material && !child.material.transparent) {
                        child.castShadow = true;
                    }
                    child.receiveShadow = true;
                }
            });
            scene.add(model);
            
            // Only add to smartDevices if it has device config
            if (deviceConfig) {
                model.deviceConfig = deviceConfig;
                smartDevices.push(model);
                console.log(`Is it inside smartDevices: ${smartDevices.includes(model)}`);
                console.log(`Loaded smart device: ${deviceConfig.type}`);
            }
            
            resolve(model);
        }, undefined, reject);
    });
}

function toggleLightSwitch(model) {
    model.deviceConfig.isOn = !model.deviceConfig.isOn;
    const isOn = model.deviceConfig.isOn;
    console.log(`Light Switch is now ${isOn ? 'ON' : 'OFF'}`);

    // Rotate the switch slightly to indicate state change (adjust axis/amount to taste)
    const angle = Math.PI;
    model.rotation.z += isOn ? angle : -angle;

    // Toggle linked light if provided
    const light = model.deviceConfig && model.deviceConfig.linkedLight;
    if (light) {
        light.intensity = isOn ? (model.deviceConfig.lightIntensity || 1.5) : 0;
        light.visible = isOn;
    }

    // Toggle helper visibility if provided
    //const helper = model.deviceConfig && model.deviceConfig.linkedLightHelper;
    //if (helper) helper.visible = isOn;

    // Optional: if you know specific mesh parts of the flat that should glow, provide them
    // in deviceConfig.linkedMeshes (array of mesh references). Example toggles emissive.
    if (model.deviceConfig && model.deviceConfig.linkedMeshes) {
        model.deviceConfig.linkedMeshes.forEach(mesh => {
            if (mesh.material && mesh.material.emissive) {
                mesh.material.emissive.set(isOn ? 0xffcc66 : 0x000000);
                mesh.material.needsUpdate = true;
            }
        });
    }
}