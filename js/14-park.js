        // ══════════════════════════════════════════════════════════
        //  猫盾乐园：不用写代码的"积木编程"——选积木、填参数、拼成一串
        //  就是一个能玩的小游戏。别人玩得越多，设计者赚的乐园币越多。
        //  没有服务器存不了全网大厅，退而求其次——分享码本身就带着
        //  「作者是谁」，作者在同一个房间时实时记功。
        //  自带两个官方难度，本身也是用同一套积木拼的，当范例。
        // ══════════════════════════════════════════════════════════
        const PARK_COLOR_NAMES = { orange: '橙色', blue: '蓝色', red: '红色', green: '绿色' };
        const PARK_COLOR_HEX = { orange: 0xffb300, blue: 0x42a5f5, red: 0xef5350, green: 0x66bb6a };
        const PARK_EFFECT_NAMES = { score: '+1 分', lose1: '-1 分', win: '直接获胜', lose: '直接失败', addtime: '+10 秒时间', varinc: '变量 +N', vardec: '变量 -N', remove: '只是消失' };
        const PARK_ARENA_NAMES = { small: '小', medium: '中', large: '大' };
        const PARK_ARENA_HALF = { small: 24, medium: 40, large: 64 };
        const PARK_SPEED_NAMES = { slow: '慢', normal: '正常', fast: '快' };
        const PARK_SPEED_VAL = { slow: 20, normal: 32, fast: 46 };
        const PARK_COND_OPS = { gt: '>', lt: '<', eq: '=' };
        const PARK_STEP_SPEED = 8;   // "前进 N 步"里，1 步等于走这么远，走完这么多秒结束这条指令
        const PARK_BLOCK_PRICE = { var: 30, condition: 40, turnrandom: 20 };
        // 以前"变量/判断/随机转向"要花猫盾币解锁；创作界面只留基础积木后这三块不卖了，买过的退钱（只退一次）
        function parkRefundOld() {
            if (gState.parkRefunded || !gState.id) return;
            gState.parkRefunded = true;
            let back = Object.keys(gState.parkUnlocked || {}).reduce(function (a, k) { return a + (gState.parkUnlocked[k] ? (PARK_BLOCK_PRICE[k] || 0) : 0); }, 0);
            if (back > 0) { coinsAdd(null, back); setTimeout(function () { blazeFlash('乐园积木简化了，买过的积木退你 ' + back + ' 猫盾币'); }, 1500); }
            saveProgress();
        }
        const PARK_BUILTIN = {
            easy: {
                name: '鱼干捕手·简单', blocks: [
                    { type: 'spawn', color: 'orange', every: 1.6 },
                    { type: 'fall', color: 'orange', speed: 7 },
                    { type: 'touch', color: 'orange', effect: 'score' },
                    { type: 'win', score: 8 },
                    { type: 'time', seconds: 90, result: 'lose' }
                ]
            },
            hard: {
                name: '鱼干捕手·挑战', blocks: [
                    { type: 'spawn', color: 'orange', every: 0.9 },
                    { type: 'fall', color: 'orange', speed: 14 },
                    { type: 'spawn', color: 'red', every: 1.8 },
                    { type: 'fall', color: 'red', speed: 6 },
                    { type: 'turnplayer', color: 'red' },
                    { type: 'touch', color: 'orange', effect: 'score' },
                    { type: 'touch', color: 'red', effect: 'lose1' },
                    { type: 'win', score: 15 },
                    { type: 'time', seconds: 90, result: 'lose' }
                ]
            }
        };
        let parkEditorBlocks = [
            { type: 'spawn', color: 'orange', every: 1.6 },
            { type: 'fall', color: 'orange', speed: 7 },
            { type: 'touch', color: 'orange', effect: 'score' },
            { type: 'win', score: 8 },
            { type: 'time', seconds: 90, result: 'lose' }
        ];

        function parkEncode(by, p) {
            try { return btoa(unescape(encodeURIComponent(JSON.stringify({ by: by, p: p })))); } catch (e) { return ''; }
        }
        function parkDecode(code) {
            try { return JSON.parse(decodeURIComponent(escape(atob(code.trim())))); } catch (e) { return null; }
        }
        // 把一串积木"编译"成能跑的小游戏配置。同颜色的 生成/下落/前进/等待/转向 积木
        // 各自归堆——生成决定多久刷一个，下落决定要不要掉，前进/等待/转向拼成这个颜色
        // 反复循环的一套动作（没有下落也没有前进/转向的颜色，就乖乖悬在原地）。
        function parkCompile(blocks) {
            let spawnDefs = {}, scripts = {}, fallSpeeds = {}, rules = {}, vars = {}, conditions = [];
            let winScore = null, duration = 60, timeUpResult = 'lose';
            let arenaHalf = PARK_ARENA_HALF.medium, playerSpeed = PARK_SPEED_VAL.normal;
            (blocks || []).forEach(function (b) {
                let c = b.color || 'orange';
                if (b.type === 'spawn') spawnDefs[c] = Math.max(0.2, +b.every || 1.5);
                else if (b.type === 'fall') fallSpeeds[c] = Math.max(1, +b.speed || 8);
                else if (b.type === 'step') (scripts[c] = scripts[c] || []).push({ op: 'step', n: Math.max(0.5, +b.n || 3) });
                else if (b.type === 'wait') (scripts[c] = scripts[c] || []).push({ op: 'wait', s: Math.max(0.1, +b.s || 1) });
                else if (b.type === 'turnplayer') (scripts[c] = scripts[c] || []).push({ op: 'turnplayer' });
                else if (b.type === 'turnrandom') (scripts[c] = scripts[c] || []).push({ op: 'turnrandom' });
                else if (b.type === 'chase') (scripts[c] = scripts[c] || []).push({ op: 'turnplayer' }, { op: 'step', n: 3 });
                else if (b.type === 'touch') rules[c] = { effect: b.effect || 'score', varName: (b.varName || '').trim(), amount: +b.amount || 1 };
                else if (b.type === 'var') vars[(b.name || '变量').trim()] = +b.initial || 0;
                else if (b.type === 'condition') conditions.push({ varName: (b.varName || '').trim(), op: b.op || 'gt', value: +b.value || 0, result: b.result === 'win' ? 'win' : 'lose' });
                else if (b.type === 'win') winScore = Math.max(1, +b.score || 10);
                else if (b.type === 'time') { duration = Math.max(10, +b.seconds || 60); timeUpResult = b.result === 'win' ? 'win' : 'lose'; }
                else if (b.type === 'arena') arenaHalf = PARK_ARENA_HALF[b.size] || PARK_ARENA_HALF.medium;
                else if (b.type === 'speed') playerSpeed = PARK_SPEED_VAL[b.level] || PARK_SPEED_VAL.normal;
            });
            // 规则/条件里提到的变量，就算没放"定义变量"积木也从 0 开始，不至于报废整局
            Object.keys(rules).forEach(function (c) { let v = rules[c].varName; if (v && !(v in vars)) vars[v] = 0; });
            conditions.forEach(function (c) { if (c.varName && !(c.varName in vars)) vars[c.varName] = 0; });
            let colors = {};
            Object.keys(spawnDefs).forEach(function (c) { colors[c] = 1; });
            if (!Object.keys(colors).length) colors.orange = 1;
            let spawners = Object.keys(colors).map(function (c) {
                return { color: c, every: spawnDefs[c] || 1.5, script: scripts[c] || [], fallSpeed: fallSpeeds[c] || 0, t: 0 };
            });
            if (!Object.keys(rules).length) rules.orange = { effect: 'score', varName: '', amount: 1 };
            if (winScore === null && !conditions.length) winScore = 10;
            return {
                spawners: spawners, rules: rules, vars: vars, conditions: conditions,
                winScore: winScore, duration: duration, timeUpResult: timeUpResult,
                arenaHalf: arenaHalf, playerSpeed: playerSpeed
            };
        }

        function parkImportPlay() {
            let raw = document.getElementById('park-import-code').value;
            let data = parkDecode(raw);
            if (!data || !Array.isArray(data.p)) { showSysModal('提示', '这个分享码看不懂，检查一下有没有复制完整', [{ label: '确定' }]); return; }
            parkBegin({ name: '好友分享的小游戏', blocks: data.p, creatorId: data.by });
        }

        function parkBuildArena() {
            let half = park.compiled.arenaHalf, size = half * 2;
            let floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color: 0xb3e5fc }));
            floor.rotation.x = -Math.PI / 2; scene.add(floor); park.meshes.push(floor);
            function wall(x, z, w, d) {
                let m = new THREE.Mesh(new THREE.BoxGeometry(w, 10, d), new THREE.MeshLambertMaterial({ color: 0x81c784 }));
                m.position.set(x, 5, z); scene.add(m); park.meshes.push(m);
            }
            wall(0, -half, size, 3); wall(0, half, size, 3); wall(-half, 0, 3, size); wall(half, 0, 3, size);
        }
        // 有下落速度的从天上摔下来；没有下落（只有前进/转向脚本，或者干脆什么运动积木都没放）
        // 的直接生成在够得着的高度，不然一个不会掉的东西生成在天上就永远碰不到了。
        function parkSpawnItem(sp) {
            let range = park.compiled.arenaHalf - 6;
            let x = (Math.random() - 0.5) * range * 2, z = (Math.random() - 0.5) * range * 2;
            let y = sp.fallSpeed > 0 ? 44 : 8;
            let mesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshLambertMaterial({ color: PARK_COLOR_HEX[sp.color] || 0xffb300 }));
            mesh.position.set(x, y, z);
            scene.add(mesh);
            let a0 = Math.random() * Math.PI * 2;
            park.items.push({
                mesh: mesh, p: new THREE.Vector3(x, y, z), color: sp.color, fallSpeed: sp.fallSpeed,
                script: sp.script, pc: 0, instrProg: 0, dir: { x: Math.sin(a0), z: Math.cos(a0) }, age: 0
            });
        }
        // 每个物品自己的"前进/等待/转向"小程序——按顺序执行，走到列表末尾就从头再来，
        // 一直循环。这就是"很多小积木拼成一段行为"，不是一个下拉框选死一种运动方式。
        function parkRunItemScript(it, dt) {
            let script = it.script;
            if (!script || !script.length) return;
            let instr = script[it.pc % script.length];
            if (instr.op === 'step') {
                it.p.x += it.dir.x * PARK_STEP_SPEED * dt; it.p.z += it.dir.z * PARK_STEP_SPEED * dt;
                it.instrProg += PARK_STEP_SPEED * dt;
                if (it.instrProg >= instr.n) { it.pc++; it.instrProg = 0; }
            } else if (instr.op === 'wait') {
                it.instrProg += dt;
                if (it.instrProg >= instr.s) { it.pc++; it.instrProg = 0; }
            } else if (instr.op === 'turnplayer') {
                let dx = park.p.x - it.p.x, dz = park.p.z - it.p.z, n = Math.hypot(dx, dz) || 1;
                it.dir = { x: dx / n, z: dz / n };
                it.pc++; it.instrProg = 0;
            } else if (instr.op === 'turnrandom') {
                let a = Math.random() * Math.PI * 2;
                it.dir = { x: Math.sin(a), z: Math.cos(a) };
                it.pc++; it.instrProg = 0;
            }
        }
        function parkPlayerMove(dt) {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1;
            if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            if (fwd || strafe) {
                let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe, n = Math.hypot(mx, mz) || 1;
                let sp = park.compiled.playerSpeed;
                park.p.x += mx / n * sp * dt; park.p.z += mz / n * sp * dt;
                park.faceDir = { x: mx / n, z: mz / n };
            }
            let half = park.compiled.arenaHalf - 2;
            park.p.x = Math.max(-half, Math.min(half, park.p.x));
            park.p.z = Math.max(-half, Math.min(half, park.p.z));
        }
        function parkHud() {
            let remain = Math.max(0, park.compiled.duration - park.clock);
            let scoreTxt = park.compiled.winScore !== null ? (park.score + ' / ' + park.compiled.winScore) : ('得分 ' + park.score);
            let varNames = Object.keys(park.vars);
            let varTxt = varNames.length ? '　' + varNames.map(function (n) { return n + ':' + park.vars[n]; }).join(' ') : '';
            document.getElementById('blaze-score').innerText = scoreTxt + '　' + Math.ceil(remain) + 's';
            document.getElementById('blaze-round').innerText = (park.program.name || '猫盾乐园') + (padOn() ? '　摇杆移动去碰物品' : '　WASD 移动去碰物品') + varTxt;
        }
        // A3：别人玩了你做的乐园游戏，分你一份猫盾币。只认房间里的人，金额 1～30，
        // 同一个人 10 分钟内最多 3 次；不合规矩的整条丢掉。sender 由房主按连接写入（见 netDeliver）。
        const PARK_CREDIT_MAX = 30, PARK_CREDIT_WINDOW = 10 * 60 * 1000, PARK_CREDIT_PER_WINDOW = 3;
        let parkCreditLog = {};
        function parkOnCredit(msg) {
            let from = msg.sender, amt = msg.amount;
            if (!from || from === gState.id || !roomPeers[from]) return;
            if (typeof amt !== 'number' || !isFinite(amt) || amt !== Math.floor(amt) || amt <= 0 || amt > PARK_CREDIT_MAX) return;
            let now = Date.now();
            let log = (parkCreditLog[from] || []).filter(function (t) { return now - t < PARK_CREDIT_WINDOW; });
            if (log.length >= PARK_CREDIT_PER_WINDOW) { parkCreditLog[from] = log; return; }
            log.push(now); parkCreditLog[from] = log;
            coinsAdd('park', amt);
            blazeFlash('有人玩了你做的乐园小游戏，+' + amt + ' 猫盾币！');
        }
        function parkEndMatch(won) {
            if (!park || park.over) return;
            park.over = true;
            let totalSpeed = park.compiled.spawners.reduce(function (s, sp) { return s + sp.fallSpeed; }, 0);
            let baseReward = Math.round(8 + (park.compiled.winScore || 10) * 1.2 + totalSpeed * 0.3);
            let reward = won ? baseReward : Math.max(1, Math.floor(baseReward * 0.3));
            coinsAdd('park', reward);
            if (typeof achState === 'function') achState().modes.park = 1;
            if (park.program.creatorId && park.program.creatorId !== gState.id && roomPeers[park.program.creatorId]) {
                let credit = Math.min(PARK_CREDIT_MAX, Math.round(reward * 0.5));
                if (credit > 0) bc.postMessage({ type: 'PARK_CREDIT', target: '*', sender: gState.id, to: park.program.creatorId, amount: credit });
            }
            showSysModal(won ? '通关！' : '没能达成目标', '获得 ' + reward + ' 猫盾币' + (won ? '' : '（安慰奖）'),
                [{ label: '返回大厅', color: '#5cb85c', onClick: function () { parkExit(); } }]);
        }
        function parkTick(dt) {
            park.clock += dt;
            parkPlayerMove(dt);
            park.mesh.position.set(park.p.x, park.p.y, park.p.z);
            if (park.faceDir) park.mesh.rotation.y = Math.atan2(park.faceDir.x, park.faceDir.z);
            tickAccStarOrbit(park.mesh.userData, dt);
            if (park.clock < park.compiled.duration) {
                park.compiled.spawners.forEach(function (sp) {
                    sp.t -= dt;
                    if (sp.t <= 0) { parkSpawnItem(sp); sp.t = sp.every; }
                });
            }
            let outcome = null;
            park.items = park.items.filter(function (it) {
                it.age += dt;
                if (it.fallSpeed > 0) it.p.y -= it.fallSpeed * dt;
                parkRunItemScript(it, dt);
                it.mesh.position.copy(it.p);
                // 碰到就算吃到——不用等它掉到脚边贴地才算数，身体+耳朵这一整段高度碰到都数，
                // 耳朵尖大概在 y=14 上下，给到 15 留一点余量。
                let touching = Math.hypot(it.p.x - park.p.x, it.p.z - park.p.z) < 8 && it.p.y >= -1 && it.p.y <= 15;
                if (touching) {
                    let rule = park.compiled.rules[it.color] || { effect: 'remove' };
                    if (rule.effect === 'score') park.score++;
                    else if (rule.effect === 'lose1') park.score = Math.max(0, park.score - 1);
                    else if (rule.effect === 'win') outcome = true;
                    else if (rule.effect === 'lose') outcome = false;
                    else if (rule.effect === 'addtime') park.clock = Math.max(0, park.clock - 10);
                    else if (rule.effect === 'varinc' && rule.varName) park.vars[rule.varName] = (park.vars[rule.varName] || 0) + rule.amount;
                    else if (rule.effect === 'vardec' && rule.varName) park.vars[rule.varName] = (park.vars[rule.varName] || 0) - rule.amount;
                    scene.remove(it.mesh); return false;
                }
                if (it.p.y < -3 || it.p.y > 70 || it.age > 30) { scene.remove(it.mesh); return false; }
                return true;
            });
            // 变量判断积木：每一帧都检查一遍，谁先满足条件谁先算数
            park.compiled.conditions.forEach(function (c) {
                if (outcome !== null || !c.varName) return;
                let val = park.vars[c.varName] || 0;
                let hit = c.op === 'gt' ? val > c.value : c.op === 'lt' ? val < c.value : val === c.value;
                if (hit) outcome = (c.result === 'win');
            });
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0;
            if (dir.lengthSq() < 0.0001) dir.set(0, 0, -1); else dir.normalize();
            camera.position.set(park.p.x - dir.x * 22, park.p.y + 20, park.p.z - dir.z * 22);
            parkHud();
            if (!park.over) {
                if (outcome === true) parkEndMatch(true);
                else if (outcome === false) parkEndMatch(false);
                else if (park.compiled.winScore !== null && park.score >= park.compiled.winScore) parkEndMatch(true);
                else if (park.clock >= park.compiled.duration) parkEndMatch(park.compiled.timeUpResult === 'win');
            }
            renderer.render(scene, camera);
        }
        function parkLoop() {
            if (!park) return;
            let now = performance.now();
            let dt = Math.min(0.05, (now - park.last) / 1000);
            park.last = now;
            if (!park.over) parkTick(dt);
            park.raf = requestAnimationFrame(parkLoop);
        }
        function parkTouchUI(on) {
            ['blaze-jump-btn', 'blaze-skill1-btn', 'blaze-skill2-btn', 'blaze-card-btn', 'blaze-atk-btn',
                'race-dash-btn', 'race-skill-btn', 'race-item-btn', 'race-jump-btn', 'run-btn'].forEach(function (id) {
                    let e = document.getElementById(id); if (e) e.style.display = 'none';
                });
            let stats = document.getElementById('blaze-stats-btn'); if (stats) stats.style.display = 'none';
            let skillbar = document.getElementById('blaze-skillbar'); if (skillbar) skillbar.innerHTML = '';
            let skillTxt = document.getElementById('blaze-skill'); if (skillTxt) skillTxt.innerText = '';
            document.getElementById('blaze-bottom').style.display = 'none';
            let cross = document.getElementById('blaze-crosshair-anchor');
            if (cross && cross.previousElementSibling) cross.previousElementSibling.style.display = on ? 'none' : '';
            let ex = document.getElementById('blaze-exit-btn');
            if (ex) ex.onclick = on ? parkExit : blazeExit;
            ['blaze-stats', 'blaze-perk', 'blaze-ffa-cards'].forEach(function (id) {
                let e = document.getElementById(id); if (e && on) e.classList.add('hidden');
            });
        }
        function parkBegin(program) {
            showModeIntroIfFirstTime('park');
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.add('hidden');
            document.getElementById('blaze-hud').classList.remove('hidden');
            let pe = document.getElementById('blaze-perk'); if (pe) pe.classList.add('hidden');
            if (blaze) { try { blazeExit(); } catch (e) { } }
            if (race) { try { raceExit(); } catch (e) { } }
            if (jail) { try { jailExit(); } catch (e) { } }
            if (dodge) { try { dodgeExit(); } catch (e) { } }
            if (escapeRoom) { try { escapeExit(); } catch (e) { } }
            ensureScene();
            scene.background = new THREE.Color(0x81d4fa);
            scene.fog = new THREE.FogExp2(0x81d4fa, 0.002);

            let mesh = raceMakeBody(mySkinColor(0xffca28), 0, false, gState.acc, myFace());
            scene.add(mesh);
            let compiled = parkCompile(program.blocks);
            park = {
                over: false, clock: 0, program: program, compiled: compiled, score: 0, vars: Object.assign({}, compiled.vars),
                meshes: [], items: [],
                p: new THREE.Vector3(0, 0, 0), faceDir: { x: 0, z: 1 }, mesh: mesh,
                last: performance.now(), raf: null
            };
            parkBuildArena();
            camera.rotation.set(0, Math.PI, 0);

            document.body.onmousedown = function (e) {
                if (!park || park.over) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal'))) return;
                if (!document.pointerLockElement) { safeLockPointer(); }
            };
            document.body.onmouseup = null;
            parkTouchUI(true);
            bgmStart();
            parkLoop();
        }
        function parkExit() {
            if (!park) return;
            park.over = true;
            if (park.raf) cancelAnimationFrame(park.raf);
            if (document.pointerLockElement) document.exitPointerLock();
            (park.meshes || []).forEach(function (m) { scene.remove(m); });
            (park.items || []).forEach(function (it) { scene.remove(it.mesh); });
            scene.remove(park.mesh);
            park = null;
            parkTouchUI(false);
            bgmStop();
            document.body.onmousedown = null;
            document.getElementById('blaze-hud').classList.add('hidden');
            nav('screen-lobby'); selectGameMode('park');
            makerAfterGame();
        }

