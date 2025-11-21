import './style.css'
import * as THREE from 'three';

// Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.setZ(30);

// Renderer Setup
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    canvas: document.querySelector('canvas'),
});

// Adjust renderer for high-DPI displays
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// Initial render
renderer.render(scene, camera);

// Handle window resize
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// Testing geometry rendering
const geometry = new THREE.TorusGeometry(10, 3, 16, 100);
const material = new THREE.MeshBasicMaterial({ color: 0xff6347, wireframe: true });
const torus = new THREE.Mesh(geometry, material);
scene.add(torus);

function gameloop() {
    requestAnimationFrame(gameloop);

    torus.rotation.x += 0.01;
    torus.rotation.y += 0.005;
    torus.rotation.z += 0.01;
    
    renderer.render(scene, camera);
}

gameloop();