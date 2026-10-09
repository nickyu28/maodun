        // ══════════════════════════════════════════════════════════
        //  松饼大作战（原代号 "I'm a pancake"）：自由混战抓人，不分队伍——
        //  面朝谁、又让谁进了你手的范围，谁就当场出局，最后剩下的人赢。
        //  地图上会刷新几种短效增益，捡到能占点便宜。
        //  身体换成松饼卷起来的圆柱形（cakeMakeBody），胳膊腿也改成贴身的小圆墩。
        // ══════════════════════════════════════════════════════════
        const CAKE = {
            playerCount: 8,       // 1 真人 + 7 个 AI 一起下场
            matchTime: 210,       // 3 分半，时间到还没分出胜负就按拍出局数判
            handRange: 9,         // 手的判定范围，常驻显示在脚下
            tagConeDeg: 65,       // 朝向锥角：目标得在你面前这个夹角内，纯贴背后不算抓
            jumpV: 44, gravity: 150,
            moveSpeed: 40,
            camBack: 30, camUp: 20,
            buffEvery: 9, buffLifespan: 22, buffMaxOnField: 4,
            buffSpeedMul: 1.35, buffSpeedT: 8,
            buffReachAdd: 5,   // 长手：捡到就是永久的，不再计时

            aiVision: 60, aiPanicRange: 16,
            buildingCount: 6, buildingMinH: 20, buildingMaxH: 48,   // 场上几栋高矮不一的楼，当掩体兼天际线
            platformCount: 4, platformH: 4.5, platformHalf: 6.5     // 另外几个能跳上去的矮台子，抢个居高临下的视野
        };
        const CAKE_BUFF_KINDS = [
            { key: 'speed', label: '加速', color: 0xffee58 },
            { key: 'reach', label: '长手', color: 0x64b5f6 },
            { key: 'shield', label: '护盾', color: 0x81c784 }
        ];
        const CAKE_LINES = {
            catch: ['拍到一个！', '出局一个，稳了', '别想跑']
        };

        function cakeBuffMesh(kind) {
            let g = new THREE.Group();
            let m = new THREE.Mesh(new THREE.OctahedronGeometry(3.4, 0),
                new THREE.MeshLambertMaterial({ color: kind.color, emissive: kind.color }));
            m.position.y = 5; g.add(m);
            g.userData.spin = m;
            return g;
        }
        function cakeSpawnBuff() {
            if (!cake) return;
            let kind = CAKE_BUFF_KINDS[Math.floor(Math.random() * CAKE_BUFF_KINDS.length)];
            let cx = Math.floor(mSize / 2 + (Math.random() - 0.5) * mSize * 0.7);
            let cz = Math.floor(mSize / 2 + (Math.random() - 0.5) * mSize * 0.7);
            let c = jailOpenCellsNear(cx, cz, 1)[0];
            let mesh = cakeBuffMesh(kind);
            mesh.position.set(c.x * TILE, 0, c.z * TILE);
            scene.add(mesh);
            cake.buffs.push({ id: cake.buffSeq++, mesh: mesh, kind: kind, x: c.x * TILE, z: c.z * TILE, life: CAKE.buffLifespan });
        }
        // 联机时刷新/捡增益只归房主判定（不然同一个增益会被两边各判一次），
        // 剩下的人靠 cakeOnWorld 里的 buffs 列表对齐，见下面 cakeSyncBuffs。
        function cakeSyncBuffs(list) {
            let seen = {};
            (list || []).forEach(function (b) { seen[b.id] = 1; });
            cake.buffs = cake.buffs.filter(function (b) {
                if (seen[b.id]) return true;
                scene.remove(b.mesh); return false;
            });
            let have = {};
            cake.buffs.forEach(function (b) { have[b.id] = 1; });
            (list || []).forEach(function (b) {
                if (have[b.id]) return;
                let kind = CAKE_BUFF_KINDS.filter(function (k) { return k.key === b.k; })[0]; if (!kind) return;
                let mesh = cakeBuffMesh(kind);
                mesh.position.set(b.x, 0, b.z);
                scene.add(mesh);
                cake.buffs.push({ id: b.id, mesh: mesh, kind: kind, x: b.x, z: b.z, life: CAKE.buffLifespan });
            });
        }
        function cakeApplyBuff(a, kind) {
            // 长手/护盾捡到就是永久的（Infinity），只有加速还是限时的
            if (kind.key === 'speed') a.speedT = CAKE.buffSpeedT;
            else if (kind.key === 'reach') a.reachT = Infinity;
            else if (kind.key === 'shield') a.shieldT = Infinity;
            cakeBurst(a.p.x, a.p.z, kind.color);
            if (a.isPlayer) {
                blazeFlash('捡到增益：' + kind.label + (kind.key === 'speed' ? '！' : '（永久）！'));
                introOnce('cake.' + kind.key, kind.label, { speed: '跑得快一阵子。', reach: '手变长了，离远一点也能抓到人。这局一直有效。', shield: '被抓的时候能挡一次。' }[kind.key] || '');
            }
        }
        function cakeBuffTick(dt) {
            if (cake.net && !cakeIsHost()) return;   // 联机时刷新/判定归房主，其他人靠世界同步对齐
            cake.buffTimer -= dt;
            if (cake.buffTimer <= 0 && cake.buffs.length < CAKE.buffMaxOnField) {
                cakeSpawnBuff(); cake.buffTimer = CAKE.buffEvery;
            }
            cake.buffs = cake.buffs.filter(function (b) {
                b.mesh.userData.spin.rotation.y += dt * 2;
                b.life -= dt;
                if (b.life <= 0) { scene.remove(b.mesh); return false; }
                let hit = cake.actors.find(function (a) { return !a.out && Math.hypot(a.p.x - b.x, a.p.z - b.z) < 6; });
                if (hit) { cakeApplyBuff(hit, b.kind); scene.remove(b.mesh); return false; }
                return true;
            });
        }
        function cakeHandRange(a) { return CAKE.handRange + (a.reachT > 0 ? CAKE.buffReachAdd : 0); }
        function cakeSpeedMul(a) { return a.speedT > 0 ? CAKE.buffSpeedMul : 1; }

        function cakeBurst(x, z, color) {
            if (!cake) return;
            let mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
            let m = new THREE.Mesh(new THREE.RingGeometry(4, 5.5, 18), mat);
            m.rotation.x = -Math.PI / 2; m.position.set(x, 1.2, z);
            scene.add(m);
            cake.fx.push({ o: m, mat: mat, t: 0.5, life: 0.5, r0: 5, r1: 22 });
        }
        function cakeFxTick(dt) {
            cake.fx = cake.fx.filter(function (f) {
                f.t -= dt;
                if (f.t <= 0) { scene.remove(f.o); f.mat.dispose(); return false; }
                let frac = 1 - f.t / f.life;
                let r = f.r0 + (f.r1 - f.r0) * frac;
                f.o.scale.set(r / f.r0, r / f.r0, 1);
                f.mat.opacity = 0.85 * (1 - frac * frac);
                return true;
            });
        }

        // 玩家移动：跟监狱救援一套手感（camera 朝向 + WASD/摇杆 + 轻微惯性），
        // 但「面朝」直接跟着镜头走、不等移动才转身——这游戏靠面朝谁判定抓人，
        // 站着不动也得能瞄准。
        function cakePlayerMove(a, dt) {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            a.facing = Math.atan2(dir.x, dir.z);
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1;
            if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            let wx = 0, wz = 0;
            if (fwd || strafe) {
                let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe, n = Math.hypot(mx, mz) || 1;
                let sp = CAKE.moveSpeed * cakeSpeedMul(a) * DAILY_MOD.speedMul;
                wx = mx / n * sp; wz = mz / n * sp;
            }
            let rate = (wx || wz) ? 1 / BLAZE.accel : 1 / BLAZE.brake;
            let k = Math.min(1, rate * dt);
            a.mvx = (a.mvx || 0) + (wx - (a.mvx || 0)) * k;
            a.mvz = (a.mvz || 0) + (wz - (a.mvz || 0)) * k;
            let prevY = a.p.y;
            if (Math.abs(a.mvx) >= 0.4 || Math.abs(a.mvz) >= 0.4) {
                let dx = a.mvx * dt, dz = a.mvz * dt;
                // 跳台侧面要当墙挡住，不然贴着台子横着走会直接穿模过去——
                // 只在人确实比台面矮一截时才挡（人已经站上去、正要落地那一下不算）。
                // 之前只查目的地这一个点，横着快速斜穿台子边角时中间那段路可能真的穿过去
                // 但起点终点都不在判定框里——沿位移多采几个点一起查，堵住这种"抄近道"。
                let blockedBySide = false;
                for (let s = 1; s <= 4 && !blockedBySide; s++) {
                    let t = s / 4, sx = a.p.x + dx * t, sz = a.p.z + dz * t;
                    blockedBySide = cakePlatforms.some(function (p) {
                        return Math.abs(sx - p.x) < p.half + 3.5 && Math.abs(sz - p.z) < p.half + 3.5 &&
                            prevY < p.y - 0.2 && prevY > p.y - 7;
                    });
                }
                if (!blockedBySide) blazeStep(a, dx, dz);
            }
            else { a.mvx = 0; a.mvz = 0; }

            let curGroundY = cakeGroundYAt(a.p.x, a.p.z, prevY);
            let onGround = a.p.y <= curGroundY + 0.01;
            if ((keys[' '] || touchBtn.jump) && onGround) a.vy = CAKE.jumpV * DAILY_MOD.jumpMul;
            keys[' '] = false; touchBtn.jump = false;
            a.vy = (a.vy || 0) - CAKE.gravity * dt;
            a.p.y += a.vy * dt;
            let groundY = cakeGroundYAt(a.p.x, a.p.z, prevY);
            if (a.p.y < groundY) { a.p.y = groundY; a.vy = 0; }
        }

        // 判断 from 是否面朝 (tx,tz)——跟 cakeTagCheck 用的同一套朝向锥判定，
        // AI 拿它来分辨"那家伙是真要来抓我了"还是"只是恰好离得近"。
        function cakeFacingAt(from, tx, tz) {
            let dx = tx - from.p.x, dz = tz - from.p.z, n = Math.hypot(dx, dz) || 1;
            let fx = Math.sin(from.facing || 0), fz = Math.cos(from.facing || 0);
            return (dx / n) * fx + (dz / n) * fz > Math.cos(CAKE.tagConeDeg * Math.PI / 180);
        }
        // 没人真的要抓自己的时候就主动追最近的目标——不然大家都在安全距离外
        // 互相盯着，永远不会有人真正凑近，一整局都抓不到人。
        // 只有当最近的人已经贴到手范围附近、又正好面朝自己（真的要挨抓了）才会跑；
        // 朝向直接用这一步真实挪动的方向算，不依赖 mvx/mvz（那两个只有玩家会更新）。
        // 联机时 AI 机器人只归房主模拟，其他人靠世界同步收位置——不然同一个机器人
        // 在每个人屏幕上各走各的，早晚对不上。
        function cakeIsHost() { return !cake || !cake.net || cake.host === gState.id; }
        function cakeMine(a) { return a.isPlayer || (!a.netId && cakeIsHost()); }

        function cakeAi(a, dt) {
            if (a.isPlayer || a.remote || !cakeMine(a)) return;
            a.aiT -= dt;
            if (a.aiT <= 0) a.aiT = 0.25 + Math.random() * 0.35;
            let live = cake.actors.filter(function (x) { return !x.out; });
            let threat = null, threatD = CAKE.aiVision;
            live.forEach(function (b) {
                if (b === a) return;
                let d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
                if (d < threatD) { threatD = d; threat = b; }
            });
            let tx = a.p.x, tz = a.p.z;
            let dangerous = threat && !(a.shieldT > 0) &&
                threatD < cakeHandRange(threat) * 1.4 && cakeFacingAt(threat, a.p.x, a.p.z);
            if (dangerous) {
                let dx = a.p.x - threat.p.x, dz = a.p.z - threat.p.z, n = Math.hypot(dx, dz) || 1;
                tx = a.p.x + dx / n * 40; tz = a.p.z + dz / n * 40;
            } else if (threat) {
                tx = threat.p.x; tz = threat.p.z;
            } else {
                let buff = null, bestD = 90;
                cake.buffs.forEach(function (b) {
                    let d = Math.hypot(a.p.x - b.x, a.p.z - b.z);
                    if (d < bestD) { bestD = d; buff = b; }
                });
                if (buff) { tx = buff.x; tz = buff.z; }
                else {
                    if (!a.wanderT || a.wanderT <= 0) {
                        a.wanderTx = a.p.x + (Math.random() - 0.5) * 120;
                        a.wanderTz = a.p.z + (Math.random() - 0.5) * 120;
                        a.wanderT = 1.5 + Math.random() * 2;
                    }
                    a.wanderT -= dt;
                    tx = a.wanderTx; tz = a.wanderTz;
                }
            }
            let px0 = a.p.x, pz0 = a.p.z;
            blazeAdvance(a, tx, tz, dt);
            let ddx = a.p.x - px0, ddz = a.p.z - pz0;
            if (Math.hypot(ddx, ddz) > 0.01) a.facing = Math.atan2(ddx, ddz);

            a.vy = (a.vy || 0) - CAKE.gravity * dt;
            a.p.y += a.vy * dt;
            let groundY = cakeGroundYAt(a.p.x, a.p.z, a.p.y - a.vy * dt);
            if (a.p.y < groundY) { a.p.y = groundY; a.vy = 0; }
        }

        // 抓人：谁进了别人的手范围、又被那个人面朝着，就当场出局。
        // live 是这一帧开始时的快照，但 a.out 是共享对象上的实时字段——
        // 一旦被判出局，同一帧后面的检查会立刻看到，不会一帧内被两个人重复计一次。
        function cakeTagCheck() {
            if (cake.net && !cakeIsHost()) return;   // 联机时谁出局归房主判定，其他人靠世界同步对齐
            let live = cake.actors.filter(function (a) { return !a.out; });
            let coneCos = Math.cos(CAKE.tagConeDeg * Math.PI / 180);
            live.forEach(function (b) {
                if (b.out) return;
                live.forEach(function (a) {
                    if (a === b || a.out || b.out) return;
                    let d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
                    if (d > cakeHandRange(b)) return;
                    let dx = (a.p.x - b.p.x) / (d || 1), dz = (a.p.z - b.p.z) / (d || 1);
                    let fx = Math.sin(b.facing || 0), fz = Math.cos(b.facing || 0);
                    if (dx * fx + dz * fz < coneCos) return;
                    // 护盾只挡一下：真的要被拍出局时才用掉（以前放在距离/朝向判断前面，
                    // 随便哪个人在不在身边都会把护盾当场耗掉）。（B2，重做夜间 PR #12）
                    if (a.shieldT > 0) {
                        a.shieldT = 0;
                        cakeBurst(a.p.x, a.p.z, 0x81c784);
                        if (a.isPlayer) blazeFlash('护盾帮你挡了一下，但用掉了！');
                        else if (b.isPlayer) blazeFlash(a.name + ' 的护盾帮TA挡了一下！');
                        return;
                    }
                    cakeTagOut(a, b);
                });
            });
        }
        function cakeTagOut(victim, tagger) {
            victim.out = true;
            tagger.kills = (tagger.kills || 0) + 1;
            victim.mesh.visible = false;
            cakeBurst(victim.p.x, victim.p.z, 0xff7043);
            if (victim.isPlayer) { blazeFlash('你被 ' + tagger.name + ' 拍出局了！'); sfxBuzz(); }
            else if (tagger.isPlayer) { blazeFlash('你把 ' + victim.name + ' 拍出局了！'); sfxThud(true); }
            else aiSay(tagger, tagger.name, 'catch', CAKE_LINES.catch);
            cakeCheckWin();
        }
        function cakeCheckWin() {
            if (!cake || cake.over) return;
            let live = cake.actors.filter(function (a) { return !a.out; });
            if (live.length <= 1) cakeEndMatch(live[0] || null, '只剩一位没被拍出局。');
        }
        function cakeTimeUp() {
            let best = null;
            cake.actors.forEach(function (a) {
                if (!best) { best = a; return; }
                let ak = a.kills || 0, bk = best.kills || 0;
                if (ak > bk || (ak === bk && !a.out && best.out)) best = a;
            });
            cakeEndMatch(best, '时间到，按拍出局数和存活情况判定。');
        }
        function cakeEndMatch(winner, reason) {
            if (!cake || cake.over) return;
            cake.over = true;
            let me = cake.me;
            let text = (reason ? reason + '<br>' : '') + '你一共拍出局 ' + (me.kills || 0) + ' 人。';
            let title = !winner ? '平局' : (winner === me ? '你赢了！' : winner.name + ' 获胜');
            coinsSettle('cake', winner === me); text += coinsLine();
            showSysModal(title, text, [{ label: '返回大厅', color: '#5cb85c', onClick: function () { cakeExit(); } }]);
        }

        function cakeTouchUI(on) {
            ['blaze-atk-btn', 'blaze-skill1-btn', 'blaze-skill2-btn', 'blaze-card-btn',
                'race-dash-btn', 'race-skill-btn', 'race-item-btn', 'run-btn'].forEach(function (id) {
                    let e = document.getElementById(id); if (e) e.style.display = 'none';
                });
            let pad = (gState.control === 'pad');
            let jb = document.getElementById('race-jump-btn');
            if (jb) jb.style.display = (on && pad) ? 'flex' : 'none';
            let stats = document.getElementById('blaze-stats-btn'); if (stats) stats.style.display = 'none';
            let skillbar = document.getElementById('blaze-skillbar'); if (skillbar) skillbar.innerHTML = '';
            let skillTxt = document.getElementById('blaze-skill'); if (skillTxt) skillTxt.innerText = '';
            document.getElementById('blaze-bottom').style.display = on ? '' : 'none';
            let cross = document.getElementById('blaze-crosshair-anchor');
            if (cross && cross.previousElementSibling) cross.previousElementSibling.style.display = on ? 'none' : '';
            let ex = document.getElementById('blaze-exit-btn');
            if (ex) ex.onclick = on ? cakeExit : blazeExit;
            ['blaze-stats', 'blaze-perk', 'blaze-ffa-cards'].forEach(function (id) {
                let e = document.getElementById(id); if (e && on) e.classList.add('hidden');
            });
        }
        function cakeHud() {
            let me = cake.me;
            let live = cake.actors.filter(function (a) { return !a.out; }).length;
            let remain = Math.max(0, CAKE.matchTime - cake.clock);
            document.getElementById('blaze-score').innerText = '存活 ' + live + ' / ' + cake.actors.length + '　' + Math.ceil(remain) + 's';
            document.getElementById('blaze-round').innerText =
                '抓到 ' + (me.kills || 0) + ' 人' +
                (me.out ? '　出局了，在观战' : '') +
                (me.shieldT > 0 ? '　护盾' : '') +
                (me.speedT > 0 ? '　加速中' : '') +
                (me.reachT > 0 ? '　长手中' : '');
            document.getElementById('blaze-roster').innerHTML = '';
            let bar = document.getElementById('blaze-hpbar');
            bar.style.width = '100%'; bar.style.background = '#66bb6a';
            document.getElementById('blaze-hptxt').innerText = '存活 ' + live + ' 人';
        }
        function cakeCameraPos(me) {
            let dir = chaseCamDir();
            let back = CAKE.camBack;
            let ax = me.p.x, ay = me.p.y + CAKE.camUp, az = me.p.z;
            // 接近抬头/低头 90° 时水平分量趋近 0，横向探墙没意义（这时候镜头是几乎
            // 垂直摆动），跳过去避免拿自己脚下的东西当成挡路的墙，把镜头收到贴脸。
            if (Math.hypot(dir.x, dir.z) > 0.3) {
                for (let t = 0.2; t <= 1; t += 0.2) {
                    let tx = ax - dir.x * back * t, tz = az - dir.z * back * t;
                    if (blazeBlocked(tx, tz, 0)) { back = back * Math.max(0, t - 0.2); break; }
                }
            }
            return { x: ax - dir.x * back, y: ay - dir.y * back, z: az - dir.z * back };
        }
        // ── 联机同步 ──
        // 每个真人只广播自己那一份位置（15Hz）；房主额外广播一份"世界快照"（10Hz）：
        // 机器人的位置 + 所有人的出局/连杀/增益状态 + 场上还剩哪些增益。
        // 谁的角色归谁模拟：真人的移动永远是自己算自己发，机器人和出局判定/增益判定
        // 只有房主算——不然同一件事会被两台设备各判一次，对不上。
        function cakeNetTick(dt) {
            if (!cake || !cake.net) return;
            cake.sendSelf -= dt;
            if (cake.sendSelf <= 0) {
                cake.sendSelf = 1 / 15;
                let me = cake.me;
                bc.postMessage({
                    type: 'CK_ME', target: '*', sender: gState.id, i: me.idx,
                    x: Math.round(me.p.x), y: +me.p.y.toFixed(1), z: Math.round(me.p.z),
                    facing: +me.facing.toFixed(2)
                });
            }
            if (!cakeIsHost()) return;
            cake.sendWorld -= dt;
            if (cake.sendWorld > 0) return;
            cake.sendWorld = 1 / 10;
            bc.postMessage({
                type: 'CK_W', target: '*', sender: gState.id,
                a: cake.actors.map(function (a) {
                    return {
                        i: a.idx, x: Math.round(a.p.x), y: +a.p.y.toFixed(1), z: Math.round(a.p.z),
                        facing: +(a.facing || 0).toFixed(2), out: a.out, kills: a.kills || 0,
                        speedT: +Math.max(0, Math.min(999, a.speedT || 0)).toFixed(1),
                        reachT: a.reachT > 0 ? 1 : 0, shieldT: a.shieldT > 0 ? 1 : 0
                    };
                }),
                buffs: cake.buffs.map(function (b) { return { id: b.id, x: b.x, z: b.z, k: b.kind.key }; })
            });
        }
        function cakeOnMe(m) {
            if (!cake || m.sender === gState.id) return;
            let a = cake.actors[m.i];
            if (!a || a.netId !== m.sender) a = cake.actors.filter(function (o) { return o.netId === m.sender; })[0];
            if (!a || a.isPlayer) return;
            a.target = { x: m.x, y: m.y, z: m.z };
            a.facing = m.facing;
        }
        function cakeOnWorld(m) {
            if (!cake || cakeIsHost()) return;
            (m.a || []).forEach(function (o) {
                let a = cake.actors[o.i]; if (!a) return;
                if (!a.netId) { a.target = { x: o.x, y: o.y, z: o.z }; a.facing = o.facing; }
                let wasOut = a.out, hadShield = a.shieldT > 0;
                a.kills = o.kills;
                a.speedT = o.speedT; a.reachT = o.reachT ? Infinity : 0; a.shieldT = o.shieldT ? Infinity : 0;
                a.out = o.out;
                if (a.mesh) a.mesh.visible = !a.out;
                if (!wasOut && a.out) {
                    cakeBurst(a.p.x, a.p.z, 0xff7043);
                    if (a.isPlayer) blazeFlash('你被拍出局了！');
                } else if (hadShield && !a.shieldT) {
                    cakeBurst(a.p.x, a.p.z, 0x81c784);
                    if (a.isPlayer) blazeFlash('护盾帮你挡了一下，但用掉了！');
                }
            });
            cakeSyncBuffs(m.buffs);
            cakeCheckWin();
        }
        // 远端的人（真人队友 + 非房主视角下的机器人）按收到的坐标平滑过去，
        // 不然 10~15Hz 的更新会看着一跳一跳的。
        function cakeLerpRemotes(dt) {
            if (!cake) return;
            let k = Math.min(1, dt * 12);
            cake.actors.forEach(function (a) {
                if (!a.target || a.isPlayer) return;
                a.p.x += (a.target.x - a.p.x) * k;
                a.p.z += (a.target.z - a.p.z) * k;
                a.p.y += (a.target.y - a.p.y) * k;
            });
        }

        function cakeTick(dt) {
            cake.clock += dt;
            // 联机时别人/机器人的位置是网络给的（cakeLerpRemotes 挪过去），
            // spd 得等挪完了再算，不然动画会看着像"人在滑步不动腿"。
            let px0 = [], pz0 = [];
            cake.actors.forEach(function (a) {
                px0[a.idx] = a.p.x; pz0[a.idx] = a.p.z;
                if (a.out) { a.spd = 0; return; }
                if (a.isPlayer) cakePlayerMove(a, dt); else cakeAi(a, dt);
            });
            cakeLerpRemotes(dt);
            cake.actors.forEach(function (a) {
                if (a.out) return;
                a.spd = Math.hypot(a.p.x - px0[a.idx], a.p.z - pz0[a.idx]) / dt;
                if (a.speedT > 0) a.speedT -= dt;   // 长手/护盾捡到是永久的，不用倒计时
            });
            cakeTagCheck();
            cakeBuffTick(dt);
            cakeNetTick(dt);
            cakeFxTick(dt);
            cake.actors.forEach(function (a) {
                a.mesh.position.set(a.p.x, a.p.y, a.p.z);
                if (a.out) return;
                a.mesh.rotation.y = a.facing || 0;
                let run = Math.min(1, (a.spd || 0) / CAKE.moveSpeed);
                a.animT = (a.animT || 0) + dt * (2 + run * 16);
                let u = a.mesh.userData;
                if (u.legs) { u.legs[0].rotation.x = Math.sin(a.animT) * 0.9 * run; u.legs[1].rotation.x = -Math.sin(a.animT) * 0.9 * run; }
                tickAccStarOrbit(u, dt);
                if (u.arms) {
                    if (a.gestureT > 0) { a.gestureT -= dt; bodyGesture(u, a.gestureKind, Math.max(0, a.gestureT) / 0.35); }
                    else { u.arms[0].rotation.x = -Math.sin(a.animT) * 0.7 * run; u.arms[1].rotation.x = Math.sin(a.animT) * 0.7 * run; }
                }
                if (u.reach) u.reach.material.opacity = a.reachT > 0 ? 0.7 : 0.35;
                if (u.ring) u.ring.material.color.setHex(a.shieldT > 0 ? 0x81c784 : a.col);
            });
            let me = cake.me;
            let camPos = cakeCameraPos(me);
            camera.position.set(camPos.x, camPos.y, camPos.z);
            if (!cake.over && cake.clock >= CAKE.matchTime) cakeTimeUp();
            cakeHud();
            renderer.render(scene, camera);
        }
        function cakeLoop() {
            if (!cake) return;
            let now = performance.now();
            let dt = Math.min(0.05, (now - cake.last) / 1000);
            cake.last = now;
            if (!cake.over) cakeTick(dt);
            cake.raf = requestAnimationFrame(cakeLoop);
        }
        // 出生点：以前是挤在地图正中间那一小块，8 个人贴脸站。改成沿一个大圈
        // 均匀摆开，每个人对应圈上一个角度，再各自吸到最近的空地格（复用
        // jailOpenCellsNear 的"贴最近空地"逻辑，保证不会摆进墙里）。
        function cakeEvenSpawns(n) {
            let mid = mSize / 2, r = mSize / 2 - 5;
            let pts = [];
            for (let i = 0; i < n; i++) {
                let ang = (i / n) * Math.PI * 2;
                let gx = Math.round(mid + Math.cos(ang) * r);
                let gz = Math.round(mid + Math.sin(ang) * r);
                pts.push(jailOpenCellsNear(gx, gz, 1)[0]);
            }
            return pts;
        }

        // 楼：找几块空地直接在网格里标成墙（跟柱子一个套路，谁都绕不过去），
        // 但做得高很多、高矮不一，顶上加一圈"屋檐"、腰上加几道亮色窗带，
        // 一看就是楼不是矮墙，顺便当混战的视线遮挡物。
        function cakeAddBuildings() {
            let mid = Math.floor(mSize / 2);
            let placed = [];
            let tooClose = function (x, z, min) {
                return placed.some(function (p) { return Math.hypot(p.x - x, p.z - z) < min; });
            };
            let cols = [0x8d6e63, 0xa1887f, 0xef9a9a, 0x90a4ae, 0xce93d8, 0xffb74d];
            for (let i = 0; i < CAKE.buildingCount; i++) {
                let x = 0, z = 0, ok = false;
                for (let tries = 0; tries < 30; tries++) {
                    x = 4 + Math.floor(seededRandom() * (mSize - 8));
                    z = 4 + Math.floor(seededRandom() * (mSize - 8));
                    let row = maze[0] && maze[0][z];
                    if (row && row[x] && row[x].type === 0 && Math.hypot(x - mid, z - mid) > 5 && !tooClose(x, z, 6)) { ok = true; break; }
                }
                if (!ok) continue;
                placed.push({ x: x, z: z });
                let old = maze[0][z][x];
                if (old && old.mesh) { scene.remove(old.mesh); let wi = walkableMeshes.indexOf(old.mesh); if (wi > -1) walkableMeshes.splice(wi, 1); }
                let h = CAKE.buildingMinH + seededRandom() * (CAKE.buildingMaxH - CAKE.buildingMinH);
                let col = cols[i % cols.length];
                let g = new THREE.Group();
                let body = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.92, h, TILE * 0.92),
                    new THREE.MeshLambertMaterial({ color: col }));
                body.position.y = h / 2; g.add(body);
                let roof = new THREE.Mesh(new THREE.BoxGeometry(TILE * 1.05, TILE * 0.26, TILE * 1.05),
                    new THREE.MeshLambertMaterial({ color: 0x5d4037 }));
                roof.position.y = h + TILE * 0.13; g.add(roof);
                for (let fl = 1; fl * 12 < h - 4; fl++) {
                    let band = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.95, 1.4, TILE * 0.95),
                        new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0x8d6e00 }));
                    band.position.y = fl * 12; g.add(band);
                }
                g.position.set(x * TILE, 0, z * TILE);
                scene.add(g);
                maze[0][z][x] = { type: 1, mesh: g };
            }
        }

        // 跳台：几个单独放的矮台子，不进网格（脚下照样是空地，走位不受影响），
        // 只在 cakePlayerMove 里额外判一次「脚下有没有台子」——跳上去能占个视野。
        function cakeAddPlatforms() {
            cakePlatformMeshes.forEach(function (m) { scene.remove(m); });
            cakePlatformMeshes = [];
            cakePlatforms = [];
            let mid = Math.floor(mSize / 2);
            for (let i = 0; i < CAKE.platformCount; i++) {
                let ok = false, x = 0, z = 0;
                for (let tries = 0; tries < 30; tries++) {
                    x = 6 + Math.floor(seededRandom() * (mSize - 12));
                    z = 6 + Math.floor(seededRandom() * (mSize - 12));
                    let row = maze[0] && maze[0][z];
                    if (row && row[x] && row[x].type === 0 && Math.hypot(x - mid, z - mid) > 5) { ok = true; break; }
                }
                if (!ok) continue;
                let px = x * TILE, pz = z * TILE;
                let m = new THREE.Mesh(new THREE.CylinderGeometry(CAKE.platformHalf, CAKE.platformHalf, 2, 16),
                    new THREE.MeshLambertMaterial({ color: 0xffe082 }));
                m.position.set(px, CAKE.platformH, pz); scene.add(m);
                let leg = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, CAKE.platformH, 8),
                    new THREE.MeshLambertMaterial({ color: 0xd7ccc8 }));
                leg.position.set(px, CAKE.platformH / 2, pz); scene.add(leg);
                cakePlatformMeshes.push(m, leg);
                cakePlatforms.push({ x: px, z: pz, half: CAKE.platformHalf, y: CAKE.platformH });
            }
        }

        // 脚下这一点，台子和地面里取更高的那个——跟大厅跑酷同一套判法：
        // 台子得比「移动前」的脚下高度矮一截才算数，不然贴着台子边走过去会被吸上去。
        function cakeGroundYAt(x, z, curY) {
            let best = 0;
            for (let i = 0; i < cakePlatforms.length; i++) {
                let p = cakePlatforms[i];
                if (Math.abs(x - p.x) < p.half && Math.abs(z - p.z) < p.half && p.y <= curY + 0.6 && p.y > best) best = p.y;
            }
            return best;
        }

        // blazeBuildArena 乱斗那份随机墙用的是普通 Math.random，跟种子对不上——
        // 联机时每个人各自随机出来的墙都不一样，画面会对不上。这里先铲平，
        // 只留边界，剩下的障碍物全部交给下面 cakeAddBuildings/cakeAddPlatforms
        // （两个都用 seededRandom，同一个种子在谁的屏幕上都长一样）。
        function cakeClearRandomWalls() {
            const floorTex = createProceduralTexture('floor', '#cfe8a8', '#b7d98e');
            for (let z = 1; z < mSize - 1; z++) {
                for (let x = 1; x < mSize - 1; x++) {
                    let c = maze[0][z][x];
                    if (!c || c.type !== 1) continue;
                    if (c.mesh) scene.remove(c.mesh);
                    let f = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE),
                        new THREE.MeshLambertMaterial({ map: floorTex }));
                    f.rotation.x = -Math.PI / 2; f.position.set(x * TILE, 0, z * TILE); scene.add(f);
                    maze[0][z][x] = { type: 0, mesh: f };
                    walkableMeshes.push(f);
                }
            }
        }

        function cakeBuildArena() {
            blazeBuildArena(true, false, false);
            cakeClearRandomWalls();
            cakeAddBuildings();
            cakeAddPlatforms();
        }

        // 松饼大作战专属身体：躯干换成圆柱（卷起来的松饼），耳朵不变，
        // 胳膊腿都改成贴着身体的矮圆墩——不再是伸得老远的细长方块。
        function cakeMakeBody(col, handRange, hideRing, acc, faceKey) {
            let g = new THREE.Group();
            let mat = new THREE.MeshLambertMaterial({ color: col });
            let body = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 10, 18), mat);
            body.position.y = 5; g.add(body);
            addCatFace(g, 7, 4.05, faceKey);
            let earGeo = new THREE.ConeGeometry(1.6, 3.2, 8);
            let ears = [];
            [-1, 1].forEach(function (sdir) {
                let ear = new THREE.Mesh(earGeo, mat);
                ear.position.set(sdir * 2.1, 11.2, 0); g.add(ear); ears.push(ear);
            });
            g.userData.ears = ears;
            // 腿：矮墩墩的小圆柱，贴着身体下沿露出一截
            let legs = [];
            [-1, 1].forEach(function (sdir) {
                let hip = new THREE.Group();
                hip.position.set(sdir * 1.8, 2, 0);
                let leg = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.6, 10), mat);
                leg.position.y = -1.3; hip.add(leg);
                g.add(hip); legs.push(hip);
            });
            g.userData.legs = legs;
            g.userData.body = body;
            // 胳膊：肩膀紧贴身体，短短一截圆柱 + 缩小版的半圆爪子，摆动幅度天然就小
            let arms = [];
            [-1, 1].forEach(function (sdir) {
                let shoulder = new THREE.Group();
                shoulder.position.set(sdir * 3.4, 6.4, 0);
                let arm = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 10), mat);
                arm.position.y = -1.1; shoulder.add(arm);
                // 爪子缩小到比手臂（半径 1.3）略窄，别再喧宾夺主。
                let hand = new THREE.Mesh(new THREE.CircleGeometry(1.2, 12, 0, Math.PI),
                    new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide }));
                hand.position.y = -1.9; hand.rotation.z = Math.PI; shoulder.add(hand);
                g.add(shoulder); arms.push(shoulder);
            });
            g.userData.arms = arms;
            // 白描边，远处也认得出轮廓
            let outMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, depthWrite: false });
            let parts = []; g.traverse(function (o) { if (o.isMesh) parts.push(o); });
            parts.forEach(function (m) {
                let o = new THREE.Mesh(m.geometry, outMat);
                o.position.copy(m.position); o.rotation.copy(m.rotation);
                o.scale.copy(m.scale).multiplyScalar(1.09);
                o.renderOrder = -1;
                (m.parent || g).add(o);
            });
            // 脚下一圈本人颜色，混战时看得出自己站哪儿——大厅广场没有"混战"这回事，
            // 一堆人站一起圈子密密麻麻反而是视觉噪音，hub 那几处调用传 hideRing 关掉它。
            let ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.8, 6, 20),
                new THREE.MeshBasicMaterial({ color: col }));
            ring.rotation.x = -Math.PI / 2; ring.position.y = 0.6; ring.visible = !hideRing; g.add(ring);
            g.userData.ring = ring;
            // 手能摸到多远——常驻显示，不用等你伸手才知道范围
            if (handRange) {
                let reach = new THREE.Mesh(new THREE.TorusGeometry(handRange, 0.35, 6, 24),
                    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
                reach.rotation.x = -Math.PI / 2; reach.position.y = 0.4; g.add(reach);
                g.userData.reach = reach;
            }
            if (acc) addAccessories(g, 7, 4.05, 11.6, 3.6, acc);
            return g;
        }

        // 邀请对象看 lobbyParty（组队面板里双方都同意过的人），不是大厅里随便谁——
        // 大厅现在默认自动进同一个房间，roomList 里一堆互不相干的人，不能见谁都拉去
        // 松饼大作战。没组队就直接自己开局（AI 补满）；组了队才发邀请，得所有人都
        // 同意才真的开局——谁不同意（或者半天没反应）这次就不开，不悄悄换成 AI。
        let cakeInvite = null, cakeInviteTimer = null;
        const CAKE_INVITE_TIMEOUT = 15000;
        function cakeStartGo() {
            let others = lobbyParty.slice(0, CAKE.playerCount - 1);
            if (!others.length) {
                // 没组队：先等最多 15 秒看房间里有没有陌生人也想玩，凑到人就真联机
                mmStart('cake', CAKE.playerCount, function (ids) {
                    let plan = ids.map(function (id) { return { id: id }; });
                    let seed = Math.floor(Math.random() * 1000000);
                    if (ids.length > 1) bc.postMessage({ type: 'CK_START', target: '*', sender: gState.id, plan: plan, host: gState.id, seed: seed });
                    cakeBegin(plan, gState.id, seed);
                });
                return;
            }
            let reqId = 'ck' + Date.now() + Math.floor(Math.random() * 1000);
            cakeInvite = { reqId: reqId, others: others.slice(), pending: others.slice(), declined: [], t0: performance.now() };
            bc.postMessage({ type: 'CK_INVITE', target: '*', sender: gState.id, ids: others, reqId: reqId });
            cakeInviteRender();
            if (cakeInviteTimer) clearInterval(cakeInviteTimer);
            cakeInviteTimer = setInterval(cakeInviteTick, 300);
        }
        function cakeInviteRender() {
            if (!cakeInvite) return;
            let waiting = cakeInvite.pending.length ? '还在等同意：' + cakeInvite.pending.join('、') : '';
            let declined = cakeInvite.declined.length ? '　已拒绝：' + cakeInvite.declined.join('、') : '';
            showSysModal('等待同意　松饼大作战', '在等房间里的人点同意，都同意就开。' +
                (waiting || declined ? '<br><span style="font-size:12px; color:#888;">' + waiting + declined + '</span>' : ''),
                [{ label: '取消', color: '#999', onClick: function () { cakeInviteCancel(); } }]);
        }
        function cakeInviteCancel() {
            if (cakeInviteTimer) { clearInterval(cakeInviteTimer); cakeInviteTimer = null; }
            cakeInvite = null;
        }
        function cakeInviteTick() {
            if (!cakeInvite) { clearInterval(cakeInviteTimer); cakeInviteTimer = null; return; }
            if (cakeInvite.declined.length) {
                clearInterval(cakeInviteTimer); cakeInviteTimer = null;
                let who = cakeInvite.declined.map(dispName).join('、'); cakeInvite = null;
                showSysModal('没法开局', who + ' 拒绝了，这次先不开松饼大作战。', [{ label: '知道了' }]);
                return;
            }
            if (cakeInvite.pending.length === 0) {
                clearInterval(cakeInviteTimer); cakeInviteTimer = null;
                let plan = [{ id: gState.id }].concat(cakeInvite.others.map(function (id) { return { id: id }; }));
                let seed = Math.floor(Math.random() * 1000000);
                cakeInvite = null;
                document.getElementById('sys-modal').classList.add('hidden');   // 全票通过，自动开局，不用等你点关闭
                bc.postMessage({ type: 'CK_START', target: '*', sender: gState.id, plan: plan, host: gState.id, seed: seed });
                cakeBegin(plan, gState.id, seed);
                return;
            }
            if (performance.now() - cakeInvite.t0 > CAKE_INVITE_TIMEOUT) {
                clearInterval(cakeInviteTimer); cakeInviteTimer = null;
                let who = cakeInvite.pending.map(dispName).join('、'); cakeInvite = null;
                showSysModal('没法开局', who + ' 没有回应（可能不在了），这次先不开松饼大作战。', [{ label: '知道了' }]);
            }
        }
        // 收到别人发来的开局邀请：不是自己身上的邀请就无视，是的话弹窗问同意不同意，
        // 把结果发回给发起人。
        function cakeOnInvite(m) {
            if (!m.ids || m.ids.indexOf(gState.id) < 0) return;
            showSysModal('邀请　松饼大作战', (m.sender ? dispName(m.sender) : '有人') + ' 想现在开始松饼大作战，同意一起玩吗？', [
                {
                    label: '同意', color: '#5cb85c', onClick: function () {
                        if (m.sender) cakeAcceptAt[m.sender] = performance.now();
                        bc.postMessage({ type: 'CK_INVITE_ACK', target: m.sender, sender: gState.id, reqId: m.reqId, accept: true });
                    }
                },
                {
                    label: '拒绝', color: '#d9534f', onClick: function () {
                        bc.postMessage({ type: 'CK_INVITE_ACK', target: m.sender, sender: gState.id, reqId: m.reqId, accept: false });
                    }
                }
            ]);
        }
        function cakeOnInviteAck(m) {
            if (!cakeInvite || m.reqId !== cakeInvite.reqId) return;
            let i = cakeInvite.pending.indexOf(m.sender);
            if (i < 0) return;
            cakeInvite.pending.splice(i, 1);
            if (!m.accept) cakeInvite.declined.push(m.sender);
            cakeInviteRender();
        }
        // plan：[{id}, {id}, ...]，真人的位置排前面，不够 CAKE.playerCount 个就用 AI 补满。
        // 联机时 host/seed 由发起人决定，所有人用同一个 seed 生成地图，画面才能对上。
        function cakeBegin(plan, hostId, seed) {
            showModeIntroIfFirstTime('cake');
            plan = plan || [{ id: gState.id }];
            hostId = hostId || gState.id;
            seed = seed || Math.floor(Math.random() * 1000000);
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
            ensureScene();
            scene.background = new THREE.Color(0xfff3cd);
            scene.fog = new THREE.FogExp2(0xfff3cd, 0.0012);
            gameSeed = seed;   // 建楼/建台子都用 seededRandom，全员种子一样地图就长一样
            cakeBuildArena();

            let n = CAKE.playerCount;
            let spawns = cakeEvenSpawns(n);
            cake = {
                over: false, clock: 0, actors: [], fx: [], buffs: [], buffSeq: 0,
                buffTimer: CAKE.buffEvery * 0.4, last: performance.now(), raf: null,
                host: hostId, net: plan.some(function (q) { return q.id && q.id !== gState.id; }),
                sendSelf: 0, sendWorld: 0
            };

            let pool = HUB_BOT_NAMES.slice();
            for (let i = 0; i < n; i++) {
                let q = plan[i] || {};
                let isP = q.id === gState.id;
                let col = isP ? mySkinColor(RACE_COLORS[i % RACE_COLORS.length]) : (q.id ? RACE_COLORS[i % RACE_COLORS.length] : aiSkinColor(RACE_COLORS[i % RACE_COLORS.length]));
                let mesh = cakeMakeBody(col, CAKE.handRange, false, isP ? gState.acc : (q.id ? peerAccOf(q.id) : aiRandomAcc()), isP ? myFace() : (q.id ? peerFaceOf(q.id) : aiRandomFace()));
                scene.add(mesh);
                let sp = spawns[i];
                let name = q.id ? dispName(q.id) : (pool.length ? pool.splice(Math.floor(seededRandom() * pool.length), 1)[0] : ('猫盾' + (i + 1)));
                // 头顶名字：联机的时候一堆猫盾身体长得一样，不然根本分不清谁是真人朋友
                // name 是 dispName() 转义过的（给下面结算弹窗等 innerText/innerHTML 用），画到画布上要用原文，不然名字带 & < 时会显示成 &amp; 这种
                let label = nightMakeLabel(q.id ? dispNameText(q.id) : name, col, false, isP ? myTitle() : (q.id ? peerTitleOf(q.id) : aiRandomTitle()));
                label.position.y = 13.5; mesh.add(label);
                if (isP) label.visible = false;   // 第三人称镜头就在自己背后，自己头顶的名字一直挡在画面正中
                let a = {
                    idx: i, isPlayer: isP, col: col, name: name,
                    netId: q.id || null, remote: !!(q.id && !isP), target: null,
                    p: new THREE.Vector3(sp.x * TILE, 0, sp.z * TILE), facing: Math.random() * Math.PI * 2,
                    floor: 0, mvx: 0, mvz: 0, vy: 0, out: false, kills: 0,
                    speedT: 0, reachT: 0, shieldT: 0, gestureT: 0, gestureKind: null,
                    mesh: mesh, aiT: Math.random() * 0.5, animT: 0
                };
                cake.actors.push(a);
            }
            cake.me = cake.actors.filter(function (a) { return a.isPlayer; })[0] || cake.actors[0];
            camera.rotation.set(0, Math.random() * Math.PI * 2, 0);

            document.body.onmousedown = function (e) {
                if (!cake || cake.over) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal'))) return;
                if (!document.pointerLockElement) { safeLockPointer(); }
            };
            document.body.onmouseup = null;
            cakeTouchUI(true);
            bgmStart();
            cakeLoop();
        }
        function cakeExit() {
            if (!cake) return;
            cake.over = true;
            if (cake.raf) cancelAnimationFrame(cake.raf);
            if (document.pointerLockElement) document.exitPointerLock();
            cake.actors.forEach(function (a) { scene.remove(a.mesh); });
            cake.buffs.forEach(function (b) { scene.remove(b.mesh); });
            cake.fx.forEach(function (f) { scene.remove(f.o); f.mat.dispose(); });
            clearMazeMeshes();   // 松饼地图自己搭的楼房/跳台也在这一并清掉，不然回大厅还看得见
            cake = null;
            cakeTouchUI(false);
            bgmStop();
            document.body.onmousedown = null;
            document.getElementById('blaze-hud').classList.add('hidden');
            nav('screen-lobby'); selectGameMode('cake');
        }

