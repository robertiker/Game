// ===== Configuracion =====
const TEX = {
    color:     'texture_pbr_20250901.png',
    normal:    'texture_pbr_20250901_normal.png',
    roughness: 'texture_pbr_20250901_roughness.png'
};

// Nombres de tus nuevas fotos reales para el fondo (ajusta la extension .jpg o .png segun corresponda)
const PARALLAX_IMAGES = {
    sky: 'cielo.png',
    city: 'ciudad.png',
    foreground: 'barandilla.png'
};

const MATERIAL_MODE = 'basic';
const SPEED = 3.0;
const CHAR_HEIGHT = 1.8;
const GRAVITY = 18;          
const JUMP_SPEED = 6;        
const JUMP_ANIM_SPEED = 1.5; 
const CAM_DIST = 4.5;        
const CAM_HEIGHT = 1.8;      
const CAM_LOOK = 1.0;        

// Mostrar cualquier error en pantalla
function showError(msg) {
    const el = document.getElementById('loading');
    if (el) {
        el.style.display = 'block';
        el.style.maxWidth = '80%';
        el.textContent = msg;
    }
}
window.addEventListener('error', e => showError('Error: ' + e.message));
window.addEventListener('unhandledrejection', e => showError('Error: ' + e.reason));

// 1. Escena, camara y renderizador
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e88e5);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 3, -6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// 2. Luces y suelo
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.0));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(5, 20, -10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);
scene.add(dirLight.target);

// Suelo tipo paseo / acera
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ===== Construccion del Escenario Parallax con tus Fotos Reales =====
const parallaxGroup = new THREE.Group();
const parallaxLayers = [];
const textureLoader = new THREE.TextureLoader();

function addParallaxLayer(imagePath, zDist, width, height, yBottom, speedFactor, renderOrder) {
    textureLoader.load(imagePath, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.encoding = THREE.sRGBEncoding;
        
        // Si quieres repetir la foto varias veces a lo ancho para que no se estire:
        texture.repeat.set(3, 1);

        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const geo = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, yBottom + height / 2, zDist);
        mesh.renderOrder = renderOrder;
        parallaxGroup.add(mesh);

        parallaxLayers.push({ texture, speedFactor });
    }, undefined, (err) => {
        console.error('No se pudo cargar la imagen de fondo: ' + imagePath, err);
        showError('Falta la imagen: ' + imagePath);
    });
}

// Cargar las 3 capas con tus archivos de fotos reales
addParallaxLayer(PARALLAX_IMAGES.sky,        40, 240, 22.0, 0, 0.008, 1);
addParallaxLayer(PARALLAX_IMAGES.city,       20, 160,  6.5, 0, 0.03,  2);
addParallaxLayer(PARALLAX_IMAGES.foreground,  5,  90,  1.7, 0, 0.09,  3);

scene.add(parallaxGroup);

// ===== Limites de movimiento =====
const WORLD_LIMIT_X = 35;
const MAX_Z = 3.8;
const MIN_Z = -15;

// 3. Variables del personaje
let mixer, character, current;
let jumping = false;
let baseY = 0;      
let feetY = 0;      
let velY = 0;       
let onGround = true;
let dancing = false;
const actions = {};
const clock = new THREE.Clock();
const loader = new THREE.FBXLoader();

// 4. Cargar personaje
loader.load('personaje.fbx', function (object) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    character = object;

    const box = new THREE.Box3().setFromObject(character);
    character.scale.setScalar(CHAR_HEIGHT / (box.max.y - box.min.y));
    character.position.set(0, 0, 0);
    const box2 = new THREE.Box3().setFromObject(character);
    character.position.y -= box2.min.y;
    baseY = character.position.y;

    character.rotation.y = -Math.PI / 2;

    const texLoader = new THREE.TextureLoader();
    const load = (url, srgb) => {
        const t = texLoader.load(url, undefined, undefined, () => {
            const fallbackUrl = url.replace('.png', '.jpg');
            texLoader.load(fallbackUrl, fbTex => {
                if (srgb) fbTex.encoding = THREE.sRGBEncoding;
                character.traverse(c => {
                    if (c.isMesh && c.material && c.material.map === t) {
                        c.material.map = fbTex;
                        c.material.needsUpdate = true;
                    }
                });
            });
        });
        if (srgb) t.encoding = THREE.sRGBEncoding;
        return t;
    };
    const colorMap     = load(TEX.color, true);
    const normalMap    = load(TEX.normal, false);
    const roughnessMap = load(TEX.roughness, false);

    character.traverse(child => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;

        if (MATERIAL_MODE === 'original') return;

        let mat;
        if (MATERIAL_MODE === 'basic') {
            mat = new THREE.MeshBasicMaterial({
                map: colorMap,
                color: 0xffffff,
                side: THREE.DoubleSide,
                skinning: !!child.isSkinnedMesh
            });
        } else {
            mat = new THREE.MeshStandardMaterial({
                map: colorMap,
                normalMap: normalMap,
                roughnessMap: roughnessMap,
                metalness: 0,
                roughness: 1,
                side: THREE.DoubleSide,
                skinning: !!child.isSkinnedMesh
            });
        }
        child.material = Array.isArray(child.material)
            ? child.material.map(() => mat)
            : mat;
    });

    scene.add(character);
    mixer = new THREE.AnimationMixer(character);
    loadAnim('idle', 'idle.fbx');
    loadAnim('walk', 'walk.fbx');
    loadAnim('jump', 'Jump.fbx');
    loadAnim('dance', 'Dance.fbx');

    mixer.addEventListener('finished', e => {
        if (e.action === actions.jump) jumping = false;
    });
}, undefined, function (error) {
    console.error('Error cargando personaje.fbx:', error);
    showError('Error al cargar personaje.fbx (mira la consola)');
});

function loadAnim(name, file) {
    loader.load(file, obj => {
        const clip = obj.animations[0];
        if (!clip) return;

        clip.tracks.forEach(track => {
            if (track.name.toLowerCase().endsWith('hips.position')) {
                const v = track.values;
                const x0 = v[0], z0 = v[2];
                for (let i = 0; i < v.length; i += 3) {
                    v[i]     = x0;   
                    v[i + 2] = z0;   
                    if (name === 'jump') v[i + 1] = v[1];   
                }
            }
        });

        actions[name] = mixer.clipAction(clip);
        if (name === 'jump') {
            actions[name].setLoop(THREE.LoopOnce, 1);   
            actions[name].clampWhenFinished = true;
            actions[name].timeScale = JUMP_ANIM_SPEED;
        }
        if (name === 'idle') playAction('idle');
    }, undefined, () => console.warn('No se pudo cargar ' + file));
}

function playAction(name) {
    const next = actions[name];
    if (!next || next === current) return;
    next.reset().fadeIn(0.25).play();
    if (current) current.fadeOut(0.25);
    current = next;
}

function startJump() {
    const a = actions.jump;
    if (!a || jumping || !onGround) return;
    jumping = true;
    velY = JUMP_SPEED;
    onGround = false;
    dancing = false;
    a.reset().fadeIn(0.1).play();
    if (current) current.fadeOut(0.1);
    current = a;
}

function toggleDance() {
    if (!actions.dance || jumping) return;
    dancing = !dancing;
    playAction(dancing ? 'dance' : 'idle');
}

// 5. Entrada: joystick + teclado
const input = { x: 0, y: 0 };
const keys = {};

const joystick = nipplejs.create({
    zone: document.getElementById('joystick-zone'),
    mode: 'static',
    position: { left: '75px', bottom: '75px' },
    color: '#444444'
});
joystick.on('move', (evt, data) => {
    const mag = Math.min(data.force, 1);
    input.x = data.vector.x * mag;
    input.y = data.vector.y * mag;
});
joystick.on('end', () => { input.x = 0; input.y = 0; });

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); startJump(); }
    if (e.code === 'KeyB') toggleDance();
});
window.addEventListener('keyup', e => keys[e.code] = false);

const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); startJump(); });
const danceBtn = document.getElementById('dance-btn');
if (danceBtn) danceBtn.addEventListener('pointerdown', e => { e.preventDefault(); toggleDance(); });

// 6. Bucle del juego
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    let moveX = 0;

    if (character) {
        let ix = input.x + ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
        let iy = input.y + ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0);
        const mag = Math.min(Math.hypot(ix, iy), 1);

        if (mag > 0.1) {
            const dx = -ix, dz = iy;
            const target = Math.atan2(dx, dz);
            let diff = target - character.rotation.y;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            character.rotation.y += diff * Math.min(1, 10 * delta);

            const len = Math.hypot(dx, dz);
            const stepX = (dx / len) * mag * SPEED * delta;
            const stepZ = (dz / len) * mag * SPEED * delta;

            character.position.x += stepX;
            character.position.z += stepZ;
            moveX = stepX; 

            dancing = false;   
            if (!jumping) playAction('walk');
        } else {
            if (!jumping && !dancing) playAction('idle');
        }

        character.position.x = Math.max(-WORLD_LIMIT_X, Math.min(WORLD_LIMIT_X, character.position.x));
        character.position.z = Math.max(MIN_Z, Math.min(MAX_Z, character.position.z));

        velY -= GRAVITY * delta;
        feetY += velY * delta;
        if (feetY <= 0) {
            feetY = 0;
            velY = 0;
            if (!onGround) jumping = false;   
            onGround = true;
        } else {
            onGround = false;
        }
        character.position.y = baseY + feetY;

        parallaxGroup.position.x = character.position.x;

        dirLight.position.set(character.position.x + 5, 20, character.position.z - 10);
        dirLight.target.position.copy(character.position);

        camera.position.set(character.position.x, character.position.y + CAM_HEIGHT, character.position.z - CAM_DIST);
        camera.lookAt(character.position.x, character.position.y + CAM_LOOK, character.position.z);
    }

    if (moveX !== 0) {
        parallaxLayers.forEach(layer => {
            layer.texture.offset.x += moveX * layer.speedFactor;
        });
    }

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
