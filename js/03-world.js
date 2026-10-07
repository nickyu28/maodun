        // ── 寻宝队 / 惊魂夜的第三人称 ──
        // 这两个模式原来是第一人称，而且整套逻辑（碰撞、开箱、修机、联机同步……）都把 camera.position
        // 当成"人"站的位置。那些一概不动：只在画这一帧的时候把镜头沿视线往身后挪，碰到墙就停在墙前面，
        // 朝向对准"眼睛"视线远处那一点——准星指的还是原来那个地方。画完把镜头原样放回去。
        // 竖着拿平板/手机时画面很窄，65° 的视角下自己的角色占掉大半个屏幕、左右什么都看不到。
        // 竖屏按"横向大约 70°"来算纵向视角（最多 95°），横屏还是原来的 65°。
        function camFovFor(aspect) {
            if (!(aspect < 1)) return 65;
            return Math.min(95, 2 * Math.atan(Math.tan(35 * Math.PI / 180) / aspect) * 180 / Math.PI);
        }
        let tpLastD = 0;
        function tpRender(o) {
            let eye = camera.position.clone();
            let rx = camera.rotation.x, ry = camera.rotation.y, rz = camera.rotation.z;
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir);
            let back = o.back, up = o.up, d = 0;
            for (let st = 1; st <= back; st++) {
                if (o.blocked(eye.x - dir.x * st, eye.z - dir.z * st, eye.y - dir.y * st + up * st / back)) break;
                d = st;
            }
            d = Math.max(0, d - 2);   // 跟墙留点空，不然镜头贴着墙面会穿进墙里
            // 离墙近了立刻收进来（不然会穿墙）；离开墙往外退的时候慢慢退，不会一跳一跳的
            tpLastD = d < tpLastD ? d : tpLastD + (d - tpLastD) * 0.15;
            d = tpLastD;
            let cy = eye.y - dir.y * d + up * d / back;
            if (o.yMin !== undefined) cy = Math.max(o.yMin, Math.min(o.yMax, cy));
            if (o.self) o.self.visible = d > (o.hideBelow || 6);   // 被墙挤到贴着自己后背的时候不画自己，不然满屏都是后背
            camera.position.set(eye.x - dir.x * d, cy, eye.z - dir.z * d);
            camera.lookAt(eye.x + dir.x * 60, eye.y + dir.y * 60, eye.z + dir.z * 60);
            renderer.render(scene, camera);
            camera.position.copy(eye); camera.rotation.set(rx, ry, rz); camera.updateMatrixWorld();
        }
        // 自己的身体摆到"眼睛"下面：朝向跟视线一致，走起来摆腿（raceMakeBody 的腿/胳膊）
        function tpPoseSelf(mesh, footY, faceRotY, dt) {
            let u = mesh.userData;
            let px = camera.position.x, pz = camera.position.z;
            let sp = u.tpLast ? Math.hypot(px - u.tpLast.x, pz - u.tpLast.z) / Math.max(dt, 0.001) : 0;
            u.tpLast = { x: px, z: pz };
            mesh.position.set(px, footY, pz);
            mesh.rotation.y = faceRotY;
            let run = Math.min(1, sp / 30);
            u.tpT = (u.tpT || 0) + dt * (2 + run * 14);
            if (u.legs) { u.legs[0].rotation.x = Math.sin(u.tpT) * 0.9 * run; u.legs[1].rotation.x = -Math.sin(u.tpT) * 0.9 * run; }
            if (u.arms) { u.arms[0].rotation.x = -Math.sin(u.tpT) * 0.7 * run; u.arms[1].rotation.x = Math.sin(u.tpT) * 0.7 * run; }
        }

        // 各模式各有各的「在局内」标志：寻宝队看 isPlaying，惊魂夜看 night，超燃看 blaze……
        // 大厅广场（hub）、松饼大作战（cake）当时加的时候漏加了，导致触屏在这两个模式里转不动视角。
        function touchLookActive() {
            if (gState.backpackOpen || gState.largeMapOpen) return false;
            if (blaze && !blaze.over) return true;
            if (nm && !nm.over) return true;
            if (night && !night.over) return true;
            if (race && !race.over) return true;
            if (jail && !jail.over) return true;
            if (dodge && !dodge.over) return true;
            if (hub) return true;
            if (cake && !cake.over) return true;
            if (escapeRoom && !escapeRoom.over) return true;   // 合作密室之前也漏了，平板上转不了视角
            if (park && !park.over) return true;
            return isPlaying && !gState.isDead;
        }
        // 大厅/局内那些可以点、可以滑的面板：手指按在上面不算摇杆也不算转视角
        function touchOverPanel(el) {
            return !!(el && el.closest && el.closest('input, select, textarea, a, #lobby-bottom, #lobby-tl, #lobby-tr, #mode-detail-panel, #sys-modal, #esc-code-panel, #chat-panel, #shop-modal, #nm-spectate-bar, #race-spectate-bar, #spectate-bar'));
        }
        function touchLookSkip(t) {
            return touchOverPanel(t.target) || t.target.closest('.joystick-zone') || t.target.closest('.action-btn') ||
                t.target.closest('.slot') || t.target.closest('button') ||
                t.target.closest('#blaze-skillbar') || t.target.closest('#blaze-perk') || t.target.closest('#blaze-ffa-cards') || t.target.closest('#blaze-stats') ||
                t.target.id === 'minimap-container' || t.target.id === 'minimap';
        }

        document.addEventListener('touchstart', function (e) {
            if (!touchLookActive()) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                let t = e.changedTouches[i];
                if (touchLookSkip(t)) continue;
                // 移动手指归摇杆管，转视角不能抢；左半屏起手的一律不当作转视角
                if (moveTouch.id === t.identifier) continue;
                if (gState.control === 'pad' && t.clientX < window.innerWidth / 2) continue;
                if (camTouchId === null) { camTouchId = t.identifier; lastCamX = t.clientX; lastCamY = t.clientY; isDraggingCamera = true; }
            }
        }, { passive: false });

        document.addEventListener('touchmove', function (e) {
            if (!isDraggingCamera || !touchLookActive()) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                let t = e.changedTouches[i];
                if (t.identifier === camTouchId) {
                    let dx = t.clientX - lastCamX; let dy = t.clientY - lastCamY;
                    if (camera) { let s = mouseSens(); camera.rotation.y -= dx * 0.01 * s; camera.rotation.x -= dy * 0.01 * s * lookY(); camera.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, camera.rotation.x)); }
                    lastCamX = t.clientX; lastCamY = t.clientY;
                }
            }
        }, { passive: false });

        let mouseLook = false;
        window.addEventListener('mousedown', function (e) {
            if ((!isPlaying && !night) || gState.backpackOpen || gState.largeMapOpen) return;
            if (e.target.closest('button') || e.target.closest('.slot') || e.target.closest('.action-btn') || e.target.closest('#minimap-container')) return;
            if (!document.pointerLockElement) mouseLook = true;
        });
        window.addEventListener('mouseup', function () { mouseLook = false; });

        document.addEventListener('mousedown', function (e) {
            if (chatMode === 0) return;
            let panel = document.getElementById('chat-panel');
            if (panel && !panel.contains(e.target)) chatSetMode(0);
        }, true);
        window.addEventListener('mousemove', function (e) {
            if (!mouseLook || document.pointerLockElement || !camera) return;
            if (gState.backpackOpen || gState.largeMapOpen) return;
            let mx = Math.max(-100, Math.min(100, e.movementX || 0)); let my = Math.max(-100, Math.min(100, e.movementY || 0));
            let s = mouseSens();
            camera.rotation.y -= mx * 0.005 * s; camera.rotation.x -= my * 0.005 * s * lookY();
            camera.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, camera.rotation.x));
        });

        function handleTouchEnd(e) { for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === camTouchId) { camTouchId = null; isDraggingCamera = false; } } }
        document.addEventListener('touchend', handleTouchEnd); document.addEventListener('touchcancel', handleTouchEnd);

        function getHiddenSpawnPos() {
            if (camera) { camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); viewProjMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); viewFrustum.setFromProjectionMatrix(viewProjMatrix); }
            for (let i = 0; i < 100; i++) {
                let fx = 3 + Math.floor(seededRandom() * (mSize - 4)); let fz = 3 + Math.floor(seededRandom() * (mSize - 4)); let fl = Math.floor(seededRandom() * FLOORS);
                if (maze[fl] && maze[fl][fz] && maze[fl][fz][fx] && maze[fl][fz][fx].type === 0) {
                    let pt = new THREE.Vector3(fx * TILE, fl * TILE + 4.5, fz * TILE);
                    if (!camera || (!viewFrustum.containsPoint(pt) && pt.distanceTo(camera.position) > TILE * 3)) return { fx, fz, fl };
                }
            }
            return { fx: mSize - 3, fz: mSize - 3, fl: 0 };
        }

        function ensureScene() {
            if (scene) return;
            scene = new THREE.Scene(); scene.background = new THREE.Color(0xf0f0f5); scene.fog = new THREE.FogExp2(0xf0f0f5, 0.004);
            camera = new THREE.PerspectiveCamera(camFovFor(window.innerWidth / window.innerHeight), window.innerWidth / window.innerHeight, 0.5, 1600); camera.rotation.order = 'YXZ';
            let canvas = document.getElementById('gameCanvas'); renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); renderer.setPixelRatio(SETTINGS.hq ? Math.min(2, window.devicePixelRatio || 1) : 1); renderer.setSize(window.innerWidth, window.innerHeight);
            window.addEventListener('resize', function () { if (camera && renderer) { camera.aspect = window.innerWidth / window.innerHeight; camera.fov = camFovFor(camera.aspect); camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); } });
            clock = new THREE.Clock(); raycaster = new THREE.Raycaster();
            pVel = new THREE.Vector3();
            viewFrustum = new THREE.Frustum(); viewProjMatrix = new THREE.Matrix4();
            const amb = new THREE.AmbientLight(0xffffff, 0.95); scene.add(amb);
            const sunLight = new THREE.DirectionalLight(0xffffff, 0.4); sunLight.position.set(30, 60, 30); scene.add(sunLight); scene.add(camera);

            document.addEventListener('mousemove', function (e) {
                if (document.pointerLockElement && !gState.backpackOpen && !gState.largeMapOpen) {
                    let mx = Math.max(-100, Math.min(100, e.movementX)); let my = Math.max(-100, Math.min(100, e.movementY));
                    let s = mouseSens();
                    camera.rotation.y -= mx * 0.005 * s; camera.rotation.x -= my * 0.005 * s * lookY(); camera.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, camera.rotation.x));
                }
            });

            const mmCanvas = document.getElementById('minimap'); mmCanvas.addEventListener('click', function (e) { e.stopPropagation(); let rect = mmCanvas.getBoundingClientRect(); generateFootprintGuide(Math.floor(((e.clientX - rect.left) / rect.width) * mSize), Math.floor(((e.clientY - rect.top) / rect.height) * mSize)); });
            const lmCanvas = document.getElementById('largemap'); lmCanvas.addEventListener('click', function (e) { let rect = lmCanvas.getBoundingClientRect(); generateFootprintGuide(Math.floor(((e.clientX - rect.left) / rect.width) * mSize), Math.floor(((e.clientY - rect.top) / rect.height) * mSize)); });
        }

        function startGameMap(seed, syncSpawns) {
            stashLootBeforeRun();   // 宝物留在仓库，只带工具进图
            mSize = HUNT_SIZE;
            showModeIntroIfFirstTime('hunt');
            gameSeed = seed || 1; nav('none'); document.getElementById('ui-layer').classList.remove('hidden'); document.getElementById('ui-id').innerText = dispNameText(gState.id);
            gState.selectedSlot = 0; gState.selectedContainer = 'inv';   // 仓库和局内快捷栏共用这两个
            gState.huntRunActive = true; saveProgress();   // H5：没结算就关页面，下次读档按撤离失败算
            isPlaying = true; gState.isDead = false; gState.submittedItems = []; gState.hp = 100; timeSecs = 8 * 3600; gState.totalSubmitted = 0; gState.runCash = 0; gState.aiSubmitted = 0; gState.aiChestsTaken = 0; stamina = 100;
            // abilityCd/abilityActive 之前是全局变量，从来没在开新一局的时候清零过——
            // 上一局技能刚用完、冷却还没走完就退出，下一局技能会一直显示"还在冷却"，
            // 看着就跟坏掉了一样，实际是上一局的残留状态。
            abilityCd = 0; abilityActive = 0; gHpRegenAcc = 0;
            gState.safeOpenedThisGame = false; gState.backpackOpen = false; gState.largeMapOpen = false; gState.monstersSpawned = false; gState.inSafeZone = true; gState.needsLock = false; gState.pAtkCd = 0; gState.timeStop = 0;
            gState.debuff = { type: 0, timer: 0, cooldown: 0 };
            gState.maxHp = 100;
            huntLure = null;
            huntLureFx.forEach(function (f) { scene.remove(f.o); }); huntLureFx = [];
            gState.hasLeft = false; gState.deathPos = null; gState.spectating = null; gState.spectateIdx = -1; gState.peerState = {}; hideDeathUI();
            gState.signal = { active: false, timer: 0, mesh: null }; signalRouteClear();
            for (let wi = 0; wi < MOB_WAVES_AT.length; wi++) gState['wave' + (wi + 1) + 'Spawned'] = false;
            document.getElementById('backpack-overlay-page').classList.add('hidden'); document.getElementById('large-map-panel').classList.add('hidden'); document.getElementById('time-stop-overlay').style.display = 'none'; document.getElementById('debuff-msg').style.display = 'none';
            explored = Array(FLOORS).fill().map(function () { return Array(mSize).fill().map(() => Array(mSize).fill(false)); });

            document.getElementById('submit-progress').innerText = `上交进度: 0 / ${gState.extractTarget}`; document.getElementById('submit-progress').style.color = '#ffeb3b';
            document.getElementById('btn-submit').classList.remove('hidden');
            if (gState.mapDifficulty === 'hard') document.getElementById('btn-lottery').classList.remove('hidden'); else document.getElementById('btn-lottery').classList.add('hidden');
            document.getElementById('btn-extract').classList.add('hidden');

            ensureScene();
            currentNavPath = [];

            buildProceduralMaze(); spawnLobbyAgents();
            // 保底用在"这一局"身上——不管这局最后撤没撤出去，用过就是用过了，不然连
            // 续几局都失败/没撤出去的人会一直卡在保底状态，每局都重复吃保底。放在生
            // 成地图之后清零：这局造图的时候两个标记还是 true，能正常生效。
            // 组队局里保底不生效，标记留到下一次自己打的时候
            if (!huntHasHumanMates()) { gState.isFirstRound = false; gState.pityGuaranteed = false; saveProgress(); }

            if (syncSpawns) gState.preGenSpawns = syncSpawns;

            if (gState.control === 'laptop') { document.body.onclick = function (e) { if (isPlaying && !gState.backpackOpen && !gState.largeMapOpen && !e.target.closest('.action-btn') && !e.target.closest('button')) { safeLockPointer(); gState.needsLock = false; } }; }
            updateHUD(); bgmStart(); animate();
            // 第一次进寻宝队才弹——新手不知道"捡了东西不代表到手"，得回安全区上交、撤离出去、回仓库卖掉才有钱，
            // 死了/没上交就白捡了，这个规则不解释一下容易被当成 bug。
            if (!gState.huntTutorialShown) {
                gState.huntTutorialShown = true; saveProgress();
                setTimeout(function () {
                    showSysModal('新手提示', '捡到的东西拿回出生点，站在安全区里按「上交」。撤离出去以后东西进仓库，卖掉才有钱。没撤出去，东西全没。', [{ label: '知道了' }]);
                }, 400);
            }
        }

        // 各模式退出时该拿掉的场景残留统一走这——之前 cakeExit() 只删了角色/增益/特效，
        // 松饼地图自己搭的建筑（塞进 maze 网格里）跟跳台完全没清，回大厅之后这些楼房/台子
        // 一直杵在场景里没人管，谁都看得见（大厅明明没有 maze，看到的却是上一局松饼的楼）。
        // 不进 maze 网格的地图装饰（火拼图的楼梯标记/传送门/竖井光柱这类）：搭图时往这里一塞，
        // 退出和下一局开图时跟 maze 一起拿掉，之前没人管，每打一局就在场景里多留二十几个。
        let mapExtraMeshes = [];
        function mapExtraAdd(m) { scene.add(m); mapExtraMeshes.push(m); return m; }
        function clearMazeMeshes() {
            mapExtraMeshes.forEach(function (m) { scene.remove(m); }); mapExtraMeshes = [];
            // 寻宝图的墙/地板在开局后会合并成几块大网格（huntMergeStatic），原来的格子早就
            // 从场景里拿掉了，只清 maze 清不到它们——寻宝撤离/离开回大厅，整张迷宫还罩在
            // 大厅广场上，镜头直接卡在安全区的墙里，满屏一片青色。
            huntDropMerged();
            maze.forEach(function (fRows) { if (fRows) fRows.forEach(function (row) { if (row) row.forEach(function (m) { if (m) ['mesh', 'roof', 'roof2', 'roof3', 'roof4', 'roof5', 'roof6'].forEach(function (k) { if (m[k]) scene.remove(m[k]); }); }); }); });
            chests.forEach(function (c) { scene.remove(c); }); groundItems.forEach(function (g) { scene.remove(g); }); entities.forEach(function (e) { scene.remove(e); });
            cakePlatformMeshes.forEach(function (m) { scene.remove(m); }); cakePlatformMeshes = []; cakePlatforms = [];
            // 惊魂夜的椅子/机子/门/板子——之前只在"开新的一局"时清（buildNightMap/buildProceduralMaze
            // 开头那份一样的逻辑），退出到大厅这条路完全没走到，椅子会一直杵在场景里。
            [gState.machines, gState.chairs, gState.doors, gState.pallets].forEach(function (list) {
                (list || []).forEach(function (o) { if (o.mesh) scene.remove(o.mesh); if (o.lintel) scene.remove(o.lintel); });
            });
            gState.machines = []; gState.chairs = []; gState.doors = []; gState.pallets = [];
            chests = []; groundItems = []; entities = []; maze = []; walkableMeshes = [];
        }
        // H15：造完图验证从出生点能走到每个箱子、每层都有能走到的空格；不过就按固定规则换种子重造
        // （新种子只由原种子和第几次决定，各端一样）。只有坏图才会重造，好图跟以前一模一样。
        const HUNT_REBUILD_MAX = 20;
        function buildProceduralMaze() {
            let seed0 = gameSeed;
            for (let attempt = 0; ; attempt++) {
                huntBuildMazeOnce();
                if (huntMapReachable() || attempt >= HUNT_REBUILD_MAX) break;
                // 合并之前台阶、桌子这些小 mesh 还在场景里，清图清不到，先拿掉
                walkableMeshes.forEach(function (m) { scene.remove(m); });
                gameSeed = (seed0 + 7919 * (attempt + 1)) % 233280 || 1;
            }
            huntAssignLoot(chests, seededRandom, Math.max(1, (gState.team || []).length));
            gState.signalN = 0;
            huntMergeStatic();
            huntTaskNew();
            camera.position.set(TILE, 9, TILE); camera.rotation.set(0, 0, 0);
            // 出生点在角落的安全屋里，原来一律面朝 -Z——那边正好是地图边墙，开局第一眼
            // 就是贴脸一整面青色的墙，得自己转一圈才找得到路。四个方向各打一条射线，
            // 朝最空旷的那边站。
            let best = 0, bestD = -1, rc = new THREE.Raycaster();
            [0, -Math.PI / 2, Math.PI, Math.PI / 2].forEach(function (yaw) {
                let dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
                rc.set(camera.position, dir);
                let hit = rc.intersectObjects(huntMerged, false)[0];
                let d = hit ? hit.distance : Infinity;
                if (d > bestD + 0.01) { bestD = d; best = yaw; }
            });
            camera.rotation.set(0, best, 0);
        }
        // 从出生点按真实走法（huntRouteNbrs，跟信号接收器的路线一样）能走到的格子
        function huntReachFrom(from) {
            let key = function (n) { return (n.f * 64 + n.z) * 64 + n.x; }, seen = {}, q = [from];
            seen[key(from)] = true;
            for (let h = 0; h < q.length; h++) huntRouteNbrs(q[h]).forEach(function (m) { let k = key(m); if (!seen[k]) { seen[k] = true; q.push(m); } });
            return { has: function (f, x, z) { return !!seen[key({ f: f, x: x, z: z })]; }, list: q };
        }
        function huntMapReachable() {
            let r = huntReachFrom({ f: 0, x: 1, z: 1 });
            for (let f = 0; f < FLOORS; f++) if (!r.list.some(function (n) { return n.f === f && huntCellKind(n.f, n.x, n.z) === 'floor'; })) return false;
            return chests.every(function (c) {
                let p = c.position, to = { f: Math.floor((p.y - 0.5) / TILE), x: Math.floor((p.x + TILE / 2) / TILE), z: Math.floor((p.z + TILE / 2) / TILE) };
                return !!huntRouteFind({ f: 0, x: 1, z: 1 }, to);
            });
        }
        function huntBuildMazeOnce() {
            mSize = HUNT_SIZE;
            clearFootprints3D();
            huntDropMerged();
            // 从躲猫猫/火拼图/松饼切过来时，上一张图的屋顶(roof…roof6)、松饼的楼房/跳台
            // 也得一起拿掉，不然留在场景里白白多画几百个 mesh。
            clearMazeMeshes();

            const wallTex = createProceduralTexture('wall', '#e5e5ea', '#cccccc'); const floorTex = createProceduralTexture('floor', '#ffffff', '#e5e5ea');
            const safeFloorTex = createProceduralTexture('safe_floor', '#a8e6cf', '#dcedc1'); const safeWallTex = createProceduralTexture('safe_wall', '#1abc9c', '#16a085');
            const tableTex = createProceduralTexture('table', '#7f8c8d', '#95a5a6'); const goldShopWallTex = createProceduralTexture('gold_shop_wall', '#ffd700', '#daa520'); const goldShopFloorTex = createProceduralTexture('gold_shop_floor', '#ffd700', '#b8860b');

            let conf = mapConfigs[gState.mapDifficulty];
            let allLeaves = []; let goldShopLoc = { x: -1, z: -1 };

            for (let fl = 0; fl < FLOORS; fl++) {
                let grid = Array(mSize).fill().map(function () { return Array(mSize).fill(1); }); let stack = [{ x: 1, z: 1 }], leaves = []; grid[1][1] = 0;
                while (stack.length > 0) {
                    let curr = stack[stack.length - 1];
                    let dirs = [{ dx: 0, dz: -2 }, { dx: 0, dz: 2 }, { dx: -2, dz: 0 }, { dx: 2, dz: 0 }];
                    for (let i = dirs.length - 1; i > 0; i--) { let j = Math.floor(seededRandom() * (i + 1)); let temp = dirs[i]; dirs[i] = dirs[j]; dirs[j] = temp; }
                    let moved = false;
                    for (let d of dirs) { let nx = curr.x + d.dx, nz = curr.z + d.dz; if (nx > 0 && nx < mSize - 1 && nz > 0 && nz < mSize - 1 && grid[nz][nx] === 1) { grid[curr.z + d.dz / 2][curr.x + d.dx / 2] = 0; grid[nz][nx] = 0; stack.push({ x: nx, z: nz }); moved = true; break; } }
                    if (!moved) { let popped = stack.pop(); let paths = 0;[{ dx: 0, dz: -1 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }, { dx: 1, dz: 0 }].forEach(function (d) { if (grid[popped.z + d.dz][popped.x + d.dx] === 0) paths++; }); if (paths === 1) { leaves.push(popped); allLeaves.push({ f: fl, x: popped.x, z: popped.z }); } }
                }

                if (fl === 0 && conf.hasGoldShop && leaves.length > 1) { goldShopLoc = leaves[1]; }

                maze[fl] = Array(mSize).fill().map(function () { return Array(mSize).fill(null); });

                for (let z = 0; z < mSize; z++) {
                    for (let x = 0; x < mSize; x++) {
                        let px = x * TILE, py = fl * TILE, pz = z * TILE;
                        let isGoldShopCell = (fl === 0 && x === goldShopLoc.x && z === goldShopLoc.z);
                        let isAdjacentToGoldShop = (fl === 0 && conf.hasGoldShop && goldShopLoc.x !== -1 && Math.abs(x - goldShopLoc.x) <= 1 && Math.abs(z - goldShopLoc.z) <= 1);
                        let isHomeCell = (fl === 0 && x === 1 && z === 1);
                        let isHomeWall = (fl === 0 && x <= 2 && z <= 2 && grid[z][x] === 1);

                        if (grid[z][x] === 1) {
                            let tex = isAdjacentToGoldShop ? goldShopWallTex : (isHomeWall ? safeWallTex : wallTex);
                            let m = new THREE.Mesh(new THREE.BoxGeometry(TILE, 24, TILE), new THREE.MeshLambertMaterial({ map: tex })); m.position.set(px, py + TILE / 2, pz); scene.add(m); maze[fl][z][x] = { type: 1, mesh: m };
                        } else {
                            let tex = isGoldShopCell ? goldShopFloorTex : (isHomeCell ? safeFloorTex : floorTex);

                            let f;
                            if (fl === 0) {
                                f = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE), new THREE.MeshLambertMaterial({ map: tex }));
                                f.rotation.x = -Math.PI / 2; f.position.set(px, py, pz);
                            } else {
                                f = new THREE.Mesh(new THREE.BoxGeometry(TILE, FLOOR_SLAB, TILE), new THREE.MeshLambertMaterial({ map: tex }));
                                f.position.set(px, py - FLOOR_SLAB / 2, pz);
                            }
                            scene.add(f); maze[fl][z][x] = { type: 0, mesh: f, isLeaf: false, isGoldShop: isGoldShopCell }; walkableMeshes.push(f);

                            if (conf.hasTables && seededRandom() < 0.08 && !isGoldShopCell && !isHomeCell) {

                                let tableM = new THREE.Mesh(new THREE.BoxGeometry(TILE, 8, TILE), new THREE.MeshLambertMaterial({ map: tableTex }));
                                tableM.position.set(px, py + 4, pz); scene.add(tableM); walkableMeshes.push(tableM);
                                maze[fl][z][x].type = 2; maze[fl][z][x].table = tableM;
                            }
                        }
                    }
                }
            }

            const STAIRS_PER_FLOOR = 2, STAIR_STEPS = 8, STAIR_DEPTH = 2, STAIR_RISE = TILE / STAIR_STEPS;
            let stairOpen = function (fl, st) {
                for (let d of [{ dx: 0, dz: -1 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }, { dx: 1, dz: 0 }]) {
                    let nz = st.z + d.dz, nx = st.x + d.dx;
                    if (maze[fl][nz] && maze[fl][nz][nx] && maze[fl][nz][nx].type === 0) return d;
                }
                return null;
            };
            let dropTable = function (c) {   // H15：放宽条件时把桌子改回地板
                if (!c || c.type !== 2) return;
                if (c.table) { scene.remove(c.table); let wi = walkableMeshes.indexOf(c.table); if (wi > -1) walkableMeshes.splice(wi, 1); c.table = null; }
                c.type = 0;
            };
            for (let fl = 0; fl < FLOORS - 1; fl++) {
                let cand = allLeaves.filter(function (l) {
                    return l.f === fl && maze[fl][l.z][l.x].type === 0 && maze[fl + 1][l.z][l.x].type === 0 && !(fl === 0 && l.x <= 2 && l.z <= 2);
                });
                let placed = 0;
                for (let s = 0, fb = false; (s < STAIRS_PER_FLOOR && cand.length > 0) || (placed === 0 && !fb); s++) {
                    let st;
                    if (cand.length > 0 && s < STAIRS_PER_FLOOR) st = cand.splice(Math.floor(seededRandom() * cand.length), 1)[0];
                    else {
                        // H15：死胡同里一座都没放上。按固定顺序扫全层：先找上下都是空地、下层有口的格子；
                        // 还没有就允许上下是桌子（把桌子拿掉）。离出生点那 3×3 和金店那一格不放。
                        let pick = function (allowTable) {
                            let list = [];
                            for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) {
                                if (fl === 0 && ((x <= 2 && z <= 2) || (x === goldShopLoc.x && z === goldShopLoc.z))) continue;
                                let lo = maze[fl][z][x], up = maze[fl + 1][z][x], ok = function (c) { return c.type === 0 || (allowTable && c.type === 2); };
                                if (ok(lo) && ok(up) && stairOpen(fl, { x: x, z: z })) list.push({ x: x, z: z });
                            }
                            return list;
                        };
                        let list = pick(false); if (!list.length) list = pick(true);
                        if (!list.length) break;
                        st = list[Math.floor(seededRandom() * list.length)];
                        dropTable(maze[fl][st.z][st.x]); dropTable(maze[fl + 1][st.z][st.x]);
                        fb = true;   // 补一座就够了
                    }
                    if (maze[fl][st.z][st.x].type !== 0 || maze[fl + 1][st.z][st.x].type !== 0) continue;

                    let open = stairOpen(fl, st);
                    if (!open) continue;
                    placed++;

                    let ax = -open.dx, az = -open.dz;
                    let axis = az !== 0 ? 'z' : 'x', sign = az !== 0 ? az : ax;
                    let center = axis === 'z' ? st.z * TILE : st.x * TILE;
                    let meta = { base: fl, axis: axis, sign: sign, edge: center - sign * TILE / 2, depth: STAIR_DEPTH, rise: STAIR_RISE, count: STAIR_STEPS };
                    maze[fl][st.z][st.x].type = 3; maze[fl][st.z][st.x].stair = meta;
                    maze[fl + 1][st.z][st.x].type = 3; maze[fl + 1][st.z][st.x].stair = meta;

                    for (let i = 0; i < STAIR_STEPS; i++) {
                        let h = STAIR_RISE * (i + 1);
                        let geo = axis === 'z' ? new THREE.BoxGeometry(TILE, h, STAIR_DEPTH) : new THREE.BoxGeometry(STAIR_DEPTH, h, TILE);
                        let step = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tableTex }));
                        let along = -TILE / 2 + i * STAIR_DEPTH + STAIR_DEPTH / 2;
                        step.position.set(st.x * TILE + ax * along, fl * TILE + h / 2, st.z * TILE + az * along);
                        scene.add(step); walkableMeshes.push(step);
                    }

                    let upper = maze[fl + 1][st.z][st.x];
                    if (upper.mesh) {
                        let flatDepth = TILE - STAIR_STEPS * STAIR_DEPTH;
                        let flatOffset = TILE / 2 - flatDepth / 2;
                        scene.remove(upper.mesh);
                        let wi = walkableMeshes.indexOf(upper.mesh); if (wi > -1) walkableMeshes.splice(wi, 1);
                        let fGeo = axis === 'z' ? new THREE.BoxGeometry(TILE, FLOOR_SLAB, flatDepth) : new THREE.BoxGeometry(flatDepth, FLOOR_SLAB, TILE);
                        let fMesh = new THREE.Mesh(fGeo, new THREE.MeshLambertMaterial({ map: floorTex }));
                        fMesh.position.set(st.x * TILE + ax * flatOffset, (fl + 1) * TILE - FLOOR_SLAB / 2, st.z * TILE + az * flatOffset);
                        scene.add(fMesh); walkableMeshes.push(fMesh); upper.mesh = fMesh;
                    }
                }
            }

            let openNbrs = function (fl, x, z) {
                let n = 0;
                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { let c = maze[fl][z + d[1]] && maze[fl][z + d[1]][x + d[0]]; if (c && c.type !== 1) n++; });
                return n;
            };
            let pathOnFloor = function (fl, from, to) {
                let prev = Array(mSize).fill().map(function () { return Array(mSize).fill(null); });
                let seen = Array(mSize).fill().map(function () { return Array(mSize).fill(false); });
                let q = [from]; seen[from.z][from.x] = true;
                while (q.length) {
                    let c = q.shift();
                    if (c.x === to.x && c.z === to.z) { let p = [], cur = c; while (cur) { p.unshift(cur); cur = prev[cur.z][cur.x]; } return p; }
                    for (let d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        let nx = c.x + d[0], nz = c.z + d[1];
                        if (nx < 1 || nx >= mSize - 1 || nz < 1 || nz >= mSize - 1) continue;
                        if (!maze[fl][nz][nx] || maze[fl][nz][nx].type === 1 || seen[nz][nx]) continue;
                        seen[nz][nx] = true; prev[nz][nx] = c; q.push({ x: nx, z: nz });
                    }
                }
                return null;
            };
            let countOpen = function (skip) {
                let n = 0;
                for (let f = 0; f < FLOORS; f++) for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) {
                    if (skip && skip.fl === f && skip.x === x && skip.z === z) continue;
                    if (maze[f][z][x] && maze[f][z][x].type !== 1) n++;
                }
                return n;
            };
            let reachableCount = function (skip) {
                let seen = [];
                for (let f = 0; f < FLOORS; f++) seen[f] = Array(mSize).fill().map(function () { return Array(mSize).fill(false); });
                let ok = function (f, x, z) {
                    if (x < 0 || x >= mSize || z < 0 || z >= mSize) return false;
                    if (skip && skip.fl === f && skip.x === x && skip.z === z) return false;
                    let c = maze[f][z][x]; return c && c.type !== 1;
                };
                let q = [{ f: 0, x: 1, z: 1 }]; seen[0][1][1] = true; let n = 1;
                while (q.length) {
                    let c = q.shift();
                    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
                        let nx = c.x + d[0], nz = c.z + d[1];
                        if (ok(c.f, nx, nz) && !seen[c.f][nz][nx]) { seen[c.f][nz][nx] = true; n++; q.push({ f: c.f, x: nx, z: nz }); }
                    });
                    let here = maze[c.f][c.z][c.x];
                    if (here.type === 3 && here.stair) {
                        [c.f - 1, c.f + 1].forEach(function (nf) {
                            if (nf < 0 || nf >= FLOORS) return;
                            let o = maze[nf][c.z][c.x];
                            if (o && o.type === 3 && o.stair === here.stair && !seen[nf][c.z][c.x]) { seen[nf][c.z][c.x] = true; n++; q.push({ f: nf, x: c.x, z: c.z }); }
                        });
                    }
                }
                return n;
            };

            for (let fl = 0; fl < FLOORS; fl++) {
                let stairCells = [];
                for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) if (maze[fl][z][x].type === 3) stairCells.push({ x: x, z: z });
                for (let i = stairCells.length - 1; i > 0; i--) { let j = Math.floor(seededRandom() * (i + 1)); let t = stairCells[i]; stairCells[i] = stairCells[j]; stairCells[j] = t; }

                let floorOpen = 0;
                for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) if (maze[fl][z][x] && maze[fl][z][x].type !== 1) floorOpen++;
                let minPocket = 8, maxPocket = Math.floor(floorOpen * 0.35);

                let regionSize = function (from, skip) {
                    let seen = Array(mSize).fill().map(function () { return Array(mSize).fill(false); });
                    let q = [from]; seen[from.z][from.x] = true; let n = 1;
                    while (q.length) {
                        let c = q.shift();
                        for (let d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                            let nx = c.x + d[0], nz = c.z + d[1];
                            if (nx < 0 || nx >= mSize || nz < 0 || nz >= mSize) continue;
                            if (skip.x === nx && skip.z === nz) continue;
                            let m = maze[fl][nz][nx];
                            if (m && m.type !== 1 && !seen[nz][nx]) { seen[nz][nx] = true; n++; q.push({ x: nx, z: nz }); }
                        }
                    }
                    return n;
                };

                let best = null;
                for (let s of stairCells) {
                    if (best) break;
                    let p = pathOnFloor(fl, { x: 1, z: 1 }, s);
                    if (!p || p.length < 5) continue;
                    for (let i = p.length - 2; i >= 2; i--) {
                        let c = p[i];
                        if (maze[fl][c.z][c.x].type !== 0) continue;
                        if (fl === 0 && c.x <= 2 && c.z <= 2) continue;
                        if (openNbrs(fl, c.x, c.z) !== 2) continue;
                        let skip = { fl: fl, x: c.x, z: c.z };
                        let size = regionSize(s, skip);
                        if (size < minPocket || size > maxPocket) continue;
                        if (reachableCount(skip) !== countOpen(skip)) continue;
                        best = c; break;
                    }
                }
                if (best) {
                    let cell = maze[fl][best.z][best.x];
                    if (cell.mesh) { scene.remove(cell.mesh); let wi = walkableMeshes.indexOf(cell.mesh); if (wi > -1) walkableMeshes.splice(wi, 1); }
                    let wm = new THREE.Mesh(new THREE.BoxGeometry(TILE, 24, TILE), new THREE.MeshLambertMaterial({ map: wallTex }));
                    wm.position.set(best.x * TILE, fl * TILE + TILE / 2, best.z * TILE);
                    scene.add(wm); maze[fl][best.z][best.x] = { type: 1, mesh: wm };
                }
            }

            const woodChestTex = createProceduralTexture('wood_chest', '#8a5a36', '#5c3a21'); const silverChestTex = createProceduralTexture('silver_chest', '#bdc3c7', '#ffffff'); const goldChestTex = createProceduralTexture('gold_chest', '#ffd700', '#b8860b'); const safeTex = createProceduralTexture('safe_box', '#55555a', '#333335');

            allLeaves.forEach(function (l) { if (maze[l.f] && maze[l.f][l.z] && maze[l.f][l.z][l.x]) maze[l.f][l.z][l.x].isLeaf = true; });

            let validLeaves = allLeaves.filter(l => !(l.f === 0 && l.x <= 2 && l.z <= 2) && maze[l.f][l.z][l.x].type === 0 && !(l.f === 0 && l.x === goldShopLoc.x && l.z === goldShopLoc.z));
            for (let i = validLeaves.length - 1; i > 0; i--) { let j = Math.floor(seededRandom() * (i + 1)); let temp = validLeaves[i]; validLeaves[i] = validLeaves[j]; validLeaves[j] = temp; }

            // H12：保底局（新号第一局 / 连续没出货）。简单图不出保险柜，改成多 1 个金箱子、大金概率翻倍；
            // 中等、困难图还是必出保险柜。只在没有真人队友的局里生效（标记是各人自己的，
            // 组队时每人的地图要一模一样，不能因为谁带着保底就多一个箱子）。
            let pity = huntPityActive();
            huntPityMul = (pity && gState.mapDifficulty === 'easy') ? 2 : 1;
            let cTypes = [];
            if (pity && gState.mapDifficulty === 'easy') cTypes.push('gold');
            for (let i = 0; i < conf.gold; i++) cTypes.push('gold'); for (let i = 0; i < conf.silver; i++) cTypes.push('silver'); for (let i = 0; i < conf.wood; i++) cTypes.push('wood');

            for (let i = cTypes.length - 1; i > 0; i--) { let j = Math.floor(seededRandom() * (i + 1)); let t = cTypes[i]; cTypes[i] = cTypes[j]; cTypes[j] = t; }

            let leavesByFloor = [], placedByFloor = [];
            for (let f = 0; f < FLOORS; f++) { leavesByFloor[f] = validLeaves.filter(function (l) { return l.f === f; }); placedByFloor[f] = []; }
            let floorCursor = 0;
            let takeSpreadLeaf = function () {
                for (let tries = 0; tries < FLOORS; tries++) {
                    let f = floorCursor % FLOORS; floorCursor++;
                    let pool = leavesByFloor[f]; if (pool.length === 0) continue;
                    let placed = placedByFloor[f], pickIdx = 0;
                    if (placed.length > 0) {
                        let best = -1;
                        for (let i = 0; i < pool.length; i++) {
                            let minD = Infinity;
                            for (let p of placed) { let d = Math.abs(pool[i].x - p.x) + Math.abs(pool[i].z - p.z); if (d < minD) minD = d; }
                            if (minD > best) { best = minD; pickIdx = i; }
                        }
                    }
                    let picked = pool.splice(pickIdx, 1)[0]; placed.push(picked); return picked;
                }
                return null;
            };

            cTypes.forEach(function (ctype) {
                let l = takeSpreadLeaf(); if (!l) return;
                let texObj = (ctype === 'gold') ? goldChestTex : ((ctype === 'silver') ? silverChestTex : woodChestTex);
                let c = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), new THREE.MeshLambertMaterial({ map: texObj })); c.position.set(l.x * TILE, l.f * TILE + 2, l.z * TILE); c.userData = { isChest: true, type: ctype, opened: false }; scene.add(c); chests.push(c);
            });

            if (conf.hasGoldShop && goldShopLoc.x !== -1) {
                let c = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), new THREE.MeshLambertMaterial({ map: goldChestTex })); c.position.set(goldShopLoc.x * TILE - 8, 2, goldShopLoc.z * TILE + 8); c.userData = { isChest: true, type: 'gold', opened: false }; scene.add(c); chests.push(c);
            }

            // 简单图永远不出保险柜——这是作者的决定（10-05，记在 TASKS.md「作者的决定」），不要改回去。
            // 简单图的保底换成上面那个多出来的金箱子 + 大金概率翻倍。中等、困难图保底局必出保险柜。
            let safePity = pity && gState.mapDifficulty !== 'easy';
            if (gState.mapDifficulty !== 'easy' && (conf.hasSafe || safePity)) {
                let prob = safePity ? 1.0 : 0.1;
                let roll = seededRandom();
                let l = roll < prob ? takeSpreadLeaf() : null;
                if (l) {
                    let safeBox = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshLambertMaterial({ map: safeTex })); safeBox.position.set(l.x * TILE, l.f * TILE + 5, l.z * TILE); safeBox.userData = { isChest: true, type: 'safe', opened: false, hidden: true }; scene.add(safeBox); chests.push(safeBox);
                }
            }

        }

        // 反馈「游戏有点卡」：寻宝图每一格墙/地板/台阶都是单独一个 mesh + 单独一个材质，
        // 三层加起来一千四百多个，一帧平均四百次、最多一千一百次 draw call，低配机器直接掉帧。
        // 地图建好以后就不会再变，所以按贴图把它们合成几块大 mesh 来画。
        // 原来那些小 mesh 从场景里拿掉，但对象留着：walkableMeshes 往下打射线还用它们，
        // 各处清图的代码 scene.remove 它们也照样不出错。
        let huntMerged = [];
        function huntDropMerged() {
            huntMerged.forEach(function (m) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
            huntMerged = [];
        }
        function huntMergeStatic() {
            huntDropMerged();
            let set = new Set(walkableMeshes);
            maze.forEach(function (rows) { rows.forEach(function (row) { row.forEach(function (c) { if (c && c.mesh) set.add(c.mesh); }); }); });
            let byTex = new Map();
            set.forEach(function (m) {
                if (!m.parent || !m.material || !m.material.map) return;
                m.updateMatrixWorld(true);
                let g = m.geometry.clone();
                g.applyMatrix4(m.matrixWorld);
                let k = m.material.map;
                if (!byTex.has(k)) byTex.set(k, []);
                byTex.get(k).push(g);
                scene.remove(m);
            });
            byTex.forEach(function (geos, tex) {
                let nv = 0, ni = 0;
                geos.forEach(function (g) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
                let pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
                let vo = 0, io = 0;
                geos.forEach(function (g) {
                    let n = g.attributes.position.count;
                    pos.set(g.attributes.position.array, vo * 3);
                    nor.set(g.attributes.normal.array, vo * 3);
                    uv.set(g.attributes.uv.array, vo * 2);
                    if (g.index) { let a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
                    else { for (let i = 0; i < n; i++) idx[io++] = vo + i; }
                    vo += n; g.dispose();
                });
                let geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
                geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
                geo.setIndex(new THREE.BufferAttribute(idx, 1));
                geo.computeBoundingSphere();
                let mm = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
                scene.add(mm); huntMerged.push(mm);
            });
        }

        // 惊魂夜的 AI 强度：反应快慢、追捕视野、队友修机效率，三样跟着隐藏分走。
        // 你打得越好，追捕看得越远反应越快，AI 队友也修得越快。
        function nightSkillK() {
            let sk = (night && night.aiSkill !== undefined) ? night.aiSkill : aiSkillBase('night');
            return {
                react: 1.6 - sk * 1.0,     // 1.6 倍慢 -> 0.6 倍快
                sight: 0.7 + sk * 0.6,     // 视野 0.7 -> 1.3
                repair: 0.7 + sk * 0.6     // 队友修机 0.7 -> 1.3
            };
        }

        const NIGHT = {
            surv: 36, hunter: 41.4, crawl: 18, hunterSpdMul: 1.15,
            aiReact: 0.55, hunterSight: 260, hunterFov: Math.cos(Math.PI * 0.42), hunterMemory: 6, hunterSwitchT: 14,
            aiTurnRate: 4.2,
            aiFleeHold: 1.2,

            gamePerReal: 1 / 0.7,
            chairStage: 30,
            hitBoost: 1.5, hitBoostTime: 1,
            hitRecover: 2, whiffRecover: 1,
            atkRange: 16, spearRange: 80, spearSpeed: 72, spearCd: 20,
            machines: 7, needed: 5, doors: 2, chairs: 7,
            baseRateEarly: 0.5, baseRateLate: 0.75, rateBoostAt: 11 * 60,
            firstCalibDelay: 7,
            aiRepairFactor: 0.8,
            doorOpenTime: 20, escapeTime: 0,
            chairElim: 60, rescueTime: 1, pickupTime: 15, selfHealTime: 20, selfHealCap: 0.9, bleedOut: 180,
            struggleNeed: 30, struggleGap: 0.6,
            calibInterval: 10, calibSweep: 2.0, calibStun: 2.0, calibBuffAt: 240, calibMiss: -5,
            palletStun: 3, palletBreak: 2.5, palletVault: 1.1, palletHitRange: 4,
            palletBreakRange: 22,
            palletVaultLift: 11,
            limit: 15 * 60, winEscapes: 3
        };
        const NIGHT_MACHINES = NIGHT.machines, NIGHT_MACHINES_NEEDED = NIGHT.needed;

        function pickSpread(pool, placed) {
            if (pool.length === 0) return null;
            let pick = 0;
            if (placed.length > 0) {
                let best = -1;
                for (let i = 0; i < pool.length; i++) {
                    let minD = Infinity;
                    for (let p of placed) { let d = Math.abs(pool[i].x - p.x) + Math.abs(pool[i].z - p.z); if (d < minD) minD = d; }
                    if (minD > best) { best = minD; pick = i; }
                }
            }
            let cell = pool.splice(pick, 1)[0]; placed.push(cell); return cell;
        }

        function buildNightMap() {
            mSize = NIGHT_SIZE;
            clearFootprints3D();
            huntDropMerged();
            clearMazeMeshes();
            if (night) {
                (night.survivors || []).forEach(function (a) { if (a.mesh) scene.remove(a.mesh); });
                if (night.hunter && night.hunter.mesh) scene.remove(night.hunter.mesh);
            }

            const wallTex = createProceduralTexture('wall', '#e5e5ea', '#cccccc');
            const floorTex = createProceduralTexture('floor', '#ffffff', '#e5e5ea');
            const tableTex = createProceduralTexture('table', '#7f8c8d', '#95a5a6');

            gameSeed = NIGHT_SKELETON_SEED;

            let grid = Array(mSize).fill().map(function () { return Array(mSize).fill(0); });
            for (let i = 0; i < mSize; i++) { grid[0][i] = 1; grid[mSize - 1][i] = 1; grid[i][0] = 1; grid[i][mSize - 1] = 1; }

            const BLD_H = DECK_H * 2;
            let deck = { cells: {}, stairs: {}, covered: {}, y: DECK_H };
            let roofed = {}, gates = [], blds = [], deckGate = null, deckSpare = null, bldHalves = [];
            let deckWin = null;

            let bldEdge = function (x, z) {
                return blds.some(function (b) {
                    let onRect = x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.h;
                    let inner = x > b.x && x < b.x + b.w - 1 && z > b.z && z < b.z + b.h - 1;
                    return onRect && !inner;
                });
            };
            let inMap = function (x, z) { return x >= 1 && x < mSize - 1 && z >= 1 && z < mSize - 1; };
            let areaClear = function (x0, z0, w, h) {
                for (let z = z0 - 1; z <= z0 + h; z++) for (let x = x0 - 1; x <= x0 + w; x++) {
                    if (!inMap(x, z)) return false;
                    if (grid[z][x] !== 0) return false;
                }
                return true;
            };
            for (let n = 0, tries = 0; n < 1 && tries < 1500; tries++) {
                let bw = 9 + Math.floor(seededRandom() * 3), bh = 8 + Math.floor(seededRandom() * 3);
                let bx = 2 + Math.floor(seededRandom() * (mSize - 4 - bw)), bz = 2 + Math.floor(seededRandom() * (mSize - 4 - bh));
                if (!areaClear(bx, bz, bw, bh)) continue;

                for (let z = bz; z < bz + bh; z++) for (let x = bx; x < bx + bw; x++) {
                    if (x === bx || x === bx + bw - 1 || z === bz || z === bz + bh - 1) grid[z][x] = 1;
                }

                let px0, hole, doors, pz1 = 0;
                if (bw >= bh) {

                    px0 = bx + 2 + Math.floor(seededRandom() * Math.max(1, bw - 4));
                    hole = bz + 1 + Math.floor(seededRandom() * (bh - 2));
                    for (let z = bz + 1; z < bz + bh - 1; z++) if (z !== hole) grid[z][px0] = 1;
                    gates.push({ x: px0, z: hole, axis: 'x', indoor: true });
                    deckGate = { x: px0, z: hole, axis: 'x' };

                    let leftX = bx + 1 + Math.floor(seededRandom() * Math.max(1, px0 - bx - 1));
                    let rightX = px0 + 1 + Math.floor(seededRandom() * Math.max(1, bx + bw - 2 - px0));
                    doors = [{ x: leftX, z: bz, axis: 'z' }, { x: rightX, z: bz + bh - 1, axis: 'z' }];
                } else {

                    let pz0 = bz + 2 + Math.floor(seededRandom() * Math.max(1, bh - 4)); pz1 = pz0;
                    hole = bx + 1 + Math.floor(seededRandom() * (bw - 2));
                    for (let x = bx + 1; x < bx + bw - 1; x++) if (x !== hole) grid[pz0][x] = 1;
                    gates.push({ x: hole, z: pz0, axis: 'z', indoor: true });
                    deckGate = { x: hole, z: pz0, axis: 'z' };
                    px0 = bx + Math.floor(bw / 2);
                    let topZ = bz + 1 + Math.floor(seededRandom() * Math.max(1, pz0 - bz - 1));
                    let botZ = pz0 + 1 + Math.floor(seededRandom() * Math.max(1, bz + bh - 2 - pz0));
                    doors = [{ x: bx, z: topZ, axis: 'x' }, { x: bx + bw - 1, z: botZ, axis: 'x' }];
                }

                doors.forEach(function (d) { grid[d.z][d.x] = 0; });

                for (let z = bz; z < bz + bh; z++) for (let x = bx; x < bx + bw; x++) {
                    deck.cells[x + ',' + z] = 1; roofed[x + ',' + z] = 1;
                }

                let flight = Math.max(1, Math.floor(STAIR_STEPS / 2));
                let rest = STAIR_STEPS - flight;

                let keepClear = {};
                gates.forEach(function (g) { keepClear[g.x + ',' + g.z] = 1; });

                doors.forEach(function (d) { keepClear[d.x + ',' + d.z] = 1; });
                let freeCell = function (cx, cz) {
                    return inMap(cx, cz) && grid[cz][cx] === 0 &&
                        deck.stairs[cx + ',' + cz] === undefined && !keepClear[cx + ',' + cz];
                };

                let stairsOk = function (list) {
                    if (!list || !list.length) return false;
                    let blocked = {};
                    list.forEach(function (c) { blocked[c.x + ',' + c.z] = 1; });
                    let inside = [];
                    for (let z2 = bz + 1; z2 <= bz + bh - 2; z2++) {
                        for (let x2 = bx + 1; x2 <= bx + bw - 2; x2++) {
                            if (grid[z2][x2] === 0 && !blocked[x2 + ',' + z2]) inside.push({ x: x2, z: z2 });
                        }
                    }
                    if (!inside.length) return false;
                    let seen = {}, q = [inside[0]];
                    seen[inside[0].x + ',' + inside[0].z] = 1;
                    let head = 0;
                    while (head < q.length) {
                        let c = q[head++];
                        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) {
                            let nx = c.x + v[0], nz = c.z + v[1], kk = nx + ',' + nz;
                            if (seen[kk]) return;
                            if (nx < bx + 1 || nx > bx + bw - 2 || nz < bz + 1 || nz > bz + bh - 2) return;
                            if (grid[nz][nx] !== 0 || blocked[kk]) return;
                            seen[kk] = 1; q.push({ x: nx, z: nz });
                        });
                    }
                    if (q.length !== inside.length) return false;

                    return doors.every(function (d) {
                        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (v) {
                            return seen[(d.x + v[0]) + ',' + (d.z + v[1])];
                        });
                    });
                };
                let tryL = function (x0, z0, dx, dz, xFirst) {
                    let out = [];
                    let put = function (cx, cz, h) {
                        if (!freeCell(cx, cz)) return false;
                        if (out.some(function (o) { return o.x === cx && o.z === cz; })) return false;
                        out.push({ x: cx, z: cz, h: h });
                        return true;
                    };
                    for (let i2 = 0; i2 < flight; i2++) {
                        let ax = xFirst ? x0 + dx * i2 : x0;
                        let az = xFirst ? z0 : z0 + dz * i2;
                        if (!put(ax, az, STAIR_RISE * (i2 + 1))) return null;
                    }
                    let lx2 = xFirst ? x0 + dx * flight : x0;
                    let lz2 = xFirst ? z0 : z0 + dz * flight;
                    if (!put(lx2, lz2, STAIR_RISE * flight)) return null;
                    for (let i2 = 0; i2 < rest; i2++) {
                        let bx2 = xFirst ? lx2 : lx2 + dx * (i2 + 1);
                        let bz2 = xFirst ? lz2 + dz * (i2 + 1) : lz2;
                        if (!put(bx2, bz2, STAIR_RISE * (flight + i2 + 1))) return null;
                    }
                    return out;
                };
                let cells = null;
                let corners = [
                    [bx + 1, bz + 1, 1, 1], [bx + bw - 2, bz + 1, -1, 1],
                    [bx + 1, bz + bh - 2, 1, -1], [bx + bw - 2, bz + bh - 2, -1, -1]
                ];
                let pick = function (r) { if (r && stairsOk(r)) cells = r; };
                for (let ci = 0; ci < corners.length && !cells; ci++) {
                    let c = corners[ci];
                    pick(tryL(c[0], c[1], c[2], c[3], true));
                    if (!cells) pick(tryL(c[0], c[1], c[2], c[3], false));
                }

                for (let z2 = bz + 1; z2 <= bz + bh - 2 && !cells; z2++) {
                    for (let x2 = bx + 1; x2 <= bx + bw - 2 && !cells; x2++) {
                        for (let d1 = 0; d1 < 2 && !cells; d1++) {
                            for (let d2 = 0; d2 < 2 && !cells; d2++) {
                                let ddx = d1 ? -1 : 1, ddz = d2 ? -1 : 1;
                                pick(tryL(x2, z2, ddx, ddz, true));
                                if (!cells) pick(tryL(x2, z2, ddx, ddz, false));
                            }
                        }
                    }
                }
                if (!cells) {

                    let minN = Math.ceil(DECK_H / NIGHT_STEP_UP);
                    let runs = [];
                    [true, false].forEach(function (horiz) {
                        let o1 = horiz ? bz + 1 : bx + 1, e1 = horiz ? bz + bh - 2 : bx + bw - 2;
                        let o2 = horiz ? bx + 1 : bz + 1, e2 = horiz ? bx + bw - 2 : bz + bh - 2;
                        for (let a1 = o1; a1 <= e1; a1++) {
                            for (let st = o2; st <= e2; st++) {
                                [1, -1].forEach(function (dir) {
                                    let run = [], a2 = st;
                                    while (run.length < STAIR_STEPS) {
                                        let cx = horiz ? a2 : a1, cz = horiz ? a1 : a2;
                                        if (!freeCell(cx, cz)) break;
                                        run.push({ x: cx, z: cz }); a2 += dir;
                                    }
                                    if (run.length >= minN) runs.push(run);
                                });
                            }
                        }
                    });
                    runs.sort(function (a2, b2) { return b2.length - a2.length; });
                    for (let ri = 0; ri < runs.length && !cells; ri++) {
                        let n2 = runs[ri].length;
                        let line = runs[ri].map(function (c, i2) {
                            return { x: c.x, z: c.z, h: DECK_H * (i2 + 1) / n2 };
                        });
                        if (stairsOk(line)) cells = line;
                    }
                }
                if (cells) {
                    cells.forEach(function (c) {
                        deck.stairs[c.x + ',' + c.z] = c.h;

                    });
                }

                {
                    let hA = [], hB = [];
                    for (let z2 = bz + 1; z2 <= bz + bh - 2; z2++) {
                        for (let x2 = bx + 1; x2 <= bx + bw - 2; x2++) {
                            if (grid[z2][x2] !== 0) continue;
                            if (deck.stairs[x2 + ',' + z2] !== undefined) continue;
                            let firstHalf = (bw >= bh) ? (x2 < px0) : (z2 < pz1);
                            (firstHalf ? hA : hB).push({ x: x2, z: z2 });
                        }
                    }
                    if (hA.length) bldHalves.push(hA);
                    if (hB.length) bldHalves.push(hB);
                }
                blds.push({ x: bx, z: bz, w: bw, h: bh });
                n++;
            }

            let reachAll = function () {
                let start = null, total = 0;
                for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) {
                    if (grid[z][x] === 0) { total++; if (!start) start = { x: x, z: z }; }
                }
                if (!start) return false;
                let seen = {}, q = [start], n = 0; seen[start.x + ',' + start.z] = 1;
                while (q.length) {
                    let c = q.pop(); n++;
                    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) {
                        let nx = c.x + v[0], nz = c.z + v[1], k = nx + ',' + nz;
                        if (!inMap(nx, nz) || grid[nz][nx] !== 0 || seen[k]) return;
                        seen[k] = 1; q.push({ x: nx, z: nz });
                    });
                }
                return n === total;
            };

            let groupLens = [3, 5, 5];
            let variantLen = groupLens[gState.nightVariant || 0];
            let crateGroups = [];

            let groupTarget = Math.round(10 * (mSize * mSize) / (21 * 21));
            for (let tries = 0; tries < 4000 && crateGroups.length < groupTarget; tries++) {
                let axis = seededRandom() < 0.5 ? 'x' : 'z';
                let x0 = 2 + Math.floor(seededRandom() * (mSize - 4));
                let z0 = 2 + Math.floor(seededRandom() * (mSize - 4));

                if ((gState.nightVariant || 0) === 2) { if (axis === 'x') x0 += 1; else z0 += 1; }
                let cells = [], ok = true;
                for (let i = 0; i < variantLen && ok; i++) {
                    let cx = axis === 'x' ? x0 + i : x0, cz = axis === 'z' ? z0 + i : z0;
                    if (!inMap(cx, cz) || grid[cz][cx] !== 0) { ok = false; break; }
                    if (deck.cells[cx + ',' + cz] || deck.stairs[cx + ',' + cz] !== undefined) { ok = false; break; }

                    cells.push({ x: cx, z: cz, slot: (i % 2 === 1) });
                }
                if (!ok) continue;

                let vaultAxis = axis === 'x' ? 'z' : 'x';
                let pOk = cells.every(function (c) {
                    if (!c.slot) return true;

                    let n1 = vaultAxis === 'z' ? { x: c.x, z: c.z - 1 } : { x: c.x - 1, z: c.z };
                    let n2 = vaultAxis === 'z' ? { x: c.x, z: c.z + 1 } : { x: c.x + 1, z: c.z };
                    return inMap(n1.x, n1.z) && grid[n1.z][n1.x] === 0 && inMap(n2.x, n2.z) && grid[n2.z][n2.x] === 0;
                });
                if (!pOk) continue;

                let pad = 2;
                let clash = crateGroups.some(function (g) {
                    return g.cells.some(function (a) { return cells.some(function (b) { return Math.abs(a.x - b.x) <= pad && Math.abs(a.z - b.z) <= pad; }); });
                }) || gates.some(function (g) { return cells.some(function (c) { return Math.abs(g.x - c.x) + Math.abs(g.z - c.z) < 3; }); });
                if (clash) continue;

                cells.forEach(function (c) { grid[c.z][c.x] = 2; });
                crateGroups.push({ cells: cells, vaultAxis: vaultAxis });
            }

            while (crateGroups.length > 0 && !reachAll()) {
                let g = crateGroups.pop();
                g.cells.forEach(function (c) { grid[c.z][c.x] = 0; });
            }

            let slotCellKeys = {};
            crateGroups.forEach(function (g) {
                g.cells.forEach(function (c) {
                    if (!c.slot) return;
                    slotCellKeys[c.x + ',' + c.z] = 1;
                    grid[c.z][c.x] = 0;
                    gates.push({ x: c.x, z: c.z, axis: g.vaultAxis });
                });
            });

            gates = gates.filter(function (g) {
                let was = grid[g.z][g.x];
                grid[g.z][g.x] = 1;
                let ok = reachAll();
                grid[g.z][g.x] = was;
                return ok;
            });
            gState.nightDeck = deck;

            maze[0] = Array(mSize).fill().map(function () { return Array(mSize).fill(null); });
            for (let z = 0; z < mSize; z++) for (let x = 0; x < mSize; x++) {
                let px = x * TILE, pz = z * TILE, k = x + ',' + z;
                let outer = (x === 0 || x === mSize - 1 || z === 0 || z === mSize - 1);
                if (grid[z][x] === 1) {

                    let wh = outer ? 24 : BLD_H;
                    let m = new THREE.Mesh(new THREE.BoxGeometry(TILE, wh, TILE), new THREE.MeshLambertMaterial({ map: wallTex }));
                    m.position.set(px, wh / 2, pz); scene.add(m); maze[0][z][x] = { type: 1, mesh: m };
                } else if (grid[z][x] === 2) {

                    let c = new THREE.Mesh(new THREE.BoxGeometry(CRATE_SIDE, CRATE_H, CRATE_SIDE),
                        new THREE.MeshLambertMaterial({ color: 0xc99a5b }));
                    c.position.set(px, CRATE_H / 2, pz); scene.add(c);
                    let f0 = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE), new THREE.MeshLambertMaterial({ map: floorTex, side: THREE.DoubleSide }));
                    f0.rotation.x = -Math.PI / 2; f0.position.set(px, 0, pz); scene.add(f0);
                    maze[0][z][x] = { type: 1, crate: true, mesh: c, roof: f0 };
                } else {
                    let f = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE), new THREE.MeshLambertMaterial({ map: floorTex, side: THREE.DoubleSide }));
                    f.rotation.x = -Math.PI / 2; f.position.set(px, 0, pz);
                    scene.add(f);
                    maze[0][z][x] = { type: 0, mesh: f }; walkableMeshes.push(f);
                }
                if (deck.stairs[k] !== undefined) {
                    let sh = deck.stairs[k];
                    let st = new THREE.Mesh(new THREE.BoxGeometry(TILE, sh, TILE), new THREE.MeshLambertMaterial({ map: wallTex }));
                    st.position.set(px, sh / 2, pz); scene.add(st); maze[0][z][x].roof2 = st;

                    let rails = new THREE.Group();
                    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) {
                        let nx2 = x + v[0], nz2 = z + v[1];
                        if (deck.stairs[nx2 + ',' + nz2] !== undefined) return;
                        let nh = (deck.cells[nx2 + ',' + nz2] && grid[nz2] && grid[nz2][nx2] === 1) ? sh : 0;
                        if (Math.abs(sh - nh) <= NIGHT_STEP_UP) return;
                        let bar = new THREE.Mesh(
                            new THREE.BoxGeometry(v[0] ? 1.2 : TILE, 6, v[1] ? 1.2 : TILE),
                            new THREE.MeshLambertMaterial({ color: 0xbfae9b }));
                        bar.position.set(v[0] * (TILE / 2 - 0.6), sh + 3, v[1] * (TILE / 2 - 0.6));
                        rails.add(bar);
                    });
                    if (rails.children.length) {
                        rails.position.set(px, 0, pz); scene.add(rails);
                        maze[0][z][x].roof5 = rails;
                    }

                    if (deck.covered[k]) {
                        let dk2 = new THREE.Mesh(new THREE.BoxGeometry(TILE, 2.5, TILE), new THREE.MeshLambertMaterial({ map: floorTex }));
                        dk2.position.set(px, DECK_H - 1.25, pz); scene.add(dk2); maze[0][z][x].roof4 = dk2;
                    }
                } else if (deck.cells[k] && grid[z][x] !== 1) {
                    let dk = new THREE.Mesh(new THREE.BoxGeometry(TILE, 2.5, TILE), new THREE.MeshLambertMaterial({ map: floorTex }));
                    dk.position.set(px, DECK_H - 1.25, pz); scene.add(dk); maze[0][z][x].roof2 = dk;
                }
                if (roofed[k]) {
                    let r = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE),
                        new THREE.MeshLambertMaterial({ color: 0xb9b2c4, side: THREE.DoubleSide }));
                    r.rotation.x = Math.PI / 2; r.position.set(px, BLD_H, pz);
                    scene.add(r); maze[0][z][x].roof3 = r;
                }
            }

            for (let fl = 1; fl < FLOORS; fl++) {
                maze[fl] = [];
                for (let z = 0; z < mSize; z++) {
                    let row = [];
                    for (let x = 0; x < mSize; x++) {
                        let g0 = maze[0][z][x];

                        let spare = (fl === 1) && deckSpare && deckSpare.x === x && deckSpare.z === z;
                        row.push((fl === 1 && !spare && (g0 && g0.type === 1 && !g0.crate)) ? { type: 1 } : { type: 0 });
                    }
                    maze[fl].push(row);
                }
            }

            let open = [];
            for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) {
                if (grid[z][x] !== 0) continue;
                if (slotCellKeys[x + ',' + z]) continue;
                open.push({ x: x, z: z });
            }
            for (let i = open.length - 1; i > 0; i--) { let j = Math.floor(seededRandom() * (i + 1)); let t = open[i]; open[i] = open[j]; open[j] = t; }

            let occupied = gates.filter(function (g) { return g.indoor; }).map(function (g) { return { x: g.x, z: g.z }; })
                .concat(crateGroups.map(function (g) { return { x: g.cells[2].x, z: g.cells[2].z }; }));
            open = open.filter(function (c) {
                if (gates.some(function (g) { return g.x === c.x && g.z === c.z; })) return false;
                return deck.stairs[c.x + ',' + c.z] === undefined;
            });

            let corner = Math.max(3, Math.floor(mSize * 0.18));
            let palletCells = crateGroups.map(function (g) { return g.cells[1]; }).filter(Boolean);
            let nearPallet = function (c) {
                return palletCells.some(function (q) { return Math.abs(q.x - c.x) + Math.abs(q.z - c.z) <= 4; });
            };
            let notCorner = function (c) {
                let ex = Math.min(c.x - 1, mSize - 2 - c.x), ez = Math.min(c.z - 1, mSize - 2 - c.z);
                return !(ex < corner && ez < corner);
            };
            let mPool = open.filter(function (c) { return notCorner(c) && nearPallet(c); });
            if (mPool.length < NIGHT.machines) mPool = open.filter(notCorner);
            if (mPool.length < NIGHT.machines) mPool = open.slice();

            let takeCell = function (cell) {
                open = open.filter(function (c) { return !(c.x === cell.x && c.z === cell.z); });
                mPool = mPool.filter(function (c) { return !(c.x === cell.x && c.z === cell.z); });
            };
            let addMachine = function (cell) {
                takeCell(cell);
                let mm = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 10), new THREE.MeshLambertMaterial({ map: tableTex }));
                mm.position.set(cell.x * TILE, 6, cell.z * TILE); scene.add(mm);
                gState.machines.push({ x: cell.x, z: cell.z, progress: 0, done: false, mesh: mm });
            };

            let placedIn = 0;
            bldHalves.forEach(function (half) {
                let pool = half.filter(function (c) {
                    return open.some(function (o) { return o.x === c.x && o.z === c.z; });
                });
                if (!pool.length) return;
                let cell = pickSpread(pool, occupied); if (!cell) return;
                addMachine(cell); placedIn++;
            });
            for (let n = placedIn; n < NIGHT.machines; n++) {
                let cell = pickSpread(mPool, occupied); if (!cell) break;
                addMachine(cell);
            }

            let chairPlaced = 0;
            if (bldHalves.length) {
                let pool = bldHalves[0].filter(function (c) {
                    return open.some(function (o) { return o.x === c.x && o.z === c.z; });
                });
                if (pool.length) {
                    let cell = pickSpread(pool, occupied);
                    if (cell) {
                        open = open.filter(function (c) { return !(c.x === cell.x && c.z === cell.z); });
                        let cm0 = new THREE.Mesh(new THREE.BoxGeometry(9, 22, 9), new THREE.MeshLambertMaterial({ color: 0xd32f2f }));
                        cm0.position.set(cell.x * TILE, 11, cell.z * TILE); scene.add(cm0);
                        gState.chairs.push({ x: cell.x, z: cell.z, used: false, occupant: null, mesh: cm0 });
                        chairPlaced = 1;
                    }
                }
            }
            for (let n = chairPlaced; n < NIGHT.chairs; n++) {
                let cell = pickSpread(open, occupied); if (!cell) break;

                let cm = new THREE.Mesh(new THREE.BoxGeometry(9, 22, 9), new THREE.MeshLambertMaterial({ color: 0xd32f2f }));
                cm.position.set(cell.x * TILE, 11, cell.z * TILE); scene.add(cm);
                gState.chairs.push({ x: cell.x, z: cell.z, used: false, occupant: null, mesh: cm });
            }

            let doorCands = [];
            for (let i = 2; i < mSize - 2; i++) {
                if (grid[1][i] === 0) doorCands.push({ x: i, z: 0 });
                if (grid[mSize - 2][i] === 0) doorCands.push({ x: i, z: mSize - 1 });
                if (grid[i][1] === 0) doorCands.push({ x: 0, z: i });
                if (grid[i][mSize - 2] === 0) doorCands.push({ x: mSize - 1, z: i });
            }
            for (let i = doorCands.length - 1; i > 0; i--) { let j = Math.floor(seededRandom() * (i + 1)); let t = doorCands[i]; doorCands[i] = doorCands[j]; doorCands[j] = t; }
            let doorPlaced = [];
            for (let n = 0; n < NIGHT.doors; n++) {
                let d = pickSpread(doorCands, doorPlaced); if (!d) break;

                let cell = maze[0][d.z][d.x];
                if (cell && cell.mesh) { scene.remove(cell.mesh); cell.mesh = null; }
                let dm = new THREE.Mesh(new THREE.BoxGeometry(TILE - 3, 21, TILE - 3),
                    new THREE.MeshLambertMaterial({ color: 0xc2185b }));
                dm.position.set(d.x * TILE, 10.5, d.z * TILE); scene.add(dm);

                let lintel = new THREE.Mesh(new THREE.BoxGeometry(TILE - 1, 3, TILE - 1),
                    new THREE.MeshLambertMaterial({ color: 0xff80ab, emissive: 0x4a0025 }));
                lintel.position.set(d.x * TILE, 22.5, d.z * TILE); scene.add(lintel);
                gState.doors.push({ x: d.x, z: d.z, openProgress: 0, open: false, mesh: dm, lintel: lintel });
            }

            let cellFree = function (x, z) {
                return x >= 1 && x < mSize - 1 && z >= 1 && z < mSize - 1 && grid[z][x] === 0;
            };

            let detourCost = function (c) {
                let sideA, sideB;
                if (c.axis === 'x') { sideA = { x: c.x - 1, z: c.z }; sideB = { x: c.x + 1, z: c.z }; }
                else { sideA = { x: c.x, z: c.z - 1 }; sideB = { x: c.x, z: c.z + 1 }; }
                if (!cellFree(sideA.x, sideA.z) || !cellFree(sideB.x, sideB.z)) return Infinity;
                let seen = {}, q = [{ x: sideA.x, z: sideA.z, d: 0 }];
                seen[sideA.x + ',' + sideA.z] = 1;
                seen[c.x + ',' + c.z] = 1;
                let head = 0;
                while (head < q.length) {
                    let cur = q[head++];
                    if (cur.x === sideB.x && cur.z === sideB.z) return cur.d;
                    if (cur.d > PALLET_DETOUR_CELLS) break;
                    let nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                    for (let v of nb) {
                        let nx = cur.x + v[0], nz = cur.z + v[1], k = nx + ',' + nz;
                        if (seen[k] || !cellFree(nx, nz)) continue;
                        seen[k] = 1; q.push({ x: nx, z: nz, d: cur.d + 1 });
                    }
                }
                return Infinity;
            };
            let hardCount = 0;
            gates.forEach(function (c) {
                let cost = detourCost(c);
                if (cost > PALLET_DETOUR_CELLS) {

                    if (hardCount >= PALLET_HARD_MAX) return;
                    hardCount++;
                }
                let pm = nightMakePallet(c.axis, !!c.indoor);
                pm.position.set(c.x * TILE, 0, c.z * TILE); scene.add(pm);
                gState.pallets.push({
                    x: c.x, z: c.z, axis: c.axis, state: 'up', mesh: pm,
                    gy: 0, indoor: !!c.indoor, hard: cost > PALLET_DETOUR_CELLS
                });
            });

            (function () {
                if (!blds.length) return;
                let b = blds[0];
                let stairPts = Object.keys(deck.stairs).map(function (kk) {
                    let q = kk.split(','); return { x: +q[0], z: +q[1] };
                });
                let best = null, bestD = -1;
                let edges = [];
                for (let x2 = b.x + 1; x2 <= b.x + b.w - 2; x2++) {
                    edges.push({ x: x2, z: b.z, ox: 0, oz: -1 });
                    edges.push({ x: x2, z: b.z + b.h - 1, ox: 0, oz: 1 });
                }
                for (let z2 = b.z + 1; z2 <= b.z + b.h - 2; z2++) {
                    edges.push({ x: b.x, z: z2, ox: -1, oz: 0 });
                    edges.push({ x: b.x + b.w - 1, z: z2, ox: 1, oz: 0 });
                }
                edges.forEach(function (e) {

                    if (gState.doors.some(function (o) { return o.x === e.x && o.z === e.z; })) return;
                    let ox = e.x + e.ox, oz = e.z + e.oz;
                    if (!inMap(ox, oz) || grid[oz][ox] !== 0) return;
                    let ix = e.x - e.ox, iz = e.z - e.oz;
                    if (!inMap(ix, iz) || grid[iz][ix] !== 0) return;
                    let d = stairPts.reduce(function (mn, sp) {
                        return Math.min(mn, Math.abs(sp.x - e.x) + Math.abs(sp.z - e.z));
                    }, 999);
                    if (d > bestD) { bestD = d; best = e; }
                });
                if (!best) return;
                deckWin = { x: best.x, z: best.z };
                let axis = best.ox ? 'x' : 'z';
                let pm3 = nightMakePallet(axis, true);
                pm3.position.set(best.x * TILE, DECK_H, best.z * TILE); scene.add(pm3);
                gState.pallets.push({
                    x: best.x, z: best.z, axis: axis, state: 'up',
                    mesh: pm3, gy: DECK_H, indoor: true, hard: false
                });

                let fr = new THREE.Mesh(new THREE.BoxGeometry(TILE - 1, 3, TILE - 1),
                    new THREE.MeshLambertMaterial({ color: 0xff80ab, emissive: 0x4a0025 }));
                fr.position.set(best.x * TILE, DECK_H + 8, best.z * TILE); scene.add(fr);
                maze[0][best.z][best.x].roof6 = fr;
            })();

            if (deckGate) {
                let along = (deckGate.axis === 'x') ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
                for (let vi = 0; vi < along.length && !deckSpare; vi++) {
                    let nx = deckGate.x + along[vi][0], nz = deckGate.z + along[vi][1];

                    let ok2 = blds.some(function (b) {
                        return nx > b.x && nx < b.x + b.w - 1 && nz > b.z && nz < b.z + b.h - 1;
                    });
                    if (ok2) deckSpare = { x: nx, z: nz };
                }
            }

            if (deckGate) {
                let pm2 = nightMakePallet(deckGate.axis, true);
                pm2.position.set(deckGate.x * TILE, DECK_H, deckGate.z * TILE); scene.add(pm2);
                gState.pallets.push({
                    x: deckGate.x, z: deckGate.z, axis: deckGate.axis, state: 'up',
                    mesh: pm2, gy: DECK_H, indoor: true, hard: false
                });
            }

            (function () {
                let up = [];
                blds.forEach(function (b) {
                    for (let z2 = b.z + 1; z2 <= b.z + b.h - 2; z2++) {
                        for (let x2 = b.x + 1; x2 <= b.x + b.w - 2; x2++) {
                            let kk = x2 + ',' + z2;
                            if (deck.stairs[kk] !== undefined) continue;
                            if (grid[z2][x2] === 1) continue;
                            if (deckGate && deckGate.x === x2 && deckGate.z === z2) continue;
                            up.push({ x: x2, z: z2 });
                        }
                    }
                });
                let placed = [];
                for (let n = 0; n < 2; n++) {
                    let c = pickSpread(up, placed); if (!c) break;
                    let mm = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 10), new THREE.MeshLambertMaterial({ map: tableTex }));
                    mm.position.set(c.x * TILE, DECK_H + 6, c.z * TILE); scene.add(mm);
                    gState.machines.push({ x: c.x, z: c.z, gy: DECK_H, progress: 0, done: false, mesh: mm });
                }
                for (let n = 0; n < 2; n++) {
                    let c = pickSpread(up, placed); if (!c) break;
                    let cm = new THREE.Mesh(new THREE.BoxGeometry(9, 22, 9), new THREE.MeshLambertMaterial({ color: 0xd32f2f }));
                    cm.position.set(c.x * TILE, DECK_H + 11, c.z * TILE); scene.add(cm);
                    gState.chairs.push({ x: c.x, z: c.z, gy: DECK_H, used: false, occupant: null, mesh: cm });
                }
            })();

            gState.nightBlds = blds;
            gState.nightBldH = BLD_H;

            gameSeed = Math.floor(Math.random() * 1000000) || 1;
            camera.position.set(TILE, 9, TILE); camera.rotation.set(0, 0, 0);
        }

        const EGG_RESET_VER = 2;
        const EGG_PAIRS = { cat: 'hunter', dog: 'hgou', meow: 'hmeow', mi: 'hmi', c1: 'hgou', c2: 'hmi' };
        const GOLD_EGG_NAMES = ['黄金书', '金苹果', '黄金圣杯', '黄金小鱼干', '黄金猫盾', '至臻猫盾', '外星信号接收器']
            .concat(HUNT_GEMS.map(function (g) { return g.n; }));   // 六颗宝石也算金色物品
        // 传说宝物：整个游戏里只有这三件，价值都在金色天花板（王权之心 100 万）之上
        const RED_EGG_NAMES = ['皇冠', '皇家马车', '永恒誓言'];

        const EGGS = (function () {
            let list = {};

            Object.keys(EGG_PAIRS).forEach(function (s) {
                let h = EGG_PAIRS[s];
                list['pair_' + s] = {
                    name: '同类相和 · ' + NIGHT_CHARS[s].name + ' × ' + NIGHT_CHARS[h].name,
                    kind: '成就', hidden: true,
                    text: '两个同类的影子在黑暗里对视了三秒。谁也没有先动手。'
                };
            });
            list['blaze_flawless'] = {
                name: '一次都没倒下', kind: '成就', hidden: true,
                text: '超燃打完一整场，你的名字一次都没出现在击杀播报里。'
            };
            list['chair_alone'] = {
                name: '无人来救', kind: '成就', hidden: true,
                text: '椅子很高。你数着秒，听见远处矿机的声音一直没停。'
            };
            list['chat_67'] = {
                name: '67', kind: '彩蛋', hidden: true,
                text: '你在公共聊天里打出了「67」。没人知道为什么，但猫盾币到账了。'
            };

            GOLD_EGG_NAMES.forEach(function (n) {
                list['gold_' + n] = {
                    name: '藏品记录 · ' + n, kind: '藏品',
                    how: '在寻宝队里拿到「' + n + '」',
                    text: '「' + n + '」被登记入册。柜台后面的人看了它很久，才盖下印章。'
                };
            });
            RED_EGG_NAMES.forEach(function (n) {
                list['red_' + n] = {
                    name: '传说宝物 · ' + n, kind: '藏品',
                    how: '在寻宝队里拿到传说宝物「' + n + '」',
                    text: '「' + n + '」不该出现在这种地方。册子上没有它的编号，只能新起一页。'
                };
            });
            return list;
        })();

        function loadEggs() {
            try { gState.eggs = JSON.parse(localStorage.getItem('TH_eggs') || '{}') || {}; }
            catch (e) { gState.eggs = {}; }

            let ver = 0;
            try { ver = +(localStorage.getItem('TH_eggs_ver') || 0); } catch (e) { }
            if (ver !== EGG_RESET_VER) {
                gState.eggs = {};
                try { localStorage.setItem('TH_eggs_ver', String(EGG_RESET_VER)); } catch (e) { }
                saveEggs();
            }
        }
        function saveEggs() { try { localStorage.setItem('TH_eggs', JSON.stringify(gState.eggs || {})); } catch (e) { } }

        let nightEggQueue = [];
        function unlockEgg(id) {
            if (!EGGS[id]) return;
            if (!gState.eggs) loadEggs();
            if (gState.eggs[id]) return;
            gState.eggs[id] = Date.now(); saveEggs();
            if (nightEggQueue.indexOf(id) === -1) nightEggQueue.push(id);
        }

        function nightFlushEggs(after) {
            if (nightEggQueue.length === 0) { if (after) after(); return; }
            let ids = nightEggQueue.slice(); nightEggQueue = [];
            let body = ids.map(function (id) {
                let e = EGGS[id];
                let how = e.how || (e.kind === '成就' ? '隐藏成就' : '');
                return '<div style="margin:8px 0;"><b>' + e.name + '</b>' +
                    (how ? '<br><span style="color:#666; font-size:13px;">' + how + '</span>' : '') + '</div>';
            }).join('');
            showSysModal('本局解锁 ' + ids.length + ' 个彩蛋', body,
                [{ label: '收下', color: '#9b59b6', onClick: function () { if (after) after(); } }]);
        }

        function eggCount() { if (!gState.eggs) loadEggs(); return Object.keys(gState.eggs).length; }

        function nightTreasureEgg(name) {
            if (GOLD_EGG_NAMES.indexOf(name) !== -1) unlockEgg('gold_' + name);
            if (RED_EGG_NAMES.indexOf(name) !== -1) unlockEgg('red_' + name);
        }

        let NIGHT_FRIENDLY_DISABLED_FOR_TESTING = false;

        function nightIsFriendly() {
            if (NIGHT_FRIENDLY_DISABLED_FOR_TESTING) { gState.nightFriendlyStreak = 0; return false; }

            let h = gState.nightHistory || [];
            let wins = h.filter(function (w) { return w; }).length;
            let rate = h.length > 0 ? wins / h.length : 1;
            let streak = 0;
            for (let i = h.length - 1; i >= 0 && !h[i]; i--) streak++;

            let want = false;
            if (h.length >= 3 && rate < 0.3) want = true;
            else if (streak >= 5) want = true;
            else want = Math.random() < 0.04;

            let streakSoFar = gState.nightFriendlyStreak || 0;
            if (want && streakSoFar >= 2) want = false;

            gState.nightFriendlyStreak = want ? streakSoFar + 1 : 0;
            saveProgress();
            return want;
        }

        function nightRecordResult(won) {
            if (!gState.nightHistory) gState.nightHistory = [];
            gState.nightHistory.push(!!won);
            if (gState.nightHistory.length > 30) gState.nightHistory.shift();
            saveProgress();
        }

        // 更新公告：新条目往数组最前面加（下标 0 永远是最新的）。夜间自动修 bug 的
        // 云端任务也会往这加一条，这样玩家不用来问我改了什么，打开游戏自己就能看见。
        // 更新公告：只写玩家关心的，一条一句话，按时间合并成几段（原来六十多条，太长没人看）
        (function () { let v = document.getElementById('lobby-version'); if (v) v.innerText = '版本 ' + GAME_VERSION; })();
        const CHANGELOG = [
            {
                id: '2026-10-07', date: '10 月 7 日', title: '加载、联机和大厅', items: [
                    '打开游戏更快了，加载时会显示进度',
                    '画面和联机用的组件放到自己网站上了，不再从国外网站下载',
                    '大厅加了「联机诊断」，连不上时点一下看是哪一环的问题',
                    '房间里的在线人数会跟着有人进出刷新了',
                    '大厅顶上的在线人数只算真人，不算路人'
                ]
            },
            {
                id: '2026-10-05-v3', date: '10 月 5 日', title: '寻宝队地图', items: [
                    '寻宝队每两层之间都一定有楼梯了，不会再有上不去的楼层',
                    '信号接收器的蓝线在楼梯口旁边有桌子的地方不会再穿进桌子了',
                    '名字里带 & 或 < 的，在队伍、提示里不会再显示成乱码了'
                ]
            },
            {
                id: '2026-10-05-v2', date: '10 月 5 日', title: '每日效果和寻宝队', items: [
                    '游戏数据清了一次，大家从头开始',
                    '每日效果的幅度都改小了，快慢高低都只差一点',
                    '寻宝队简单图不再出保险柜',
                    '宝箱开出大金的机会变少了，一张图最多 4 个',
                    '腰包改成自己装东西：每个腰包 3 格，点一下打开，能带好几个',
                    '信号接收器改成一条蓝线带路，上下楼也认得路',
                    '点小地图导航改成绿线，跟蓝线分开，互不影响'
                ]
            },
            {
                id: '2026-10-05', date: '10 月 5 日', title: '爬塔存档点', items: [
                    '爬塔加了存档点：掉下去回最近的绿旗，岩浆淹过绿旗再掉才算输',
                    '「举步维艰」那天爬塔也爬得上去了，塔会跟着当天的跳跃变矮一点',
                    '超燃选的角色刷新后不会变回默认；惊魂夜追捕者头上也有称号了'
                ]
            },
            {
                id: '2026-10-04-v2', date: '10 月 4 日', title: '寻宝队修复', items: [
                    '卡的时候爬楼梯不会再掉进台阶里、卡在平台底下了',
                    '仓库里东西能拖到空格了；钱不够、仓库满了会告诉你',
                    '仓库里点一下就能选中，选中后按 Backspace 或点「卖掉」卖掉',
                    '上交不再直接给钱：撤离出去东西进仓库，卖掉才有钱',
                    '中途退出、关页面都算撤离失败，背包里的东西全丢（腰包、徽章也是）',
                    '地窖徽章只送一次，丢了可以在商店买',
                    '仓库里有「返回大厅」了，组队时自己回去不影响别人',
                    '跳上桌子不会再掉进桌子里，从楼梯口掉下去也不会卡进墙',
                    '撤离成功后，鱼叉、医疗包这些道具留在背包里，不用每局再拖',
                    '负重提示和寻宝队新手提示只弹一次，皮肤抽卡的进度刷新也不丢了'
                ]
            },
            {
                id: '2026-10-04', date: '10 月 4 日', title: '规则和入门关', items: [
                    '大厅有「规则」按钮了，局里第一次碰到新东西会弹介绍，密室前 8 关改成入门关',
                    '这次更新后要刷新页面才能和朋友联机'
                ]
            },
            {
                id: '2026-10-03', date: '10 月 3 日', title: '联机安全', items: [
                    '别人起的怪名字不会再在你的页面上乱跑代码了',
                    '没组队、没在排的人，不能再把你硬拉进对局了',
                    '联机升级了，跟朋友一起玩前都刷新一下页面',
                    '超燃乱斗买到「奇遇」卡不再白花钱，会抽一张别的牌并加强',
                    '松饼大作战的护盾只在真要被抓时才用掉',
                    '惊魂夜当追捕者时，不再显示 4 个「AI 队友」',
                    '被拉进超燃时，手上那局会先好好退出，不再两局抢画面',
                    '大厅左上角能看到版本号了',
                    '大厅「今日效果」写清楚了：惊魂夜、密室、乐园不受影响'
                ]
            },
            {
                id: '2026-09-30-v3', date: '9 月 30 日', title: '新模式和成就', items: [
                    '三个新模式：推推乐、彩弹占地、爬塔（爬塔能单人、双人合作、多人）',
                    '每个模式打完都给猫盾币，赢了、连胜、每天首胜给得更多',
                    '每周换一个活动模式，那一周猫盾币翻倍',
                    '大厅多了「成就 · 称号」：成就能领猫盾币，称号戴在名字上面',
                    '密室多了「今日密室」，还能自己拼关卡发给朋友玩',
                    '竞速被淘汰后能换人看，还能跟自己最好成绩的影子比',
                    '躲避球加了 5 对 5 快速局',
                    '寻宝队有翻滚和受伤的动作了，每局还有个小任务',
                    '房间里别人开寻宝队，不会再把没组队的你拽进去了',
                    '平板上大厅、松饼、密室、乐园走不动的问题修好了，左半屏按住拖就能走',
                    '寻宝队捡东西、开箱子不用对准了，离得近点「互动」就行',
                    '平板竖着拿视野宽了，自己不会挡住半个屏幕',
                    '密室的提示都改短了，走上密码台会自己弹出键盘',
                    '乐园和密室多了「创作」界面，像拼 Scratch 一样拖积木做关卡',
                    '密室面板里多了「开始」按钮，选好关直接点'
                ]
            },
            {
                id: '2026-09-30-v2', date: '9 月 30 日', title: '界面和操作', items: [
                    '竞速开跑前有 7 秒：栏杆拦着，可以往前挤位置、顺手选技能',
                    '不用选电脑还是平板了，键盘和触屏都能用；大厅多了「设置」',
                    '方向键也能走，回车打开聊天，寻宝队按 1 / 2 / 3 换物品',
                    '惊魂夜右上角换成小猫盾图标，受伤变红，倒地会趴下',
                    '联机时有人走了或掉线，AI 帮他顶上；惊魂夜房主走了也能打完',
                    '密室变成 15 关，越往后越难',
                    '修了一堆界面问题，手机上好用多了',
                    '表情分成「角色的脸」和「宠物的脸」各选各的，商店里能看到换上的样子',
                    '寻宝队和惊魂夜也改成第三人称了',
                    'AI 也会戴商店里的表情、配饰、颜色，超燃里有的还带宠物'
                ]
            },
            {
                id: '2026-09-29', date: '9 月 29 日', title: '配饰和小修', items: [
                    '配饰真的戴在身上了',
                    '黄金猫盾只能合成，开箱子开不出来了',
                    '背景音乐默认打开',
                    '竞速双人可以联机了'
                ]
            },
            {
                id: '2026-09-28', date: '9 月 28 日', title: '签到和联机', items: [
                    '每日签到',
                    '皮肤抽奖便宜了，配饰可以自己搭',
                    '音效多了很多',
                    '监狱救援、躲避球、密室可以联机了（还在测）',
                    '快捷语每个模式一套'
                ]
            },
            {
                id: '2026-09-27', date: '9 月 27 日', title: '竞速联机', items: [
                    '竞速可以联机了（还在测）',
                    '第一次进一个模式会先讲规则',
                    '反馈不用登录 GitHub 了'
                ]
            },
            {
                id: '2026-09-26', date: '9 月 24 – 26 日', title: '大厅广场', items: [
                    '大厅广场：能看到别人、走过去组队、玩跑酷',
                    '猫盾有脸了',
                    '聊天分成公共 / 队伍 / 好友',
                    '新模式：松饼大作战',
                    '金币统一成猫盾币',
                    '麦克风能用了'
                ]
            },
            {
                id: '2026-09-20', date: '9 月 20 日', title: '大厅改版', items: [
                    '大厅换了新布局',
                    '躲避球手感调了，猫盾乐园重做'
                ]
            }
        ];
        function changelogHasUnseen() {
            try { return localStorage.getItem('TH_changelog_seen') !== CHANGELOG[0].id; } catch (e) { return false; }
        }
        function changelogBadgeSync() {
            let b = document.getElementById('changelog-badge');
            if (b) b.style.display = changelogHasUnseen() ? 'inline-block' : 'none';
            if (typeof achBadgeSync === 'function') achBadgeSync();
        }
        function openChangelog() {
            let html = '<div style="max-height:320px; overflow-y:auto; text-align:left;">';
            CHANGELOG.forEach(function (e) {
                html += '<div style="padding:8px 10px; margin-bottom:8px; border-radius:5px; background:#eef6ff;">' +
                    '<div style="font-size:11px; color:#999;">' + e.date + '</div>' +
                    '<div style="font-weight:bold; color:#2c5d8f; margin:2px 0 5px;">' + e.title + '</div>' +
                    '<ul style="margin:0; padding-left:18px; font-size:12px; color:#555; line-height:1.7;">' +
                    e.items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' +
                    '</div>';
            });
            html += '</div>';
            try { localStorage.setItem('TH_changelog_seen', CHANGELOG[0].id); } catch (e) { }
            changelogBadgeSync();
            showSysModal('更新公告', html, [{ label: '关闭', color: '#666' }]);
        }

        // 每日签到：7 天一循环，连续签到奖励递增；断签（隔了不止一天没签）从第 1 天重来。
        // 用本地时区的"第几天"整数判断是不是新的一天，比存时间戳再算时差简单也不怕跨天误判。
        const CHECKIN_REWARDS = [5, 8, 10, 12, 15, 20, 30];
        function localDayNum() {
            let d = new Date();
            return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
        }
        function checkinAvailable() {
            return gState.checkinLastDay !== localDayNum();
        }
        function checkinBadgeSync() {
            let b = document.getElementById('checkin-badge');
            if (b) b.style.display = checkinAvailable() ? 'inline-block' : 'none';
        }
        function openCheckin() {
            let today = localDayNum();
            if (gState.checkinLastDay === today) {
                let next = CHECKIN_REWARDS[gState.checkinStreak % 7];
                showSysModal('每日签到', '今天已经签到过啦，当前连续签到 <b>' + gState.checkinStreak + '</b> 天。<br>明天签到 +' + next + ' 猫盾币。', [{ label: '知道了' }]);
                return;
            }
            let hadPrev = gState.checkinLastDay !== -1;
            let continuing = gState.checkinLastDay === today - 1;
            let broke = hadPrev && !continuing && gState.checkinStreak > 1;
            let streak = continuing ? (gState.checkinStreak + 1) : 1;
            let reward = CHECKIN_REWARDS[(streak - 1) % 7];
            gState.checkinStreak = streak; gState.checkinLastDay = today;
            coinsAdd('checkin', reward);
            checkinBadgeSync();
            let nextReward = CHECKIN_REWARDS[streak % 7];
            showSysModal('每日签到', (broke ? '断签啦，从第 1 天重新开始～<br>' : '') +
                '签到成功！连续签到 <b>' + streak + '</b> 天，获得 <b>' + reward + '</b> 猫盾币（当前共 ' + coinsOf() + ' 个）。<br>' +
                '明天继续签到 +' + nextReward + ' 猫盾币。', [{ label: '太好了' }]);
        }

        // 反馈：没有后端，收不到结构化数据，就走最土但最不会掉链子的路——
        // 拼一封邮件，带上测试者的 ID/模式方便我对上号，发不出邮件就退化成复制文本。
        // 反馈走 GitHub issue（仓库：nickyu28/maodun），不是随便存个本地文本——
        // 这样夜里那个自动检查 bug 的云端任务才能真的读到。以前是直接开一个 GitHub
        // 预填链接让玩家自己提交——但 GitHub 从来不允许匿名开 issue，没账号的玩家
        // 这条路根本走不通。现在改成打一个 Netlify Function（/.netlify/functions/feedback），
        // 后端拿开发者自己存的 token 建 issue，玩家不用登录任何东西。那个接口没配好
        // 或者请求失败的话，自动退回旧的"打开 GitHub 预填页面"方案，反馈不会丢。
        const FEEDBACK_REPO = 'nickyu28/maodun';
        const FEEDBACK_EMAIL = 'iway.yu@gmail.com';
        // 用 mailto 兜底：调起测试者自己手机/电脑上已经登录的邮箱客户端，标题正文都填好，
        // 点发送就行，不用注册任何新账号。缺点是得设备上真的配了邮箱客户端才弹得出来。
        function feedbackMailto(subject, body) {
            location.href = 'mailto:' + FEEDBACK_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        }
        // 提交到后端建 issue；失败（没配 token/网络问题）就退回旧的复制内容 + 打开
        // GitHub 预填页面那套，至少反馈还能送到——只是又变成需要 GitHub 账号那条路了。
        function feedbackSubmit(title, body, label, onOk, onFallback) {
            fetch('/.netlify/functions/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title, body: body, label: label })
            }).then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
                .then(function () { onOk(); })
                .catch(function () {
                    try { navigator.clipboard.writeText(body).catch(function () { }); } catch (e) { }
                    let url = 'https://github.com/' + FEEDBACK_REPO + '/issues/new?title=' + encodeURIComponent(title) +
                        '&body=' + encodeURIComponent(body) + '&labels=' + label;
                    window.open(url, '_blank');
                    onFallback();
                });
        }
        // 反馈涉及哪个/哪些模式让用户自己勾，不再偷偷塞 gState.gameMode——
        // 那个字段只是"选择模式面板里选中的是哪个"，在大厅里从来没真的进任何模式，
        // 却一直默认显示寻宝队，反馈里"模式"那一栏全是错的。
        const FEEDBACK_MODES = [
            ['hunt', '寻宝队'], ['night', '惊魂夜'], ['blaze', '超燃'], ['race', '竞速'],
            ['jail', '监狱救援'], ['dodge', '躲避球'], ['escape', '密室'], ['park', '猫盾乐园'],
            ['cake', '松饼大作战'], ['hub', '大厅广场'], ['other', '其他/不确定']
        ];
        function feedbackActiveMode() {
            if (typeof isPlaying !== 'undefined' && isPlaying) return 'hunt';
            if (typeof night !== 'undefined' && night) return 'night';
            if (typeof blaze !== 'undefined' && blaze) return 'blaze';
            if (typeof race !== 'undefined' && race) return 'race';
            if (typeof jail !== 'undefined' && jail) return 'jail';
            if (typeof dodge !== 'undefined' && dodge) return 'dodge';
            if (typeof escapeRoom !== 'undefined' && escapeRoom) return 'escape';
            if (typeof park !== 'undefined' && park) return 'park';
            if (typeof cake !== 'undefined' && cake) return 'cake';
            if (typeof hub !== 'undefined' && hub) return 'hub';
            return null;
        }
        function openFeedback() {
            let active = feedbackActiveMode();
            let modesHtml = '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">' +
                FEEDBACK_MODES.map(function (m) {
                    return '<label style="font-size:12px; background:#f0f0f0; border-radius:4px; padding:4px 8px;">' +
                        '<input type="checkbox" class="feedback-mode-cb" value="' + m[0] + '"' + (m[0] === active ? ' checked' : '') + '> ' + m[1] + '</label>';
                }).join('') + '</div>';
            let html = '<div style="text-align:left;">' +
                '<textarea id="feedback-text" placeholder="想说什么都行——卡住了、看不懂、觉得哪里不好玩……" style="width:100%; box-sizing:border-box; height:100px; font-size:13px; padding:8px; border:1px solid #ccc; border-radius:5px; resize:vertical;"></textarea>' +
                '<div style="font-size:11px; color:#999; margin-top:8px;">这条反馈跟哪个/哪些模式有关？（可多选）</div>' + modesHtml +
                '<div style="font-size:11px; color:#999; margin-top:8px;">会顺便带上你的 ID（' + dispName(gState.id) + '）。直接提交就行，不用注册任何账号；也可以选"用邮件发"。</div>' +
                '</div>';
            showSysModal('反馈', html, [
                { label: '提交反馈', color: '#24292e', onClick: function () { feedbackSend(); } },
                { label: '用邮件发', color: '#5cb85c', onClick: function () { feedbackSend(true); } },
                { label: '取消' }
            ]);
        }
        function feedbackBuildBody(text, modes) {
            let meta = 'ID: ' + dispNameText(gState.id) + '\n模式: ' + (modes.length ? modes.join('、') : '（没选）') + '\n时间: ' + new Date().toLocaleString();
            return text + '\n\n——\n' + meta;
        }
        function feedbackSend(viaEmail) {
            let box = document.getElementById('feedback-text');
            let text = box ? box.value.trim() : '';
            if (!text) { showSysModal('提示', '写点什么再发吧', [{ label: '确定' }]); return; }
            let modes = Array.from(document.querySelectorAll('.feedback-mode-cb:checked')).map(function (cb) { return cb.value; });
            let body = feedbackBuildBody(text, modes);
            let title = '[反馈] ' + text.slice(0, 40).replace(/\n/g, ' ') + (text.length > 40 ? '…' : '');
            if (viaEmail) { feedbackMailto(title, body); return; }
            feedbackSubmit(title, body, 'feedback',
                function () { blazeFlash('反馈已提交，谢谢！'); },
                function () { blazeFlash('自动提交失败，已复制内容并打开 GitHub 页面'); });
        }

        // 游玩记录：只是你自己遇到过的人的本地小名单，不是全网玩家统计——
        // 没有后端，没法知道谁没跟你联机过就在玩。跟反馈一个套路，
        // 想真的交给开发者看就点"提交"，走同一条 GitHub issue 预填链接。
        function openPlayLog() {
            let ids = Object.keys(playLog).sort(function (a, b) { return playLog[b].lastSeen - playLog[a].lastSeen; });
            let rows = ids.length ? ids.map(function (id) {
                let e = playLog[id], s = e.stats || {};
                let statsTxt = s.mcoin === undefined ? '（还没收到数据）' :
                    chatEscape(s.mcoin + ' 猫盾币　皮肤 ' + s.skins + '　彩蛋 ' + s.eggs +
                        '　惊魂夜 ' + s.nightRank + '　超燃 ' + s.blazeRank);
                return '<tr><td style="padding:4px 8px; border-top:1px solid #eee;">' + dispName(id) + '</td>' +
                    '<td style="padding:4px 8px; border-top:1px solid #eee; color:#888; font-size:11px;">' +
                    new Date(e.firstSeen).toLocaleDateString() + '</td>' +
                    '<td style="padding:4px 8px; border-top:1px solid #eee; color:#888; font-size:11px;">' +
                    new Date(e.lastSeen).toLocaleString() + '</td>' +
                    '<td style="padding:4px 8px; border-top:1px solid #eee; text-align:center;">' + e.timesSeen + '</td>' +
                    '<td style="padding:4px 8px; border-top:1px solid #eee; font-size:11px;">' + statsTxt + '</td></tr>';
            }).join('') : '<tr><td colspan="5" style="padding:14px; color:#999; text-align:center;">还没遇到过人。跟别人进同一个房间就会记下来。</td></tr>';
            let html = '<div style="text-align:left;">' +
                '<div style="font-size:11px; color:#999; margin-bottom:8px;">只记你遇到过的人。</div>' +
                '<div style="max-height:320px; overflow:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">' +
                '<tr style="color:#888; text-align:left;"><th style="padding:4px 8px;">ID</th><th style="padding:4px 8px;">第一次</th>' +
                '<th style="padding:4px 8px;">最近一次</th><th style="padding:4px 8px;">次数</th><th style="padding:4px 8px;">上次看到的数据</th></tr>' +
                rows + '</table></div></div>';
            showSysModal('游玩记录　共 ' + ids.length + ' 人', html, [
                { label: '提交给开发者', color: '#24292e', onClick: function () { playLogSubmit(); } },
                { label: '用邮件发', color: '#5cb85c', onClick: function () { playLogSubmit(true); } },
                { label: '关闭' }
            ]);
        }
        function playLogSubmit(viaEmail) {
            let ids = Object.keys(playLog);
            if (!ids.length) { showSysModal('提示', '还没记录到任何人，先联机玩一会儿再提交', [{ label: '确定' }]); return; }
            let lines = ids.sort().map(function (id) {
                let e = playLog[id], s = e.stats || {};
                return dispNameText(id) + '　首次 ' + new Date(e.firstSeen).toLocaleDateString() +
                    '　最近 ' + new Date(e.lastSeen).toLocaleString() + '　次数 ' + e.timesSeen +
                    '　币 ' + (s.mcoin === undefined ? '?' : s.mcoin) + '　皮肤 ' + (s.skins === undefined ? '?' : s.skins) +
                    '　彩蛋 ' + (s.eggs === undefined ? '?' : s.eggs) +
                    '　惊魂夜 ' + (s.nightRank || '?') + '　超燃 ' + (s.blazeRank || '?');
            });
            let body = '提交者: ' + dispNameText(gState.id) + '\n时间: ' + new Date().toLocaleString() + '\n记录到 ' + ids.length + ' 人\n\n' + lines.join('\n');
            let title = '[游玩记录] ' + dispNameText(gState.id) + ' 提交，共 ' + ids.length + ' 人';
            if (viaEmail) { feedbackMailto(title, body); return; }
            feedbackSubmit(title, body, 'playlog',
                function () { blazeFlash('游玩记录已提交，谢谢！'); },
                function () { blazeFlash('自动提交失败，已复制内容并打开 GitHub 页面'); });
        }

        function openEggBook() {
            if (!gState.eggs) loadEggs();
            let total = Object.keys(EGGS).length, got = eggCount();
            let html = '<div style="font-size:13px; color:#666; margin-bottom:10px;">已解锁 ' + got + ' / ' + total + '</div>';
            html += '<div style="max-height:320px; overflow-y:auto; text-align:left;">';
            Object.keys(EGGS).forEach(function (id) {
                let e = EGGS[id], has = !!gState.eggs[id];

                let hint = has ? '' : (e.hidden ? '<div style="font-size:11px; color:#bbb; margin-top:3px;">？？？（成就）</div>'
                    : '<div style="font-size:11px; color:#888; margin-top:3px;">' + e.how + '</div>');
                html += '<div style="padding:8px 10px; margin-bottom:6px; border-radius:5px; background:' + (has ? '#f3e9fb' : '#f0f0f0') + ';">' +
                    '<div style="font-weight:bold; color:' + (has ? '#7b3fa0' : '#aaa') + ';">' + (has ? e.name : '？？？') +
                    '<span style="font-size:11px; font-weight:normal; color:#999;">　' + (e.kind || '') + '</span></div>' +
                    hint +
                    (has ? '<div style="font-size:12px; color:#555; margin-top:5px;">' + e.text + '</div>' : '') +
                    '</div>';
            });
            html += '</div>';
            showSysModal('彩蛋图鉴', html, [{ label: '关闭', color: '#666' }]);
        }

        // 测试用：只有你自己的技能没有冷却（AI 照常吃冷却，不然对面无限放技能没法打）。
        let BLAZE_TEST_NO_CD = false;
        // 测试用：按 Q 直接跳过这一局，判给目前赢得少的那一方。
        let BLAZE_TEST_SKIP_KEY = false;
        // 测试用：选卡不计时，想看多久看多久。
        let BLAZE_TEST_NO_PERK_TIMER = false;

