        // ══════════════════════════════════════════════════════════
        //  新模式通用框架：推推乐 / 彩弹占地 / 爬塔
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

        function nmStartGo(mode, opt) {
            opt = opt || {};
            let def = NM_DEFS[mode];
            let cap = def.count(opt);
            let go = function (ids) {
                let plan = ids.slice(0, cap).map(function (id) { return { id: id }; });
                let seed = Math.floor(Math.random() * 1000000) || 1;
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
                let label = nightMakeLabel(name, col, false, isP ? myTitle() : (q.id ? peerTitleOf(q.id) : aiRandomTitle()));
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
                'race-dash-btn', 'race-skill-btn', 'race-item-btn', 'run-btn'].forEach(function (id) {
                    let e = document.getElementById(id); if (e) e.style.display = 'none';
                });
            let pad = gState.control === 'pad';
            let jb = document.getElementById('race-jump-btn'); if (jb) { jb.innerText = '跳'; jb.style.display = (on && pad) ? 'flex' : 'none'; }
            let ab = document.getElementById('nm-act-btn');
            if (ab) { ab.innerText = on && nm ? (nm.def.actLabel || '') : ''; ab.style.display = (on && pad && nm && nm.def.actLabel) ? 'flex' : 'none'; }
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
            let act = !!(keys['lmb'] || keys['e'] || touchBtn.nmAct); keys['e'] = false; touchBtn.nmAct = false;
            if (nm.def.actHold) act = !!(keys['lmb'] || keys['e']) || act;
            // 人朝镜头方向（横着走也是面朝前），推/喷都朝镜头看的方向
            return { x: n > 1 ? mx / n : mx, z: n > 1 ? mz / n : mz, jump: jump, act: act, face: a.facing };
        }
        function nmPhysics(a, w, dt) {
            let def = nm.def;
            if (a.actCd > 0) a.actCd -= dt;
            if (a.stunT > 0) { a.stunT -= dt; w = { x: 0, z: 0, jump: false, act: false, face: w.face }; }
            let sp = def.speed * (def.speedMul ? def.speedMul(nm, a) : 1) * DAILY_MOD.speedMul;
            let wx = w.x * sp, wz = w.z * sp;
            let rate = (Math.abs(wx) + Math.abs(wz) > 0.01 ? 1 / 0.16 : 1 / 0.14) * (a.onGround ? 1 : 0.45);
            let k = Math.min(1, rate * dt);
            a.mvx += (wx - a.mvx) * k; a.mvz += (wz - a.mvz) * k;
            if (w.face !== undefined) a.facing = w.face;
            else if (w.x || w.z) a.facing = Math.atan2(w.x, w.z);
            // 击退冲量单独算，慢慢衰减——被推的那一下是"飞出去"，不是被自己的移动抵消
            let kd = Math.pow(0.08, dt);
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
            if (w.jump && (onG || a.coyote > 0)) { a.vy = def.jumpV * DAILY_MOD.jumpMul; onG = false; a.coyote = 0; }
            a.vy -= def.gravity * dt;
            a.p.y += a.vy * dt;
            g = def.groundAt(nm, a.p.x, a.p.z, prevY);
            if (g > -1e8 && a.p.y <= g && prevY >= g - 0.8) { a.p.y = g; a.vy = 0; a.onGround = true; a.coyote = 0.1; }
            else { if (a.onGround) a.coyote = 0.1; a.onGround = false; if (a.coyote > 0) a.coyote -= dt; }
            if (w.act && a.actCd <= 0 && def.act) def.act(nm, a);
        }
        function nmKnock(b, ix, iz, by, hop) {
            if (!b || b.out) return;
            if (nmMine(b)) {
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
                a.mesh.rotation.y = a.facing || 0;
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
        const SUMO = {
            count: 8, r0: 110, rMin: 34, shrinkAt: 20, shrinkRate: 0.55, time: 150,
            speed: 42, jumpV: 40, gravity: 140, pushRange: 12, pushCos: 0.5, pushPower: 105, pushCd: 1.1
        };
        function sumoRadius(t) { return t < SUMO.shrinkAt ? SUMO.r0 : Math.max(SUMO.rMin, SUMO.r0 - (t - SUMO.shrinkAt) * SUMO.shrinkRate); }
        NM_DEFS.sumo = {
            sky: 0xb3e5fc, fog: 0.0016, speed: SUMO.speed, jumpV: SUMO.jumpV, gravity: SUMO.gravity,
            camBack: 34, camUp: 20, actLabel: '推', fxY: 0,
            count: function () { return SUMO.count; },
            build: function (g) {
                let plat = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 8, 64), new THREE.MeshLambertMaterial({ color: 0xffe0b2 }));
                plat.position.y = -4; nmAdd(plat); g.plat = plat;
                let ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 64), new THREE.MeshBasicMaterial({ color: 0xe53935 }));
                ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; nmAdd(ring); g.ring = ring;
                let rings = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 48), new THREE.MeshBasicMaterial({ color: 0xffcc80, side: THREE.DoubleSide }));
                rings.rotation.x = -Math.PI / 2; rings.position.y = 0.05; rings.scale.setScalar(SUMO.r0); nmAdd(rings);
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
            groundAt: function (g, x, z) { return Math.hypot(x, z) <= sumoRadius(g.clock) ? 0 : -1e9; },
            act: function (g, a) {
                a.actCd = SUMO.pushCd; a.gestureT = 0.35;
                let fx = Math.sin(a.facing), fz = Math.cos(a.facing);
                a.kx += fx * 45; a.kz += fz * 45;   // 自己往前一冲
                g.actors.forEach(function (b) {
                    if (b === a || b.out) return;
                    let dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, d = Math.hypot(dx, dz);
                    if (d > SUMO.pushRange || d < 0.01 || Math.abs(b.p.y - a.p.y) > 8) return;
                    if ((dx / d) * fx + (dz / d) * fz < SUMO.pushCos) return;
                    nmKnock(b, dx / d * SUMO.pushPower, dz / d * SUMO.pushPower, a, 22);
                    nmBurst(b.p.x, b.p.y, b.p.z, 0xffffff);
                });
            },
            ai: function (g, a, dt) {
                let r = sumoRadius(g.clock), dc = Math.hypot(a.p.x, a.p.z);
                let w = { x: 0, z: 0, jump: false, act: false };
                a.aiT -= dt;
                if (dc > r - 16) { w.x = -a.p.x / (dc || 1); w.z = -a.p.z / (dc || 1); return w; }   // 太靠边，先回中间
                let t = nmNearest(a);
                if (!t) return w;
                let dx = t.b.p.x - a.p.x, dz = t.b.p.z - a.p.z, d = t.d || 1;
                w.x = dx / d; w.z = dz / d;
                if (a.aiT <= 0 && d < SUMO.pushRange - 1 && nmFacingDot(a, t.b) > 0.6) { w.act = true; a.aiT = 0.3 + Math.random() * 0.6; }
                if (Math.random() < dt * 0.15) w.jump = true;
                return w;
            },
            tick: function (g) {
                let r = sumoRadius(g.clock);
                g.plat.scale.set(r, 1, r);
                g.ring.scale.set(r, r, 1);
                g.ring.material.color.setHex(g.clock > SUMO.shrinkAt - 3 && Math.sin(g.clock * 8) > 0 ? 0xffeb3b : 0xe53935);
            },
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
                nmHudText('存活 ' + alive + ' / ' + g.actors.length + '　' + t + 's',
                    (g.clock < SUMO.shrinkAt ? Math.ceil(SUMO.shrinkAt - g.clock) + ' 秒后台子开始缩　' : '台子在缩　') + '推下去 ' + g.me.kills + ' 人' +
                    (g.me.out ? '　出局了，在观战' : ''));
            }
        };

        // ══════════════ 彩弹占地 ══════════════
        // 4v4。走过的地方刷成自己队的颜色，按「喷」往前扔一团颜料，落地炸开一片；
        // 砸中对面的人他会愣 1.5 秒。时间到，哪队地盘大哪队赢。踩在对面的颜色上走得慢。
        const PAINT = {
            count: 8, grid: 32, cell: 9, time: 120, speed: 44, jumpV: 40, gravity: 140,
            shootCd: 0.45, blobSpeed: 95, blobGrav: 110, splash: 1, stunT: 1.5, enemySlow: 0.72, hitR: 5
        };
        function paintHalf() { return PAINT.grid * PAINT.cell / 2; }
        function paintCellOf(x, z) {
            let h = paintHalf();
            return { cx: Math.floor((x + h) / PAINT.cell), cz: Math.floor((z + h) / PAINT.cell) };
        }
        function paintSet(g, cx, cz, team) {
            if (cx < 0 || cz < 0 || cx >= PAINT.grid || cz >= PAINT.grid) return;
            let i = cz * PAINT.grid + cx;
            if (g.walls[i]) return;
            let v = team + 1;
            if (g.cells[i] === v) return;
            g.cells[i] = v; g.dirty = true;
        }
        function paintSplash(g, x, z, team, r) {
            let c = paintCellOf(x, z);
            for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r + 1) paintSet(g, c.cx + dx, c.cz + dz, team);
        }
        function paintCount(g) {
            let c = [0, 0], tot = 0;
            for (let i = 0; i < g.cells.length; i++) { if (g.walls[i]) continue; tot++; if (g.cells[i] === 1) c[0]++; else if (g.cells[i] === 2) c[1]++; }
            return { a: c[0], b: c[1], tot: tot };
        }
        function paintTexUpdate(g) {
            if (!g.dirty) return;
            g.dirty = false;
            let d = g.tex.image.data;
            let cols = [[236, 239, 241], [41, 182, 246], [236, 64, 122]];
            for (let i = 0; i < g.cells.length; i++) {
                let c = g.walls[i] ? [120, 144, 156] : cols[g.cells[i]];
                d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
            }
            g.tex.needsUpdate = true;
        }
        function paintShoot(g, a, remote) {
            let fx = Math.sin(a.facing), fz = Math.cos(a.facing);
            let pitch = a.isPlayer ? Math.max(-0.1, Math.min(0.8, camera.rotation.x + 0.35)) : 0.3 + Math.random() * 0.2;
            let b = {
                x: a.p.x + fx * 4, y: a.p.y + 8, z: a.p.z + fz * 4, team: a.team, by: a.idx,
                vx: fx * PAINT.blobSpeed * Math.cos(pitch), vy: PAINT.blobSpeed * Math.sin(pitch), vz: fz * PAINT.blobSpeed * Math.cos(pitch)
            };
            b.mesh = nmAdd(new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshLambertMaterial({ color: NM_TEAM_COL[a.team], emissive: NM_TEAM_COL[a.team], emissiveIntensity: 0.3 })));
            g.blobs.push(b);
            if (!remote && g.net) bc.postMessage({ type: 'NM_EV', target: '*', sender: gState.id, mode: 'paint', ev: 'shot', i: a.idx, x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(1), vx: +b.vx.toFixed(1), vy: +b.vy.toFixed(1), vz: +b.vz.toFixed(1) });
        }
        NM_DEFS.paint = {
            sky: 0xe1f5fe, fog: 0.0012, speed: PAINT.speed, jumpV: PAINT.jumpV, gravity: PAINT.gravity,
            camBack: 32, camUp: 18, actLabel: '喷', teams: true, actHold: true, fxY: 0,
            count: function () { return PAINT.count; },
            build: function (g) {
                let N = PAINT.grid, h = paintHalf();
                g.cells = new Uint8Array(N * N); g.walls = new Uint8Array(N * N); g.blobs = [];
                // 几块掩体：中心对称摆，两边公平
                for (let k = 0; k < 7; k++) {
                    let cx = 5 + Math.floor(seededRandom() * (N / 2 - 6)), cz = 3 + Math.floor(seededRandom() * (N - 6));
                    let w = 1 + Math.floor(seededRandom() * 2), d = 1 + Math.floor(seededRandom() * 3);
                    [[cx, cz], [N - 1 - cx - (w - 1), N - 1 - cz - (d - 1)]].forEach(function (o) {
                        for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) g.walls[(o[1] + z) * N + o[0] + x] = 1;
                        let m = new THREE.Mesh(new THREE.BoxGeometry(w * PAINT.cell, 10, d * PAINT.cell), new THREE.MeshLambertMaterial({ color: 0x90a4ae }));
                        m.position.set(-h + (o[0] + w / 2) * PAINT.cell, 5, -h + (o[1] + d / 2) * PAINT.cell); nmAdd(m);
                    });
                }
                let data = new Uint8Array(N * N * 4);
                g.tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
                g.tex.magFilter = THREE.NearestFilter; g.tex.minFilter = THREE.NearestFilter;
                g.dirty = true; paintTexUpdate(g);
                let floor = new THREE.Mesh(new THREE.PlaneGeometry(N * PAINT.cell, N * PAINT.cell), new THREE.MeshLambertMaterial({ map: g.tex }));
                floor.rotation.x = -Math.PI / 2; nmAdd(floor);
                [[0, -h, N * PAINT.cell, 2], [0, h, N * PAINT.cell, 2], [-h, 0, 2, N * PAINT.cell], [h, 0, 2, N * PAINT.cell]].forEach(function (w) {
                    let m = new THREE.Mesh(new THREE.BoxGeometry(w[2], 6, w[3]), new THREE.MeshLambertMaterial({ color: 0x78909c }));
                    m.position.set(w[0], 3, w[1]); nmAdd(m);
                });
                let grass = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0xa5d6a7 }));
                grass.rotation.x = -Math.PI / 2; grass.position.y = -0.2; nmAdd(grass);
            },
            spawns: function (g, n) {
                let h = paintHalf(), out = [];
                for (let i = 0; i < n; i++) {
                    let team = i % 2, k = Math.floor(i / 2);
                    out.push({ x: (team === 0 ? -1 : 1) * (h - 14), z: (k - 1.5) * 22, facing: team === 0 ? Math.PI / 2 : -Math.PI / 2 });
                }
                return out;
            },
            camYaw: function (g) { return g.me.facing + Math.PI; },
            groundAt: function () { return 0; },
            blocked: function (g, x, z) {
                let h = paintHalf() - 3;
                if (Math.abs(x) > h || Math.abs(z) > h) return true;
                let c = paintCellOf(x, z);
                return !!g.walls[c.cz * PAINT.grid + c.cx];
            },
            speedMul: function (g, a) {
                let c = paintCellOf(a.p.x, a.p.z), v = g.cells[c.cz * PAINT.grid + c.cx];
                return (v && v !== a.team + 1) ? PAINT.enemySlow : 1;
            },
            act: function (g, a) { a.actCd = PAINT.shootCd; a.gestureT = 0.3; paintShoot(g, a, false); },
            ai: function (g, a, dt) {
                let w = { x: 0, z: 0, jump: false, act: false };
                a.aiT -= dt;
                // 找一块不是自己颜色的格子去刷；路上看到对面的人就朝他喷
                if (!a.goal || a.aiT <= 0 || Math.hypot(a.goal.x - a.p.x, a.goal.z - a.p.z) < 6) {
                    a.aiT = 2 + Math.random() * 2;
                    let h = paintHalf() - 8, best = null, bs = -1;
                    for (let k = 0; k < 8; k++) {
                        let x = (Math.random() * 2 - 1) * h, z = (Math.random() * 2 - 1) * h;
                        let c = paintCellOf(x, z), v = g.cells[c.cz * PAINT.grid + c.cx];
                        let score = (v === a.team + 1 ? 0 : (v ? 2 : 1.5)) - Math.hypot(x - a.p.x, z - a.p.z) / 200;
                        if (score > bs && !g.walls[c.cz * PAINT.grid + c.cx]) { bs = score; best = { x: x, z: z }; }
                    }
                    a.goal = best || { x: 0, z: 0 };
                }
                let dx = a.goal.x - a.p.x, dz = a.goal.z - a.p.z, d = Math.hypot(dx, dz) || 1;
                w.x = dx / d; w.z = dz / d;
                let foe = nmNearest(a, function (b) { return b.team !== a.team; });
                if (foe && foe.d < 55) {
                    w.face = Math.atan2(foe.b.p.x - a.p.x, foe.b.p.z - a.p.z);
                    if (Math.random() < dt * 3) w.act = true;
                } else if (Math.random() < dt * 1.2) w.act = true;
                if (a.actCd > 0) w.act = false;
                return w;
            },
            tick: function (g, dt) {
                g.actors.forEach(function (a) { if (!a.out && a.p.y < 1) paintSet(g, paintCellOf(a.p.x, a.p.z).cx, paintCellOf(a.p.x, a.p.z).cz, a.team); });
                g.blobs = g.blobs.filter(function (b) {
                    b.vy -= PAINT.blobGrav * dt;
                    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
                    b.mesh.position.set(b.x, b.y, b.z);
                    let hitActor = null;
                    g.actors.forEach(function (o) {
                        if (hitActor || o.out || o.team === b.team) return;
                        if (Math.hypot(o.p.x - b.x, o.p.z - b.z) < PAINT.hitR && b.y < o.p.y + 12 && b.y > o.p.y - 1) hitActor = o;
                    });
                    let land = b.y <= 0.5 || NM_DEFS.paint.blocked(g, b.x, b.z);
                    if (hitActor || land) {
                        paintSplash(g, b.x, b.z, b.team, PAINT.splash + (hitActor ? 1 : 0));
                        if (hitActor && nmMine(hitActor)) { nmStun(hitActor, PAINT.stunT, g.actors[b.by]); if (hitActor.isPlayer) blazeFlash('被颜料砸中了！'); }
                        nmBurst(b.x, Math.max(0, b.y - 3), b.z, NM_TEAM_COL[b.team]);
                        scene.remove(b.mesh);
                        return false;
                    }
                    return true;
                });
                paintTexUpdate(g);
            },
            fallCheck: function () { return null; },
            worldState: function (g) {
                g.gridSend = (g.gridSend || 0) - 1;
                if (g.gridSend > 0) return null;
                g.gridSend = 10;   // 一秒一次整张格子，其余时候各自本地刷，差一点会被这一下拉齐
                return { cells: Array.prototype.join.call(g.cells, '') };
            },
            applyWorld: function (g, s) {
                if (!s.cells) return;
                for (let i = 0; i < g.cells.length; i++) { let v = +s.cells[i]; if (g.cells[i] !== v) { g.cells[i] = v; g.dirty = true; } }
            },
            onEv: function (g, m) {
                if (m.ev !== 'shot') return;
                let a = g.actors[m.i]; if (!a) return;
                let b = { x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz, team: a.team, by: a.idx };
                b.mesh = nmAdd(new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshLambertMaterial({ color: NM_TEAM_COL[a.team] })));
                g.blobs.push(b);
            },
            checkEnd: function (g) {
                if (g.clock < PAINT.time) return null;
                let c = paintCount(g);
                return { a: c.a, b: c.b, tot: c.tot, w: c.a === c.b ? -1 : (c.a > c.b ? 0 : 1), cells: Array.prototype.join.call(g.cells, '') };
            },
            didWin: function (g, res, me) { return res.w === me.team; },
            resultTitle: function (g, res, won) { return res.w < 0 ? '平局' : (won ? '你的队伍赢了' : '你的队伍输了'); },
            resultText: function (g, res) {
                let mine = g.me.team === 0 ? res.a : res.b, theirs = g.me.team === 0 ? res.b : res.a;
                return '地盘：我方 ' + Math.round(mine / res.tot * 100) + '% · 对面 ' + Math.round(theirs / res.tot * 100) + '%';
            },
            hud: function (g) {
                let c = paintCount(g);
                let mine = g.me.team === 0 ? c.a : c.b, theirs = g.me.team === 0 ? c.b : c.a;
                let t = Math.max(0, Math.ceil(PAINT.time - g.clock));
                nmHudText(Math.round(mine / c.tot * 100) + '% : ' + Math.round(theirs / c.tot * 100) + '%　' + t + 's',
                    (g.me.stunT > 0 ? '被砸中了！' : ''));
            }
        };

        // ══════════════ 爬塔 ══════════════
        // 一座绕着柱子盘上去的跳台塔，底下岩浆一直在涨。
        //   单人：能爬多高爬多高，爬到顶算赢。
        //   双人合作：两个人都要爬到顶。有人掉进岩浆就先趴下，另一个爬到下一面旗子就能把他拉回来；两个都掉就输。
        //   多人：谁先到顶谁赢。
        // 存档点（T2）：起点和每面绿旗。站上更高的绿旗就更新，只升不降。掉进岩浆时岩浆还没淹到存档点台面，
        // 就回存档点接着爬；淹过了：单人结束、多人出局、双人倒下等队友救。AI 一样。
        const TOWER = { steps: 60, flagEvery: 10, speed: 40, jumpV: 50, gravity: 140, lava0: -40, rise0: 2.2, rise1: 5, riseRamp: 100, grace: 6 };
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
                let ang = 0, y = 0, r = 68, prevHalf = 26;
                g.steps.push({ x: 0, z: 70, y: 0, half: 26, mv: 0 });   // 起点大平台
                for (let i = 1; i <= TOWER.steps; i++) {
                    // 按"边到边的空隙"来排，而不是随便转个角度——之前角度+半径都随机，有的两块离了 40 格，根本跳不过去。
                    // 满力跳大概能飞 20 格，空隙控制在 5~11，越往上越宽一点。
                    let half = i === TOWER.steps ? 16 : Math.max(5.5, 10 - i * 0.06 - seededRandom() * 2);
                    let gap = (5 + seededRandom() * 4 + Math.min(2, i * 0.04)) * sc.r;
                    r = Math.max(60, Math.min(76, r + (seededRandom() - 0.5) * 6));
                    ang += (prevHalf + half + gap) / r;
                    prevHalf = half;
                    y += (5 + seededRandom() * 2.6) * sc.h;
                    let mv = (i > 8 && i % 7 === 0) ? (6 + seededRandom() * 6) * sc.r : 0;   // 每隔几块有一块左右晃
                    g.steps.push({ x: Math.sin(ang) * r, z: Math.cos(ang) * r, y: y, half: half, mv: mv, ph: seededRandom() * 6, flag: i % TOWER.flagEvery === 0 });
                }
                g.steps.forEach(function (s, i) {
                    let top = i === g.steps.length - 1;
                    let m = new THREE.Mesh(new THREE.BoxGeometry(s.half * 2, 3, s.half * 2), new THREE.MeshLambertMaterial({ color: top ? 0xffd54f : (s.mv ? 0x80deea : (i % 2 ? 0xb39ddb : 0x9575cd)) }));
                    m.position.set(s.x, s.y - 1.5, s.z); nmAdd(m); s.mesh = m; s.x0 = s.x;
                    if (s.flag) {
                        let pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
                        pole.position.set(0, 7.5, 0); m.add(pole);
                        let fl = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.4), new THREE.MeshBasicMaterial({ color: 0x66bb6a }));
                        fl.position.set(2.5, 12, 0); m.add(fl); s.flagMesh = fl;
                    }
                });
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
                    if (Math.abs(x - s.x) <= s.half && Math.abs(z - s.z) <= s.half && s.y <= prevY + 0.6 && s.y > best) best = s.y;
                });
                return best;
            },
            carry: function (g, a) {   // 站在晃动的台子上跟着走
                if (!a.onGround) return;
                g.steps.forEach(function (s) {
                    if (s.mv && Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half && Math.abs(a.p.y - s.y) < 0.2) a.p.x += s.dx || 0;
                });
            },
            ai: function (g, a, dt) {
                let w = { x: 0, z: 0, jump: false, act: false };
                // 站着的台子编号：往上找最近的一块当目标
                g.steps.forEach(function (s, i) { if (a.onGround && Math.abs(a.p.y - s.y) < 0.3 && Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half) a.si = i; });
                let t = g.steps[Math.min(g.steps.length - 1, a.si + 1)];
                let dx = t.x - a.p.x, dz = t.z - a.p.z, d = Math.hypot(dx, dz) || 1;
                if (a.si === g.steps.length - 1) return w;
                // 双人合作：AI 队友领先太多就停下等你
                if (g.opt.kind === 'duo') {
                    let mate = g.actors.filter(function (b) { return b !== a; })[0];
                    if (mate && !mate.downed && a.si - mate.si > 4 && a.onGround) return w;
                }
                // 偶尔站一下再跳，像人在瞄
                if (a.pauseT > 0) { a.pauseT -= dt; return w; }
                if (a.onGround && Math.random() < dt * (0.5 - a.skill * 0.3)) { a.pauseT = 0.3 + Math.random() * 0.6; return w; }
                w.x = dx / d; w.z = dz / d;
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
                g.actors.forEach(function (a) {
                    if (a.out || a.downed) return;
                    g.steps.forEach(function (s, i) { if (a.onGround && Math.abs(a.p.y - s.y) < 0.3 && Math.abs(a.p.x - s.x) <= s.half && Math.abs(a.p.z - s.z) <= s.half) { a.si = i; if (i > a.best) a.best = i; } });
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
                    '<br>掉下去 ' + (g.me.falls || 0) + ' 次';
            },
            afterEnd: function (g) { if ((g.me.best || 0) > (gState.towerBest || 0)) { gState.towerBest = g.me.best; saveProgress(); } },
            hud: function (g) {
                let me = g.me, total = g.steps.length - 1;
                let gap = Math.max(0, Math.round(me.p.y - g.lavaY));
                let kindTxt = g.opt.kind === 'solo' ? '单人' : g.opt.kind === 'duo' ? '双人合作' : '多人';
                let mate = g.opt.kind === 'duo' ? g.actors.filter(function (b) { return b !== me; })[0] : null;
                let flooded = g.lavaY > g.steps[me.cp || 0].y;
                nmHudText('第 ' + me.best + ' / ' + total + ' 块　离岩浆 ' + gap,
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
            document.getElementById('sys-modal').classList.add('hidden');
            makerOpen(k);
            return true;
        }
