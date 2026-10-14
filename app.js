// ===== Configuracion =====
const TEX = {
    color:     'texture_pbr_20250901.png',
    normal:    'texture_pbr_20250901_normal.png',
    roughness: 'texture_pbr_20250901_roughness.png'
};
// 'basic'    = sin luces (test: si asi se ve con color, la textura esta bien)
// 'standard' = con luces, normal y roughness
// 'original' = deja el material que trae el propio FBX
const MATERIAL_MODE = 'basic';
const SPEED = 3.0;
const CHAR_HEIGHT = 1.8;
const GRAVITY = 18;          // Fuerza de gravedad
const JUMP_SPEED = 6;        // Impulso del salto
const JUMP_ANIM_SPEED = 1.5; // Velocidad de la animacion de salto
const CAM_DIST = 3.5;     // Distancia detras del personaje
const CAM_HEIGHT = 1.8;   // Altura de la camara
const CAM_LOOK = 1.0;     // Altura del punto al que mira

// Mostrar cualquier error en pantalla
function showError(msg) {
    const el = document.getElementById('loading');
    el.style.display = 'block';
    el.style.maxWidth = '80%';
    el.textContent = msg;
}
window.addEventListener('error', e => showError('Error: ' + e.message));
window.addEventListener('unhandledrejection', e => showError('Error: ' + e.reason));

// 1. Escena, camara y renderizador
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

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
dirLight.position.set(5, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
dirLight.shadow.camera.far = 80;
scene.add(dirLight);
scene.add(dirLight.target);

const grid = new THREE.GridHelper(200, 100, 0x000000, 0x000000);
grid.material.opacity = 0.2;
grid.material.transparent = true;
scene.add(grid);

// ===== Escenario y obstaculos =====
const WORLD_LIMIT = 40;        // El mapa va de -40 a +40
const PLAYER_RADIUS = 0.4;     // "Grosor" del personaje para chocar
const colliders = [];

// Suelo
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({ color: 0x8aa57a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
grid.position.y = 0.01;   // Evita parpadeo con el suelo

// Gestor de capas Parallax
const textureLoader = new THREE.TextureLoader();
const parallaxLayers = [];

function createParallaxLayer(imageFile, distanceZ, height, scrollSpeed) {
    const texture = textureLoader.load(imageFile);
    
    // Activar repeticion infinita en el eje horizontal
    texture.wrapS = THREE.RepeatWrapping; 
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.encoding = THREE.sRGBEncoding;

    const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true, 
        depthWrite: false, // Previene problemas de superposicion Z
        side: THREE.FrontSide
    });
    
    // Crear un plano lo suficientemente ancho para cubrir los bordes de la pantalla
    const aspect = window.innerWidth / window.innerHeight;
    const width = height * aspect * 3; 
    const geometry = new THREE.PlaneGeometry(width, height);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = distanceZ;
    
    return { mesh, texture, scrollSpeed };
}

const parallaxGroup = new THREE.Group();

// Capa 1: Cielo (Lejos, muy lento)
const skyLayer = createParallaxLayer('cielo.png', 100, 80, 0.02);
skyLayer.mesh.position.y = 20; 
parallaxLayers.push(skyLayer);

// Capa 2: Ciudad (Medio, velocidad normal)
const cityLayer = createParallaxLayer('ciudad.png', 70, 50, 0.08);
cityLayer.mesh.position.y = 10;
parallaxLayers.push(cityLayer);

// Capa 3: Barandilla y setos (Cerca, muy rapido)
const foregroundLayer = createParallaxLayer('barandilla.png', 30, 20, 0.25);
foregroundLayer.mesh.position.y = 0;
parallaxLayers.push(foregroundLayer);

parallaxLayers.forEach(layer => parallaxGroup.add(layer.mesh));
scene.add(parallaxGroup);

function addBox(x, z, w, d, h, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 }));
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push({ type: 'box', x: x, z: z, hw: w / 2, hd: d / 2, top: h });
}

function addCylinder(x, z, r, h, color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24),
        new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 }));
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push({ type: 'cyl', x: x, z: z, r: r, top: h });
}

// Muros del borde del mapa
const L = WORLD_LIMIT;
addBox(0,  L + 0.5, 2 * L + 2, 1, 3, 0x888888);
addBox(0, -L - 0.5, 2 * L + 2, 1, 3, 0x888888);
addBox( L + 0.5, 0, 1, 2 * L + 2, 3, 0x888888);
addBox(-L - 0.5, 0, 1, 2 * L + 2, 3, 0x888888);

// Obstaculos
addBox(5, 6, 2, 2, 0.7, 0xb5651d);      
addBox(-6, 8, 3, 1.5, 0.6, 0xb5651d);   
addBox(8, -4, 1.5, 1.5, 0.5, 0xc98a4b); 
addBox(10, 10, 2, 2, 0.5, 0xc98a4b);    
addBox(12, 10, 2, 2, 1.0, 0xb5651d);    
addCylinder(-5, -6, 0.8, 3, 0x777788);  
addCylinder(3, -9, 0.8, 3, 0x777788);   
addCylinder(-10, 2, 1.2, 4, 0x2e7d32);  
addBox(0, 14, 10, 0.6, 2.5, 0x6a7fa0);  
addBox(14, 4, 0.6, 8, 2.5, 0x6a7fa0);   

// Altura del suelo bajo un punto
function groundHeight(x, z) {
    let h = 0;
    for (const c of colliders) {
        if (c.type !== 'box') continue;
        if (Math.abs(x - c.x) <= c.hw + 0.2 && Math.abs(z - c.z) <= c.hd + 0.2) h = Math.max(h, c.top);
    }
    return h;
}

function resolveCollisions(pos, feetY) {
    for (const c of colliders) {
        if (feetY >= c.top - 0.05) continue;   // Si los pies estan por encima, no choca
        if (c.type === 'box') {
            const nx = Math.max(c.x - c.hw, Math.min(pos.x, c.x + c.hw));
            const nz = Math.max(c.z - c.hd, Math.min(pos.z, c.z + c.hd));
            const dx = pos.x - nx, dz = pos.z - nz;
            const dist = Math.hypot(dx, dz);
            if (dist < PLAYER_RADIUS) {
                if (dist > 0.0001) {
                    pos.x = nx + (dx / dist) * PLAYER_RADIUS;
                    pos.z = nz + (dz / dist) * PLAYER_RADIUS;
                } else {
                    const px = c.hw - Math.abs(pos.x - c.x);
                    const pz = c.hd - Math.abs(pos.z - c.z);
                    if (px < pz) pos.x = c.x + (pos.x >= c.x ? 1 : -1) * (c.hw + PLAYER_RADIUS);
                    else         pos.z = c.z + (pos.z >= c.z ? 1 : -1) * (c.hd + PLAYER_RADIUS);
                }
            }
        } else {
            const dx = pos.x - c.x, dz = pos.z - c.z;
            const dist = Math.hypot(dx, dz);
            const min = c.r + PLAYER_RADIUS;
            if (dist < min) {
                const k = dist > 0.0001 ? min / dist : 0;
                pos.x = dist > 0.0001 ? c.x + dx * k : c.x + min;
                pos.z = dist > 0.0001 ? c.z + dz * k : c.z;
            }
        }
    }
}

// 3. Variables
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
    document.getElementById('loading').style.display = 'none';
    character = object;

    const box = new THREE.Box3().setFromObject(character);
    character.scale.setScalar(CHAR_HEIGHT / (box.max.y - box.min.y));
    character.position.set(0, 0, 0);
    const box2 = new THREE.Box3().setFromObject(character);
    character.position.y -= box2.min.y;
    baseY = character.position.y;

    const texLoader = new THREE.TextureLoader();
    const load = (url, srgb) => {
        const t = texLoader.load(url, undefined, undefined,
            () => console.warn('No se encontro ' + url));
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

        // Quitar el avance de la cadera (X y Z) para que la animacion sea "in place"
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
jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); startJump(); });
document.getElementById('dance-btn').addEventListener('pointerdown', e => { e.preventDefault(); toggleDance(); });

// 6. Bucle del juego
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    // Actualizar el offset de las texturas para el efecto de movimiento
    parallaxLayers.forEach(layer => {
        layer.texture.offset.x -= layer.scrollSpeed * delta; 
    });

    // Enganchar el grupo parallax a la camara
    parallaxGroup.position.x = camera.position.x;
    parallaxGroup.position.z = camera.position.z;

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
            character.position.x += (dx / len) * mag * SPEED * delta;
            character.position.z += (dz / len) * mag * SPEED * delta;
            dancing = false;   
            if (!jumping) playAction('walk');
        } else {
            if (!jumping && !dancing) playAction('idle');
        }

        // Fisica vertical
        velY -= GRAVITY * delta;
        feetY += velY * delta;
        resolveCollisions(character.position, feetY);
        const gh = groundHeight(character.position.x, character.position.z);
        if (feetY <= gh) {
            feetY = gh;
            velY = 0;
            if (!onGround) jumping = false;   
            onGround = true;
        } else {
            onGround = false;
        }
        character.position.y = baseY + feetY;

        dirLight.position.set(character.position.x + 5, 20, character.position.z + 10);
        dirLight.target.position.copy(character.position);

        camera.position.set(character.position.x, character.position.y + CAM_HEIGHT, character.position.z - CAM_DIST);
        camera.lookAt(character.position.x, character.position.y + CAM_LOOK, character.position.z);
    }

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    // Si cambias el tamano de la ventana, es buena idea actualizar el plano de fondo
    // pero por ahora solo ajustamos el renderizador principal
    renderer.setSize(window.innerWidth, window.innerHeight);
});