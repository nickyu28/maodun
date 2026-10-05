        // ══════════════════════════════════════════════════════════
        //  《躲避球》· 经典淘汰 + 篮筐，疯狂模式再叠加复活球/秒杀球/随机掉落
        //  场地是一整块开阔矩形（不用 maze），中线分两队，球只能砸中对方，
        //  人不能越过中线。球落地不消失，永远留在场上等人来捡。
        // ══════════════════════════════════════════════════════════
        const DODGE = {
            teamSize: 10,
            courtW: 240, courtL: 960,          // 宽度减半——太宽的话开局捡球得跑老远；纵深不动，人还是够分散
            matchTime: 240,
            // 球速和重力一起调高——以前 130/45 那组数据，球飞得又慢又飘，
            // 而且玩家瞄准是「猜一个目标距离再解仰角」，一旦猜成了接近极限射程，
            // 解出来的角度直接顶到 45°，看着就是没由头地飞上天。现在玩家扔球
            // 改成直接用视线方向当初速度方向（所见即所得），球更快、重力更沉，
            // 手感更像真的抡一下，而不是端着炮往天上打。
            ballSpeed: 260, gravity: 100,
            pickupRange: 9, hitRadius: 8,
            catchWindow: 0.3,                  // 右键按下去之后，这么长时间内是「举着手」，能接住
            throwCd: 0.35,
            reviveN: 5,                        // 接住复活球，复活这么多人
            // 篮筐摆在场地正中央（两队各自半场之间），篮板两边各一块——
            // 以前只有 z=+11 那一块，等于只有队伍0 那个方向扔进去才有板可以打，
            // 队伍1 反着往这边投，篮板其实在球的来向背后，形同虚设，谈不上两边对称。
            hoopPos: { x: 0, y: 34, z: 0 }, hoopR: 9,
            boardOffset: 11, boardR: 9,
            camBack: 26, camUp: 17,
            staminaMax: 100, runSpeedMul: 1.6, runDrain: 28, runRegen: 16,   // 体力用来跑，跟寻宝队一样的数值
            jumpV: 44, jumpGravity: 150, jumpCost: 10,   // 跳跃纯位移表达，不影响任何判定，但要吃一口体力
            dropEvery: 7, dropVariance: 3
        };

        function dodgeHome(p) { return p.z < 0 ? 0 : 1; }

        function dodgeClampCourt(a) {
            let halfW = DODGE.courtW / 2 - 3, halfL = DODGE.courtL / 2 - 3;
            a.p.x = Math.max(-halfW, Math.min(halfW, a.p.x));
            if (a.team === 0) a.p.z = Math.max(-halfL, Math.min(-1, a.p.z));
            else a.p.z = Math.max(1, Math.min(halfL, a.p.z));
        }

        // ── 场地：一整块地板 + 四周矮墙 + 中线 + 中场悬空的篮筐/篮板 ──
        function dodgeBuildCourt() {
            let W = DODGE.courtW, L = DODGE.courtL;
            let floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshLambertMaterial({ color: 0xdcedc1 }));
            floor.rotation.x = -Math.PI / 2; scene.add(floor); dodge.meshes.push(floor);
            let line = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            line.rotation.x = -Math.PI / 2; line.position.y = 0.05; scene.add(line); dodge.meshes.push(line);
            function wall(x, z, w, d) {
                let m = new THREE.Mesh(new THREE.BoxGeometry(w, 16, d), new THREE.MeshLambertMaterial({ color: 0x90a4ae }));
                m.position.set(x, 8, z); scene.add(m); dodge.meshes.push(m);
            }
            wall(0, -L / 2, W, 3); wall(0, L / 2, W, 3);
            wall(-W / 2, 0, 3, L); wall(W / 2, 0, 3, L);
            // 篮筐：环 + 立柱；篮板：贴在环后面的一块板
            let rim = new THREE.Mesh(new THREE.TorusGeometry(DODGE.hoopR * 0.7, 0.8, 8, 20),
                new THREE.MeshLambertMaterial({ color: 0xff7043, emissive: 0x7f2200 }));
            rim.rotation.x = Math.PI / 2; rim.position.set(DODGE.hoopPos.x, DODGE.hoopPos.y, DODGE.hoopPos.z);
            scene.add(rim); dodge.meshes.push(rim);
            let pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, DODGE.hoopPos.y, 10),
                new THREE.MeshLambertMaterial({ color: 0x78909c }));
            pole.position.set(DODGE.hoopPos.x, DODGE.hoopPos.y / 2, DODGE.hoopPos.z);
            scene.add(pole); dodge.meshes.push(pole);
            // 篮板两边各摆一块，两队往中间投都有板可以打——对称
            [-1, 1].forEach(function (side) {
                let board = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 1.2),
                    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }));
                board.position.set(DODGE.hoopPos.x, DODGE.hoopPos.y + 3, DODGE.hoopPos.z + side * DODGE.boardOffset);
                scene.add(board); dodge.meshes.push(board);
            });
        }

        // ── 球 ──
        function dodgeBallColor(kind) { return kind === 'revival' ? 0xffd700 : kind === 'kill' ? 0x212121 : 0xff8a65; }
        function dodgeMakeBallMesh(kind) {
            let g = new THREE.Group();
            let ball = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 10),
                new THREE.MeshLambertMaterial({ color: dodgeBallColor(kind), emissive: kind === 'kill' ? 0x5c0000 : 0x000000 }));
            g.add(ball);
            return g;
        }
        function dodgeSpawnBall(kind, x, y, z) {
            let mesh = dodgeMakeBallMesh(kind);
            mesh.position.set(x, y, z);
            scene.add(mesh);
            let b = { idx: dodge.balls.length, mesh: mesh, kind: kind, state: 'idle', holder: null, thrownBy: null, thrownTeam: null, airT: 0,
                claimedBy: null, claimAge: 0,
                p: new THREE.Vector3(x, y, z), vel: new THREE.Vector3() };
            dodge.balls.push(b);
            return b;
        }

        function dodgeBurst(p, color) {
            if (!dodge) return;
            let mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
            let m = new THREE.Mesh(new THREE.RingGeometry(4, 5.5, 18), mat);
            m.rotation.x = -Math.PI / 2; m.position.set(p.x, 1.2, p.z);
            scene.add(m);
            dodge.fx.push({ o: m, mat: mat, t: 0.5, life: 0.5, r0: 5, r1: 22 });
        }
        function dodgeFxTick(dt) {
            dodge.fx = dodge.fx.filter(function (f) {
                f.t -= dt;
                if (f.t <= 0) { scene.remove(f.o); f.mat.dispose(); return false; }
                let frac = 1 - f.t / f.life, r = f.r0 + (f.r1 - f.r0) * frac;
                f.o.scale.set(r / f.r0, r / f.r0, 1);
                f.mat.opacity = 0.85 * (1 - frac * frac);
                return true;
            });
        }

        function dodgeKindName(k) { return k === 'revival' ? '复活球' : k === 'kill' ? '秒杀球' : '普通球'; }

        // ── 扔球 ──
        // 按抛物线公式算仰角：给定水平距离，解出用 DODGE.ballSpeed 这个初速度
        // 能刚好打到那么远的角度（取比较平的那个解，不是踢高球）。
        // AI 用固定俯仰角扔球时，稍微远一点的目标球压根飞不到——落地一半路就没了。
        function dodgeArcDir(ux, uz, dist) {
            let v = DODGE.ballSpeed, g = DODGE.gravity;
            let sin2t = Math.min(1, Math.max(0.06, (Math.max(dist, 1) * g) / (v * v)));
            let theta = Math.asin(sin2t) / 2;
            return { x: ux * Math.cos(theta), y: Math.sin(theta), z: uz * Math.cos(theta) };
        }

        // AI 投篮专用：篮筐比人高一大截（y=34），dodgeArcDir 那套「目标跟起手点一样高」
        // 的简化公式解不出正确仰角，得把落点的高度差也算进抛物线方程里，
        // 不然球到了篮筐正下方那个水平距离时，早就掉到地上了。
        function dodgeHoopArcDir(a) {
            let dx = DODGE.hoopPos.x - a.p.x, dz = DODGE.hoopPos.z - a.p.z;
            let d = Math.max(1, Math.hypot(dx, dz));
            let ux = dx / d, uz = dz / d;
            let h = DODGE.hoopPos.y - (a.p.y + 8);
            let v = DODGE.ballSpeed, g = DODGE.gravity;
            let A = (g * d * d) / (2 * v * v);
            let disc = d * d - 4 * A * (h + A);
            let theta;
            if (disc < 0) {
                theta = Math.PI / 4;   // 太远/太高够不着，尽力扔一个 45° 弧线
            } else {
                let sq = Math.sqrt(disc);
                let cands = [(d - sq) / (2 * A), (d + sq) / (2 * A)].filter(function (u) { return u > 0; });
                let u = cands.length ? Math.min.apply(null, cands) : Math.tan(Math.PI / 4);
                theta = Math.atan(u);
            }
            theta = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, theta));
            return { x: ux * Math.cos(theta), y: Math.sin(theta), z: uz * Math.cos(theta) };
        }

        // 每一次出手都画一条真实弹道线，跟着球飞行的时间同步淡出——球速调快之后
        // 光靠球本身太小、飞得太快，一晃眼就到，跟瞬移没区别。这条线留在原地，
        // 不管球本身飞多快，弧线本身都看得清清楚楚。关掉 fog，不然场地这么大，
        // 稍微远一点线就被雾色吃掉了，跟消失了一样。
        function dodgeSpawnArcLine(origin, dir, color) {
            let p = origin.clone();
            let v = new THREE.Vector3(dir.x * DODGE.ballSpeed, dir.y * DODGE.ballSpeed, dir.z * DODGE.ballSpeed);
            let pts = [p.clone()];
            let dt2 = 0.02, flightT = 0;
            for (let i = 0; i < 400; i++) {
                v.y -= DODGE.gravity * dt2;
                p.x += v.x * dt2; p.y += v.y * dt2; p.z += v.z * dt2;
                pts.push(p.clone());
                flightT += dt2;
                if (p.y <= 0) break;
                if (Math.abs(p.x) > DODGE.courtW / 2 || Math.abs(p.z) > DODGE.courtL / 2) break;
            }
            let line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: color || 0x000000, transparent: true, opacity: 1, fog: false }));
            scene.add(line);
            let life = Math.max(0.5, flightT);
            dodge.arcs.push({ line: line, t: life, life: life });
        }
        function dodgeArcTick(dt) {
            dodge.arcs = dodge.arcs.filter(function (f) {
                f.t -= dt;
                if (f.t <= 0) { scene.remove(f.line); f.line.geometry.dispose(); f.line.material.dispose(); return false; }
                f.line.material.opacity = Math.min(1, f.t / f.life * 1.5);   // 大半程都是实的，只在快消失前才淡出
                return true;
            });
        }

        // 右键把手上的球放下——拿着球没法再接（伸手要空的），这是唯一能腾出手的办法。
        // 捡/放这两下是"空闲的球"，没有正在飞的物理要抢，谁的角色谁拍板就行——
        // 跟监狱救援的捡物品/交物品一个道理，不用像球的飞行/命中那样非得走房主。
        function dodgeDoDrop(actorIdx) {
            dodgeApplyDrop(actorIdx);
            if (dodge.netOn) bc.postMessage({ type: 'DODGE_EV', target: '*', sender: gState.id, ev: 'drop', a: actorIdx });
        }
        function dodgeApplyDrop(actorIdx) {
            let a = dodge.actors[actorIdx];
            if (!a || !a.holding) return;
            let b = a.holding;
            b.state = 'idle'; b.holder = null; b.p.set(a.p.x, 3.5, a.p.z); b.vel.set(0, 0, 0);
            a.holding = null;
            if (a.isPlayer) blazeFlash('把球放下了');
        }

        // 玩家扔球：以前是「猜一个目标距离，再拿抛物线公式反解仰角」，只要猜的距离
        // 接近极限射程，解出来的角度就顶到 45° 封顶，看着像没来由地往天上抛。
        // 改回所见即所得——直接拿视线方向当初速度方向，球速和重力都调高了，
        // 才不会像最早那版一样稍微低头就直接砸自己脚下。瞄准辅助线会画出这个
        // 方向真实的抛物线，想打多远，自己抬头压低去调，不用系统替你猜。
        function dodgePlayerAimDir(a) {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.normalize();
            return dir;
        }

        // 弹道线/放手动作/冷却是纯本地表现，谁扔的这边直接算，不用等联机那一趟；
        // 真正让球飞起来（球的位置/速度这份"世界状态"，后续命中判定也靠它）
        // 只有房主能动手——跟球的飞行物理归房主管是同一个道理，不然两边各算一份
        // 物理，球到底飞到哪、打没打中谁就可能对不上。非房主自己扔球时，把这个
        // 意图（谁、哪颗球、往哪个方向）发给房主，房主收到了才真的让球飞出去，
        // 房主随后按老规矩广播世界状态，这边球的画面跟着同步过来。
        function dodgeTryThrow(a) {
            if (!a || a.out || !a.holding || (a.throwCd || 0) > 0) return;
            if (a.mustReturn) { if (a.isPlayer) blazeFlash('这是中线球，先跑回本方边线再出手！'); return; }
            let ballIdx = a.holding.idx;
            let dir;
            if (a.isPlayer) dir = dodgePlayerAimDir(a);
            else if (a.aimHoop) {
                let arc = dodgeHoopArcDir(a);
                dir = new THREE.Vector3(arc.x, arc.y, arc.z);
            } else {
                let ux = a.aimX || 0, uz = a.aimZ || (a.team === 0 ? 1 : -1);
                let arc = dodgeArcDir(ux, uz, a.aimDist || 50);
                dir = new THREE.Vector3(arc.x, arc.y, arc.z);
            }
            if (dir.lengthSq() < 0.0001) dir.set(0, 0.2, a.team === 0 ? 1 : -1);
            dir.normalize();
            // 每次出手都画弹道线——投篮拼命那一下用金色特别标出来，其它就是投手的队伍色
            let arcColor = a.aimHoop ? 0xe65100 : (a.team === 0 ? 0x0d47a1 : 0xb71c1c);   // 深色，不要浅色
            dodgeSpawnArcLine(new THREE.Vector3(a.p.x, a.p.y + 8, a.p.z), dir, arcColor);
            a.holding = null;
            a.throwCd = DODGE.throwCd;
            a.gestureT = 0.3; a.gestureKind = 'throw';
            if (a.isPlayer) sfxThrow();   // 只给自己扔的这一下出声，AI 满场扔球不用都响
            if (!a.isPlayer && a.team === dodge.me.team) aiSay(a, a.name, 'throw', DODGE_LINES.throw);
            let amHost = !dodge.hostId || dodge.hostId === gState.id;
            let dirObj = { x: dir.x, y: dir.y, z: dir.z };
            if (amHost) dodgeApplyThrow(a.idx, ballIdx, dirObj);
            else if (dodge.netOn) bc.postMessage({ type: 'DODGE_EV', target: '*', sender: gState.id, ev: 'throwReq', a: a.idx, b: ballIdx, dir: dirObj });
        }
        function dodgeApplyThrow(actorIdx, ballIdx, dir) {
            let a = dodge.actors[actorIdx], b = dodge.balls[ballIdx];
            if (!a || !b || b.state === 'flying') return;   // 已经在飞了，别重复扔一遍
            b.vel.set(dir.x * DODGE.ballSpeed, dir.y * DODGE.ballSpeed, dir.z * DODGE.ballSpeed);
            b.p.set(a.p.x, a.p.y + 8, a.p.z);
            b.state = 'flying'; b.holder = null; b.thrownBy = a; b.thrownTeam = a.team; b.airT = 0;
            if (a.holding === b) a.holding = null;
        }

        function dodgeReviveAll(team) {
            let n = 0, first = null;
            dodge.actors.forEach(function (a) { if (a.team === team && a.out) { a.out = false; a.p.set(a.home.x, 0, a.home.z); n++; if (!first && !a.isPlayer) first = a; } });
            if (n > 0 && dodge.me.team === team) blazeFlash('投进篮筐！全队复活！');
            if (first && team === dodge.me.team) aiSay(first, first.name, 'revive', DODGE_LINES.revive);
            if (dodge.spectating && !dodge.me.out) dodgeLeaveSpectate();
        }
        function dodgeReviveN(team, n) {
            let revived = 0, first = null;
            dodge.actors.filter(function (a) { return a.team === team && a.out; }).slice(0, n).forEach(function (a) {
                a.out = false; a.p.set(a.home.x, 0, a.home.z); revived++; if (!first && !a.isPlayer) first = a;
            });
            if (revived > 0 && dodge.me.team === team) blazeFlash('接住复活球！复活了 ' + revived + ' 名队友！');
            if (first && team === dodge.me.team) aiSay(first, first.name, 'revive', DODGE_LINES.revive);
            if (dodge.spectating && !dodge.me.out) dodgeLeaveSpectate();
        }
        // 接球复活：普通球接住了，不只是保自己安全，还顺带把本队一名被淘汰的队友接回场——
        // 真实躲避球里常见的规则，光靠篮筐/复活球救人太慢，接球本身也该有点回报。
        function dodgeCatchRevive(a) {
            let target = dodge.actors.find(function (o) { return o.team === a.team && o.out; });
            if (!target) return;
            target.out = false; target.p.set(target.home.x, 0, target.home.z);
            dodgeBurst(target.p, 0x66bb6a);
            if (a.team === dodge.me.team) blazeFlash((a.isPlayer ? '你' : a.name) + ' 接球救回一名队友！');
            if (dodge.spectating && !dodge.me.out) dodgeLeaveSpectate();
        }
        function dodgeCheckWin() {
            for (let t = 0; t < 2; t++) {
                let mem = dodge.actors.filter(function (a) { return a.team === t; });
                if (mem.length && mem.every(function (a) { return a.out; })) { dodgeEndMatch(1 - t); return; }
            }
        }
        function dodgeEliminate(a) {
            if (a.out) return;
            a.out = true;
            if (a.holding) { a.holding.state = 'idle'; a.holding.holder = null; a.holding.p.copy(a.p); a.holding.p.y = 3.5; a.holding = null; }
            dodgeBurst(a.p, 0xef5350);   // 爆点在真正被砸中的地方，先炸完再挪去场边
            // 按淘汰顺序坐去场边——人挪窝了，但打不着也摸不到球，对现役的人来说跟不存在一样。
            let idx = dodge.benchCount[a.team]++;
            a.p.set((idx - (DODGE.teamSize - 1) / 2) * 12, 0, (a.team === 0 ? -1 : 1) * (DODGE.courtL / 2 + 20));
            if (a.isPlayer) dodgeEnterSpectate('你被淘汰了！');
            dodgeCheckWin();
        }

        const DODGE_LINES = {
            catch: ['接住了！', '稳稳拿下'],
            throw: ['看招！', '接得住算你厉害'],
            revive: ['复活了，冲！', '谢了，我们还能打'],
            claim: ['这颗我来捡，你们找别的', '分开找球，别都挤一块', '我来捡这颗，别跟我抢']
        };
        // 球的飞行/命中只有房主在跑（dodgeBallTick 由 amHost 控制），这里判出来的
        // 结果（淘汰/接住/复活）要影响到所有人的画面，走跟捡球一样的"算完就广播"，
        // 让每台机器上受影响的那个人（不管真人还是 AI）都做同一件事。
        function dodgeDoEliminate(actorIdx, byIdx) {
            dodgeApplyEliminate(actorIdx, byIdx);
            if (dodge.netOn) bc.postMessage({ type: 'DODGE_EV', target: '*', sender: gState.id, ev: 'eliminate', a: actorIdx, by: byIdx });
        }
        function dodgeApplyEliminate(actorIdx, byIdx) {
            let a = dodge.actors[actorIdx];
            if (!a || a.out) return;
            let wasMe = (a === dodge.me);
            let byMe = (typeof byIdx === 'number' && dodge.actors[byIdx] === dodge.me);
            dodgeEliminate(a);
            // 只有自己被砸、或者自己砸中人，才出声——不然满场 AI 互相淘汰的声音会连成一片。
            if (wasMe) sfxBuzz(); else if (byMe) sfxThud(true);
        }
        function dodgeDoCatch(actorIdx, ballIdx) {
            dodgeApplyCatch(actorIdx, ballIdx);
            if (dodge.netOn) bc.postMessage({ type: 'DODGE_EV', target: '*', sender: gState.id, ev: 'catch', a: actorIdx, b: ballIdx });
        }
        function dodgeApplyCatch(actorIdx, ballIdx) {
            let a = dodge.actors[actorIdx], b = dodge.balls[ballIdx];
            if (!a || !b) return;
            b.state = 'held'; b.holder = a; a.holding = b;
            dodgeBurst(a.p, 0x81d4fa);
            if (a.isPlayer) { blazeFlash('接住了！'); sfxChime(2); }
            else if (a.team === dodge.me.team) aiSay(a, a.name, 'catch', DODGE_LINES.catch);
            dodgeCatchRevive(a);
        }
        function dodgeDoReviveN(team) {
            dodgeApplyReviveN(team);
            if (dodge.netOn) bc.postMessage({ type: 'DODGE_EV', target: '*', sender: gState.id, ev: 'reviveN', team: team });
        }
        function dodgeApplyReviveN(team) {
            let wasOut = dodge.me.out;
            dodgeReviveN(team, DODGE.reviveN);
            if (wasOut && !dodge.me.out) sfxChime(3);
        }
        function dodgeDoReviveAll(team) {
            dodgeApplyReviveAll(team);
            if (dodge.netOn) bc.postMessage({ type: 'DODGE_EV', target: '*', sender: gState.id, ev: 'reviveAll', team: team });
        }
        function dodgeApplyReviveAll(team) {
            let wasOut = dodge.me.out;
            dodgeReviveAll(team);
            if (wasOut && !dodge.me.out) sfxChime(3);
        }

        function dodgeResolveHit(b, a) {
            // 先记下真正被砸中的地方——dodgeEliminate 会把 a.p 挪去场边，
            // 球要是等挪完了再抄 a.p，就会跟着传送到场边，看着像「人被淘汰后变成了一颗球」。
            let hitPos = a.p.clone();
            let byIdx = b.thrownBy ? b.thrownBy.idx : -1;
            if (b.kind === 'kill') {
                dodgeBurst(a.p, 0x212121);
                b.state = 'idle'; b.holder = null; b.p.copy(hitPos); b.p.y = 3.5; b.vel.set(0, 0, 0);
                dodgeDoEliminate(a.idx, byIdx);
                return;
            }
            // 接不接得住看这一下有没有在「按空格」的接球窗口内——不看朝向。
            // 以前是看有没有面朝来球方向，但场地这么大、双方队伍常年隔着球场对着站，
            // 「朝向」这个条件形同虚设，人人都算数，等于谁也打不中谁。
            // 换成主动按键：空手时按一下空格开一小段接球窗口，按早按晚都接不住。
            let caught = (a.catchWindow || 0) > 0 && !a.holding;
            if (b.kind === 'revival') {
                if (caught) dodgeDoReviveN(a.team);
                b.state = 'idle'; b.holder = null; b.p.copy(a.p); b.p.y = 3.5; b.vel.set(0, 0, 0);
                return;
            }
            // 普通球：接住不反杀，接住就是安全 + 球到手上；没接住就出局
            if (caught) {
                dodgeDoCatch(a.idx, b.idx);
            } else {
                b.state = 'idle'; b.holder = null; b.p.copy(hitPos); b.p.y = 3.5; b.vel.set(0, 0, 0);
                dodgeDoEliminate(a.idx, byIdx);
            }
        }

        function dodgeBallTick(dt) {
            dodge.balls.forEach(function (b) {
                if (b.state !== 'flying') return;
                b.airT += dt;
                b.vel.y -= DODGE.gravity * dt;
                b.p.x += b.vel.x * dt; b.p.y += b.vel.y * dt; b.p.z += b.vel.z * dt;
                if (b.p.y <= 3.5) {
                    b.p.y = 3.5; b.state = 'idle'; b.vel.set(0, 0, 0); return;
                }
                let halfW = DODGE.courtW / 2, halfL = DODGE.courtL / 2;
                if (Math.abs(b.p.x) > halfW || Math.abs(b.p.z) > halfL) {
                    // 出界：球不消失，落在界内边缘等人来捡
                    b.p.x = Math.max(-halfW + 4, Math.min(halfW - 4, b.p.x));
                    b.p.z = Math.max(-halfL + 4, Math.min(halfL - 4, b.p.z));
                    b.p.y = 3.5; b.state = 'idle'; b.vel.set(0, 0, 0); return;
                }
                // 篮筐：任何球投进都直接复活投手全队
                let dHoop = Math.hypot(b.p.x - DODGE.hoopPos.x, b.p.y - DODGE.hoopPos.y, b.p.z - DODGE.hoopPos.z);
                if (dHoop < DODGE.hoopR) {
                    dodgeDoReviveAll(b.thrownTeam);
                    b.state = 'idle'; b.p.y = 3.5; b.vel.set(0, 0, 0); return;
                }
                // 复活球碰到篮板，一样复活全队（比投进宽松，不用真的空心入网）——
                // 两块板都要判，不然只对着其中一队的投篮方向生效，不对称。
                if (b.kind === 'revival') {
                    let hitBoard = [-1, 1].some(function (side) {
                        let bz = DODGE.hoopPos.z + side * DODGE.boardOffset;
                        return Math.hypot(b.p.x - DODGE.hoopPos.x, b.p.y - DODGE.hoopPos.y, b.p.z - bz) < DODGE.boardR;
                    });
                    if (hitBoard) {
                        dodgeDoReviveAll(b.thrownTeam);
                        b.state = 'idle'; b.p.y = 3.5; b.vel.set(0, 0, 0); return;
                    }
                }
                if (b.airT < 0.12) return;   // 刚出手那一瞬间不会打到自己
                for (let i = 0; i < dodge.actors.length; i++) {
                    let a = dodge.actors[i];
                    if (a.out) continue;
                    if (a === b.thrownBy && b.airT < 0.35) continue;
                    // 普通球/复活球只打得到对面——不然球会在半路误伤扔球那队自己人。
                    // 秒杀球例外：碰到就死，不分敌我，拿着它本身就该小心。
                    if (b.kind !== 'kill' && a.team === b.thrownTeam) continue;
                    if (Math.abs(a.p.y - b.p.y) > 14) continue;
                    let d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
                    if (d > DODGE.hitRadius) continue;
                    dodgeResolveHit(b, a);
                    return;
                }
            });
        }

        // 空格这一下要干嘛：手上没东西、附近有闲置的球就捡起来；没球可捡就当作
        // 「想接球」，开一个短暂的接球窗口。玩家和 AI 共用这一个判断。
        // 捡起来：中线球（centerBall）第一次被捡走要打上「必须先回本方边线」的标——
        // 一次性的，捡到手就把球身上那个标摘掉，球再被扔出去、被别人捡走就不再管这条规则了。
        function dodgeDoPickup(actorIdx, ballIdx) {
            dodgeApplyPickup(actorIdx, ballIdx);
            if (dodge.netOn) bc.postMessage({ type: 'DODGE_EV', target: '*', sender: gState.id, ev: 'pickup', a: actorIdx, b: ballIdx });
        }
        function dodgeApplyPickup(actorIdx, ballIdx) {
            let a = dodge.actors[actorIdx], ball = dodge.balls[ballIdx];
            if (!a || !ball || ball.state !== 'idle' || a.holding) return;   // 已经处理过了，别重复捡一遍
            ball.state = 'held'; ball.holder = a; a.holding = ball; a.gestureT = 0.3; a.gestureKind = 'pickup';
            ball.claimedBy = null;
            if (a.ballTarget === ball) a.ballTarget = null;
            // 每次捡球都重新判一次，不留上一颗球欠下的债——不然被淘汰过一次、
            // 再捡一颗跟中线毫无关系的球，也会莫名其妙被这条规矩卡住扔不出去。
            a.mustReturn = !!ball.centerBall;
            ball.centerBall = false;
        }
        // 鼠标端拆成两个独立动作：左键点一下专门捡球，右键专门接球，互不干扰
        function dodgePickupNearby(a) {
            if (a.out || a.holding) return;
            let ball = dodge.balls.find(function (b) {
                return b.state === 'idle' && Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z) < DODGE.pickupRange;
            });
            if (ball) dodgeDoPickup(a.idx, ball.idx);
        }
        function dodgeOpenCatch(a) {
            if (a.out || a.holding) return;
            a.catchWindow = DODGE.catchWindow;
        }

        // AI 的「捡球」还是自动的——没有按键这回事，纯粹是行为决策；
        // 玩家的捡球/接球全部改成显式按空格，在 dodgePlayerMove 里单独处理。
        // 这个 tick 只有房主在跑，之前漏判了 netId——联机的真人队友在房主眼里
        // isPlayer 是 false（isPlayer 只在"自己"那台机器上才是 true），不排除的话
        // 房主这边会把真人队友当 AI，人站在球边上就替他自动捡起来，手感全乱了。
        function dodgePickupTick() {
            dodge.actors.forEach(function (a) {
                if (a.isPlayer || a.netId || a.out || a.holding) return;
                let ball = dodge.balls.find(function (b) {
                    return b.state === 'idle' && Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z) < DODGE.pickupRange;
                });
                if (ball) dodgeDoPickup(a.idx, ball.idx);
            });
        }

        function dodgeSeparate() {
            let list = dodge.actors.filter(function (a) { return !a.out; });
            for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
                let a = list[i], b = list[j];
                let dx = a.p.x - b.p.x, dz = a.p.z - b.p.z, d = Math.hypot(dx, dz);
                if (d >= 9 || d < 0.01) continue;
                let nx = dx / d, nz = dz / d, push = (9 - d) * 0.3;
                a.p.x += nx * push; a.p.z += nz * push; b.p.x -= nx * push; b.p.z -= nz * push;
                dodgeClampCourt(a); dodgeClampCourt(b);
            }
        }

        function dodgeDropTick(dt) {
            if (!dodge.crazy) return;
            dodge.dropT -= dt;
            if (dodge.dropT > 0) return;
            dodge.dropT = DODGE.dropEvery + (Math.random() - 0.5) * DODGE.dropVariance * 2;
            let x = (Math.random() - 0.5) * (DODGE.courtW - 16);
            let z = (Math.random() - 0.5) * (DODGE.courtL - 16);
            let roll = Math.random();
            let kind = roll < 0.15 ? 'kill' : roll < 0.32 ? 'revival' : 'normal';
            let b = dodgeSpawnBall(kind, x, 55, z);
            b.state = 'flying'; b.vel.set(0, 0, 0);
        }

        // ── 玩家移动：跟监狱救援一套手感，边界换成矩形场地 + 中线不能越过 ──
        function dodgePlayerMove(a, dt) {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0;
            if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1); else dir.normalize();
            a.faceDir = { x: dir.x, z: dir.z };
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1;
            if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            let isMoving = (fwd !== 0 || strafe !== 0);
            // 体力用来跑，跟寻宝队一样：按住 Shift（平板是「跑/走」开关）加速 60%、吃体力。
            let isRunning = (keys['shift'] || padRun) && isMoving && a.stamina > 0;
            let wx = 0, wz = 0;
            if (isMoving) {
                let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe;
                let n = Math.hypot(mx, mz) || 1, sp = blazeSpeed(a) * (isRunning ? staminaBoostMul(a.stamina, DODGE.runSpeedMul) : 1);
                wx = mx / n * sp; wz = mz / n * sp;
            }
            if (isRunning) a.stamina = Math.max(0, a.stamina - DODGE.runDrain * dt);
            else a.stamina = Math.min(DODGE.staminaMax, a.stamina + DODGE.runRegen * dt);

            let rate = (wx || wz) ? 1 / BLAZE.accel : 1 / BLAZE.brake;
            let k = Math.min(1, rate * dt);
            a.mvx = (a.mvx || 0) + (wx - (a.mvx || 0)) * k;
            a.mvz = (a.mvz || 0) + (wz - (a.mvz || 0)) * k;
            if (Math.abs(a.mvx) >= 0.4 || Math.abs(a.mvz) >= 0.4) { a.p.x += a.mvx * dt; a.p.z += a.mvz * dt; }
            else { a.mvx = 0; a.mvz = 0; }
            dodgeClampCourt(a);

            // 接球改成右键触发（mousedown 里直接调 dodgeOpenCatch，一次点击就是一次尝试，
            // 不用像轮询那样自己做「刚按下」的边缘检测）。这里只保留触屏「接」键的轮询——
            // 触屏没有右键这回事，还是靠点一下算一下的 touchBtn.jump 标记位。
            let catchTapped = touchBtn.jump; touchBtn.jump = false;
            if (catchTapped) dodgeOpenCatch(a);
            if (a.catchWindow > 0) a.catchWindow -= dt;

            // 跳跃：纯位移表达，不影响任何判定，但要吃 10 点体力——现在空格空出来了，
            // 键盘用空格，触屏借超燃的「跳」键位。
            let onGround = a.p.y <= 0.01;
            if ((keys[' '] || touchBtn.dodgeJump) && onGround && a.stamina >= DODGE.jumpCost) {
                a.vy = DODGE.jumpV * DAILY_MOD.jumpMul;
                a.stamina -= DODGE.jumpCost;
            }
            keys[' '] = false; touchBtn.dodgeJump = false;
            a.vy = (a.vy || 0) - DODGE.jumpGravity * dt;
            a.p.y += a.vy * dt;
            if (a.p.y < 0) { a.p.y = 0; a.vy = 0; }
        }

        // ── AI：没球就找本方半场里最近的 idle 球去捡；有球就找最近的敌人扔；
        //       敌方来球飞近了就转身面对（试着接住），不然就被动挨打。──
        function dodgeAi(a, dt) {
            a.aiT -= dt;
            if (a.aiT <= 0) a.aiT = 0.2 + Math.random() * 0.3;
            let threat = dodge.balls.find(function (b) {
                if (b.state !== 'flying' || b.thrownTeam === a.team) return false;
                let dx = a.p.x - b.p.x, dz = a.p.z - b.p.z, d = Math.hypot(dx, dz);
                if (d > 45) return false;
                let vl = Math.hypot(b.vel.x, b.vel.z) || 1;
                return (dx * b.vel.x + dz * b.vel.z) / (d * vl) > 0.4;   // 大致朝我飞来
            });
            let wx = 0, wz = 0;
            if (threat) {
                a.faceDir = { x: threat.p.x - a.p.x, z: threat.p.z - a.p.z };
                let n = Math.hypot(a.faceDir.x, a.faceDir.z) || 1; a.faceDir.x /= n; a.faceDir.z /= n;
                wx = (Math.random() < 0.5 ? 1 : -1) * 0.4;   // 顺便侧移一点，别死站着
                // AI 的「按空格」：第一次发现这颗威胁球时扔一次骰子，赌自己反应过来了没有；
                // 反应过来了就一直举着手到球飞到为止，反应不过来这一颗就等着挨打。
                if (!a.threatWasOn) a.reactionOk = !a.holding && Math.random() < 0.5;
                if (a.reactionOk) a.catchWindow = DODGE.catchWindow;
                a.threatWasOn = true;
            } else {
                a.threatWasOn = false;
            }
            if (a.catchWindow > 0) a.catchWindow -= dt;
            if (a.holding && a.mustReturn) {
                // 中线球欠着「先回家」的债，别的都先不管，直奔自家边线
                wz = a.team === 0 ? -1 : 1;
                a.faceDir = { x: 0, z: wz };
            } else if (a.holding) {
                // 本队活人（含自己）不到 3 个，别浪了——拼一把投篮，中了直接复活全队
                let aliveMates = dodge.actors.filter(function (o) { return o.team === a.team && !o.out; }).length;
                a.aimHoop = aliveMates < 3;
                if (a.aimHoop) {
                    let dx = DODGE.hoopPos.x - a.p.x, dz = DODGE.hoopPos.z - a.p.z, n = Math.hypot(dx, dz) || 1;
                    a.aimX = dx / n; a.aimZ = dz / n; a.aimDist = n;
                    if (!threat) a.faceDir = { x: a.aimX, z: a.aimZ };
                    if (!threat && Math.random() < dt * 0.6) dodgeTryThrow(a);
                    // 站近篮筐一点，仰角小、更容易进——跟正常追人扔球不是一回事，
                    // 死守着固定站位线没意义，篮筐就在中线上，越近越好投。
                    let idealZ = (a.team === 0 ? -1 : 1) * Math.min(DODGE.courtL * 0.5 - 20, 60);
                    wz = Math.max(-1, Math.min(1, (idealZ - a.p.z) * 0.1));
                } else {
                    // 手上有球就直奔最近的敌人——贴近了扔得更准，不再是死守一条固定站位线
                    let target = dodge.actors.filter(function (o) { return o.team !== a.team && !o.out; })
                        .sort(function (p, q) { return Math.hypot(p.p.x - a.p.x, p.p.z - a.p.z) - Math.hypot(q.p.x - a.p.x, q.p.z - a.p.z); })[0];
                    if (target) {
                        a.aimX = target.p.x - a.p.x; a.aimZ = target.p.z - a.p.z;
                        let n = Math.hypot(a.aimX, a.aimZ) || 1; a.aimX /= n; a.aimZ /= n; a.aimDist = n;
                        if (!threat) { a.faceDir = { x: a.aimX, z: a.aimZ }; wx = a.aimX; wz = a.aimZ; }
                        if (!threat && Math.random() < dt * 0.45) dodgeTryThrow(a);
                    }
                }
            } else {
                // 没球：优先去捡地上的球（先保证自己有得打）——但不能大家都去抢离自己
                // 最近的那颗，不然一堆人挤在同一颗球上，别的球没人理。谁先看中一颗就
                // 占着（claimedBy），别人挑剩下的；占太久没捡到手（3秒）当放弃，可以抢。
                let candidates = dodge.balls.filter(function (b) {
                    if (b.state !== 'idle' || dodgeHome(b.p) !== a.team) return false;
                    return !b.claimedBy || b.claimedBy === a || b.claimedBy.out || b.claimedBy.holding || (b.claimAge || 0) > 3;
                });
                let ball = candidates.sort(function (p, q) { return Math.hypot(p.p.x - a.p.x, p.p.z - a.p.z) - Math.hypot(q.p.x - a.p.x, q.p.z - a.p.z); })[0];
                if (ball) {
                    if (a.ballTarget && a.ballTarget !== ball) a.ballTarget.claimedBy = null;
                    if (ball.claimedBy !== a) {
                        ball.claimedBy = a; ball.claimAge = 0; a.ballTarget = ball;
                        if (a.team === dodge.me.team) aiSay(a, a.name, 'claim', DODGE_LINES.claim);
                    } else {
                        ball.claimAge = (ball.claimAge || 0) + dt;
                    }
                    let dx = ball.p.x - a.p.x, dz = ball.p.z - a.p.z, n = Math.hypot(dx, dz) || 1;
                    wx = dx / n; wz = dz / n;
                    if (!threat) a.faceDir = { x: wx, z: wz };
                } else {
                    if (a.ballTarget) { a.ballTarget.claimedBy = null; a.ballTarget = null; }
                    // 本方地盘没球可捡了，才去堵有球的敌人，凑近了更容易蹭进「威胁球」的
                    // 反应判定范围，争取接到球。
                    let holder = dodge.actors.find(function (o) { return o.team !== a.team && !o.out && o.holding; });
                    if (holder) {
                        let dx = holder.p.x - a.p.x, dz = holder.p.z - a.p.z, n = Math.hypot(dx, dz) || 1;
                        wx = dx / n; wz = dz / n;
                        if (!threat) a.faceDir = { x: wx, z: wz };
                    }
                }
            }
            let sp = blazeSpeed(a);
            a.p.x += wx * sp * dt; a.p.z += wz * sp * dt;
            dodgeClampCourt(a);
            if (!a.faceDir) a.faceDir = { x: 0, z: a.team === 0 ? 1 : -1 };
        }

        // 观战：淘汰后不再让自己举着相机杵在场边看，改成跟寻宝队/惊魂夜一样——
        // 跟拍一个还活着的队友（第三人称，看得见他的身体），◀▶ 切人，复活了自动收起。
        function dodgeSpectateTargets() {
            let me = dodge.me;
            return dodge.actors.filter(function (a) { return a.team === me.team && a !== me && !a.out; });
        }
        function dodgeEnterSpectate(reason) {
            if (dodge.spectating) return;
            dodge.spectating = true; dodge.spectateIdx = 0;
            let bar = document.getElementById('dodge-spectate-bar'); if (bar) bar.style.display = 'flex';
            if (document.pointerLockElement) document.exitPointerLock();
            if (reason) blazeFlash(reason);
            dodgeApplySpectate();
        }
        function dodgeCycleSpectate(dir) {
            if (!dodge || !dodge.spectating) return;
            let list = dodgeSpectateTargets(); if (list.length === 0) return;
            dodge.spectateIdx = ((dodge.spectateIdx + dir) % list.length + list.length) % list.length;
            dodgeApplySpectate();
        }
        function dodgeApplySpectate() {
            let list = dodgeSpectateTargets();
            let label = document.getElementById('dodge-spectate-target');
            if (list.length === 0) { if (label) label.innerText = '无人可观战'; return; }
            if (dodge.spectateIdx >= list.length) dodge.spectateIdx = 0;
            if (label) label.innerText = dispName(list[dodge.spectateIdx].name);
        }
        function dodgeLeaveSpectate() {
            if (!dodge) return;
            dodge.spectating = false;
            let bar = document.getElementById('dodge-spectate-bar'); if (bar) bar.style.display = 'none';
        }

        function dodgeCameraPos(me) {
            let dir = chaseCamDir();
            let ay = me.p.y + DODGE.camUp;
            // 镜头不能退到场地围墙外面：开局大家都站在自己那一侧的底线上，镜头往后退 26 格
            // 正好跑到底墙后面，屏幕下半截全是灰墙、自己的角色被整个挡住。按视线方向把镜头往前收，
            // 收到墙里面为止。
            let back = DODGE.camBack, m = 4;
            let hx = DODGE.courtW / 2 - m, hz = DODGE.courtL / 2 - m;
            let inside = Math.abs(me.p.x) <= hx && Math.abs(me.p.z) <= hz;   // 出局站在场外的不管
            if (!inside) return { x: me.p.x - dir.x * back, y: ay - dir.y * back, z: me.p.z - dir.z * back };
            if (dir.x > 1e-4) back = Math.min(back, (me.p.x + hx) / dir.x);
            else if (dir.x < -1e-4) back = Math.min(back, (me.p.x - hx) / dir.x);
            if (dir.z > 1e-4) back = Math.min(back, (me.p.z + hz) / dir.z);
            else if (dir.z < -1e-4) back = Math.min(back, (me.p.z - hz) / dir.z);
            back = Math.max(6, back);
            return { x: me.p.x - dir.x * back, y: ay - dir.y * back, z: me.p.z - dir.z * back };
        }

        // 瞄准辅助：按住左键（还没松手）那段时间，模拟当前视角丢出去的抛物线——
        // 落点画一个圈（正中篮筐会变绿），弹道本身画一条跟着视角走的虚线，
        // 松手前就能看清这一投到底往哪儿飞。经典/疯狂都有，不再是疯狂模式专属。
        function dodgeAimAssistTick() {
            if (!dodge.reticle || !dodge.aimLine) return;
            let me = dodge.me;
            if (me.out || !me.holding || !me.aiming) { dodge.reticle.visible = false; dodge.aimLine.visible = false; return; }
            let dir = dodgePlayerAimDir(me);
            let p = new THREE.Vector3(me.p.x, me.p.y + 8, me.p.z);
            let v = new THREE.Vector3(dir.x * DODGE.ballSpeed, dir.y * DODGE.ballSpeed, dir.z * DODGE.ballSpeed);
            let pts = [p.clone()];
            let dt2 = 0.05, hitHoop = false;
            for (let i = 0; i < 200; i++) {
                v.y -= DODGE.gravity * dt2;
                p.x += v.x * dt2; p.y += v.y * dt2; p.z += v.z * dt2;
                pts.push(p.clone());
                if (Math.hypot(p.x - DODGE.hoopPos.x, p.y - DODGE.hoopPos.y, p.z - DODGE.hoopPos.z) < DODGE.hoopR) { hitHoop = true; break; }
                if (p.y <= 0) break;
                if (Math.abs(p.x) > DODGE.courtW / 2 || Math.abs(p.z) > DODGE.courtL / 2) break;
            }
            dodge.reticle.visible = true;
            dodge.reticle.position.set(p.x, 0.4, p.z);
            dodge.reticle.material.color.setHex(hitHoop ? 0x1b5e20 : 0xe65100);   // 深色，不要浅色
            dodge.aimLine.visible = true;
            dodge.aimLine.geometry.setFromPoints(pts);
            dodge.aimLine.material.color.setHex(hitHoop ? 0x1b5e20 : 0x000000);
        }

        function dodgeHud() {
            let me = dodge.me;
            let a0 = dodge.actors.filter(function (a) { return a.team === 0 && !a.out; }).length;
            let a1 = dodge.actors.filter(function (a) { return a.team === 1 && !a.out; }).length;
            let remain = Math.max(0, DODGE.matchTime - dodge.clock);
            document.getElementById('blaze-score').innerText = a0 + ' : ' + a1 + '　' + Math.ceil(remain) + 's';
            document.getElementById('blaze-round').innerText =
                (dodge.crazy ? '躲避球·疯狂　' : (DODGE.teamSize === 5 ? '躲避球·5v5　' : '躲避球·经典　')) +
                '我方存活 ' + (me.team === 0 ? a0 : a1) + '　对面存活 ' + (me.team === 0 ? a1 : a0) +
                (me.out ? '　你出局了'
                    : me.holding ? ('　手里：' + dodgeKindName(me.holding.kind) + (me.mustReturn ? '（中线球）' : '')) : '');
            if (me.holding) introOnce('dodge.hold', '拿到球了', kTxt('按住 <b>左键</b> 瞄准，松手扔出去。点一下 <b>左键</b> 放下。', '按住 <b>投</b> 瞄准，松手扔出去。点一下 <b>投</b> 放下。'));
            if (me.holding && me.mustReturn) introOnce('dodge.center', '中线球', '中线上捡的球，要先跑回自己底线才能扔。');
            if (me.out) introOnce('dodge.out', '出局了', '队友接住球、或者把球投进中间的篮筐，就能把你救回来。');
            document.getElementById('blaze-roster').innerHTML = '';
            let pct = Math.max(0, me.stamina / DODGE.staminaMax * 100);
            let bar = document.getElementById('blaze-hpbar');
            bar.style.width = pct + '%'; bar.style.background = pct < 34 ? '#e57373' : '#66bb6a';
            document.getElementById('blaze-hptxt').innerText = '体力 ' + Math.round(me.stamina) + ' / ' + DODGE.staminaMax;
        }

        function dodgeEndMatch(winTeam) {
            if (!dodge || dodge.over) return;
            dodge.over = true;
            let me = dodge.me;
            let title, text = '';
            if (winTeam === null) { title = '平局'; text = '时间到，双方存活人数一样多。'; }
            else title = (winTeam === me.team) ? '你的队伍获胜' : '你的队伍输了';
            // 结算原来只有一行标题，别的模式都有比分/用时，这里补上
            let alive = function (t) { return dodge.actors.filter(function (a) { return a.team === t && !a.out; }).length; };
            let secs = Math.round(Math.min(dodge.clock, DODGE.matchTime));
            text += (text ? '<br>' : '') + '存活：我方 ' + alive(me.team) + ' 人 · 对面 ' + alive(1 - me.team) + ' 人　用时 ' +
                Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
            coinsSettle('dodge', winTeam === me.team); text += coinsLine();
            showSysModal(title, text, [{ label: '返回大厅', color: '#5cb85c', onClick: function () { dodgeExit(); } }]);
        }

        function dodgeTick(dt) {
            dodge.clock += dt;
            dodge.actors.forEach(function (a) { if (a.throwCd > 0) a.throwCd -= dt; });
            // 摸到自己家墙根就解禁——中线球捡到手那阵子欠的「先回家」债，还完了
            dodge.actors.forEach(function (a) {
                if (!a.mustReturn || a.out) return;
                let wallZ = a.team === 0 ? -DODGE.courtL / 2 : DODGE.courtL / 2;
                if (Math.abs(a.p.z - wallZ) < 8) {
                    a.mustReturn = false;
                    if (a.isPlayer) blazeFlash('到线了，可以出手了！');
                }
            });
            let amHost = !dodge.hostId || dodge.hostId === gState.id;
            dodge.actors.forEach(function (a) {
                if (a.out) return;
                if (a.isPlayer) dodgePlayerMove(a, dt);
                else if (!a.netId && amHost) dodgeAi(a, dt);
                // 联机的真人队友（netId 有值）跟非房主这边的 AI：位置全靠 DODGE_ME/DODGE_W
                // 网络同步过来，这里不本地再跑一遍逻辑。
            });
            if (amHost) dodgePickupTick();   // AI 的捡球是自动行为，不管哪队都归房主拍板
            if (amHost) dodgeBallTick(dt);   // 球的飞行/命中判定全归房主——跟世界状态一个道理
            if (amHost) dodgeDropTick(dt);   // 疯狂模式空投球，也是房主一个人生成，不然两边各生成一遍就重复了
            dodgeSeparate();
            dodgeFxTick(dt);
            dodgeArcTick(dt);
            dodgeAimAssistTick();
            if (dodge.netOn) dodgeNetTick(dt);
            dodge.actors.forEach(function (a) {
                a.mesh.position.set(a.p.x, a.p.y, a.p.z);
                a.mesh.visible = !a.out;
                if (a.faceDir) a.mesh.rotation.y = Math.atan2(a.faceDir.x, a.faceDir.z);
                let sp = Math.hypot(a.mvx || 0, a.mvz || 0);
                a.animT = (a.animT || 0) + dt * (2 + Math.min(1, sp / BLAZE.speed) * 16);
                let u = a.mesh.userData, run = Math.min(1, sp / BLAZE.speed);
                if (u.legs) { u.legs[0].rotation.x = Math.sin(a.animT) * 0.9 * run; u.legs[1].rotation.x = -Math.sin(a.animT) * 0.9 * run; }
                if (u.arms) {
                    if (a.gestureT > 0) {
                        a.gestureT -= dt;
                        bodyGesture(u, a.gestureKind, Math.max(0, a.gestureT) / 0.3);
                    } else if (a.catchWindow > 0) {
                        // 举着手等球——空格按下去那一下开的窗口，只要还开着手就一直举着
                        u.arms[0].rotation.x = -1.9; u.arms[1].rotation.x = -1.9;
                    } else if (a.holding) {
                        // 手上有球，双臂端着抱在胸前，不跟着跑步甩
                        u.arms[0].rotation.x = -1.3; u.arms[1].rotation.x = -1.3;
                    } else {
                        u.arms[0].rotation.x = -Math.sin(a.animT) * 0.7 * run;
                        u.arms[1].rotation.x = Math.sin(a.animT) * 0.7 * run;
                    }
                }
                if (u.ring) u.ring.material.color.setHex(a.holding ? 0xffee58 : a.col);
            });
            dodge.balls.forEach(function (b) {
                if (b.state === 'held' && b.holder) {
                    let h = b.holder, fd = h.faceDir || { x: 0, z: 1 };
                    b.mesh.position.set(h.p.x + fd.x * 10, h.p.y + 8, h.p.z + fd.z * 10);
                } else {
                    b.mesh.position.set(b.p.x, b.p.y, b.p.z);
                }
            });
            if (dodge.spectating) {
                // 第三人称跟拍，跟自己打球时同一个机位公式——这样能看见正在观战的
                // 那个人（不是钻进他脑子里的第一人称），镜头也贴在他脚跟后面而不是悬空。
                let list = dodgeSpectateTargets();
                if (list.length > 0) {
                    if (dodge.spectateIdx >= list.length) dodge.spectateIdx = 0;
                    let t = list[dodge.spectateIdx];
                    let camPos = dodgeCameraPos(t);
                    camera.position.set(camPos.x, camPos.y, camPos.z);
                }
            } else {
                let me = dodge.me;
                let camPos = dodgeCameraPos(me);
                camera.position.set(camPos.x, camPos.y, camPos.z);
            }
            if (!dodge.over && dodge.clock >= DODGE.matchTime) {
                let a0 = dodge.actors.filter(function (a) { return a.team === 0 && !a.out; }).length;
                let a1 = dodge.actors.filter(function (a) { return a.team === 1 && !a.out; }).length;
                if (a0 === a1) dodgeEndMatch(null); else dodgeEndMatch(a0 > a1 ? 0 : 1);
            }
            dodgeHud();
            renderer.render(scene, camera);
        }

        function dodgeLoop() {
            if (!dodge) return;
            let now = performance.now();
            let dt = Math.min(0.05, (now - dodge.last) / 1000);
            dodge.last = now;
            if (!dodge.over) dodgeTick(dt);
            dodge.raf = requestAnimationFrame(dodgeLoop);
        }

        function dodgeTouchUI(on) {
            ['blaze-skill1-btn', 'blaze-skill2-btn', 'blaze-card-btn',
                'race-dash-btn', 'race-skill-btn', 'race-item-btn'].forEach(function (id) {
                    let e = document.getElementById(id); if (e) e.style.display = 'none';
                });
            let pad = (gState.control === 'pad');
            let atk = document.getElementById('blaze-atk-btn');
            // 「投」这颗键身兼捡/放/瞄准投掷三件事（点一下捡/放，按住瞄准松手丢）；
            // 「接」借竞速的「跳」键位专门张手接球；跑步开关借寻宝队的「跑/走」键；
            // 跳跃另外借超燃的「跳」键位——都是平板才需要
            // 借来的键退出时要把字改回去：之前一直留着「投」「接」，玩过躲避球之后
            // 超燃的普攻键写着「投」，竞速/松饼/密室的跳键写着「接」
            if (atk) { atk.innerText = on ? '投' : '普攻'; atk.style.display = (on && pad) ? 'flex' : 'none'; }
            let jb = document.getElementById('race-jump-btn');
            // 「接」原来跟「投」是同一个位置（bottom:100 right:20），接叠在上面，平板上根本点不到「投」
            if (jb) { jb.innerText = on ? '接' : '跳'; jb.style.right = on ? '120px' : '20px'; jb.style.display = (on && pad) ? 'flex' : 'none'; }
            let jump = document.getElementById('blaze-jump-btn');
            if (jump) { jump.innerText = '跳'; jump.style.display = (on && pad) ? 'flex' : 'none'; }
            let rb = document.getElementById('run-btn');
            if (rb) rb.style.display = (on && pad) ? '' : 'none';
            let stats = document.getElementById('blaze-stats-btn'); if (stats) stats.style.display = 'none';
            let skillbar = document.getElementById('blaze-skillbar'); if (skillbar) skillbar.innerHTML = '';
            let skillTxt = document.getElementById('blaze-skill'); if (skillTxt) skillTxt.innerText = '';
            document.getElementById('blaze-bottom').style.display = on ? '' : 'none';
            let cross = document.getElementById('blaze-crosshair-anchor');
            if (cross && cross.previousElementSibling) cross.previousElementSibling.style.display = on ? 'none' : '';
            let ex = document.getElementById('blaze-exit-btn');
            if (ex) ex.onclick = on ? dodgeExit : blazeExit;
            ['blaze-stats', 'blaze-perk', 'blaze-ffa-cards'].forEach(function (id) {
                let e = document.getElementById(id); if (e && on) e.classList.add('hidden');
            });
        }

        // 20 个位置：0~9 队伍0，10~19 队伍1。真人一律坐队伍0（跟组队的人是队友），
        // 队伍1 从头到尾是 AI——跟监狱救援一个思路。
        function dodgePlan(humans) {
            let plan = [];
            for (let i = 0; i < DODGE.teamSize * 2; i++) plan.push({ idx: i, team: i < DODGE.teamSize ? 0 : 1, id: null });
            humans.slice(0, DODGE.teamSize).forEach(function (h, i) { plan[i].id = h.id; });
            return plan;
        }
        function dodgeBegin(crazy, plan, hostId) {
            plan = plan || dodgePlan([{ id: gState.id }]);
            hostId = hostId || gState.id;
            showModeIntroIfFirstTime('dodge');
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.add('hidden');
            document.getElementById('blaze-hud').classList.remove('hidden');
            let pe = document.getElementById('blaze-perk'); if (pe) pe.classList.add('hidden');
            if (blaze) { try { blazeExit(); } catch (e) { } }
            if (race) { try { raceExit(); } catch (e) { } }
            if (jail) { try { jailExit(); } catch (e) { } }
            ensureScene();
            scene.background = new THREE.Color(0x8fd3f4);
            scene.fog = new THREE.FogExp2(0x8fd3f4, 0.0009);

            let netOn = plan.filter(function (q) { return q.id; }).length > 1;
            dodge = {
                over: false, crazy: !!crazy, clock: 0, actors: [], balls: [], fx: [], meshes: [], arcs: [],
                benchCount: [0, 0], spectating: false, spectateIdx: 0, hostId: hostId, netOn: netOn,
                dropT: DODGE.dropEvery, last: performance.now(), raf: null
            };
            let dsb = document.getElementById('dodge-spectate-bar'); if (dsb) dsb.style.display = 'none';
            dodgeBuildCourt();

            let n = DODGE.teamSize;
            [0, 1].forEach(function (t) {
                let col = t === 0 ? 0x42a5f5 : 0xef5350;
                let zEdge = (t === 0 ? -1 : 1) * (DODGE.courtL / 2 - 12);
                for (let i = 0; i < n; i++) {
                    let slot = plan[dodge.actors.length];
                    let isP = slot.id === gState.id;
                    let mesh = raceMakeBody(col, DODGE.pickupRange, false, isP ? gState.acc : (slot.id ? peerAccOf(slot.id) : aiRandomAcc()), isP ? myFace() : (slot.id ? peerFaceOf(slot.id) : aiRandomFace()));
                    scene.add(mesh);
                    let x = (i - (n - 1) / 2) * (DODGE.courtW / (n + 1));
                    let a = {
                        idx: dodge.actors.length, team: t, isPlayer: isP, netId: slot.id || null, col: col,
                        name: slot.id ? (dispName(slot.id) || '你') : ('队员' + (dodge.actors.length + 1)),
                        p: new THREE.Vector3(x, 0, zEdge), home: { x: x, z: zEdge },
                        mvx: 0, mvz: 0, vy: 0, out: false, holding: null, throwCd: 0,
                        stamina: DODGE.staminaMax, aiT: Math.random() * 0.3, animT: 0,
                        catchWindow: 0, reactionOk: false, threatWasOn: false, mustReturn: false, aiming: false, aimHoop: false, ballTarget: null,
                        gestureT: 0, gestureKind: null,
                        faceDir: { x: 0, z: t === 0 ? 1 : -1 },
                        mesh: mesh
                    };
                    dodge.actors.push(a);
                }
            });
            dodge.me = dodge.actors.filter(function (a) { return a.isPlayer; })[0] || dodge.actors[0];

            // 中线上摆一排球：人多了、场地也大了，球跟着翻倍。经典 12 个普通球；
            // 疯狂再加复活球/秒杀球各 2 个，之后还会持续空投。
            // 球不能摆在正好 z=0 这条线上——dodgeHome 用的是严格小于，z=0 会被
            // 判成「归队伍1」，等于中线上所有球队伍0 的 AI 一颗都捡不到，
            // 队伍1 通吃全部初始球，开局就是单方面吊打。左右稍微错开各归一半。
            let ballCount = crazy ? 10 : 12;
            for (let i = 0; i < ballCount; i++) {
                let x = (i - (ballCount - 1) / 2) * (DODGE.courtW / (ballCount + 1));
                let z = (i % 2 === 0) ? -3 : 3;
                // 开局中线球标一下：谁第一个捡到，得先跑回本方边线才能出手，
                // 不然两队一开局就在中线正面对撞点名，场地铺再大也没用。
                dodgeSpawnBall('normal', x, 3.5, z).centerBall = true;
            }
            if (crazy) {
                dodgeSpawnBall('revival', -DODGE.courtW / 4, 3.5, -3).centerBall = true;
                dodgeSpawnBall('revival', -DODGE.courtW / 6, 3.5, 3).centerBall = true;
                dodgeSpawnBall('kill', DODGE.courtW / 4, 3.5, -3).centerBall = true;
                dodgeSpawnBall('kill', DODGE.courtW / 6, 3.5, 3).centerBall = true;
            }
            // 瞄准辅助：按住左键（或触屏「投」键）没松手那段时间显示——落点环 + 一条跟着
            // 视角走的弹道虚线，两个模式都要，不再只在疯狂模式才有。
            dodge.reticle = new THREE.Mesh(new THREE.RingGeometry(3, 4.2, 20),
                new THREE.MeshBasicMaterial({ color: 0xe65100, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
            dodge.reticle.rotation.x = -Math.PI / 2; dodge.reticle.visible = false;
            scene.add(dodge.reticle); dodge.meshes.push(dodge.reticle);
            dodge.aimLine = new THREE.Line(new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, fog: false }));
            dodge.aimLine.visible = false;
            scene.add(dodge.aimLine); dodge.meshes.push(dodge.aimLine);

            camera.rotation.set(0, Math.PI, 0);   // 默认朝向是 -Z，队伍0 要朝 +Z（对面）看，得转 180°——
                                                    // 之前忘转，开局是背对球场看自家外墙

            // 左键改成按住瞄准、松手才真的丢出去——按下去只是开始瞄，辅助线跟着视角摆，
            // 左键身兼三件事，靠「点一下」还是「按住不放」区分：手空时点一下＝捡球，
            // 拿着球时点一下＝放下，拿着球按住不放（够一个点击门槛）再松手＝瞄准着丢出去。
            // 右键专门接球——张手等一个短暂的接球窗口。
            document.body.onmousedown = function (e) {
                if (!dodge || dodge.over) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal'))) return;
                if (!document.pointerLockElement) { safeLockPointer(); return; }
                let me = dodge.me;
                if (e.button === 0 && !me.out) { me.aiming = true; me.aimDownAt = performance.now(); }
                else if (e.button === 2) dodgeOpenCatch(me);
            };
            document.body.onmouseup = function (e) {
                if (!dodge || dodge.over) return;
                let me = dodge.me;
                if (e.button === 0 && me.aiming) {
                    me.aiming = false;
                    let quick = performance.now() - (me.aimDownAt || 0) < 220;
                    if (quick) { if (me.holding) dodgeDoDrop(me.idx); else dodgePickupNearby(me); }
                    else if (me.holding) dodgeTryThrow(me);
                }
            };
            dodgeTouchUI(true);
            bgmStart();
            dodgeLoop();
        }

        function dodgeExit() {
            if (!dodge) return;
            dodge.over = true;
            if (dodge.raf) cancelAnimationFrame(dodge.raf);
            if (document.pointerLockElement) document.exitPointerLock();
            (dodge.fx || []).forEach(function (f) { scene.remove(f.o); });
            (dodge.arcs || []).forEach(function (f) { scene.remove(f.line); });
            (dodge.meshes || []).forEach(function (m) { scene.remove(m); });
            (dodge.balls || []).forEach(function (b) { scene.remove(b.mesh); });
            dodge.actors.forEach(function (a) { scene.remove(a.mesh); });
            dodge = null;
            dodgeTouchUI(false);
            let dsb = document.getElementById('dodge-spectate-bar'); if (dsb) dsb.style.display = 'none';
            bgmStop();
            document.body.onmousedown = null;
            document.getElementById('blaze-hud').classList.add('hidden');
            let bd = document.getElementById('blaze-ffa-board'); if (bd) { bd.classList.add('hidden'); bd.style.left = ''; bd.style.right = '12px'; bd.style.width = '190px'; bd.style.top = '44px'; }
            nav('screen-lobby'); selectGameMode('dodge');
        }

        // 组了队直接带队友进（全部坐队伍0，队伍1 从头到尾是 AI）；没组队先等最多
        // 15 秒看房间里有没有人也想玩，凑不到就照旧配 AI——跟其它几个模式是同一套。
        // 5v5 快速局：场地短一截、2 分半。开局前把 DODGE 里这几项换掉，联机开局消息里带上 quick。
        const DODGE_SIZES = { full: { teamSize: 10, courtL: 960, matchTime: 240 }, quick: { teamSize: 5, courtL: 560, matchTime: 150 } };
        function dodgeApplySize(quick) { let z = DODGE_SIZES[quick ? 'quick' : 'full']; Object.keys(z).forEach(function (k) { DODGE[k] = z[k]; }); }
        function dodgeStartGo(crazy, quick) {
            dodgeApplySize(quick);
            if (lobbyParty.length > 0) {
                let ids = [gState.id].concat(lobbyParty.slice(0, DODGE.teamSize - 1));
                let plan = dodgePlan(ids.map(function (id) { return { id: id }; }));
                if (ids.length > 1) bc.postMessage({ type: 'DODGE_START', target: '*', sender: gState.id, crazy: !!crazy, quick: !!quick, plan: plan, host: gState.id });
                dodgeBegin(crazy, plan, gState.id);
                return;
            }
            mmStart('dodge', DODGE.teamSize, function (ids) {
                let plan = dodgePlan(ids.map(function (id) { return { id: id }; }));
                if (ids.length > 1) bc.postMessage({ type: 'DODGE_START', target: '*', sender: gState.id, crazy: !!crazy, quick: !!quick, plan: plan, host: gState.id });
                dodgeApplySize(quick);   // 等匹配的 15 秒里可能被别的开局改过
                dodgeBegin(crazy, plan, gState.id);
            });
        }
        function dodgeOnStart(m) {
            if (!m.plan || !m.plan.some(function (q) { return q.id === gState.id; })) return;
            if (!netStartAllowed('dodge', m)) return;
            mmCancel();
            if (dodge) { if (dodge.raf) cancelAnimationFrame(dodge.raf); dodge = null; }
            dodgeApplySize(m.quick);
            dodgeBegin(m.crazy, m.plan, m.host);
        }
        const DODGE_ME_HZ = 15, DODGE_W_HZ = 12;
        function dodgeNetTick(dt) {
            dodge._meT = (dodge._meT || 0) + dt;
            if (dodge._meT >= 1 / DODGE_ME_HZ) {
                dodge._meT = 0;
                let me = dodge.me;
                bc.postMessage({
                    type: 'DODGE_ME', target: '*', sender: gState.id,
                    x: me.p.x, z: me.p.z, yaw: me.mesh.rotation.y,
                    catchWindow: me.catchWindow, holding: me.holding ? me.holding.idx : -1,
                    out: me.out, mustReturn: me.mustReturn
                });
            }
            if (dodge.hostId !== gState.id) return;
            dodge._wT = (dodge._wT || 0) + dt;
            if (dodge._wT < 1 / DODGE_W_HZ) return;
            dodge._wT = 0;
            let ai = dodge.actors.filter(function (a) { return !a.netId; }).map(function (a) {
                return {
                    i: a.idx, x: a.p.x, z: a.p.z, yaw: a.mesh.rotation.y,
                    catchWindow: a.catchWindow, holding: a.holding ? a.holding.idx : -1,
                    out: a.out, mustReturn: a.mustReturn
                };
            });
            // 球（不管谁扔的）全归房主算物理，这里把所有球的状态一起广播出去——
            // 飞行中的位置、被谁拿着、是哪种球，跟超燃的 AI 世界状态走的是同一条路。
            let balls = dodge.balls.map(function (b) {
                return { i: b.idx, x: b.p.x, y: b.p.y, z: b.p.z, state: b.state, kind: b.kind, holder: b.holder ? b.holder.idx : -1 };
            });
            bc.postMessage({ type: 'DODGE_W', target: '*', sender: gState.id, ai: ai, balls: balls });
        }
        function dodgeOnMe(m) {
            if (!dodge || m.sender === gState.id) return;
            let a = dodge.actors.filter(function (o) { return o.netId === m.sender; })[0];
            if (!a) return;
            // 走路动画看的是 mvx/mvz（见下面 tick 里的 sp），网络位置之前只有 a.p 被
            // 更新，联机队友的腿一直是静止的——跟竞速联机对手同一个坑（raceTickRacer
            // 里"合成速度"那段），按收包间隔把这次位移换算成速度。
            a.mvx = (m.x - a.p.x) * DODGE_ME_HZ; a.mvz = (m.z - a.p.z) * DODGE_ME_HZ;
            a.p.x = m.x; a.p.z = m.z; a.mesh.rotation.y = m.yaw;
            a.catchWindow = m.catchWindow; a.mustReturn = m.mustReturn;
            a.holding = (m.holding >= 0) ? dodge.balls[m.holding] : null;
            a.out = m.out;
        }
        // 非房主这边：AI 的位置/接球窗口/淘汰状态，跟所有球的状态，直接套用房主广播的——
        // 淘汰/接住/复活这些已经靠事件同步过一遍了，这里只是多一层保险，
        // 万一哪次事件没接上，下一条世界状态广播也能把状态掰回来。
        // 疯狂模式房主会陆续空投新球，其它人本地压根没有这颗球，先补一个再套状态。
        function dodgeOnW(m) {
            if (!dodge || m.sender === gState.id || dodge.hostId !== m.sender) return;
            (m.ai || []).forEach(function (q) {
                let a = dodge.actors[q.i];
                if (!a || a.isPlayer || a.netId) return;
                a.mvx = (q.x - a.p.x) * DODGE_W_HZ; a.mvz = (q.z - a.p.z) * DODGE_W_HZ;
                a.p.x = q.x; a.p.z = q.z; a.mesh.rotation.y = q.yaw;
                a.catchWindow = q.catchWindow; a.mustReturn = q.mustReturn;
                a.holding = (q.holding >= 0) ? dodge.balls[q.holding] : null;
                a.out = q.out;
            });
            (m.balls || []).forEach(function (q) {
                let b = dodge.balls[q.i];
                if (!b) b = dodgeSpawnBall(q.kind, q.x, q.y, q.z);
                b.p.x = q.x; b.p.y = q.y; b.p.z = q.z;
                b.state = q.state; b.kind = q.kind;
                b.holder = (q.holder >= 0) ? dodge.actors[q.holder] : null;
            });
        }
        function dodgeOnEv(m) {
            if (!dodge) return;
            if (m.ev === 'throwReq') {
                // 别人求着房主帮忙让球飞起来——只有房主处理这条，别的旁观者不用管
                let amHost = !dodge.hostId || dodge.hostId === gState.id;
                if (amHost && m.sender !== gState.id) dodgeApplyThrow(m.a, m.b, m.dir);
                return;
            }
            if (m.sender === gState.id) return;
            if (m.ev === 'pickup') dodgeApplyPickup(m.a, m.b);
            else if (m.ev === 'drop') dodgeApplyDrop(m.a);
            else if (m.ev === 'eliminate') dodgeApplyEliminate(m.a, m.by);
            else if (m.ev === 'catch') dodgeApplyCatch(m.a, m.b);
            else if (m.ev === 'reviveN') dodgeApplyReviveN(m.team);
            else if (m.ev === 'reviveAll') dodgeApplyReviveAll(m.team);
        }

