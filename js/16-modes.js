        // ══════════════════════════════════════════════════════════
        //  新模式通用框架：推推乐 / 爬塔
        //  三个模式共用：开局（组队直接开 / 没组队走通用匹配，凑不齐用 AI 补）、
        //  猫盾身体 + 头顶名字、第三人称镜头、惯性移动/跳跃/击退、联机同步、结算和猫盾币。
        //  每个模式只在 NM_DEFS 里写自己的规则（场地、AI、胜负、HUD）。
        //  联机的分工跟松饼大作战一样：每个真人只模拟、只广播自己；机器人和胜负只归房主。
        //  打中别人（击退/定身）发给"那个人归谁模拟"的那台机器去执行。
        // ══════════════════════════════════════════════════════════
        let nm = null;
        const NM_DEFS = {};
        const NM_TEAM_COL = [0x29b6f6, 0xec407a];

        function nmIsHost() { return !nm || !nm.net || nm.host === gState.id; }
        function nmMine(a) { return a.isPlayer || (!a.netId && nmIsHost()); }

        // 按键按得比一帧还短也算按过（蓄力模式靠这个补一帧）
        window.addEventListener('keydown', function (e) { if (nm && nm.def.charge && e.key && e.key.toLowerCase() === 'e') nm.latch = true; });
        window.addEventListener('mousedown', function (e) { if (nm && nm.def.charge && e.button === 0) nm.latch = true; });

        function nmStartGo(mode, opt) {
            opt = opt || {};
            let def = NM_DEFS[mode];
            let cap = def.count(opt);
            let go = function (ids) {
                let plan = ids.slice(0, cap).map(function (id) { return { id: id }; });
                // 爬塔按日期定种子：当天所有人爬的是同一座塔（排行榜才公平）
                let seed = mode === 'tower' ? towerDaySeed() : (Math.floor(Math.random() * 1000000) || 1);
                if (plan.length > 1) bc.postMessage({ type: 'NM_START', target: '*', sender: gState.id, mode: mode, plan: plan, host: gState.id, seed: seed, opt: opt });
                nmBegin(mode, plan, gState.id, seed, opt);
            };
            if (cap <= 1) { go([gState.id]); return; }
            if (lobbyParty.length > 0) { go([gState.id].concat(lobbyParty)); return; }
            mmStart(mode, cap, go);
        }
        function nmOnStart(m) {
            if (!m.plan || !m.plan.some(function (q) { return q.id === gState.id; })) return;
            if (!NM_DEFS[m.mode] || !netStartAllowed(m.mode, m)) return;
            mmCancel();
            if (nm) nmTeardown();
            nmBegin(m.mode, m.plan, m.host, m.seed, m.opt || {});
        }

        function nmAdd(obj) { scene.add(obj); nm.meshes.push(obj); return obj; }

        function nmBegin(mode, plan, hostId, seed, opt) {
            let def = NM_DEFS[mode];
            showModeIntroIfFirstTime(mode);
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
            if (park) { try { parkExit(); } catch (e) { } }
            if (cake) { try { cakeExit(); } catch (e) { } }
            ensureScene();
            clearMazeMeshes();
            scene.background = new THREE.Color(def.sky);
            scene.fog = new THREE.FogExp2(def.sky, def.fog || 0.0012);
            gameSeed = seed;
            nm = {
                mode: mode, def: def, opt: opt, over: false, clock: 0, actors: [], fx: [], meshes: [],
                host: hostId, plan: plan, seed: seed,
                net: plan.some(function (q) { return q.id && q.id !== gState.id; }),
                sendSelf: 0, sendWorld: 0, last: performance.now(), raf: null, outOrder: [], specIdx: 0
            };
            def.build(nm);
            let n = def.count(opt);
            let spawns = def.spawns(nm, n);
            let pool = HUB_BOT_NAMES.slice();
            for (let i = 0; i < n; i++) {
                let q = plan[i] || {};
                let isP = q.id === gState.id;
                let team = def.teams ? (i % 2) : -1;
                let base = team >= 0 ? NM_TEAM_COL[team] : RACE_COLORS[i % RACE_COLORS.length];
                let col = team >= 0 ? base : (isP ? mySkinColor(base) : (q.id ? base : aiSkinColor(base)));
                let mesh = raceMakeBody(col, 0, true, isP ? gState.acc : (q.id ? peerAccOf(q.id) : aiRandomAcc()), isP ? myFace() : (q.id ? peerFaceOf(q.id) : aiRandomFace()));
                nmAdd(mesh);
                let name = q.id ? dispName(q.id) : (pool.length ? pool.splice(Math.floor(seededRandom() * pool.length), 1)[0] : ('猫盾' + (i + 1)));
                // name 是 dispName() 转义过的，头顶名字画在画布上要用 ID，nightMakeLabel 自己会取原文
                let label = nightMakeLabel(q.id || name, col, false, isP ? myTitle() : (q.id ? peerTitleOf(q.id) : aiRandomTitle()));
                label.position.y = 16; mesh.add(label);
                if (isP) label.visible = false;
                let sp = spawns[i];
                let a = {
                    idx: i, isPlayer: isP, netId: q.id || null, name: name, team: team, col: col,
                    p: new THREE.Vector3(sp.x, sp.y || 0, sp.z), mvx: 0, mvz: 0, vy: 0, kx: 0, kz: 0,
                    onGround: true, facing: sp.facing || 0, out: false, kills: 0, actCd: 0, stunT: 0,
                    mesh: mesh, target: null, aiT: Math.random(), animT: 0, spd: 0
                };
                if (def.initActor) def.initActor(nm, a);
                nm.actors.push(a);
            }
            nm.me = nm.actors.filter(function (a) { return a.isPlayer; })[0] || nm.actors[0];
            camera.rotation.set(-0.15, (def.camYaw ? def.camYaw(nm) : nm.me.facing + Math.PI), 0);
            document.body.onmousedown = function (e) {
                if (!nm || nm.over) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal'))) return;
                if (!document.pointerLockElement) safeLockPointer();
            };
            nmTouchUI(true);
            let ex = document.getElementById('blaze-exit-btn'); if (ex) ex.onclick = nmExit;
            bgmStart();
            nmLoop();
        }

        function nmTouchUI(on) {
            ['blaze-atk-btn', 'blaze-skill1-btn', 'blaze-skill2-btn', 'blaze-card-btn', 'blaze-jump-btn',
                'race-dash-btn', 'race-skill-btn', 'race-item-btn'].forEach(function (id) {
                    let e = document.getElementById(id); if (e) e.style.display = 'none';
                });
            let pad = gState.control === 'pad';
            let jb = document.getElementById('race-jump-btn'); if (jb) { jb.innerText = '跳'; jb.style.display = (on && pad) ? 'flex' : 'none'; }
            let ab = document.getElementById('nm-act-btn');
            if (ab) { ab.innerText = on && nm ? (nm.def.actLabel || '') : ''; ab.style.display = (on && pad && nm && nm.def.actLabel) ? 'flex' : 'none'; }
            let ib = document.getElementById('race-item-btn');
            if (ib) {
                let show = on && pad && nm && nm.def.useItem;
                ib.innerText = '道具'; ib.style.display = show ? 'flex' : 'none';
                if (show) { ib.style.bottom = '290px'; ib.style.right = '30px'; }   // 躲开“推”那颗键
            }
            ['blaze-stats-btn'].forEach(function (id) { let e = document.getElementById(id); if (e) e.style.display = 'none'; });
            let sb = document.getElementById('blaze-skillbar'); if (sb) sb.innerHTML = '';
            let st = document.getElementById('blaze-skill'); if (st) st.innerText = '';
            document.getElementById('blaze-bottom').style.display = 'none';
            ['blaze-stats', 'blaze-perk', 'blaze-ffa-cards'].forEach(function (id) { let e = document.getElementById(id); if (e && on) e.classList.add('hidden'); });
            let bar = document.getElementById('nm-spectate-bar'); if (bar && !on) bar.style.display = 'none';
        }

        // ── 移动：惯性 + 跳 + 重力；地面高度和墙由各模式告诉框架 ──
        function nmWish(a) {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            a.facing = Math.atan2(dir.x, dir.z);
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1;
            if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe;
            let n = Math.hypot(mx, mz);
            let jump = !!(keys[' '] || touchBtn.jump); keys[' '] = false; touchBtn.jump = false;
            let down = !!(keys['lmb'] || keys['e'] || touchBtn.nmHold);
            let tapped = !!touchBtn.nmAct; touchBtn.nmAct = false;
            let act = down || tapped;
            // 按住：蓄力模式要知道键现在是不是按着；按得太快（一帧内按下又松开）靠 latch 补上一帧
            let held = down || tapped || !!nm.latch; nm.latch = false;
            if (!nm.def.actHold) keys['e'] = false;
            let item = !!(keys['q'] || touchBtn.item); keys['q'] = false; touchBtn.item = false;
            // 人朝镜头方向（横着走也是面朝前），推/喷都朝镜头看的方向
            return { x: n > 1 ? mx / n : mx, z: n > 1 ? mz / n : mz, jump: jump, act: act, held: held, item: item, face: a.facing };
        }
        function nmPhysics(a, w, dt) {
            let def = nm.def;
            if (a.actCd > 0) a.actCd -= dt;
            if (a.slipT > 0) a.slipT -= dt;
            if (a.stunT > 0 || a.slipT > 0) {   // 被定住 / 踩了香蕉皮：不能动、不能推、蓄的力也没了
                if (a.stunT > 0) a.stunT -= dt;
                a.chargeT = 0;
                w = { x: 0, z: 0, jump: false, act: false, held: false, item: false, face: w.face };
            }
            let sp = def.speed * (def.speedMul ? def.speedMul(nm, a) : 1) * DAILY_MOD.speedMul;
            let wx = w.x * sp, wz = w.z * sp;
            let grip = def.grip ? def.grip(nm, a) : 1;   // 冰面 < 1：起步和刹车都慢
            let rate = (Math.abs(wx) + Math.abs(wz) > 0.01 ? 1 / 0.16 : 1 / 0.14) * (a.onGround ? 1 : 0.45) * grip;
            let k = Math.min(1, rate * dt);
            a.mvx += (wx - a.mvx) * k; a.mvz += (wz - a.mvz) * k;
            if (w.face !== undefined) a.facing = w.face;
            else if (w.x || w.z) a.facing = Math.atan2(w.x, w.z);
            // 击退冲量单独算，慢慢衰减——被推的那一下是"飞出去"，不是被自己的移动抵消
            let kd = Math.pow(0.08, dt * Math.sqrt(grip));
            a.kx *= kd; a.kz *= kd;
            let dx = (a.mvx + a.kx) * dt, dz = (a.mvz + a.kz) * dt;
            let prevY = a.p.y;
            if (def.blocked) {
                if (!def.blocked(nm, a.p.x + dx, a.p.z, prevY)) a.p.x += dx; else { a.mvx = 0; a.kx *= -0.3; }
                if (!def.blocked(nm, a.p.x, a.p.z + dz, prevY)) a.p.z += dz; else { a.mvz = 0; a.kz *= -0.3; }
            } else { a.p.x += dx; a.p.z += dz; }
            if (def.carry) def.carry(nm, a, dt);
            let g = def.groundAt(nm, a.p.x, a.p.z, prevY);
            let onG = g > -1e8 && a.p.y <= g + 0.05;
            if (w.jump && (onG || a.coyote > 0)) { a.vy = def.jumpV * DAILY_MOD.jumpMul * (def.jumpMul ? def.jumpMul(nm, a) : 1); onG = false; a.coyote = 0; }
            a.vy -= def.gravity * dt;
            a.p.y += a.vy * dt;
            g = def.groundAt(nm, a.p.x, a.p.z, prevY);
            if (g > -1e8 && a.p.y <= g && prevY >= g - 0.8) { a.p.y = g; a.vy = 0; a.onGround = true; a.coyote = 0.1; }
            else { if (a.onGround) a.coyote = 0.1; a.onGround = false; if (a.coyote > 0) a.coyote -= dt; }
            if (def.charge) {
                // 蓄力：按住攒力（最多 def.charge 秒），松手才推；按一下就是普通推
                if (w.held && a.actCd <= 0) a.chargeT = Math.min(def.charge, (a.chargeT || 0) + dt);
                else if (a.chargeT > 0) { let c = a.chargeT; a.chargeT = 0; if (a.actCd <= 0 && def.act) def.act(nm, a, c); }
            } else if (w.act && a.actCd <= 0 && def.act) def.act(nm, a);
            if (w.item && def.useItem) def.useItem(nm, a);
        }
        function nmKnock(b, ix, iz, by, hop) {
            if (!b || b.out) return;
            if (nmMine(b)) {
                if (b.shield && nm.def.popShield) { nm.def.popShield(nm, b); return; }   // 护盾挡掉这一下
                b.kx += ix; b.kz += iz; b.vy = Math.max(b.vy, hop || 16); b.onGround = false;
                if (by) { b.lastHitBy = by.idx; b.lastHitT = nm.clock; }
            } else if (nm.net) {
                bc.postMessage({ type: 'NM_EV', target: '*', sender: gState.id, mode: nm.mode, ev: 'kb', to: b.idx, ix: +ix.toFixed(1), iz: +iz.toFixed(1), by: by ? by.idx : -1, hop: hop || 16 });
            }
        }
        function nmStun(b, t, by) {
            if (!b || b.out) return;
            if (nmMine(b)) { b.stunT = Math.max(b.stunT, t); if (by) { b.lastHitBy = by.idx; b.lastHitT = nm.clock; } }
            else if (nm.net) bc.postMessage({ type: 'NM_EV', target: '*', sender: gState.id, mode: nm.mode, ev: 'stun', to: b.idx, t: t, by: by ? by.idx : -1 });
        }
        // 人挤人：谁归我模拟，我就把谁往外挪一点（不然 AI 和人会叠在一起）
        function nmSeparate() {
            let L = nm.actors.filter(function (a) { return !a.out; });
            for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
                let a = L[i], b = L[j];
                if (Math.abs(a.p.y - b.p.y) > 8) continue;
                let dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, d = Math.hypot(dx, dz);
                if (d > 6 || d < 0.001) continue;
                let push = (6 - d) / 2, nx = dx / d, nz = dz / d;
                if (nmMine(a)) { a.p.x -= nx * push; a.p.z -= nz * push; }
                if (nmMine(b)) { b.p.x += nx * push; b.p.z += nz * push; }
            }
        }
        function nmOut(a, reason) {
            if (a.out) return;
            a.out = true; a.mesh.visible = false;
            nm.outOrder.push(a.idx);
            let by = (a.lastHitBy !== undefined && nm.clock - (a.lastHitT || -99) < 4) ? nm.actors[a.lastHitBy] : null;
            if (by && by !== a) by.kills++;
            nmBurst(a.p.x, Math.max(a.p.y, nm.def.fxY || 0), a.p.z, 0xff7043);
            if (a.isPlayer) blazeFlash(reason || '你出局了');
            else if (by && by.isPlayer) blazeFlash('把 ' + a.name + ' 推下去了！');
            if (a.isPlayer && nm.net) bc.postMessage({ type: 'NM_EV', target: '*', sender: gState.id, mode: nm.mode, ev: 'out', i: a.idx, by: by ? by.idx : -1 });
        }
        function nmBurst(x, y, z, color) {
            for (let i = 0; i < 8; i++) {
                let m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), new THREE.MeshBasicMaterial({ color: color, transparent: true }));
                m.position.set(x, y + 3, z); nmAdd(m);
                nm.fx.push({ o: m, t: 0.6, vx: (Math.random() - 0.5) * 40, vy: 20 + Math.random() * 20, vz: (Math.random() - 0.5) * 40 });
            }
        }
        function nmFxTick(dt) {
            nm.fx = nm.fx.filter(function (f) {
                f.t -= dt;
                if (f.t <= 0) { scene.remove(f.o); return false; }
                f.vy -= 60 * dt;
                f.o.position.x += f.vx * dt; f.o.position.y += f.vy * dt; f.o.position.z += f.vz * dt;
                f.o.material.opacity = Math.min(1, f.t * 2);
                return true;
            });
        }

        // ── 联机 ──
        function nmNetTick(dt) {
            if (!nm.net) return;
            nm.sendSelf -= dt;
            if (nm.sendSelf <= 0 && !nm.me.out) {
                nm.sendSelf = 1 / 15;
                let me = nm.me;
                bc.postMessage({ type: 'NM_ME', target: '*', sender: gState.id, mode: nm.mode, i: me.idx, x: +me.p.x.toFixed(1), y: +me.p.y.toFixed(1), z: +me.p.z.toFixed(1), f: +me.facing.toFixed(2), s: me.stunT > 0 ? 1 : 0 });
            }
            if (!nmIsHost()) return;
            nm.sendWorld -= dt;
            if (nm.sendWorld > 0) return;
            nm.sendWorld = 1 / 10;
            bc.postMessage({
                type: 'NM_W', target: '*', sender: gState.id, mode: nm.mode, clock: +nm.clock.toFixed(2),
                a: nm.actors.map(function (a) { return { i: a.idx, x: +a.p.x.toFixed(1), y: +a.p.y.toFixed(1), z: +a.p.z.toFixed(1), f: +(a.facing || 0).toFixed(2), o: a.out ? 1 : 0, k: a.kills || 0 }; }),
                s: nm.def.worldState ? nm.def.worldState(nm) : null
            });
        }
        function nmOnMe(m) {
            if (!nm || nm.mode !== m.mode || m.sender === gState.id) return;
            let a = nm.actors[m.i];
            if (!a || a.netId !== m.sender) return;
            a.target = { x: m.x, y: m.y, z: m.z }; a.facing = m.f; a.stunT = m.s ? 0.2 : 0;
        }
        function nmOnWorld(m) {
            if (!nm || nm.mode !== m.mode || nmIsHost()) return;
            nm.clock = m.clock;
            (m.a || []).forEach(function (o) {
                let a = nm.actors[o.i]; if (!a) return;
                if (!a.netId) { a.target = { x: o.x, y: o.y, z: o.z }; a.facing = o.f; }
                a.kills = o.k;
                if (o.o && !a.out) { a.out = true; a.mesh.visible = false; nm.outOrder.push(a.idx); nmBurst(a.p.x, Math.max(a.p.y, nm.def.fxY || 0), a.p.z, 0xff7043); }
            });
            if (m.s && nm.def.applyWorld) nm.def.applyWorld(nm, m.s);
        }
        function nmOnEv(m) {
            if (!nm || nm.mode !== m.mode || m.sender === gState.id) return;
            if (m.ev === 'kb') { let b = nm.actors[m.to]; if (b && nmMine(b)) nmKnock(b, m.ix, m.iz, m.by >= 0 ? nm.actors[m.by] : null, m.hop); }
            else if (m.ev === 'stun') { let b = nm.actors[m.to]; if (b && nmMine(b)) nmStun(b, m.t, m.by >= 0 ? nm.actors[m.by] : null); }
            else if (m.ev === 'out') {
                let a = nm.actors[m.i]; if (!a || a.out) return;
                a.lastHitBy = m.by >= 0 ? m.by : undefined; a.lastHitT = nm.clock;
                nmOut(a);
            }
            else if (m.ev === 'end') nmEnd(m.res, true);
            else if (nm.def.onEv) nm.def.onEv(nm, m);
        }
        function nmLerpRemotes(dt) {
            let k = Math.min(1, dt * 12);
            nm.actors.forEach(function (a) {
                if (!a.target || nmMine(a)) return;
                a.p.x += (a.target.x - a.p.x) * k; a.p.y += (a.target.y - a.p.y) * k; a.p.z += (a.target.z - a.p.z) * k;
            });
        }

        // ── 主循环 ──
        function nmLoop() {
            if (!nm) return;
            let now = performance.now();
            let dt = Math.min(0.05, (now - nm.last) / 1000);
            nm.last = now;
            if (introFrozen()) { nm.raf = requestAnimationFrame(nmLoop); return; }   // R1：单人局，卡片开着整局静止
            if (!nm.over) nmTick(dt);
            nm.raf = requestAnimationFrame(nmLoop);
        }
        function nmTick(dt) {
            let def = nm.def;
            nm.clock += dt;
            let px0 = nm.actors.map(function (a) { return a.p.clone(); });
            nm.actors.forEach(function (a) {
                if (a.out || a.downed) return;
                if (a.isPlayer) nmPhysics(a, nmWish(a), dt);
                else if (nmMine(a)) nmPhysics(a, def.ai(nm, a, dt), dt);
            });
            nmLerpRemotes(dt);
            nmSeparate();
            if (def.tick) def.tick(nm, dt);
            // 掉下去 / 掉进岩浆：谁归我模拟谁由我判
            nm.actors.forEach(function (a) {
                if (a.out || a.downed || !nmMine(a)) return;
                let why = def.fallCheck(nm, a);
                if (why) { if (def.onFall) def.onFall(nm, a, why); else nmOut(a, why); }
            });
            nmNetTick(dt);
            nmFxTick(dt);
            nm.actors.forEach(function (a, i) {
                a.spd = Math.hypot(a.p.x - px0[i].x, a.p.z - px0[i].z) / Math.max(dt, 0.001);
                a.mesh.position.set(a.p.x, a.p.y, a.p.z);
                if (a.out) return;
                a.mesh.rotation.y = (a.facing || 0) + (a.slipT > 0 ? a.slipT * 18 : 0);
                let run = Math.min(1, a.spd / def.speed);
                a.animT += dt * (2 + run * 16);
                let u = a.mesh.userData;
                if (u.legs) { u.legs[0].rotation.x = Math.sin(a.animT) * 0.9 * run; u.legs[1].rotation.x = -Math.sin(a.animT) * 0.9 * run; }
                if (u.arms) {
                    if (a.gestureT > 0) { a.gestureT -= dt; bodyGesture(u, 'throw', Math.max(0, a.gestureT) / 0.35); }
                    else { u.arms[0].rotation.x = -Math.sin(a.animT) * 0.7 * run; u.arms[1].rotation.x = Math.sin(a.animT) * 0.7 * run; }
                }
                a.mesh.rotation.z = a.stunT > 0 ? Math.sin(nm.clock * 30) * 0.15 : 0;
                tickAccStarOrbit(u, dt);
            });
            // 镜头：出局了就看别人（◀ ▶ / A D 换人）
            let look = nm.me;
            if (nm.me.out || nm.me.downed) {
                let list = nm.actors.filter(function (a) { return !a.out && !a.downed; });
                if (list.length) { nm.specIdx = ((nm.specIdx % list.length) + list.length) % list.length; look = list[nm.specIdx]; }
            }
            let bar = document.getElementById('nm-spectate-bar');
            if (bar) {
                let on = (nm.me.out || nm.me.downed) && look !== nm.me;
                bar.style.display = on ? 'flex' : 'none';
                if (on) document.getElementById('nm-spectate-target').innerText = look.name;
            }
            let dir = chaseCamDir();
            let back = def.camBack || 30, up = def.camUp || 16;
            camera.position.set(look.p.x - dir.x * back, look.p.y + up - dir.y * back, look.p.z - dir.z * back);
            def.hud(nm);
            if (nmIsHost() && !nm.over) { let res = def.checkEnd(nm); if (res) nmEnd(res); }
            renderer.render(scene, camera);
        }
        function nmSpecCycle(d) { if (nm) nm.specIdx += d; }

        // ── 结算 ──
        function nmEnd(res, fromNet) {
            if (!nm || nm.over) return;
            nm.over = true;
            if (nm.net && nmIsHost() && !fromNet) bc.postMessage({ type: 'NM_EV', target: '*', sender: gState.id, mode: nm.mode, ev: 'end', res: res });
            if (document.pointerLockElement) document.exitPointerLock();
            let def = nm.def, me = nm.me;
            let won = def.didWin(nm, res, me);
            let text = def.resultText(nm, res);
            if (def.afterEnd) def.afterEnd(nm, res, won);   // 先记最好成绩，成就才能马上算到
            coinsSettle(nm.mode, won);
            text += coinsLine();
            let mode = nm.mode, opt = nm.opt;
            let btns = [];
            if (!nm.net) btns.push({ label: '再来一局', color: '#1e88e5', onClick: function () { nmTeardown(); nmStartGo(mode, opt); } });
            btns.push({ label: '返回大厅', color: '#5cb85c', onClick: function () { nmExit(); } });
            won ? sfxChime(3) : sfxBuzz();
            showSysModal(def.resultTitle(nm, res, won), text, btns);
        }
        function nmTeardown() {
            if (!nm) return;
            nm.over = true;
            if (nm.raf) cancelAnimationFrame(nm.raf);
            if (document.pointerLockElement) document.exitPointerLock();
            nm.meshes.forEach(function (m) { scene.remove(m); });
            if (nm.def.teardown) nm.def.teardown(nm);
            nm = null;
            nmTouchUI(false);
            bgmStop();
            document.body.onmousedown = null;
            document.getElementById('blaze-hud').classList.add('hidden');
            let ex = document.getElementById('blaze-exit-btn'); if (ex) ex.onclick = blazeExit;
        }
        function nmExit() {
            if (!nm) return;
            let mode = nm.mode;
            nmTeardown();
            nav('screen-lobby'); selectGameMode(mode);
        }
        function nmHudText(score, line) {
            document.getElementById('blaze-score').innerText = score;
            document.getElementById('blaze-round').innerText = line;
            document.getElementById('blaze-roster').innerHTML = '';
        }
        function nmFacingDot(a, b) {
            let dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, d = Math.hypot(dx, dz) || 1;
            return (dx / d) * Math.sin(a.facing) + (dz / d) * Math.cos(a.facing);
        }
        function nmNearest(a, filter) {
            let best = null, bd = Infinity;
            nm.actors.forEach(function (b) {
                if (b === a || b.out || b.downed || (filter && !filter(b))) return;
                let d = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z);
                if (d < bd) { bd = d; best = b; }
            });
            return best ? { b: best, d: bd } : null;
        }
        function nmPlace(a) {   // 名次：没出局的并列第 1，出局越早名次越靠后
            if (!a.out) return 1;
            let k = nm.outOrder.indexOf(a.idx);
            return nm.actors.length - k;
        }

        // ══════════════ 推推乐 ══════════════
        // 一块圆台子，开局 20 秒后开始往里缩。按「推」往前一撞，面前的人被撞飞；掉下台子就出局。
        // 最后站着的赢，时间到就看谁推下去的人多。
        // 变数（S2）：
        //   台子每局随机一种：普通 / 冰面 / 跷跷板 / 中间开洞（联机里按同一个种子，大家一样）。
        //   蓄力撞：按住攒力（最多 1.5 秒，力气最多 ×2，攒力时走得慢一半），松手才推；点一下是普通推。
        //   道具：每 10 秒掉一个（场上最多 2 个），走过去自动捡，一人拿一个，按 Q（触屏点“道具”）用。
        //     大锤 5 秒内推人力气 ×2；香蕉皮放在脚下，踩到的人滑出去 3 个身位；护盾挡一次推；弹簧原地弹得很高。
        const SUMO = {
            count: 8, r0: 110, rMin: 34, shrinkAt: 20, shrinkRate: 0.55, time: 150,
            speed: 42, jumpV: 40, gravity: 140, pushRange: 12, pushCos: 0.5, pushPower: 105, pushCd: 1.1,
            charge: 1.5, chargeTap: 0.25, chargeSlow: 0.5,
            itemFirst: 5, itemEvery: 10, itemMax: 2, itemR: 8, hammerT: 5, hammerMul: 2, slipV: 45, slipT: 0.7, springV: 80,
            holeW: 4.4, holeMaxK: 19, holeK0: 3, holeRate: 0.7, tiltMax: 12, tiltSlide: 240
        };
        const SUMO_KINDS = ['normal', 'ice', 'seesaw', 'hole'];
        const SUMO_HINT = { normal: '普通台子，把人推下去', ice: '冰面！起步和刹车都慢，别滑出去', seesaw: '跷跷板！人多的那边会往下沉', hole: '中间有个洞，台子从中间往外塌' };
        const SUMO_ITEMS = { hammer: { n: '大锤', c: 0xe53935 }, banana: { n: '香蕉皮', c: 0xffeb3b }, shield: { n: '护盾', c: 0x42a5f5 }, spring: { n: '弹簧', c: 0x66bb6a } };
        const SUMO_ITEM_KEYS = ['hammer', 'banana', 'shield', 'spring'];
        function sumoRadius(t) { return t < SUMO.shrinkAt ? SUMO.r0 : Math.max(SUMO.rMin, SUMO.r0 - (t - SUMO.shrinkAt) * SUMO.shrinkRate); }
        // 开洞的台子：由 25 圈环拼成，洞从中间一圈一圈往外扩（第 k 圈之内都是洞）
        function sumoHoleK(t) { return Math.min(SUMO.holeMaxK, SUMO.holeK0 + Math.floor(Math.max(0, t - SUMO.shrinkAt) * SUMO.holeRate / SUMO.holeW)); }
        // AI 和道具要知道"能站的范围"：[内圈, 外圈]
        function sumoBand(g) { return g.kind === 'hole' ? [sumoHoleK(g.clock) * SUMO.holeW, SUMO.r0] : [0, sumoRadius(g.clock)]; }

        function sumoItemMesh(kind) {
            let grp = new THREE.Group(), sym = new THREE.Group(), c = SUMO_ITEMS[kind].c;
            let mat = function (col, o) { return new THREE.MeshLambertMaterial(Object.assign({ color: col }, o || {})); };
            if (kind === 'hammer') {
                let h = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7, 0.9), mat(0x8d6e63)); sym.add(h);
                let hd = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3), mat(c)); hd.position.y = 3.5; sym.add(hd);
                sym.rotation.z = 0.5;
            } else if (kind === 'banana') {
                let b = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.9, 6, 14, Math.PI * 1.25), mat(c)); b.rotation.z = Math.PI * 0.4; sym.add(b);
            } else if (kind === 'shield') {
                let b = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 8), mat(c, { transparent: true, opacity: 0.8 })); sym.add(b);
            } else {
                for (let i = 0; i < 3; i++) { let t = new THREE.Mesh(new THREE.TorusGeometry(2, 0.55, 6, 12), mat(c)); t.rotation.x = Math.PI / 2; t.position.y = -2 + i * 2; sym.add(t); }
            }
            sym.position.y = 5; grp.add(sym); grp.userData.sym = sym;
            let base = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.4, 20), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
            base.rotation.x = -Math.PI / 2; base.position.y = 0.4; grp.add(base);
            return grp;
        }
        function sumoAddItem(g, id, kind, x, z) {
            if (g.items.some(function (it) { return it.id === id; })) return;
            let mesh = sumoItemMesh(kind); mesh.position.set(x, 0, z); g.pg.add(mesh);
            g.items.push({ id: id, kind: kind, x: x, z: z, mesh: mesh, t: Math.random() * 6 });
        }
        function sumoDropMesh(g, mesh) { g.pg.remove(mesh); disposeObject(mesh); }
        function sumoRemoveItem(g, id) {
            g.items = g.items.filter(function (it) { if (it.id !== id) return true; sumoDropMesh(g, it.mesh); return false; });
        }
        function sumoRandPoint(g) {
            let b = sumoBand(g);
            for (let i = 0; i < 20; i++) {
                let ang = Math.random() * Math.PI * 2, r = b[0] + 10 + Math.random() * Math.max(1, b[1] - b[0] - 22);
                if (r < b[1] - 10) return { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
            }
            return { x: Math.cos(0) * (b[0] + b[1]) / 2, z: 0 };
        }
        function sumoSend(g, o) { if (g.net) bc.postMessage(Object.assign({ type: 'NM_EV', target: '*', sender: gState.id, mode: 'sumo' }, o)); }

        // 大锤 / 护盾 的样子挂在身上（所有人都看得到）
        function sumoHammerVis(a, on) {
            if (a.hammerMesh) { a.mesh.remove(a.hammerMesh); disposeObject(a.hammerMesh); a.hammerMesh = null; }
            if (!on) return;
            let m = sumoItemMesh('hammer'); m.userData.sym.position.y = 0; m.children[1].visible = false;
            m.position.set(6, 9, 2); m.scale.setScalar(1.1); a.mesh.add(m); a.hammerMesh = m;
        }
        function sumoShieldVis(a, on) {
            if (a.shieldMesh) { a.mesh.remove(a.shieldMesh); disposeObject(a.shieldMesh); a.shieldMesh = null; }
            if (!on) return;
            let m = new THREE.Mesh(new THREE.SphereGeometry(10, 14, 10), new THREE.MeshBasicMaterial({ color: 0x64b5f6, transparent: true, opacity: 0.28 }));
            m.position.y = 7; a.mesh.add(m); a.shieldMesh = m;
        }
        function sumoPopShield(g, b) {
            b.shield = false; sumoShieldVis(b, false);
            nmBurst(b.p.x, b.p.y, b.p.z, 0x64b5f6);
            if (b.isPlayer) blazeFlash('护盾挡住了！');
            sumoSend(g, { ev: 'pop', i: b.idx });
        }
        // 用道具（物主那台机器执行，别的机器靠 'use' 消息跟着显示）
        function sumoApplyUse(g, a, m) {
            if (m.k === 'hammer') { a.hammerT = SUMO.hammerT; sumoHammerVis(a, true); }
            else if (m.k === 'shield') { a.shield = true; sumoShieldVis(a, true); }
            else if (m.k === 'banana') {
                if (g.bananas.some(function (b) { return b.id === m.id; })) return;
                let mesh = sumoItemMesh('banana'); mesh.userData.sym.position.y = 0.8; mesh.userData.sym.rotation.x = -Math.PI / 2; mesh.children[1].visible = false;
                mesh.position.set(m.x, 0.3, m.z); g.pg.add(mesh);
                g.bananas.push({ id: m.id, x: m.x, z: m.z, owner: a.idx, t: 0, mesh: mesh });
            }
        }
        function sumoUseItem(g, a) {
            if (!a.item || a.out) return;
            let k = a.item; a.item = null;
            if (k === 'spring') { a.vy = SUMO.springV; a.onGround = false; a.coyote = 0; nmBurst(a.p.x, a.p.y, a.p.z, 0x66bb6a); return; }
            let m = { ev: 'use', i: a.idx, k: k };
            if (k === 'banana') { m.id = 'b' + a.idx + '-' + Math.floor(g.clock * 10); m.x = +a.p.x.toFixed(1); m.z = +a.p.z.toFixed(1); }
            sumoApplyUse(g, a, m);
            sumoSend(g, m);
        }
        function sumoTakeItem(g, a, it) {
            g.taken[it.id] = 1; sumoRemoveItem(g, it.id);
            a.item = it.kind; a.itemT = 1 + Math.random() * 2;
            if (a.isPlayer) blazeFlash('拿到' + SUMO_ITEMS[it.kind].n + (gState.control === 'pad' ? '，点“道具”用' : '，按 Q 用'));
            sumoSend(g, { ev: 'pick', id: it.id, i: a.idx });
        }
        function sumoItemsTick(g, dt) {
            // 房主定时掉道具
            if (nmIsHost() && !g.over) {
                g.itemT -= dt;
                if (g.itemT <= 0) {
                    g.itemT = SUMO.itemEvery;
                    if (g.items.length < SUMO.itemMax) {
                        let p = sumoRandPoint(g), kind = SUMO_ITEM_KEYS[Math.floor(Math.random() * SUMO_ITEM_KEYS.length)];
                        sumoAddItem(g, 'i' + (++g.itemSeq), kind, p.x, p.z);
                    }
                }
            }
            let b = sumoBand(g);
            g.items.slice().forEach(function (it) {
                it.t += dt; it.mesh.userData.sym.position.y = 5 + Math.sin(it.t * 3) * 1.2; it.mesh.userData.sym.rotation.y = it.t * 2;
                let d = Math.hypot(it.x, it.z);
                if (nmIsHost() && (d > b[1] - 3 || d < b[0] + 3)) { sumoRemoveItem(g, it.id); return; }   // 台子缩到它那儿了
                if (g.over) return;
                for (let i = 0; i < g.actors.length; i++) {
                    let a = g.actors[i];
                    if (a.out || a.item || !nmMine(a)) continue;
                    if (Math.hypot(a.p.x - it.x, a.p.z - it.z) < SUMO.itemR && Math.abs(a.p.y - sumoGroundY(g, it.x, it.z)) < 12) { sumoTakeItem(g, a, it); break; }
                }
            });
            // 香蕉皮：谁归我模拟谁由我判
            g.bananas = g.bananas.filter(function (bn) {
                bn.t += dt;
                let hit = null;
                if (bn.t > 40) hit = 'old';
                else g.actors.forEach(function (a) {
                    if (hit || a.out || !nmMine(a) || !a.onGround || a.slipT > 0 || (a.idx === bn.owner && bn.t < 1.5)) return;
                    if (Math.hypot(a.p.x - bn.x, a.p.z - bn.z) < 5) hit = a;
                });
                if (!hit) return true;
                if (hit !== 'old') {
                    let a = hit, sp = Math.hypot(a.mvx, a.mvz), dx = sp > 4 ? a.mvx / sp : Math.sin(a.facing), dz = sp > 4 ? a.mvz / sp : Math.cos(a.facing);
                    a.kx += dx * SUMO.slipV; a.kz += dz * SUMO.slipV; a.slipT = SUMO.slipT;
                    if (a.isPlayer) blazeFlash('踩到香蕉皮了！');
                    sumoSend(g, { ev: 'bgone', id: bn.id });
                }
                sumoDropMesh(g, bn.mesh);
                return false;
            });
        }
        function sumoGroundY(g, x, z) { let y = NM_DEFS.sumo.groundAt(g, x, z); return y > -1e8 ? y : 0; }

        NM_DEFS.sumo = {
            sky: 0xb3e5fc, fog: 0.0016, speed: SUMO.speed, jumpV: SUMO.jumpV, gravity: SUMO.gravity,
            camBack: 34, camUp: 20, actLabel: '推', fxY: 0, actHold: true, charge: SUMO.charge,
            count: function () { return SUMO.count; },
            build: function (g) {
                let kind = g.opt && g.opt.plat !== undefined ? SUMO_KINDS[g.opt.plat] : SUMO_KINDS[g.seed % 4];
                g.kind = kind || 'normal';
                g.tilt = 0; g.tiltDx = 1; g.tiltDz = 0; g.tvx = 0; g.tvz = 0;
                g.items = []; g.bananas = []; g.taken = {}; g.itemSeq = 0; g.itemT = SUMO.itemFirst; g.hinted = false;
                let pg = new THREE.Group(); nmAdd(pg); g.pg = pg;   // 台子和台子上的东西挂在一起，跷跷板整个一起歪
                let ice = g.kind === 'ice', top = ice ? 0xd9f2fb : (g.kind === 'seesaw' ? 0xffcc80 : 0xffe0b2);
                if (g.kind === 'hole') {
                    g.holeMat = new THREE.MeshLambertMaterial({ color: top }); g.holeFlash = new THREE.MeshLambertMaterial({ color: 0xffeb3b });
                    g.holeRings = [];
                    for (let i = 0; i < SUMO.r0 / SUMO.holeW; i++) {
                        let a0 = i * SUMO.holeW, a1 = (i + 1) * SUMO.holeW;
                        let pts = [new THREE.Vector2(a0, 0), new THREE.Vector2(a1, 0), new THREE.Vector2(a1, -8), new THREE.Vector2(a0, -8), new THREE.Vector2(a0, 0)];
                        let m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), g.holeMat);
                        pg.add(m); g.holeRings.push(m);
                    }
                    g.holeLast = -1;
                } else {
                    let plat = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 8, 64), new THREE.MeshLambertMaterial({ color: top }));
                    plat.position.y = -4; pg.add(plat); g.plat = plat;
                }
                let ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 64), new THREE.MeshBasicMaterial({ color: 0xe53935 }));
                ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; pg.add(ring); g.ring = ring;
                if (g.kind === 'hole') ring.scale.set(SUMO.r0, SUMO.r0, 1);
                let rings = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 48), new THREE.MeshBasicMaterial({ color: ice ? 0xffffff : 0xffcc80, side: THREE.DoubleSide }));
                rings.rotation.x = -Math.PI / 2; rings.position.y = 0.05; rings.scale.setScalar(SUMO.r0); pg.add(rings);
                if (g.kind === 'seesaw') {   // 台子底下的支点，让人一眼看出它会歪
                    let fu = new THREE.Mesh(new THREE.ConeGeometry(22, 34, 20), new THREE.MeshLambertMaterial({ color: 0x8d6e63 }));
                    fu.position.y = -25; nmAdd(fu);
                }
                let sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: 0x4fc3f7 }));
                sea.rotation.x = -Math.PI / 2; sea.position.y = -70; nmAdd(sea);
            },
            spawns: function (g, n) {
                let out = [];
                for (let i = 0; i < n; i++) {
                    let ang = i / n * Math.PI * 2;
                    out.push({ x: Math.cos(ang) * SUMO.r0 * 0.65, z: Math.sin(ang) * SUMO.r0 * 0.65, facing: Math.atan2(-Math.cos(ang), -Math.sin(ang)) });
                }
                return out;
            },
            camYaw: function (g) { return g.me.facing + Math.PI; },
            groundAt: function (g, x, z) {
                let d = Math.hypot(x, z);
                if (g.kind === 'hole') return (d <= SUMO.r0 && d >= sumoHoleK(g.clock) * SUMO.holeW) ? 0 : -1e9;
                if (d > sumoRadius(g.clock)) return -1e9;
                return g.kind === 'seesaw' ? -(x * g.tiltDx + z * g.tiltDz) * Math.tan(g.tilt) : 0;
            },
            grip: function (g, a) { return g.kind === 'ice' && a.onGround ? 0.3 : 1; },
            speedMul: function (g, a) { return a.chargeT > 0 ? SUMO.chargeSlow : 1; },
            carry: function (g, a, dt) {   // 跷跷板：站在歪的台子上会往低的那边滑
                if (g.kind === 'seesaw' && g.tilt > 0.005 && a.onGround) {
                    let s = Math.sin(g.tilt) * SUMO.tiltSlide * dt;
                    a.kx += g.tiltDx * s; a.kz += g.tiltDz * s;
                }
            },
            act: function (g, a, charged) {
                let c = charged || 0;
                let power = (c >= SUMO.chargeTap ? 1 + Math.min(c, SUMO.charge) / SUMO.charge : 1) * (a.hammerT > 0 ? SUMO.hammerMul : 1);
                a.actCd = SUMO.pushCd; a.gestureT = 0.35;
                let fx = Math.sin(a.facing), fz = Math.cos(a.facing);
                a.kx += fx * 45 * (1 + (power - 1) * 0.5); a.kz += fz * 45 * (1 + (power - 1) * 0.5);   // 自己往前一冲
                g.actors.forEach(function (b) {
                    if (b === a || b.out) return;
                    let dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, d = Math.hypot(dx, dz);
                    if (d > SUMO.pushRange || d < 0.01 || Math.abs(b.p.y - a.p.y) > 8) return;
                    if ((dx / d) * fx + (dz / d) * fz < SUMO.pushCos) return;
                    nmKnock(b, dx / d * SUMO.pushPower * power, dz / d * SUMO.pushPower * power, a, 22);
                    nmBurst(b.p.x, b.p.y, b.p.z, power > 1.5 ? 0xff7043 : 0xffffff);
                });
            },
            useItem: function (g, a) { sumoUseItem(g, a); },
            popShield: sumoPopShield,
            ai: function (g, a, dt) {
                let b = sumoBand(g), dc = Math.hypot(a.p.x, a.p.z);
                let w = { x: 0, z: 0, jump: false, act: false, held: false, item: false };
                a.aiT -= dt;
                if (dc > b[1] - 16) { w.x = -a.p.x / (dc || 1); w.z = -a.p.z / (dc || 1); a.aiHold = 0; return w; }   // 太靠边，先往里走
                if (dc < b[0] + 14) { w.x = a.p.x / (dc || 1); w.z = a.p.z / (dc || 1); if (dc < 1) w.x = 1; a.aiHold = 0; return w; }   // 太靠洞，往外走
                let t = nmNearest(a);
                if (!t) return w;
                let dx = t.b.p.x - a.p.x, dz = t.b.p.z - a.p.z, d = t.d || 1;
                w.x = dx / d; w.z = dz / d;
                // 没拿道具就去捡近处的
                if (!a.item) {
                    let best = null, bd = 45;
                    g.items.forEach(function (it) { let dd = Math.hypot(it.x - a.p.x, it.z - a.p.z); if (dd < bd) { bd = dd; best = it; } });
                    if (best) { let l = bd || 1; w.x = (best.x - a.p.x) / l; w.z = (best.z - a.p.z) / l; }
                }
                // 蓄力：按住一会儿再松手
                if (a.aiHold > 0) { a.aiHold -= dt; w.held = true; }
                else if (a.aiT <= 0 && d < SUMO.pushRange + 4 && nmFacingDot(a, t.b) > 0.6 && a.actCd <= 0) {
                    a.aiHold = Math.random() < 0.5 ? 0.05 : 0.4 + Math.random() * 1.0; a.aiT = 0.3 + Math.random() * 0.6; w.held = true;
                }
                // 用道具
                if (a.item) {
                    a.itemT -= dt;
                    let k = a.item;
                    if (k === 'shield') w.item = true;
                    else if (k === 'hammer') { if (d < SUMO.pushRange + 6) w.item = true; }
                    else if (a.itemT <= 0) {
                        if (k === 'banana' && d < 26) w.item = true;
                        if (k === 'spring' && Math.random() < dt * 0.5) w.item = true;
                    }
                }
                if (Math.random() < dt * 0.15) w.jump = true;
                return w;
            },
            tick: function (g, dt) {
                let t = g.clock;
                if (g.kind === 'hole') {
                    let k = sumoHoleK(t);
                    if (k !== g.holeLast) { g.holeRings.forEach(function (m, i) { m.visible = i >= k; }); g.holeLast = k; }
                    let u = (t - SUMO.shrinkAt) * SUMO.holeRate / SUMO.holeW, frac = u - Math.floor(u);
                    let blink = k < SUMO.holeMaxK && frac > 0.75 && Math.sin(t * 10) > 0;
                    g.holeRings[k].material = blink ? g.holeFlash : g.holeMat;
                } else {
                    let r = sumoRadius(t);
                    g.plat.scale.set(r, 1, r);
                    g.ring.scale.set(r, r, 1);
                    g.ring.material.color.setHex(t > SUMO.shrinkAt - 3 && Math.sin(t * 8) > 0 ? 0xffeb3b : 0xe53935);
                }
                if (g.kind === 'seesaw') {   // 人多的那边往下沉，最多 12 度
                    let sx = 0, sz = 0, n = 0;
                    g.actors.forEach(function (a) { if (!a.out) { sx += a.p.x; sz += a.p.z; n++; } });
                    let r = Math.max(30, sumoRadius(t)), tx = n ? sx / n / (0.4 * r) : 0, tz = n ? sz / n / (0.4 * r) : 0, m = Math.hypot(tx, tz);
                    if (m > 1) { tx /= m; tz /= m; }
                    let kk = Math.min(1, dt * 2);
                    g.tvx += (tx - g.tvx) * kk; g.tvz += (tz - g.tvz) * kk;
                    let mag = Math.hypot(g.tvx, g.tvz);
                    g.tilt = mag * SUMO.tiltMax * Math.PI / 180;
                    if (mag > 0.001) { g.tiltDx = g.tvx / mag; g.tiltDz = g.tvz / mag; }
                    g.pg.quaternion.setFromAxisAngle(new THREE.Vector3(g.tiltDz, 0, -g.tiltDx), g.tilt);
                }
                if (!g.hinted && t > 0.3) { g.hinted = true; blazeFlash(SUMO_HINT[g.kind]); }
                g.actors.forEach(function (a) {
                    if (a.hammerT > 0) { a.hammerT -= dt; if (a.hammerT <= 0) { a.hammerT = 0; sumoHammerVis(a, false); } }
                    if (a.shield && a.out) { a.shield = false; sumoShieldVis(a, false); }
                });
                sumoItemsTick(g, dt);
                // 蓄力条
                let cb = g.chargeBar;
                if (!cb) {
                    cb = g.chargeBar = document.createElement('div');
                    cb.id = 'sumo-charge'; cb.style.cssText = 'position:fixed; left:50%; bottom:22%; width:160px; height:12px; margin-left:-80px; border:2px solid #fff; border-radius:8px; background:rgba(0,0,0,0.35); z-index:6; display:none; pointer-events:none;';
                    cb.innerHTML = '<div style="height:100%; width:0; background:#ff7043; border-radius:5px;"></div>';
                    document.body.appendChild(cb);
                }
                let c = g.me.chargeT || 0;
                cb.style.display = c >= SUMO.chargeTap ? 'block' : 'none';
                cb.firstChild.style.width = Math.min(100, c / SUMO.charge * 100) + '%';
            },
            worldState: function (g) { return { it: g.items.map(function (it) { return [it.id, SUMO_ITEM_KEYS.indexOf(it.kind), +it.x.toFixed(1), +it.z.toFixed(1)]; }) }; },
            applyWorld: function (g, s) {
                let ids = {};
                (s.it || []).forEach(function (q) { ids[q[0]] = 1; if (!g.taken[q[0]]) sumoAddItem(g, q[0], SUMO_ITEM_KEYS[q[1]], q[2], q[3]); });
                g.items.slice().forEach(function (it) { if (!ids[it.id]) sumoRemoveItem(g, it.id); });
            },
            onEv: function (g, m) {
                if (m.ev === 'pick') { g.taken[m.id] = 1; sumoRemoveItem(g, m.id); }
                else if (m.ev === 'use') { let a = g.actors[m.i]; if (a) sumoApplyUse(g, a, m); }
                else if (m.ev === 'pop') { let a = g.actors[m.i]; if (a) { a.shield = false; sumoShieldVis(a, false); nmBurst(a.p.x, a.p.y, a.p.z, 0x64b5f6); } }
                else if (m.ev === 'bgone') {
                    g.bananas = g.bananas.filter(function (b) { if (b.id !== m.id) return true; sumoDropMesh(g, b.mesh); return false; });
                }
            },
            afterEnd: function (g) { if (g.chargeBar) g.chargeBar.style.display = 'none'; },
            teardown: function (g) { if (g.chargeBar && g.chargeBar.parentNode) g.chargeBar.parentNode.removeChild(g.chargeBar); },
            fallCheck: function (g, a) { return a.p.y < -50 ? '掉下去了' : null; },
            checkEnd: function (g) {
                let alive = g.actors.filter(function (a) { return !a.out; });
                if (alive.length <= 1) return { w: alive.length ? alive[0].idx : -1 };
                if (g.clock >= SUMO.time) {
                    let best = alive.slice().sort(function (a, b) { return b.kills - a.kills; })[0];
                    return { w: best.idx, timeUp: 1 };
                }
                return null;
            },
            didWin: function (g, res, me) { return res.w === me.idx || nmPlace(me) <= 3; },
            resultTitle: function (g, res, won) { return res.w === g.me.idx ? '你是最后站着的！' : (res.w >= 0 ? g.actors[res.w].name + ' 赢了' : '同归于尽'); },
            resultText: function (g, res) {
                return (res.timeUp ? '时间到，推下去最多的人赢。<br>' : '') + '你推下去 ' + g.me.kills + ' 人，第 ' + nmPlace(g.me) + ' 名。';
            },
            hud: function (g) {
                let alive = g.actors.filter(function (a) { return !a.out; }).length;
                let t = Math.max(0, Math.ceil(SUMO.time - g.clock));
                let it = g.me.item ? '　道具：' + SUMO_ITEMS[g.me.item].n : (g.me.hammerT > 0 ? '　大锤 ' + Math.ceil(g.me.hammerT) + 's' : '');
                let first = g.kind === 'hole' ? (g.clock < SUMO.shrinkAt ? Math.ceil(SUMO.shrinkAt - g.clock) + ' 秒后洞开始变大　' : '洞在变大　')
                    : (g.clock < SUMO.shrinkAt ? Math.ceil(SUMO.shrinkAt - g.clock) + ' 秒后台子开始缩　' : '台子在缩　');
                nmHudText('存活 ' + alive + ' / ' + g.actors.length + '　' + t + 's',
                    first + '推下去 ' + g.me.kills + ' 人' + it + (g.me.out ? '　出局了，在观战' : ''));
            }
        };

        // ══════════════ 爬塔 ══════════════
        // 一座绕着柱子盘上去的跳台塔，底下岩浆一直在涨。
        //   单人：能爬多高爬多高，爬到顶算赢。
        //   双人合作：两个人都要爬到顶。有人掉进岩浆就先趴下，另一个爬到下一面旗子就能把他拉回来；两个都掉就输。
        //   多人：谁先到顶谁赢。
        // 存档点（T2）：起点和每面绿旗。站上更高的绿旗就更新，只升不降。掉进岩浆时岩浆还没淹到存档点台面，
        // 就回存档点接着爬；淹过了：单人结束、多人出局、双人倒下等队友救。AI 一样。
        // 变数（S3）：台子有 6 种——普通、左右晃的、易碎（踩上去 1 秒后掉，5 秒后长回来）、弹床（跳得高 ×1.6）、
// 传送带、转动的横杆（碰到被打飞，跳起来能躲）。下 1/3 只有普通台，中间 1/3 三成半是特殊的，顶上 1/3 一半是特殊的；
// 存档点旗子和塔顶永远是普通台。路上有 10 个猫盾币（每人自己捡，一局最多 10 个）。塔里有 2~3 处捷径：从 i 直接助跑跳到 i+5，
// 要是不跳就得沿着绕出去的小路慢慢走。塔按日期定种子，当天所有人爬的一样。
const TOWER = { steps: 60, flagEvery: 10, speed: 40, jumpV: 50, gravity: 140, lava0: -40, rise0: 2.2, rise1: 5, riseRamp: 100, grace: 6,
    specialP: [0, 0.35, 0.5], kinds: [['move', 0.28], ['crumble', 0.24], ['spring', 0.16], ['belt', 0.16], ['bar', 0.16]],
    moveGapMax: 12, beltV: 14, crumbleT: 1, crumbleBack: 5, springMul: 1.6, barV: 1.5, barHit: 2.4, coins: 10 };
function towerDaySeed() { return (localDayNum() * 7919 + 31) % 999983 + 1; }
// 爬塔不管几个人：把走过的台子按"这一块"算——脚下是哪一块（跳起来的瞬间也算）
function towerStepUnder(g, a) {
    for (let i = 0; i < g.steps.length; i++) {
        let s = g.steps[i];
        if (Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half && Math.abs(a.p.y - s.y) < 0.6) return s;
    }
    return null;
}
// 在空中：按剩下的飞行时间算还要多快才落在目标台子中间（人是松开方向键让自己落准，AI 也这么干，不然跳得高/远的日子会飞过头）
function towerAirK(a, t, d) {
    let disc = a.vy * a.vy + 2 * TOWER.gravity * (a.p.y - t.y);
    if (disc < 0) return 1;
    let tau = (a.vy + Math.sqrt(disc)) / TOWER.gravity;
    if (tau < 0.05) return 0.1;
    return Math.max(0.1, Math.min(1, d / tau / (TOWER.speed * DAILY_MOD.speedMul)));
}
function towerGone(g, s) { return s.cs !== undefined && g.clock - s.cs >= TOWER.crumbleT && g.clock - s.cs < TOWER.crumbleT + TOWER.crumbleBack; }
// 今日排行：AI 的成绩按日期算（每天一样），再把自己今天单人爬的最高放进去，旁边写自己的历史最好
function towerBoardList() {
    let seed = (localDayNum() * 104729 + 7) % 233280;
    let rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    let out = [];
    for (let k = 0; k < 20; k++) {
        let h = 60 - Math.floor(Math.pow(k / 19, 1.25) * 52);
        if (k >= 2) h = Math.max(4, Math.min(60, h + Math.floor(rnd() * 5) - 2));
        out.push({ n: RACE_AI_NAMES[(k * 7 + Math.floor(rnd() * 3)) % RACE_AI_NAMES.length] + (k >= RACE_AI_NAMES.length ? '2' : ''), h: h });
    }
    out.sort(function (a, b) { return b.h - a.h; });
    let td = gState.towerDay && gState.towerDay.d === localDayNum() ? gState.towerDay.h : 0;
    if (td > 0) {
        let at = out.filter(function (e) { return e.h > td; }).length;
        out.splice(at, 0, { n: gState.id || '你', h: td, me: 1 });
    }
    return { list: out, today: td };
}
function towerBoardOpen() {
    let b = towerBoardList(), total = TOWER.steps;
    let rows = b.list.map(function (e, i) {
        return '<div style="display:flex; justify-content:space-between; padding:3px 8px; font-size:13px; border-radius:4px;' +
            (e.me ? 'background:#fff3e0; font-weight:bold; color:#e65100;' : 'color:#555;') + '">' +
            '<span>' + (i + 1) + '. ' + e.n + '</span><span>' + (e.h >= total ? '到顶' : '第 ' + e.h + ' 块') + '</span></div>';
    }).join('');
    document.getElementById('tower-board-body').innerHTML =
        '<div style="font-size:12px; color:#888; margin-bottom:6px;">今天这座塔，单人爬到的最高。每天换一座。</div>' +
        '<div style="font-size:13px; margin-bottom:6px; color:#4527a0;">你今天：' + (b.today ? '第 ' + b.today + ' 块' : '还没爬过') +
        '　历史最好：' + (gState.towerBest ? '第 ' + gState.towerBest + ' 块' : '没有') + '</div>' +
        '<div style="max-height:52vh; overflow:auto;">' + rows + '</div>';
    document.getElementById('tower-board').classList.remove('hidden');
}
function towerBoardClose() { document.getElementById('tower-board').classList.add('hidden'); }
        function towerTop(g) { return g.steps[g.steps.length - 1]; }
        // T1：塔按当天的每日效果生成。跳得矮/跑得慢的日子，台子高度差按最高跳高缩（跳高 ∝ jumpMul²），
        // 空隙按能飞多远缩（∝ speedMul × jumpMul），岩浆也相应放慢；变强的日子塔不变。
        // 所有人当天的每日效果一样，塔就一样（随机数的调用顺序不变）。
        function towerScale() {
            let j = DAILY_MOD.jumpMul, v = DAILY_MOD.speedMul;
            let h = Math.min(1, j * j), r = Math.min(1, v * j);
            // 空隙跟着缩，跑完全程的时间和平常差不多，塔矮了多少岩浆就慢多少
            return { h: h, r: r, lava: h };
        }
        // 存档点更新（只升不降）；自己的存档点那面旗换成金色
        function towerSetCp(g, a, i) {
            if (i <= (a.cp || 0)) return;
            a.cp = i; a.cpWarned = false;
            if (a.isPlayer) {
                let s = g.steps[i];
                if (s && s.flagMesh) s.flagMesh.material.color.setHex(0xffca28);
                if (i < g.steps.length - 1) blazeFlash('存档点：第 ' + i + ' 块');
            }
        }
        function towerLoseWord(g) { return g.opt.kind === 'solo' ? '就结束了' : g.opt.kind === 'duo' ? '就倒下了，等队友救' : '就出局了'; }
        NM_DEFS.tower = {
            sky: 0x311b92, fog: 0.0016, speed: TOWER.speed, jumpV: TOWER.jumpV, gravity: TOWER.gravity,
            camBack: 36, camUp: 16, fxY: 0,
            count: function (opt) { return opt.kind === 'solo' ? 1 : opt.kind === 'duo' ? 2 : 6; },
            build: function (g) {
                g.steps = [];
                let sc = towerScale(); g.sc = sc;
                let ang = 0, y = 0, r = 68, prevHalf = 26, prevKind = 'normal';
                g.steps.push({ x: 0, z: 70, y: 0, half: 26, mv: 0, kind: 'normal' });   // 起点大平台
                // 捷径：2~3 处，每处从第 i 块直接跳到第 i+5 块（绕出去的小路也能走，只是慢）
                let scStart = {};
                [[11, 16], [27, 32], [42, 47]].slice(0, 2 + (seededRandom() < 0.5 ? 1 : 0)).forEach(function (w) { scStart[w[0] + Math.floor(seededRandom() * (w[1] - w[0] + 1))] = 1; });
                for (let i = 1; i <= TOWER.steps; i++) {
                    // 按"边到边的空隙"来排，而不是随便转个角度——之前角度+半径都随机，有的两块离了 40 格，根本跳不过去。
                    // 满力跳大概能飞 20 格，空隙控制在 5~11，越往上越宽一点。
                    let top = i === TOWER.steps, flag = i % TOWER.flagEvery === 0;
                    let half = top ? 16 : Math.max(5.5, 10 - i * 0.06 - seededRandom() * 2);
                    let gap = (5 + seededRandom() * 4 + Math.min(2, i * 0.04)) * sc.r;
                    r = Math.max(60, Math.min(76, r + (seededRandom() - 0.5) * 6));
                    ang += (prevHalf + half + gap) / r;
                    prevHalf = half;
                    y += (5 + seededRandom() * 2.6) * sc.h;
                    // 台子种类：旗子、塔顶、捷径起点永远是普通台
                    let kind = 'normal', pr = seededRandom(), pk = seededRandom();
                    if (!top && !flag && !scStart[i] && pr < TOWER.specialP[Math.min(2, Math.ceil(i / (TOWER.steps / 3)) - 1)]) {
                        let acc = 0; kind = TOWER.kinds[TOWER.kinds.length - 1][0];
                        for (let k = 0; k < TOWER.kinds.length; k++) { acc += TOWER.kinds[k][1]; if (pk < acc) { kind = TOWER.kinds[k][0]; break; } }
                        if (kind === 'move' && prevKind === 'move') kind = 'crumble';   // 两块晃的挨着，空隙会拉大
                        if (kind === 'bar' && half < 6.2) kind = 'spring';              // 太小的台子放不下横杆
                    }
                    prevKind = kind;
                    let mv = kind === 'move' ? (6 + seededRandom() * 6) * sc.r : 0;
                    g.steps.push({ x: Math.sin(ang) * r, z: Math.cos(ang) * r, y: y, half: half, mv: mv, ph: seededRandom() * 6, flag: flag, kind: kind, w: (seededRandom() < 0.5 ? -1 : 1) * TOWER.barV });
                    if (scStart[i] && i + 5 < TOWER.steps) {
                        // 绕出去的小路：4 块小台子往外绕一圈，第 i+5 块在 i 的正前方，两块之间是一段稍长的空隙（要助跑）。
                        // 台子是方的，斜着排的时候空隙会被缩掉，所以每一跳都按"方块之间的实际空隙"量，不在 4.5~11 之间就把步长放大/缩小重排。
                        let P0 = g.steps[i], tx = Math.cos(ang), tz = -Math.sin(ang), nx = Math.sin(ang), nz = Math.cos(ang);
                        let half5 = Math.max(6, 9 - seededRandom() * 1.5);
                        let D = P0.half + half5 + (12.5 + seededRandom() * 1.5) * sc.r;
                        let loc = function (u, v) { return { x: P0.x + tx * u + nx * v, z: P0.z + tz * u + nz * v }; };
                        let sq = function (p, hp, q, hq) { return Math.hypot(Math.max(0, Math.abs(p.x - q.x) - hp - hq), Math.max(0, Math.abs(p.z - q.z) - hp - hq)); };
                        let pad = null, P5 = loc(D, 0), unit = function (deg) { let r2 = deg * Math.PI / 180; return [Math.sin(r2), Math.cos(r2)]; };   // 0 度 = 正外侧，90 度 = 沿前进方向
                        for (let rr = 17; rr <= 27 && !pad; rr += 0.5) {
                            for (let th1 = 0; th1 < 4 && !pad; th1++) for (let al = 20; al <= 80 && !pad; al += 15) for (let be = 0; be <= 45 && !pad; be += 15) {
                                let u1 = unit([0, 12, -12, 24][th1]), u2 = unit(al), u4 = unit(be);
                                let A1 = loc(u1[0] * rr, u1[1] * rr), a2 = loc(u1[0] * rr + u2[0] * rr, u1[1] * rr + u2[1] * rr), A4 = loc(D + u4[0] * rr, u4[1] * rr);
                                // A3 取离 A2、A4 都是 rr 的那个点（外侧的一个）
                                let mx = (a2.x + A4.x) / 2, mz = (a2.z + A4.z) / 2, dx = A4.x - a2.x, dz = A4.z - a2.z, dd = Math.hypot(dx, dz);
                                if (dd > rr * 2 - 1) continue;
                                let q = Math.sqrt(rr * rr - dd * dd / 4), px = -dz / dd, pz = dx / dd;
                                let c1 = { x: mx + px * q, z: mz + pz * q }, c2 = { x: mx - px * q, z: mz - pz * q };
                                let outward = function (c) { return (c.x - P0.x) * nx + (c.z - P0.z) * nz; };
                                let A3 = outward(c1) > outward(c2) ? c1 : c2;
                                let list = [P0, A1, a2, A3, A4, P5], hs = [P0.half, 6, 6, 6, 6, half5], ok = true;
                                for (let k = 0; k < 5 && ok; k++) { let gp = sq(list[k], hs[k], list[k + 1], hs[k + 1]); if (gp < 4.5 || gp > 11 * sc.r) ok = false; }
                                // 小路上的台子之间、跟起点终点之间都不能叠（隔一块的也不行）
                                for (let k = 0; k < 6 && ok; k++) for (let m = k + 2; m < 6 && ok; m++) if (Math.abs(list[k].x - list[m].x) < hs[k] + hs[m] + 2 && Math.abs(list[k].z - list[m].z) < hs[k] + hs[m] + 2) ok = false;
                                if (ok) pad = [A1, a2, A3, A4];
                            }
                        }
                        if (!pad) { prevKind = 'normal'; continue; }   // 排不下（极少）：这一处不做捷径，接着按普通路走
                        pad.forEach(function (c, k) {
                            g.steps.push({ x: c.x, z: c.z, y: y + [1.8, 3.6, 5.4, 6.8][k] * sc.h, half: 6, mv: 0, ph: 0, flag: (i + 1 + k) % TOWER.flagEvery === 0, kind: 'normal', w: 1, ring: true });
                        });
                        let px = P5.x, pz = P5.z;
                        y = P0.y + 7 * sc.h;
                        g.steps.push({ x: px, z: pz, y: y, half: half5, mv: 0, ph: 0, flag: (i + 5) % TOWER.flagEvery === 0, kind: 'normal', w: 1, scEnd: true });
                        P0.scTo = i + 5;
                        ang = Math.atan2(px, pz); r = Math.hypot(px, pz); prevHalf = half5; prevKind = 'normal';
                        i += 5;
                    }
                }
                // 晃的台子：晃到最远的时候，跟前后两块的空隙也得跳得过去——不行就把幅度收小
                g.steps.forEach(function (s, i) {
                    if (!s.mv) return;
                    let nb = [g.steps[i - 1], g.steps[i + 1]];
                    let worst = function (m) {
                        let w = 0;
                        nb.forEach(function (n) {
                            [-m, m].forEach(function (o) {
                                let gx = Math.max(0, Math.abs(s.x + o - n.x) - s.half - n.half), gz = Math.max(0, Math.abs(s.z - n.z) - s.half - n.half);
                                w = Math.max(w, Math.hypot(gx, gz));
                            });
                        });
                        return w;
                    };
                    while (s.mv > 2 && worst(s.mv) > TOWER.moveGapMax * sc.r) s.mv -= 0.5;
                    if (worst(s.mv) > TOWER.moveGapMax * sc.r) { s.mv = 0; s.kind = 'crumble'; }
                });
                // 传送带的方向：朝下一块（六成）或朝回走（四成）
                g.steps.forEach(function (s, i) {
                    if (s.kind !== 'belt') return;
                    let nx = g.steps[i + 1], dx = nx.x - s.x, dz = nx.z - s.z, d = Math.hypot(dx, dz) || 1, sg = seededRandom() < 0.6 ? 1 : -1;
                    s.bx = dx / d * sg; s.bz = dz / d * sg;
                });
                let KIND_COL = { move: 0x80deea, crumble: 0xd7b98e, spring: 0xff8a65, belt: 0x546e7a };
                g.steps.forEach(function (s, i) {
                    let top = i === g.steps.length - 1;
                    let m = new THREE.Mesh(new THREE.BoxGeometry(s.half * 2, 3, s.half * 2), new THREE.MeshLambertMaterial({ color: top ? 0xffd54f : (KIND_COL[s.kind] || (i % 2 ? 0xb39ddb : 0x9575cd)) }));
                    m.position.set(s.x, s.y - 1.5, s.z); nmAdd(m); s.mesh = m; s.x0 = s.x;
                    if (s.flag) {
                        let pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
                        pole.position.set(0, 7.5, 0); m.add(pole);
                        let fl = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.4), new THREE.MeshBasicMaterial({ color: 0x66bb6a }));
                        fl.position.set(2.5, 12, 0); m.add(fl); s.flagMesh = fl;
                    }
                    if (s.kind === 'spring') {
                        let rg = new THREE.Mesh(new THREE.TorusGeometry(s.half * 0.45, 0.7, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffeb3b }));
                        rg.rotation.x = Math.PI / 2; rg.position.y = 1.7; m.add(rg);
                    } else if (s.kind === 'belt') {
                        let sh = new THREE.Shape(); sh.moveTo(0, 3); sh.lineTo(2.4, 0); sh.lineTo(0.9, 0); sh.lineTo(0.9, -3); sh.lineTo(-0.9, -3); sh.lineTo(-0.9, 0); sh.lineTo(-2.4, 0); sh.closePath();
                        [-0.4, 0.4].forEach(function (off) {
                            let holder = new THREE.Group(); holder.rotation.y = Math.atan2(-s.bx, -s.bz); holder.position.set(s.bx * s.half * off, 1.6, s.bz * s.half * off);
                            let ar = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffeb3b, side: THREE.DoubleSide }));
                            ar.rotation.x = -Math.PI / 2; holder.add(ar); m.add(holder);
                        });
                    } else if (s.kind === 'bar') {
                        let bar = new THREE.Mesh(new THREE.BoxGeometry(s.half * 2, 3, 1.4), new THREE.MeshLambertMaterial({ color: 0xef5350 }));
                        bar.position.y = 3; m.add(bar); s.bar = bar;
                    }
                });
                // 路上的币：10 个，从下往上大致均匀撒在台子上（每人自己捡）
                g.coins = []; let used = {};
                for (let k = 0; k < TOWER.coins; k++) {
                    let idx = Math.min(TOWER.steps - 2, Math.max(3, Math.round(3 + k * 5.6 + seededRandom() * 3)));
                    while (used[idx] && idx < TOWER.steps - 1) idx++;
                    used[idx] = 1;
                    let grp = new THREE.Group(), disc = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.6, 16), new THREE.MeshBasicMaterial({ color: 0xffca28 }));
                    disc.rotation.x = Math.PI / 2; grp.add(disc); nmAdd(grp);
                    g.coins.push({ i: idx, grp: grp, got: false });
                }
                let pillar = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, towerTop(g).y + 60, 24), new THREE.MeshLambertMaterial({ color: 0x4527a0 }));
                pillar.position.y = (towerTop(g).y + 60) / 2 - 40; nmAdd(pillar);
                g.lavaY = TOWER.lava0 * sc.h;
                let lava = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ color: 0xff5722 }));
                lava.rotation.x = -Math.PI / 2; lava.position.y = g.lavaY; nmAdd(lava); g.lava = lava;
                let glow = new THREE.PointLight(0xff7043, 1.2, 160); nmAdd(glow); g.glow = glow;
            },
            spawns: function (g, n) {
                let out = [];
                for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * 6, z: 70, y: 0, facing: Math.PI / 2 });
                return out;
            },
            initActor: function (g, a) { a.best = 0; a.si = 0; a.skill = Math.random(); a.pauseT = 0; a.cp = 0; a.falls = 0; a.cpWarned = false; },
            speedMul: function (g, a) { return a.isPlayer || a.netId ? 1 : 0.62 + a.skill * 0.22; },   // AI 别比人快太多
            camYaw: function () { return -Math.PI / 2; },   // 塔是逆时针往上盘的，开局朝 +x 看第一块
            groundAt: function (g, x, z, prevY) {
                let best = -1e9;
                g.steps.forEach(function (s) {
                    if (Math.abs(x - s.x) <= s.half && Math.abs(z - s.z) <= s.half && s.y <= prevY + 0.6 && s.y > best && !(s.kind === 'crumble' && towerGone(g, s))) best = s.y;
                });
                return best;
            },
            jumpMul: function (g, a) { let s = towerStepUnder(g, a); return s && s.kind === 'spring' ? TOWER.springMul : 1; },   // 弹床：跳得高
            carry: function (g, a, dt) {   // 站在晃动的台子上跟着走；传送带把人往一个方向带
                if (!a.onGround) return;
                g.steps.forEach(function (s) {
                    if (Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half && Math.abs(a.p.y - s.y) < 0.2) {
                        if (s.mv) a.p.x += s.dx || 0;
                        if (s.kind === 'belt') { a.p.x += s.bx * TOWER.beltV * dt; a.p.z += s.bz * TOWER.beltV * dt; }
                    }
                });
            },
            ai: function (g, a, dt) {
                let w = { x: 0, z: 0, jump: false, act: false };
                // 站着的台子编号：往上找最近的一块当目标
                g.steps.forEach(function (s, i) { if (a.onGround && Math.abs(a.p.y - s.y) < 0.3 && Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half) a.si = i; });
                // 有捷径的那一块：技术好的 AI 经常直接跳过去
                let cur = g.steps[a.si];
                if (cur && cur.scTo && a.scPick !== a.si) { a.scPick = a.si; a.useSc = Math.random() < 0.2 + a.skill * 0.4; }
                let t = g.steps[Math.min(g.steps.length - 1, (cur && cur.scTo && a.useSc && a.scPick === a.si) ? cur.scTo : a.si + 1)];
                let dx = t.x - a.p.x, dz = t.z - a.p.z, d = Math.hypot(dx, dz) || 1;
                if (a.si === g.steps.length - 1) return w;
                let onCr = cur && cur.kind === 'crumble';
                // 双人合作：AI 队友领先太多就停下等你
                if (g.opt.kind === 'duo') {
                    let mate = g.actors.filter(function (b) { return b !== a; })[0];
                    if (mate && !mate.downed && a.si - mate.si > 4 && a.onGround) return w;
                }
                // 偶尔站一下再跳，像人在瞄
                if (a.pauseT > 0 && !onCr) { a.pauseT -= dt; return w; }
                if (a.onGround && !onCr && Math.random() < dt * (0.5 - a.skill * 0.3)) { a.pauseT = 0.3 + Math.random() * 0.6; return w; }
                w.x = dx / d; w.z = dz / d;
                // 在空中飞到目标台子上头就松开方向（人也会这么做），不然跳得高/跳得远的时候会飞过头
                if (!a.onGround) { let k = towerAirK(a, t, d); w.x *= k; w.z *= k; }
                a.aiT -= dt;
                // 离目标台子边缘不远了就起跳；偶尔起跳时机没掐好（AI 也会失误）
                // 脚下马上没地了就跳（看 0.12 秒后的位置），比按距离算稳——之前一群 AI 在起点边上直接走下去
                let edge = a.onGround && NM_DEFS.tower.groundAt(g, a.p.x + a.mvx * 0.12, a.p.z + a.mvz * 0.12, a.p.y) < a.p.y - 0.5;
                if (a.onGround && (edge || (a.aiT <= 0 && d < t.half + 10))) {
                    // 偶尔没跳好直接掉下去（技术差的掉得多）
                    if (edge && Math.random() < 0.05 - a.skill * 0.035) { a.aiT = 0.5; return w; }
                    w.jump = true; a.aiT = 0.35 + Math.random() * 0.4;
                }
                if (Math.random() < dt * 0.05) { w.x += (Math.random() - 0.5); w.z += (Math.random() - 0.5); }
                return w;
            },
            tick: function (g, dt) {
                g.steps.forEach(function (s) {
                    if (!s.mv) return;
                    let nx = s.x0 + Math.sin(g.clock * 1.3 + s.ph) * s.mv;
                    s.dx = nx - s.x; s.x = nx; s.mesh.position.x = nx;
                });
                if (nmIsHost() && g.clock > TOWER.grace) {
                    let k = Math.min(1, (g.clock - TOWER.grace) / TOWER.riseRamp);
                    g.lavaY += (TOWER.rise0 + (TOWER.rise1 - TOWER.rise0) * k) * (g.sc ? g.sc.lava : 1) * dt;
                }
                g.lava.position.y = g.lavaY;
                g.glow.position.set(g.me.p.x, g.lavaY + 20, g.me.p.z);
                // 易碎台：踩上去 1 秒后掉，再过 5 秒长回来（掉落时间按局内时钟算，大家看到的一样）
                g.steps.forEach(function (s) {
                    if (s.kind === 'crumble') {
                        let d = s.cs === undefined ? -1 : g.clock - s.cs, gone = towerGone(g, s), shake = d >= 0 && d < TOWER.crumbleT;
                        s.mesh.visible = !gone;
                        s.mesh.position.x = s.x + (shake ? Math.sin(g.clock * 70) * 0.5 : 0);
                        if (s.shaking !== shake) { s.shaking = shake; s.mesh.material.color.setHex(shake ? 0xe57373 : 0xd7b98e); }
                    } else if (s.kind === 'bar') {
                        let th = g.clock * s.w + s.ph; s.bar.rotation.y = -th;
                        g.actors.forEach(function (a) {
                            if (a.out || a.downed || a.barT > 0 || !nmMine(a)) return;
                            let dy = a.p.y - s.y; if (dy < -0.5 || dy > 3.2) return;
                            let ux = Math.cos(th), uz = Math.sin(th), rx = a.p.x - s.x, rz = a.p.z - s.z;
                            let al = rx * ux + rz * uz, cl = Math.max(-s.half, Math.min(s.half, al));
                            if (Math.hypot(rx - ux * cl, rz - uz * cl) > TOWER.barHit) return;
                            let sg = (al >= 0 ? 1 : -1) * (s.w > 0 ? 1 : -1);
                            nmKnock(a, -Math.sin(th) * sg * 55, Math.cos(th) * sg * 55, null, 14); a.barT = 0.8;
                        });
                    }
                });
                // 币：悬在台子中间，转着；只有自己捡得到
                g.coins.forEach(function (c) {
                    let s = g.steps[c.i], me = g.me;
                    c.grp.position.set(s.x, s.y + 7, s.z); c.grp.rotation.y = g.clock * 3;
                    if (c.got || me.out || me.downed) return;
                    if (Math.hypot(me.p.x - s.x, me.p.z - s.z) < 6 && me.p.y < s.y + 9 && me.p.y > s.y - 7) {
                        c.got = true; c.grp.visible = false; me.runCoins = (me.runCoins || 0) + 1;
                        blazeFlash('猫盾币 +1（' + me.runCoins + ' / ' + TOWER.coins + '）');
                    }
                });
                g.actors.forEach(function (a) {
                    if (a.out || a.downed) return;
                    if (a.barT > 0) a.barT -= dt;
                    g.steps.forEach(function (s, i) {
                        if (a.onGround && Math.abs(a.p.y - s.y) < 0.3 && Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half) {
                            a.si = i; if (i > a.best) a.best = i;
                            if (s.kind === 'crumble' && nmMine(a) && (s.cs === undefined || g.clock >= s.cs + TOWER.crumbleT + TOWER.crumbleBack)) {
                                s.cs = g.clock;
                                if (g.net) bc.postMessage({ type: 'NM_EV', target: '*', sender: gState.id, mode: 'tower', ev: 'cr', k: i, t: +g.clock.toFixed(2) });
                            }
                        }
                    });
                    let st = g.steps[a.si];
                    if (st && st.flag && a.si > (a.cp || 0)) towerSetCp(g, a, a.si);
                    // 存档点被岩浆淹了：提醒一次（再掉下去就结束了）
                    if (a.isPlayer && !a.cpWarned && g.lavaY > g.steps[a.cp || 0].y) { a.cpWarned = true; blazeFlash('存档点被岩浆淹了！再掉下去' + towerLoseWord(g)); }
                    if (a.best >= g.steps.length - 1 && !a.done) {
                        a.done = true; a.doneT = g.clock;
                        if (a.isPlayer) blazeFlash('到顶了！');
                    }
                });
                // 双人：活着的那个人摸到比倒下的人更高的旗子，就把他拉回来
                if (g.opt.kind === 'duo') g.actors.forEach(function (a) {
                    if (!a.downed) return;
                    let mate = g.actors.filter(function (b) { return b !== a && !b.downed && !b.out; })[0];
                    if (!mate || !nmMine(a)) return;
                    let s = g.steps[mate.si];
                    if (s && s.flag && mate.si > (a.downAt || 0) && mate.onGround) {
                        a.downed = false; a.mesh.visible = true;
                        a.p.set(s.x + 3, s.y + 1, s.z); a.vy = 0; a.mvx = a.mvz = a.kx = a.kz = 0; a.si = mate.si;
                        if (mate.si > (a.cp || 0)) towerSetCp(g, a, mate.si);
                        nmBurst(a.p.x, a.p.y, a.p.z, 0x66bb6a);
                        blazeFlash(a.isPlayer ? mate.name + ' 把你拉回来了！' : '把 ' + a.name + ' 拉回来了！');
                        if (g.net) bc.postMessage({ type: 'NM_EV', target: '*', sender: gState.id, mode: 'tower', ev: 'up', i: a.idx });
                    }
                });
            },
            fallCheck: function (g, a) { return a.p.y < g.lavaY + 1 ? '掉进岩浆了' : null; },
            onFall: function (g, a, why) {
                a.falls = (a.falls || 0) + 1;
                let cs = g.steps[a.cp || 0];
                // 岩浆还没淹到存档点台面：回存档点接着爬，不算失败
                if (g.lavaY < cs.y) {
                    let spread = Math.min(10, cs.half);
                    a.p.set(cs.x + (Math.random() - 0.5) * spread, cs.y + 1, cs.z + (Math.random() - 0.5) * spread);
                    a.vy = 0; a.mvx = a.mvz = a.kx = a.kz = 0; a.si = a.cp || 0;
                    if (a.isPlayer) {
                        blazeFlash(a.cp ? '回到存档点（第 ' + a.cp + ' 块）' : '回到起点');
                        introOnce('tower.cp', '存档点', '起点和每面绿旗是存档点，站上去就记住。<br>掉进岩浆时，岩浆还没淹到存档点就回那里接着爬；淹过了再掉，' + towerLoseWord(g) + '。');
                    }
                    return;
                }
                if (g.opt.kind === 'duo') {
                    a.downed = true; a.downAt = a.si; a.mesh.visible = false;
                    nmBurst(a.p.x, g.lavaY, a.p.z, 0xff5722);
                    if (a.isPlayer) blazeFlash('掉进岩浆了！等队友救');
                    if (g.net) bc.postMessage({ type: 'NM_EV', target: '*', sender: gState.id, mode: 'tower', ev: 'down', i: a.idx, at: a.si });
                    return;
                }
                nmOut(a, g.opt.kind === 'solo' ? '岩浆淹过了存档点，游戏结束' : '岩浆淹过了存档点，出局了');
            },
            onEv: function (g, m) {
                if (m.ev === 'cr') { let s = g.steps[m.k]; if (s && s.kind === 'crumble') s.cs = m.t; return; }
                let a = g.actors[m.i]; if (!a) return;
                if (m.ev === 'down') { a.downed = true; a.downAt = m.at; a.mesh.visible = false; }
                else if (m.ev === 'up') { a.downed = false; a.mesh.visible = true; }
            },
            worldState: function (g) { return { lava: +g.lavaY.toFixed(1), d: g.actors.map(function (a) { return a.done ? 1 : 0; }) }; },
            applyWorld: function (g, s) {
                g.lavaY = s.lava;
                (s.d || []).forEach(function (v, i) { if (v && g.actors[i]) g.actors[i].done = true; });
            },
            checkEnd: function (g) {
                let kind = g.opt.kind;
                let alive = g.actors.filter(function (a) { return !a.out && !a.downed; });
                if (kind === 'duo') {
                    if (g.actors.every(function (a) { return a.done; })) return { w: 1 };
                    if (!alive.length) return { w: 0 };
                    return null;
                }
                let first = g.actors.filter(function (a) { return a.done; }).sort(function (a, b) { return a.doneT - b.doneT; })[0];
                if (first) return { w: first.idx, top: 1 };
                if (kind === 'solo') return g.me.out ? { w: -1, h: g.me.best } : null;
                if (alive.length === 0) return { w: -1 };
                if (alive.length === 1 && g.actors.length > 1) return { w: alive[0].idx };
                return null;
            },
            didWin: function (g, res, me) {
                if (g.opt.kind === 'duo') return res.w === 1;
                if (g.opt.kind === 'solo') return res.w === me.idx;
                return res.w === me.idx || nmPlace(me) <= 2;
            },
            resultTitle: function (g, res, won) {
                if (g.opt.kind === 'duo') return won ? '两个人都爬上去了！' : '都掉下去了';
                if (res.w === g.me.idx) return res.top ? '到顶了！' : '你撑到了最后！';
                return res.w >= 0 ? g.actors[res.w].name + (res.top ? ' 先到顶' : ' 撑到了最后') : '岩浆赢了';
            },
            resultText: function (g, res) {
                let h = g.me.best;
                let rec = gState.towerBest || 0;
                return '你爬到第 ' + h + ' 块（共 ' + (g.steps.length - 1) + ' 块）' + (h > rec ? '，新纪录！' : '，最好 ' + rec + ' 块') +
                    '<br>掉下去 ' + (g.me.falls || 0) + ' 次　捡了 ' + (g.me.runCoins || 0) + ' 个币';
            },
            afterEnd: function (g) {
                let h = g.me.best || 0;
                if (h > (gState.towerBest || 0)) gState.towerBest = h;
                if (g.opt.kind === 'solo') {   // 单人：记今天爬的最高（今日排行用）
                    let d = localDayNum();
                    if (!gState.towerDay || gState.towerDay.d !== d) gState.towerDay = { d: d, h: 0 };
                    if (h > gState.towerDay.h) gState.towerDay.h = h;
                }
                if (g.me.runCoins > 0) coinsBonus = { mode: 'tower', n: Math.min(TOWER.coins, g.me.runCoins) };
                saveProgress();
            },
            hud: function (g) {
                let me = g.me, total = g.steps.length - 1;
                let gap = Math.max(0, Math.round(me.p.y - g.lavaY));
                let kindTxt = g.opt.kind === 'solo' ? '单人' : g.opt.kind === 'duo' ? '双人合作' : '多人';
                let mate = g.opt.kind === 'duo' ? g.actors.filter(function (b) { return b !== me; })[0] : null;
                let flooded = g.lavaY > g.steps[me.cp || 0].y;
                nmHudText('第 ' + me.best + ' / ' + total + ' 块　离岩浆 ' + gap + '　币 ' + (me.runCoins || 0) + '/' + TOWER.coins,
                    (flooded && !me.out && !me.downed ? '⚠ 存档点被淹了，再掉下去' + towerLoseWord(g) + '　' : '存档点：' + (me.cp ? '第 ' + me.cp + ' 块' : '起点') + '　') +
                    kindTxt + (g.clock < TOWER.grace ? '　' + Math.ceil(TOWER.grace - g.clock) + ' 秒后岩浆开始涨' : '　岩浆在涨') +
                    (mate ? '　队友：' + mate.name + (mate.downed ? '（掉下去了）' : mate.done ? '（到顶了）' : '') : '') +
                    (me.downed ? '　掉下去了' : ''));
                if (mate && mate.downed) introOnce('tower.save', '救队友', '队友掉下去了。你爬到下一面绿旗，就能把他拉回来。');
                if (me.downed) introOnce('tower.down', '掉下去了', '别急，队友爬到下一面绿旗就能把你拉回来。');
            }
        };


        // ══════════════ 创作界面（猫盾乐园 / 合作密室 共用，像 Scratch 那样拖积木）══════════════
        // 左边是积木，拖（或点一下）到右边就加进去；右边的积木能上下拖着换位置，拖回左边就删掉。
        // 只留最基础的几块：乐园 6 块，密室 6 种房间。老分享码里的其它积木照样能玩，只是这里不再提供。
        const MK_COLOR_OPTS = { orange: '橙色', blue: '蓝色', red: '红色', green: '绿色' };
        const MAKER_DEFS = {
            park: {
                title: '猫盾乐园 · 创作', max: 16, hat: '当游戏开始', cap: null,
                cats: [
                    { name: '生成', col: '#ffab19', blocks: ['spawn'] },
                    { name: '动作', col: '#4c97ff', blocks: ['fall', 'chase'] },
                    { name: '碰到', col: '#5cb1d6', blocks: ['touch'] },
                    { name: '输赢', col: '#59c059', blocks: ['win', 'time'] }
                ],
                blocks: {
                    spawn: { col: '#ffab19', make: function () { return { type: 'spawn', color: 'orange', every: 1.5 }; }, parts: ['每', ['every', 'num'], '秒出一个', ['color', MK_COLOR_OPTS]] },
                    fall: { col: '#4c97ff', make: function () { return { type: 'fall', color: 'orange', speed: 8 }; }, parts: [['color', MK_COLOR_OPTS], '往下掉，速度', ['speed', 'num']] },
                    chase: { col: '#4c97ff', make: function () { return { type: 'chase', color: 'red' }; }, parts: [['color', MK_COLOR_OPTS], '朝我走过来'] },
                    touch: { col: '#5cb1d6', make: function () { return { type: 'touch', color: 'orange', effect: 'score' }; }, parts: ['碰到', ['color', MK_COLOR_OPTS], '就', ['effect', { score: '+1 分', lose1: '-1 分', win: '赢了', lose: '输了' }]] },
                    win: { col: '#59c059', make: function () { return { type: 'win', score: 10 }; }, parts: ['得到', ['score', 'num'], '分就赢'] },
                    time: { col: '#59c059', make: function () { return { type: 'time', seconds: 60, result: 'lose' }; }, parts: [['seconds', 'num'], '秒后', ['result', { lose: '输了', win: '赢了' }]] }
                },
                load: function () {
                    if (!Array.isArray(gState.parkDraft)) gState.parkDraft = parkEditorBlocks.slice();
                    return gState.parkDraft;
                },
                test: function (list) { parkBegin({ name: makerName() || '我做的小游戏', blocks: list.slice() }); },
                code: function (list) { return parkEncode(gState.id, list); }
            },
            escape: {
                title: '合作密室 · 创作', max: ESC_ROOM_MAX, hat: '从起点出发', cap: '到终点',
                cats: [
                    { name: '机关', col: '#ff8c1a', blocks: ['color', 'duo', 'lever', 'key'] },
                    { name: '陷阱', col: '#ff6680', blocks: ['laser', 'hurdle'] }
                ],
                blocks: {
                    color: { col: '#ff8c1a', make: function () { return { t: 'color' }; }, parts: ['彩色板：各站各的颜色'] },
                    duo: { col: '#ff8c1a', make: function () { return { t: 'duo' }; }, parts: ['灰板：两个人站住'] },
                    lever: { col: '#ff8c1a', make: function () { return { t: 'lever', side: 'R' }; }, parts: ['拉杆门', ['side', { L: '在左边', R: '在右边' }]] },
                    key: { col: '#ff8c1a', make: function () { return { t: 'key', side: 'R' }; }, parts: ['钥匙开锁', ['side', { L: '锁在左边', R: '锁在右边' }]] },
                    laser: { col: '#ff6680', make: function () { return { t: 'laser', speed: 'mid' }; }, parts: ['激光', ['speed', { slow: '慢', mid: '中', fast: '快' }]] },
                    hurdle: { col: '#ff6680', make: function () { return { t: 'hurdle' }; }, parts: ['矮栏：跳过去'] }
                },
                load: function () { return escDraft().r; },
                test: function (list) { escapeBegin(null, gState.id, 'c:' + this.code(list)); },
                code: function (list) { return parkEncode(gState.id, { n: makerName(), r: list }); }
            }
        };
        let maker = null, makerReturn = null;
        function makerKindOf(b) { return b.type || b.t; }
        function makerName() { let el = document.getElementById('mk-name'); return el ? el.value.trim().slice(0, 12) : ''; }
        function makerOpen(kind) {
            let D = MAKER_DEFS[kind]; if (!D) return;
            maker = { kind: kind, D: D, list: D.load() };
            document.getElementById('mk-title').innerText = D.title;
            let nm = document.getElementById('mk-name');
            nm.value = kind === 'escape' ? (escDraft().n || '') : (gState.parkDraftName || '');
            document.getElementById('mk-share').innerText = '';
            makerRenderPalette(); makerRender();
            document.getElementById('maker').classList.remove('hidden');
            if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { } }
        }
        function makerClose() {
            makerSave();
            document.getElementById('maker').classList.add('hidden');
            if (maker) selectGameMode(maker.kind);
            maker = null;
        }
        function makerSave() {
            if (!maker) return;
            if (maker.kind === 'escape') escDraft().n = makerName(); else gState.parkDraftName = makerName();
            saveProgress();
        }
        // 一块积木的 HTML。live=true 是右边真的积木（输入框能改），false 是左边的样品
        function makerBlockHtml(b, i, live) {
            let def = maker.D.blocks[makerKindOf(b)];
            if (!def) return '<div class="mk-blk" style="background:#9e9e9e;" data-i="' + i + '">（这块积木现在没有了）</div>';
            let inner = def.parts.map(function (p) {
                if (typeof p === 'string') return '<span>' + p + '</span>';
                let f = p[0], v = b[f];
                if (p[1] === 'num') return live ? '<input class="mk-num" type="number" value="' + v + '" onchange="makerSet(' + i + ',\'' + f + '\',this.value,1)">' : '<span class="mk-pill">' + v + '</span>';
                let opts = p[1];
                if (!live) return '<span class="mk-pill">' + (opts[v] || v) + ' ▾</span>';
                return '<select class="mk-sel" onchange="makerSet(' + i + ',\'' + f + '\',this.value,0)">' + Object.keys(opts).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + opts[k] + '</option>'; }).join('') + '</select>';
            }).join('');
            return '<div class="mk-blk" style="background:' + def.col + ';" data-i="' + i + '">' + inner + '</div>';
        }
        function makerRenderPalette() {
            let el = document.getElementById('mk-palette');
            el.innerHTML = maker.D.cats.map(function (c) {
                return '<div class="mk-cat"><span style="background:' + c.col + ';"></span>' + c.name + '</div>' +
                    c.blocks.map(function (k) { return '<div class="mk-pal" data-k="' + k + '">' + makerBlockHtml(maker.D.blocks[k].make(), -1, false) + '</div>'; }).join('');
            }).join('');
            el.querySelectorAll('.mk-pal').forEach(function (n) {
                n.addEventListener('pointerdown', function (e) { makerDragStart(e, { pal: n.getAttribute('data-k') }, n.firstChild); });
            });
        }
        function makerRender() {
            let el = document.getElementById('mk-stack');
            let L = maker.list;
            el.innerHTML = '<div class="mk-blk mk-hat">' + maker.D.hat + '</div>' +
                L.map(function (b, i) { return makerBlockHtml(b, i, true); }).join('') +
                (L.length ? '' : '<div class="mk-empty">把左边的积木拖到这里（点一下也行）</div>') +
                (maker.D.cap ? '<div class="mk-blk mk-cap">' + maker.D.cap + '</div>' : '');
            el.querySelectorAll('.mk-blk[data-i]').forEach(function (n) {
                n.addEventListener('pointerdown', function (e) {
                    if (e.target.closest('input, select')) return;
                    makerDragStart(e, { idx: +n.getAttribute('data-i') }, n);
                });
            });
            document.getElementById('mk-count').innerText = L.length + ' / ' + maker.D.max;
        }
        function makerSet(i, f, v, num) { let b = maker.list[i]; if (!b) return; b[f] = num ? (parseFloat(v) || 0) : v; makerSave(); }
        function makerAdd(k, at) {
            if (maker.list.length >= maker.D.max) { blazeFlash('最多 ' + maker.D.max + ' 块'); return; }
            let b = maker.D.blocks[k].make();
            if (at === undefined || at > maker.list.length) at = maker.list.length;
            maker.list.splice(at, 0, b); makerSave(); makerRender();
        }
        // ── 拖积木：鼠标和手指都走 pointer 事件 ──
        let mkDrag = null;
        function makerDragStart(e, src, node) {
            e.preventDefault();
            let r = node.getBoundingClientRect();
            mkDrag = { src: src, node: node, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, ghost: null, moved: false };
            window.addEventListener('pointermove', makerDragMove);
            window.addEventListener('pointerup', makerDragEnd);
            window.addEventListener('pointercancel', makerDragEnd);
        }
        function makerDropIndex(y) {
            let ns = Array.from(document.querySelectorAll('#mk-stack .mk-blk[data-i]'));
            for (let i = 0; i < ns.length; i++) { let r = ns[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return +ns[i].getAttribute('data-i'); }
            return maker.list.length;
        }
        function makerOverStack(x, y) { let r = document.getElementById('mk-area').getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
        function makerDragMove(e) {
            let d = mkDrag; if (!d) return;
            if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
            if (!d.moved) {
                d.moved = true;
                d.ghost = d.node.cloneNode(true); d.ghost.classList.add('mk-ghost');
                document.body.appendChild(d.ghost);
                if (d.src.idx !== undefined) d.node.style.opacity = '0.3';
            }
            d.ghost.style.left = (e.clientX - d.ox) + 'px'; d.ghost.style.top = (e.clientY - d.oy) + 'px';
            let line = document.getElementById('mk-line');
            if (makerOverStack(e.clientX, e.clientY)) {
                let i = makerDropIndex(e.clientY), ns = document.querySelectorAll('#mk-stack .mk-blk[data-i]');
                let ref = ns[i] || document.querySelector('#mk-stack .mk-cap') || null;
                let host = document.getElementById('mk-stack').getBoundingClientRect();
                let y = ref ? ref.getBoundingClientRect().top : (ns.length ? ns[ns.length - 1].getBoundingClientRect().bottom : document.querySelector('#mk-stack .mk-hat').getBoundingClientRect().bottom);
                line.style.display = 'block'; line.style.top = (y - host.top - 2) + 'px';
            } else line.style.display = 'none';
            document.getElementById('mk-palette').classList.toggle('mk-trash', d.src.idx !== undefined && !makerOverStack(e.clientX, e.clientY));
        }
        function makerDragEnd(e) {
            let d = mkDrag; mkDrag = null;
            window.removeEventListener('pointermove', makerDragMove);
            window.removeEventListener('pointerup', makerDragEnd);
            window.removeEventListener('pointercancel', makerDragEnd);
            document.getElementById('mk-line').style.display = 'none';
            document.getElementById('mk-palette').classList.remove('mk-trash');
            if (!d) return;
            if (d.ghost) d.ghost.remove();
            d.node.style.opacity = '';
            if (!d.moved) { if (d.src.pal) makerAdd(d.src.pal); return; }   // 点一下 = 加到最后
            let over = makerOverStack(e.clientX, e.clientY);
            if (d.src.pal) { if (over) makerAdd(d.src.pal, makerDropIndex(e.clientY)); return; }
            let from = d.src.idx, b = maker.list[from];
            if (!over) { maker.list.splice(from, 1); makerSave(); makerRender(); return; }   // 拖出去 = 删掉
            let to = makerDropIndex(e.clientY);
            maker.list.splice(from, 1);
            if (to > from) to--;
            maker.list.splice(to, 0, b); makerSave(); makerRender();
        }
        function makerTest() {
            if (!maker.list.length) { blazeFlash('先拖一块积木进来'); return; }
            makerSave();
            let kind = maker.kind, D = maker.D, list = maker.list;
            document.getElementById('maker').classList.add('hidden');
            maker = null; makerReturn = kind;
            D.test(list);
        }
        function makerShare() {
            if (!maker.list.length) { blazeFlash('先拖一块积木进来'); return; }
            makerSave();
            let code = maker.D.code(maker.list);
            document.getElementById('mk-share').innerText = '分享码：' + code;
            let done = function () { blazeFlash('分享码复制好了，发给朋友'); }, fail = function () { blazeFlash('长按上面的分享码复制'); };
            try { navigator.clipboard.writeText(code).then(done, fail); } catch (e) { fail(); }
        }
        // 试玩完回到创作界面，不是回大厅
        function makerAfterGame() {
            if (!makerReturn) return false;
            let k = makerReturn; makerReturn = null;
            sysModalCloseNormal();
            makerOpen(k);
            return true;
        }
