## Plan: First-Person Home Exploration with Models & Text Pop-Ups

Build a 3D home using imported models, enable first-person navigation via mouse and keyboard, and show text pop-ups for interactable objects.

### Steps
1. Import 3D house and object models into `main/src/main.js` (use GLTF/OBJ loaders).
2. Set up first-person controls supporting both mouse (look) and keyboard (move) in `main/src main.js`.
3. Place interactable objects (from models) in the scene, each with a unique identifier.
4. Implement raycasting to detect mouse clicks on objects in `main/src/main.js`.
5. Display HTML/CSS pop-up overlays with text info when objects are clicked.

### Further Considerations
1. Ensure models are optimized for web and placed in `main/public/` or a suitable folder.
2. Consider using Three.js `PointerLockControls` for immersive navigation.
3. Plan for extensible pop-up content (e.g., allow future addition of images or links).