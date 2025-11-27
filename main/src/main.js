import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import './style.css'
import * as THREE from 'three';

let camera, scene, renderer, controls;

const torusgeometry = new THREE.TorusGeometry(10, 3, 16, 100);
const torusmaterial = new THREE.MeshStandardMaterial({ color: 0xff6347 });
const torus = new THREE.Mesh(torusgeometry, torusmaterial);

const cubegeometry = new THREE.BoxGeometry(6, 6, 6);
const cubematerial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(cubegeometry, cubematerial);

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

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7.5);

init();

function init() { 
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 30);

    scene = new THREE.Scene();

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

    // Add some ground for collision detection
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xC0C0C0 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = 0;
    scene.add(floor);
    normalObjects.push(floor);

    // Position torus
    torus.position.y = 15;
    scene.add(torus);

    cube.position.x = 20;
    cube.position.y = 1;
    scene.add(cube);
    normalObjects.push(cube);

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

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const hdrLoader = new HDRLoader();
    hdrLoader.load(
        './skybox/kloppenheim_02_1k.hdr',
        function (texture) { 
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            scene.background = envMap;
            scene.environment = envMap;
            texture.dispose();
            pmremGenerator.dispose();
        }
    )

	renderer.setAnimationLoop(animate);
    
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

function handleInteraction() {
    // Cast a ray from the camera to detect objects in front
    interactionRaycaster.setFromCamera(mouse, camera);
    // Raycast against all objects in the scene (TODO: optimize by using a specific list)
    const intersects = interactionRaycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const closestObject = intersects[0].object;
        console.log('Interacted with:', closestObject);

        // Example interaction: change color of the object (TODO: implement pop-up)
        if (smartDevices.includes(closestObject)) {
            // GUI pop-up code would go here
        }
    }
}

function animate() {
    const time = performance.now();

    if (controls.isLocked === true) {
        // Rotate torus
        torus.rotation.x += 0.01;
        torus.rotation.y += 0.01;
        torus.rotation.z += 0.01;

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
        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        // Move the camera based on velocity
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Keep camera at a constant height
        controls.object.position.y = 10;
    }

    prevTime = time;
    renderer.render(scene, camera);
}