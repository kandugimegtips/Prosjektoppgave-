let audioCtx = null;
let isMuted = false;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type) {
    if (isMuted || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'shoot') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'hit') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.linearRampToValueAtTime(60, now + 0.15);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'fireball') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'heal') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.4);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'dash') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(450, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch (e) {}
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;

let gameState = 'MENU';
let score = 0;
let kills = 0;
let wave = 1;

const camera = { x: 0, y: 0 };
const mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };

const player = {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    radius: 18,
    speed: 3.8,
    hp: 100,
    maxHp: 100,
    mana: 100,
    maxMana: 100,
    angle: 0,
    isStealth: false,
    stealthTimer: 0,
    isInvulnerable: false,
    invulnTimer: 0,
    damageMultiplier: 1.0,
    lastShotTime: 0
};

const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    keys[e.code] = true;
    if (gameState === 'PLAYING') {
        if (e.key === '1' || e.key.toLowerCase() === 'q') useSkill(0);
        if (e.key === '2' || e.key.toLowerCase() === 'e') useSkill(1);
        if (e.key === '3' || e.key.toLowerCase() === 'r') useSkill(2);
        if (e.key === '4' || e.code === 'Space') useSkill(3);
        if (e.key === '5' || e.key.toLowerCase() === 'f') useSkill(4);
        if (e.key === '6' || e.key.toLowerCase() === 'shift') useSkill(5);
    }
});

window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
    keys[e.code] = false;
});

window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.worldX = camera.x + mouse.x;
    mouse.worldY = camera.y + mouse.y;
});

window.addEventListener('mousedown', e => {
    if (e.button === 0) {
        mouse.down = true;
        initAudio();
        if (gameState === 'PLAYING') {
            shootVanumBolt();
        }
    }
});

window.addEventListener('mouseup', e => {
    if (e.button === 0) mouse.down = false;
});

const skills = [
    { id: 'fire', name: 'Ildkule', icon: '🔥', key: '1 / Q', cost: 25, cd: 1.2, lastUsed: 0, type: 'chaos' },
    { id: 'earth', name: 'Jordvegg', icon: '🪨', key: '2 / E', cost: 30, cd: 4.0, lastUsed: 0, type: 'chaos' },
    { id: 'water', name: 'Vannhelbredelse', icon: '💧', key: '3 / R', cost: 35, cd: 6.0, lastUsed: 0, type: 'order' },
    { id: 'air', name: 'Luft-dash', icon: '🌪️', key: '4 / Space', cost: 20, cd: 2.5, lastUsed: 0, type: 'order' },
    { id: 'light', name: 'Lys-kloner', icon: '✨', key: '5 / F', cost: 40, cd: 8.0, lastUsed: 0, type: 'order' },
    { id: 'dark', name: 'Mørk Stealth', icon: '🌑', key: '6 / Shift', cost: 30, cd: 7.0, lastUsed: 0, type: 'chaos' }
];

let balanceValue = 50;

function renderSkillBar() {
    const container = document.getElementById('skillBar');
    container.innerHTML = '';
    skills.forEach((s, idx) => {
        const btn = document.createElement('button');
        btn.className = 'skill-btn relative flex flex-col items-center justify-center w-14 sm:w-16 h-14 sm:h-16 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-white shadow-lg cursor-pointer overflow-hidden';
        btn.innerHTML = `
            <span class="text-xl sm:text-2xl">${s.icon}</span>
            <span class="text-[9px] text-slate-300 font-semibold mt-0.5">${s.key}</span>
            <div id="cdOverlay_${idx}" class="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-xs font-bold text-amber-300 hidden"></div>
        `;
        btn.onclick = (e) => {
            e.stopPropagation();
            initAudio();
            useSkill(idx);
        };
        container.appendChild(btn);
    });
}

function updateSkillBarCooldowns() {
    const now = Date.now() / 1000;
    skills.forEach((s, idx) => {
        const overlay = document.getElementById(`cdOverlay_${idx}`);
        if (!overlay) return;
        const elapsed = now - s.lastUsed;
        if (elapsed < s.cd) {
            const rem = (s.cd - elapsed).toFixed(1);
            overlay.classList.remove('hidden');
            overlay.textContent = rem + 's';
        } else {
            overlay.classList.add('hidden');
        }
    });
}

function useSkill(idx) {
    if (gameState !== 'PLAYING') return;
    const s = skills[idx];
    const now = Date.now() / 1000;
    if (now - s.lastUsed < s.cd) return;
    if (player.mana < s.cost) return;

    player.mana -= s.cost;
    s.lastUsed = now;

    if (s.type === 'order') balanceValue = Math.max(0, balanceValue - 12);
    else balanceValue = Math.min(100, balanceValue + 12);

    const harmonyBox = document.getElementById('balanceContainer');
    const statusText = document.getElementById('balanceStatusText');
    const indicator = document.getElementById('balanceIndicator');
    indicator.style.left = balanceValue + '%';

    if (balanceValue >= 35 && balanceValue <= 65) {
        harmonyBox.classList.add('harmony-active');
        statusText.textContent = 'VANUM HARMONI (+35% SKADE)';
        player.damageMultiplier = 1.35;
    } else {
        harmonyBox.classList.remove('harmony-active');
        statusText.textContent = balanceValue < 35 ? 'ORDEN DOMINERER' : 'KAOS DOMINERER';
        player.damageMultiplier = 1.0;
    }

    if (s.id === 'fire') {
        playSound('fireball');
        projectiles.push({
            x: player.x, y: player.y,
            vx: Math.cos(player.angle) * 10,
            vy: Math.sin(player.angle) * 10,
            radius: 12, damage: 55, isFireball: true, life: 70
        });
    } else if (s.id === 'earth') {
        playSound('hit');
        const wallDist = 60;
        const wx = player.x + Math.cos(player.angle) * wallDist;
        const wy = player.y + Math.sin(player.angle) * wallDist;
        earthWalls.push({ x: wx, y: wy, width: 80, height: 18, angle: player.angle + Math.PI / 2, hp: 120 });
        trolls.forEach(t => {
            if (Math.hypot(t.x - wx, t.y - wy) < 90) t.stunTimer = 120;
        });
    } else if (s.id === 'water') {
        playSound('heal');
        player.hp = Math.min(player.maxHp, player.hp + 35);
        floatingTexts.push({ x: player.x, y: player.y - 20, text: '+35 LIV', color: '#38bdf8', life: 50 });
    } else if (s.id === 'air') {
        playSound('dash');
        const dashDist = 140;
        player.x += Math.cos(player.angle) * dashDist;
        player.y += Math.sin(player.angle) * dashDist;
        player.x = Math.max(30, Math.min(WORLD_WIDTH - 30, player.x));
        player.y = Math.max(30, Math.min(WORLD_HEIGHT - 30, player.y));
        player.isInvulnerable = true;
        player.invulnTimer = 45;
    } else if (s.id === 'light') {
        playSound('heal');
        for (let i = 0; i < 3; i++) {
            const a = player.angle + (i - 1) * 0.6;
            clones.push({ x: player.x + Math.cos(a) * 40, y: player.y + Math.sin(a) * 40, life: 180 });
        }
    } else if (s.id === 'dark') {
        playSound('dash');
        player.isStealth = true;
        player.stealthTimer = 240;
        player.damageMultiplier = 2.5;
        floatingTexts.push({ x: player.x, y: player.y - 20, text: 'MØRK STEALTH (2.5x)', color: '#a855f7', life: 60 });
    }
}

let trolls = [];
let projectiles = [];
let earthWalls = [];
let clones = [];
let floatingTexts = [];
let worldObjects = [];

function generateWorld() {
    worldObjects = [];
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dist = 220 + Math.random() * 80;
        worldObjects.push({
            type: 'ruin',
            x: WORLD_WIDTH / 2 + Math.cos(angle) * dist,
            y: WORLD_HEIGHT / 2 + Math.sin(angle) * dist,
            width: 50, height: 50
        });
    }
    for (let i = 0; i < 180; i++) {
        const x = 80 + Math.random() * (WORLD_WIDTH - 160);
        const y = 80 + Math.random() * (WORLD_HEIGHT - 160);
        if (Math.hypot(x - WORLD_WIDTH / 2, y - WORLD_HEIGHT / 2) < 280) continue;

        const isRock = Math.random() < 0.25;
        worldObjects.push({
            type: isRock ? 'rock' : 'tree',
            x: x, y: y,
            radius: isRock ? 22 + Math.random() * 18 : 35 + Math.random() * 25
        });
    }
}

function startGame() {
    initAudio();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('hudTop').classList.remove('hidden');
    document.getElementById('hudBottom').classList.remove('hidden');

    player.x = WORLD_WIDTH / 2;
    player.y = WORLD_HEIGHT / 2;
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    player.isStealth = false;
    player.isInvulnerable = false;
    score = 0;
    kills = 0;
    wave = 1;
    trolls = [];
    projectiles = [];
    earthWalls = [];
    clones = [];
    floatingTexts = [];

    generateWorld();
    renderSkillBar();
    spawnWave();
    gameState = 'PLAYING';
}

function spawnWave() {
    showWaveBanner(`Bølge ${wave}: Trollhorden angriper!`);
    const count = 3 + wave * 3;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 700 + Math.random() * 500;
        const isBoss = wave % 3 === 0 && i === 0;
        trolls.push({
            x: player.x + Math.cos(angle) * dist,
            y: player.y + Math.sin(angle) * dist,
            radius: isBoss ? 42 : 22,
            hp: isBoss ? 250 + wave * 50 : 50 + wave * 15,
            maxHp: isBoss ? 250 + wave * 50 : 50 + wave * 15,
            speed: isBoss ? 1.4 : 2.1 + Math.random() * 0.6,
            isBoss: isBoss,
            stunTimer: 0
        });
    }
}

function showWaveBanner(text) {
    const banner = document.getElementById('waveBanner');
    const bannerText = document.getElementById('waveBannerText');
    bannerText.textContent = text;
    banner.classList.remove('opacity-0', '-translate-y-4');
    setTimeout(() => {
        banner.classList.add('opacity-0', '-translate-y-4');
    }, 3500);
}

function shootVanumBolt() {
    const now = Date.now();
    if (now - player.lastShotTime < 180) return;
    player.lastShotTime = now;

    playSound('shoot');
    const speed = 12;
    projectiles.push({
        x: player.x, y: player.y,
        vx: Math.cos(player.angle) * speed,
        vy: Math.sin(player.angle) * speed,
        radius: 6,
        damage: 22 * player.damageMultiplier,
        isFireball: false,
        life: 50
    });

    if (player.isStealth) {
        player.isStealth = false;
        player.damageMultiplier = 1.0;
    }
}

function update() {
    if (gameState !== 'PLAYING') return;

    if (player.mana < player.maxMana) {
        player.mana = Math.min(player.maxMana, player.mana + 0.15);
    }

    let moveX = 0;
    let moveY = 0;
    if (keys['w'] || keys['arrowup']) moveY -= 1;
    if (keys['s'] || keys['arrowdown']) moveY += 1;
    if (keys['a'] || keys['arrowleft']) moveX -= 1;
    if (keys['d'] || keys['arrowright']) moveX += 1;

    if (moveX !== 0 || moveY !== 0) {
        const len = Math.hypot(moveX, moveY);
        player.x += (moveX / len) * player.speed;
        player.y += (moveY / len) * player.speed;
    } else if (mouse.down) {
        const distToMouse = Math.hypot(mouse.worldX - player.x, mouse.worldY - player.y);
        if (distToMouse > 5) {
            const angleToMouse = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
            player.x += Math.cos(angleToMouse) * player.speed;
            player.y += Math.sin(angleToMouse) * player.speed;
        }
    }

    player.x = Math.max(30, Math.min(WORLD_WIDTH - 30, player.x));
    player.y = Math.max(30, Math.min(WORLD_HEIGHT - 30, player.y));
    player.angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);

    camera.x += (player.x - canvas.width / 2 - camera.x) * 0.1;
    camera.y += (player.y - canvas.height / 2 - camera.y) * 0.1;
    camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camera.y));

    if (player.isInvulnerable) {
        player.invulnTimer--;
        if (player.invulnTimer <= 0) player.isInvulnerable = false;
    }
    if (player.isStealth) {
        player.stealthTimer--;
        if (player.stealthTimer <= 0) {
            player.isStealth = false;
            player.damageMultiplier = 1.0;
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        let hit = false;
        for (let t of trolls) {
            if (Math.hypot(t.x - p.x, t.y - p.y) < t.radius + p.radius) {
                hit = true;
                t.hp -= p.damage;
                playSound('hit');
                floatingTexts.push({ x: t.x, y: t.y - 15, text: Math.round(p.damage), color: p.isFireball ? '#f97316' : '#38bdf8', life: 35 });

                if (p.isFireball) {
                    trolls.forEach(ot => {
                        if (Math.hypot(ot.x - p.x, ot.y - p.y) < 100) ot.hp -= 30;
                    });
                }
                break;
            }
        }

        if (hit || p.life <= 0) projectiles.splice(i, 1);
    }

    for (let i = clones.length - 1; i >= 0; i--) {
        clones[i].life--;
        if (clones[i].life <= 0) clones.splice(i, 1);
    }

    for (let i = trolls.length - 1; i >= 0; i--) {
        const t = trolls[i];
        if (t.stunTimer > 0) {
            t.stunTimer--;
            continue;
        }

        let targetX = player.x;
        let targetY = player.y;
        if (!player.isStealth && clones.length > 0) {
            let closestClone = clones[0];
            let minDist = Math.hypot(clones[0].x - t.x, clones[0].y - t.y);
            for (let c of clones) {
                const d = Math.hypot(c.x - t.x, c.y - t.y);
                if (d < minDist) { minDist = d; closestClone = c; }
            }
            targetX = closestClone.x;
            targetY = closestClone.y;
        }

        const angle = Math.atan2(targetY - t.y, targetX - t.x);
        t.x += Math.cos(angle) * t.speed;
        t.y += Math.sin(angle) * t.speed;

        if (!player.isStealth && Math.hypot(player.x - t.x, player.y - t.y) < t.radius + player.radius) {
            if (!player.isInvulnerable) {
                player.hp -= t.isBoss ? 1.5 : 0.8;
                if (player.hp <= 0) triggerGameOver();
            }
        }

        if (t.hp <= 0) {
            kills++;
            score += t.isBoss ? 500 : 100;
            trolls.splice(i, 1);
            if (trolls.length === 0) {
                wave++;
                setTimeout(spawnWave, 1000);
            }
        }
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].y -= 0.6;
        floatingTexts[i].life--;
        if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }

    document.getElementById('hpText').textContent = `${Math.max(0, Math.round(player.hp))} / ${player.maxHp}`;
    document.getElementById('hpBar').style.width = `${(player.hp / player.maxHp) * 100}%`;
    document.getElementById('manaText').textContent = `${Math.round(player.mana)} / ${player.maxMana}`;
    document.getElementById('manaBar').style.width = `${(player.mana / player.maxMana) * 100}%`;
    document.getElementById('waveText').textContent = wave;
    document.getElementById('killsText').textContent = kills;
    document.getElementById('scoreText').textContent = score;

    updateSkillBarCooldowns();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState !== 'PLAYING') return;

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    ctx.fillStyle = '#223824';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.fillStyle = '#29452b';
    for (let x = 0; x < WORLD_WIDTH; x += 160) {
        for (let y = 0; y < WORLD_HEIGHT; y += 160) {
            ctx.beginPath();
            ctx.arc(x + 40, y + 40, 60, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    worldObjects.forEach(obj => {
        if (obj.type === 'ruin') {
            ctx.fillStyle = '#3a443e';
            ctx.strokeStyle = '#1e2522';
            ctx.lineWidth = 3;
            ctx.fillRect(obj.x - obj.width / 2, obj.y - obj.height / 2, obj.width, obj.height);
            ctx.strokeRect(obj.x - obj.width / 2, obj.y - obj.height / 2, obj.width, obj.height);
            ctx.fillStyle = '#5c6e62';
            ctx.fillRect(obj.x - 12, obj.y - 12, 24, 24);
        } else if (obj.type === 'rock') {
            ctx.fillStyle = '#4a544e';
            ctx.beginPath();
            ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    });

    earthWalls.forEach(w => {
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(w.angle);
        ctx.fillStyle = '#785438';
        ctx.fillRect(-w.width / 2, -w.height / 2, w.width, w.height);
        ctx.strokeStyle = '#4a321f';
        ctx.strokeRect(-w.width / 2, -w.height / 2, w.width, w.height);
        ctx.restore();
    });

    trolls.forEach(t => {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.fillStyle = t.isBoss ? '#274029' : '#365338';
        ctx.beginPath();
        ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#1b2e1d';
        ctx.stroke();

        ctx.fillStyle = t.stunTimer > 0 ? '#38bdf8' : '#ef4444';
        ctx.beginPath();
        ctx.arc(-6, -4, 4, 0, Math.PI * 2);
        ctx.arc(6, -4, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-22, -t.radius - 12, 44, 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-22, -t.radius - 12, 44 * (t.hp / t.maxHp), 6);
        ctx.restore();
    });

    clones.forEach(c => {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.fillStyle = 'rgba(252, 211, 77, 0.75)';
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    ctx.save();
    ctx.translate(player.x, player.y);
    if (player.isStealth) ctx.globalAlpha = 0.35;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(player.angle);
    ctx.fillStyle = '#1e3a2f';
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0f231b';
    ctx.stroke();

    ctx.fillStyle = '#785438';
    ctx.fillRect(4, -3, 26, 6);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(30, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    worldObjects.forEach(obj => {
        if (obj.type === 'tree') {
            ctx.fillStyle = '#3e2714';
            ctx.beginPath();
            ctx.arc(obj.x, obj.y + 10, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#19331b';
            ctx.beginPath();
            ctx.arc(obj.x, obj.y - 8, obj.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0d1a0e';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    });

    projectiles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = p.isFireball ? '#f97316' : '#38bdf8';
        ctx.shadowColor = p.isFireball ? '#f97316' : '#38bdf8';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    floatingTexts.forEach(ft => {
        ctx.save();
        ctx.font = 'bold 15px Cinzel, serif';
        ctx.fillStyle = ft.color;
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    });

    ctx.restore();
    drawMinimap();
}

function drawMinimap() {
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    const scale = minimapCanvas.width / WORLD_WIDTH;

    minimapCtx.fillStyle = '#0f172a';
    minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    minimapCtx.fillStyle = '#475569';
    minimapCtx.fillRect((WORLD_WIDTH / 2 - 50) * scale, (WORLD_HEIGHT / 2 - 50) * scale, 100 * scale, 100 * scale);

    minimapCtx.fillStyle = '#ef4444';
    trolls.forEach(t => {
        minimapCtx.fillRect(t.x * scale - 1.5, t.y * scale - 1.5, 3, 3);
    });

    minimapCtx.fillStyle = '#38bdf8';
    minimapCtx.beginPath();
    minimapCtx.arc(player.x * scale, player.y * scale, 3, 0, Math.PI * 2);
    minimapCtx.fill();
}

function triggerGameOver() {
    gameState = 'GAMEOVER';
    document.getElementById('hudTop').classList.add('hidden');
    document.getElementById('hudBottom').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('endWave').textContent = wave;
    document.getElementById('endKills').textContent = kills;
    document.getElementById('endScore').textContent = score;
}

document.getElementById('startBtn').onclick = startGame;
document.getElementById('restartBtn').onclick = startGame;

document.getElementById('muteBtn').onclick = () => {
    initAudio();
    isMuted = !isMuted;
    document.getElementById('soundOnIcon').classList.toggle('hidden', isMuted);
    document.getElementById('soundOffIcon').classList.toggle('hidden', !isMuted);
};

document.getElementById('coverUploadInput').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            const bgImg = document.getElementById('customCoverBg');
            bgImg.src = dataUrl;
            bgImg.classList.remove('hidden');
            document.getElementById('defaultCoverArt').classList.add('hidden');

            const thumbImg = document.getElementById('coverThumbImg');
            thumbImg.src = dataUrl;
            thumbImg.classList.remove('hidden');
            document.getElementById('coverThumbSvg').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
};

function mainLoop() {
    update();
    draw();
    requestAnimationFrame(mainLoop);
}
requestAnimationFrame(mainLoop);