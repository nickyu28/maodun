        // ══════════════════════════════════════════════════════════
        //  《监狱救援》· 两队对称地盘的抓人游戏
        //  地图整个借乱斗的「乱斗·单排」开阔场地生成（blazeBuildArena(true,...)）——
        //  那张图本来就是中心对称的，天然适合切成两块对等地盘，不用再画一张新图。
        //  地盘归属按对角线分：gx+gz 小的一半是队伍0的家，大的一半是队伍1的家。
        //  没有任何技能/道具/战斗，只有移动 —— 「手」是个固定范围，敌人在你地盘
        //  又在你手范围内，直接送进监狱，不需要按键。
        // ══════════════════════════════════════════════════════════
        // 体力换来的加速：以前是「体力 > 0 就是满速 1.6x，见底那一帧直接腰斩回 1x」，
        // 很突兀。改成体力越少衰减越狠，但只在快耗尽的最后一截才明显掉速——
        // 100 掉到 99 感觉不出差别，1 掉到 0 那味儿几乎跟没加速一样。
        function staminaBoostMul(stamina, boost) {
            let taper = Math.min(1, Math.max(0, stamina) / 20);
            return 1 + (boost - 1) * taper * taper;
        }
        const JAIL = {
            teamSize: 5,          // 5v5，一共 10 人
            matchTime: 240,       // 4 分钟，时间到比谁的物品多
            handRange: 8,         // 手的判定范围（抓人）
            rescueRange: 14,      // 摸到监狱多近才算救援
            freeInvulT: 4,        // 被救出来之后的无敌时间，够跑回自己地盘
            dangerRadius: 45,     // AI 判断「附近有威胁，该跑了」的范围
            camBack: 30, camUp: 20,  // 第三人称：镜头吊在身后偏上方
            itemsPerTeam: 5,      // 每队 5 件物品，一共 10 件
            itemRange: 9,         // 摸到对方物品多近就能捡起来
            jumpV: 44, gravity: 150,           // 跳跃免费，纯移动表达，不影响抓人判定，不吃体力
            staminaMax: 100, runSpeedMul: 1.6, runDrain: 28, runRegen: 16,   // 体力用来跑，跟寻宝队一模一样的数值
            aiVision: 70          // AI 的视野半径——看不到的敌人压根不存在，不是全图索敌
        };

        // 地盘归属：对角线一分为二，跟乱斗地图的中心对称完全贴合
        function jailHome(p) {
            return ((p.x / TILE) + (p.z / TILE)) < (mSize - 1) ? 0 : 1;
        }

        // 从 (cx,cz) 往外一圈圈找空地，用来摆监狱标记 / 出生点
        function jailOpenCellsNear(cx, cz, n) {
            let pts = [], seen = {};
            for (let r = 0; r < 14 && pts.length < n; r++) {
                for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    let x = cx + dx, z = cz + dz;
                    if (x < 1 || z < 1 || x >= mSize - 1 || z >= mSize - 1) continue;
                    let k = x + ',' + z; if (seen[k]) continue; seen[k] = 1;
                    let c = maze[0] && maze[0][z] && maze[0][z][x];
                    if (c && c.type === 0) { pts.push({ x: x, z: z }); if (pts.length >= n) break; }
                }
            }
            while (pts.length < n) pts.push({ x: cx, z: cz });
            return pts;
        }

        function jailMakeMarker(gx, gz, color) {
            let g = new THREE.Group();
            let cage = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 20, 10, 1, true),
                new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, wireframe: true }));
            cage.position.y = 10; g.add(cage);
            let base = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 1, 20),
                new THREE.MeshLambertMaterial({ color: color, emissive: color }));
            base.position.y = 0.5; g.add(base);
            g.position.set(gx * TILE, 0, gz * TILE);
            scene.add(g);
            return g;
        }

        // 物品：一颗立在小底座上的宝石，颜色跟着「现在归哪队」变，
        // 底座本身不换色（中立的台子），只有宝石染成物主的队伍色。
        function jailItemMesh(color) {
            let g = new THREE.Group();
            let gemMat = new THREE.MeshLambertMaterial({ color: color, emissive: color });
            let gem = new THREE.Mesh(new THREE.OctahedronGeometry(4, 0), gemMat);
            gem.position.y = 6; g.add(gem);
            let base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 1.4, 12),
                new THREE.MeshLambertMaterial({ color: 0x4a4a4a }));
            base.position.y = 0.7; g.add(base);
            g.userData.gem = gem;
            return g;
        }

        // 物品被抢：换主人、挪到新主人家门口、重新染色
        function jailRelocateItem(it, newTeam) {
            it.team = newTeam;
            let c = jail.homeCorner[newTeam];
            it.mesh.position.set(c.x * TILE + (Math.random() - 0.5) * 40, 0, c.z * TILE + (Math.random() - 0.5) * 40);
            let col = newTeam === 0 ? 0x42a5f5 : 0xef5350;
            it.mesh.userData.gem.material.color.setHex(col);
            it.mesh.userData.gem.material.emissive.setHex(col);
        }

        // 出征该去干嘛：队友被关着就先去救人，没人要救就去偷对方还没被拿走的物品，
        // 都没有的话（几乎不会发生，物品抢光了比赛也该结束了）就没什么好去的。
        // 手里已经扛着东西的人不再找新目标——扛回家才是唯一的事。
        function jailRaidTarget(myHome) {
            let jailedMate = jail.actors.some(function (x) { return x.team === myHome && x.jailed; });
            if (jailedMate) {
                let j = jail.jails[myHome];
                return { x: j.x * TILE, z: j.z * TILE };
            }
            let stealTarget = jail.items.find(function (it) { return it.team !== myHome && !it.carrier; });
            if (stealTarget) return { x: stealTarget.mesh.position.x, z: stealTarget.mesh.position.z };
            return null;
        }

        // 物品这一轮的三件事：
        // 1）扛着的物品跟着人走（举在头顶，谁都看得见，但被墙挡住照样看不见——普通渲染，不透视）
        // 2）捡：在敌方地盘、手上没扛东西、摸到一件没人扛的敌方物品，就捡起来，一次只能扛一件
        // 3）交：扛着东西的人回到自己地盘，这一趟才算数，物品才真正换主人
        function jailItemTick() {
            jail.items.forEach(function (it) {
                // 抱在胸前——贴着朝向往前挪一点、卡在胸口高度，不再举在头顶上飘着
                if (it.carrier) {
                    let ry = it.carrier.mesh.rotation.y;
                    let fx = Math.sin(ry), fz = Math.cos(ry);
                    it.mesh.position.set(it.carrier.p.x + fx * 3, 7.5, it.carrier.p.z + fz * 3);
                }
            });
            // 捡/交这两下谁来拍板，跟抓人/救援一个道理：只轮到"我自己拍板得了"的角色。
            let amHost = !jail.hostId || jail.hostId === gState.id;
            let live = jail.actors.filter(function (a) { return !a.jailed; });
            live.forEach(function (a) {
                let mine = a.isPlayer || (!a.netId && amHost);
                if (!mine) return;
                if (a.carrying) return;
                if (jailHome(a.p) === a.team) return;
                for (let i = 0; i < jail.items.length; i++) {
                    let it = jail.items[i];
                    if (it.carrier || it.team === a.team) continue;
                    let d = Math.hypot(a.p.x - it.mesh.position.x, a.p.z - it.mesh.position.z);
                    if (d < JAIL.itemRange) { jailDoPickup(it.idx, a.idx); break; }
                }
            });
            live.forEach(function (a) {
                let mine = a.isPlayer || (!a.netId && amHost);
                if (!mine) return;
                if (!a.carrying) return;
                if (jailHome(a.p) !== a.team) return;
                jailDoDeliver(a.carrying.idx, a.idx);
            });
        }
        function jailDoPickup(itemIdx, byIdx) {
            jailApplyPickup(itemIdx, byIdx);
            if (jail.netOn) bc.postMessage({ type: 'JAIL_EV', target: '*', sender: gState.id, ev: 'pickup', i: itemIdx, by: byIdx });
        }
        function jailApplyPickup(itemIdx, byIdx) {
            let it = jail.items[itemIdx], a = jail.actors[byIdx];
            if (!it || !a || it.carrier || a.carrying) return;   // 已经处理过了，别重复捡一遍
            jailPickupItem(it, a);
        }
        function jailDoDeliver(itemIdx, byIdx) {
            let it = jail.items[itemIdx], a = jail.actors[byIdx];
            if (!it || !a) return;
            let team = a.team;
            jailApplyDeliver(itemIdx, team, byIdx);
            if (jail.netOn) bc.postMessage({ type: 'JAIL_EV', target: '*', sender: gState.id, ev: 'deliver', i: itemIdx, team: team, by: byIdx });
        }
        function jailApplyDeliver(itemIdx, team, byIdx) {
            let it = jail.items[itemIdx], a = jail.actors[byIdx];
            if (!it) return;
            jailDeliverItem(it, team, a);
            if (a) a.carrying = null;
        }
        const JAIL_LINES = {
            pickup: ['抢到一件，我往回跑了', '拿到东西了，掩护我'],
            deliver: ['东西送回来了！', '这件到家了'],
            captured: ['我被抓了，谁来救我', '进局子了，队友快点'],
            catch: ['抓到人了！', '一个送进去了'],
            rescue: ['越狱成功，都跟上', '人放出来了，先撤']
        };
        function jailPickupItem(it, a) {
            it.carrier = a; a.carrying = it;
            a.gestureT = 0.35; a.gestureKind = 'pickup';
            jailBurst(it.mesh.position.x, it.mesh.position.z, 0xffee58);
            if (a.isPlayer) { blazeFlash('拿到一件物品，赶紧带回家！'); sfxChime(1); }
            else if (a.team === jail.me.team) aiSay(a, a.name, 'pickup', JAIL_LINES.pickup);
        }
        function jailDeliverItem(it, newTeam, byActor) {
            it.carrier = null;
            jailRelocateItem(it, newTeam);
            if (byActor) { byActor.gestureT = 0.35; byActor.gestureKind = 'pickup'; }
            let col = newTeam === 0 ? 0x42a5f5 : 0xef5350;
            jailBurst(it.mesh.position.x, it.mesh.position.z, col);
            if (jail.me.team === newTeam) { blazeFlash('成功把物品带回了家！'); sfxChime(3); }
            else blazeFlash('对面把我们的物品抢回家了！');
            if (byActor && !byActor.isPlayer && byActor.team === jail.me.team) aiSay(byActor, byActor.name, 'deliver', JAIL_LINES.deliver);
            jailCheckItemWin();
        }
        function jailCheckItemWin() {
            let c0 = jail.items.filter(function (it) { return it.team === 0; }).length;
            if (c0 === jail.items.length) jailEndMatch(0);
            else if (c0 === 0) jailEndMatch(1);
        }

        function jailBurst(x, z, color) {
            if (!jail) return;
            let mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
            let m = new THREE.Mesh(new THREE.RingGeometry(4, 5.5, 18), mat);
            m.rotation.x = -Math.PI / 2; m.position.set(x, 1.2, z);
            scene.add(m);
            jail.fx.push({ o: m, mat: mat, t: 0.5, life: 0.5, r0: 5, r1: 22 });
        }
        function jailFxTick(dt) {
            jail.fx = jail.fx.filter(function (f) {
                f.t -= dt;
                if (f.t <= 0) { scene.remove(f.o); f.mat.dispose(); return false; }
                let frac = 1 - f.t / f.life;
                let r = f.r0 + (f.r1 - f.r0) * frac;
                f.o.scale.set(r / f.r0, r / f.r0, 1);
                f.mat.opacity = 0.85 * (1 - frac * frac);
                return true;
            });
        }

        // 玩家移动：跟超燃的手感一样（camera 朝向 + WASD/摇杆 + 轻微惯性）。
        // 唯一的按键是跳（空格/触屏「跳」），花体力，体力条见底就跳不动了，
        // 站着不动/走着都会慢慢回体力。跳跃纯粹是位移表达，不影响抓人判定。
        function jailPlayerMove(a, dt) {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
            let side = new THREE.Vector3(-dir.z, 0, dir.x);
            let fwd = 0, strafe = 0;
            if (keys['w']) fwd += 1; if (keys['s']) fwd -= 1;
            if (keys['a']) strafe -= 1; if (keys['d']) strafe += 1;
            if (fwd === 0 && strafe === 0) { fwd = -tMove.y; strafe = tMove.x; }
            let isMoving = (fwd !== 0 || strafe !== 0);
            // 体力用来跑，跟寻宝队完全一套：按住 Shift（平板是「跑/走」开关）加速 60%、吃体力，
            // 松手或体力见底就是正常走路速度，站着/慢走会慢慢回体力。
            let isRunning = (keys['shift'] || padRun) && isMoving && a.stamina > 0;
            let wx = 0, wz = 0;
            if (isMoving) {
                let mx = dir.x * fwd + side.x * strafe, mz = dir.z * fwd + side.z * strafe;
                let n = Math.hypot(mx, mz) || 1, sp = blazeSpeed(a) * (isRunning ? staminaBoostMul(a.stamina, JAIL.runSpeedMul) : 1);
                wx = mx / n * sp; wz = mz / n * sp;
            }
            if (isRunning) a.stamina = Math.max(0, a.stamina - JAIL.runDrain * dt);
            else a.stamina = Math.min(JAIL.staminaMax, a.stamina + JAIL.runRegen * dt);

            let rate = (wx || wz) ? 1 / BLAZE.accel : 1 / BLAZE.brake;
            let k = Math.min(1, rate * dt);
            a.mvx = (a.mvx || 0) + (wx - (a.mvx || 0)) * k;
            a.mvz = (a.mvz || 0) + (wz - (a.mvz || 0)) * k;
            if (Math.abs(a.mvx) >= 0.4 || Math.abs(a.mvz) >= 0.4) blazeStep(a, a.mvx * dt, a.mvz * dt);
            else { a.mvx = 0; a.mvz = 0; }

            let onGround = a.p.y <= 0.01;
            if ((keys[' '] || touchBtn.jump) && onGround) { a.vy = JAIL.jumpV * DAILY_MOD.jumpMul; }   // 跳跃免费，不吃体力
            keys[' '] = false; touchBtn.jump = false;
            a.vy = (a.vy || 0) - JAIL.gravity * dt;
            a.p.y += a.vy * dt;
            if (a.p.y < 0) { a.p.y = 0; a.vy = 0; }
        }

        // AI：在自己地盘就近前抓闯进来的敌人；在敌方地盘要么去救被关的队友，
        // 要么见势不妙往回跑；没事干的时候小概率主动出征探一探，不然永远没人
        // 先手迈出第一步，游戏就卡死在「谁都不敢动」的僵局里。
        function jailAi(a, dt) {
            a.aiT -= dt;
            if (a.aiT <= 0) a.aiT = 0.3 + Math.random() * 0.4;
            let myHome = a.team;
            let inEnemy = jailHome(a.p) !== myHome;
            let live = jail.actors.filter(function (x) { return !x.jailed; });
            if (inEnemy) {
                // 只看视野范围内的敌人——看不见的人，AI 压根不知道他存在
                let nearestD = 1e9;
                live.forEach(function (b) {
                    if (b.team === myHome) return;
                    let d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
                    if (d < JAIL.aiVision && d < nearestD) nearestD = d;
                });
                let danger = nearestD < JAIL.dangerRadius;
                let goal = jailRaidTarget(myHome);
                if (goal && (!danger || nearestD < JAIL.handRange * 1.5)) {
                    blazeAdvance(a, goal.x, goal.z, dt);
                } else {
                    blazeAdvance(a, a.home.x, a.home.z, dt);
                }
            } else {
                // 守家也一样——只抓视野里看得见的闯入者，不是整块地盘一眼望穿
                let target = null, bestD = 1e9;
                live.forEach(function (b) {
                    if (b.team === myHome) return;
                    if (jailHome(b.p) !== myHome) return;
                    let d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
                    if (d < JAIL.aiVision && d < bestD) { bestD = d; target = b; }
                });
                if (target) {
                    blazeAdvance(a, target.p.x, target.p.z, dt);
                } else if (a.raiding > 0) {
                    a.raiding -= dt;
                    let goal = jailRaidTarget(myHome);
                    if (goal) blazeAdvance(a, goal.x, goal.z, dt); else a.raiding = 0;
                } else {
                    // 出征要给够时间：对角线横穿整张图差不多要 20 多秒，
                    // 之前只给 2~4 秒，没走到一半就被下面的闲逛拉回家门口，
                    // 相当于原地踏步，一整局都不会有人真的越境。
                    if (Math.random() < dt * 0.02) a.raiding = 25 + Math.random() * 15;
                    // 闲逛围着「自己当前位置」转，不是围着出生点 ——
                    // 不然一场没走完的出征，刚被打断就被闲逛拽回家，前功尽弃。
                    if (!a.wanderT || a.wanderT <= 0) {
                        a.wanderTx = a.p.x + (Math.random() - 0.5) * 90;
                        a.wanderTz = a.p.z + (Math.random() - 0.5) * 90;
                        a.wanderT = 2 + Math.random() * 2;
                    }
                    a.wanderT -= dt;
                    blazeAdvance(a, a.wanderTx, a.wanderTz, dt);
                }
            }
        }

        // 抓人：全自动，谁在敌方地盘又落进对方的手范围，直接送监狱。
        // 联机的话"谁抓到谁"这个判定谁来拍板得分清楚：本机真人自己的角色自己拍板，
        // AI（不管哪队）统一由房主拍板——房主本来就在本地跑所有 AI 的位置，别的
        // 机器看到的 AI 位置是同步过来的、天然会有一点延迟，各自独立判定的话
        // 两边可能判出不一样的结果（这边抓到了，那边还没抓到）。
        function jailCaptureTick(dt) {
            jail.actors.forEach(function (a) { if (a.invulT > 0) a.invulT = Math.max(0, a.invulT - dt); });
            let amHost = !jail.hostId || jail.hostId === gState.id;
            let live = jail.actors.filter(function (a) { return !a.jailed; });
            live.forEach(function (b) {
                let mine = b.isPlayer || (!b.netId && amHost);
                if (!mine) return;
                for (let i = 0; i < live.length; i++) {
                    let a = live[i];
                    if (a.team === b.team || a.invulT > 0) continue;
                    if (jailHome(a.p) === a.team) continue;
                    let d = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z);
                    if (d < JAIL.handRange) { jailDoCapture(b.idx, a.idx); break; }
                }
            });
        }
        function jailDoCapture(byIdx, targetIdx) {
            jailApplyCapture(byIdx, targetIdx);
            if (jail.netOn) bc.postMessage({ type: 'JAIL_EV', target: '*', sender: gState.id, ev: 'capture', by: byIdx, i: targetIdx });
        }
        function jailApplyCapture(byIdx, targetIdx) {
            let b = jail.actors[byIdx], a = jail.actors[targetIdx];
            if (!a || a.jailed) return;   // 已经处理过了（比如事件晚到），别重复抓一遍
            if (b) {
                b.gestureT = 0.35; b.gestureKind = 'pickup';
                if (!b.isPlayer && b.team === jail.me.team) aiSay(b, b.name, 'catch', JAIL_LINES.catch);
            }
            // 自己抓到人、或者自己被抓，都值得出声；别的队伍/别人抓别人太远太频繁，不响
            if (a === jail.me) sfxBuzz();
            else if (b === jail.me) sfxThud(true);
            jailCapture(a);
        }
        function jailCapture(a) {
            // 扛着东西的人被抓：物品就地掉落（还是原来那队的，谁都能再捡）——
            // 白跑一趟，没有直接送给对面。
            if (a.carrying) { a.carrying.mesh.position.set(a.p.x, 0, a.p.z); a.carrying.carrier = null; a.carrying = null; }
            a.jailed = 1;
            let j = jail.jails[a.team];
            a.p.set(j.x * TILE + (Math.random() - 0.5) * 8, 0, j.z * TILE + (Math.random() - 0.5) * 8);
            a.mvx = 0; a.mvz = 0; a.vy = 0;
            jailBurst(a.p.x, a.p.z, 0xff7043);
            if (a.isPlayer) blazeFlash('你被抓进监狱了！');
            else if (a.team === jail.me.team) aiSay(a, a.name, 'captured', JAIL_LINES.captured);
            jailCheckCaptureLoss();
        }
        // 加回来的规则：一队人全被抓了，没人能出去救，直接判负——不用等物品耗光。
        function jailCheckCaptureLoss() {
            for (let t = 0; t < 2; t++) {
                let members = jail.actors.filter(function (a) { return a.team === t; });
                if (members.length && members.every(function (a) { return a.jailed; })) {
                    jailEndMatch(1 - t, '一队人全被抓进了监狱，没人能出来救。');
                    return;
                }
            }
        }

        // 救援：本队还有一个自由身的人摸到自己队伍的监狱，被关的队友一次性全放出来。
        // 跟抓人一个道理：只挑"我自己拍板得了"的角色当候选救援人。
        function jailRescueTick(dt) {
            let amHost = !jail.hostId || jail.hostId === gState.id;
            [0, 1].forEach(function (myTeam) {
                let j = jail.jails[myTeam];
                let jx = j.x * TILE, jz = j.z * TILE;
                let hasJailed = jail.actors.some(function (a) { return a.team === myTeam && a.jailed; });
                if (!hasJailed) return;
                let rescuer = jail.actors.find(function (a) {
                    if (a.team !== myTeam || a.jailed) return false;
                    let mine = a.isPlayer || (!a.netId && amHost);
                    if (!mine) return false;
                    return Math.hypot(a.p.x - jx, a.p.z - jz) < JAIL.rescueRange;
                });
                if (!rescuer) return;
                jailDoRescue(myTeam, rescuer.idx);
            });
        }
        function jailDoRescue(team, byIdx) {
            jailApplyRescue(team, byIdx);
            if (jail.netOn) bc.postMessage({ type: 'JAIL_EV', target: '*', sender: gState.id, ev: 'rescue', team: team, by: byIdx });
        }
        function jailApplyRescue(team, byIdx) {
            let j = jail.jails[team];
            let jx = j.x * TILE, jz = j.z * TILE;
            let rescuer = jail.actors[byIdx];
            jail.actors.forEach(function (a) {
                if (a.team === team && a.jailed) {
                    a.jailed = 0; a.invulT = JAIL.freeInvulT;
                    a.p.set(jx + (Math.random() - 0.5) * 14, 0, jz + (Math.random() - 0.5) * 14);
                }
            });
            jailBurst(jx, jz, 0x66bb6a);
            if (jail.me.team === team) { blazeFlash('队伍越狱成功！'); sfxChime(3); }
            if (rescuer && !rescuer.isPlayer && rescuer.team === jail.me.team) aiSay(rescuer, rescuer.name, 'rescue', JAIL_LINES.rescue);
        }

        function jailEndMatch(winTeam, reason) {
            if (!jail || jail.over) return;
            jail.over = true;
            let me = jail.me;
            let c0 = jail.items.filter(function (it) { return it.team === 0; }).length;
            let ic = [c0, jail.items.length - c0];
            let text = (reason ? reason + '<br>' : '') + '本队物品：' + ic[me.team] + ' 件　对面物品：' + ic[1 - me.team] + ' 件';
            let title;
            if (winTeam === null) { title = '平局'; text = '时间到，双方物品数量一样多。<br>' + text; }
            else { title = (winTeam === me.team) ? '你的队伍获胜' : '你的队伍输了'; }
            coinsSettle('jail', winTeam === me.team); text += coinsLine();
            showSysModal(title, text, [{ label: '返回大厅', color: '#5cb85c', onClick: function () { jailExit(); } }]);
        }

        function jailTouchUI(on) {
            ['blaze-atk-btn', 'blaze-jump-btn', 'blaze-skill1-btn', 'blaze-skill2-btn', 'blaze-card-btn',
                'race-dash-btn', 'race-skill-btn', 'race-item-btn'].forEach(function (id) {
                    let e = document.getElementById(id);
                    if (e) e.style.display = on ? 'none' : '';
                });
            // 跳跃——借竞速那颗「跳」按钮；体力现在用来跑，借寻宝队那颗「跑/走」开关。都只有平板才需要
            let pad = (gState.control === 'pad');
            let jb = document.getElementById('race-jump-btn');
            if (jb) jb.style.display = (on && pad) ? 'flex' : 'none';
            let rb = document.getElementById('run-btn');
            if (rb) rb.style.display = (on && pad) ? '' : 'none';
            // 血条那一条改显示体力条；技能条这局用不上，清空免得留字
            let stats = document.getElementById('blaze-stats-btn');
            if (stats) stats.style.display = 'none';
            let skillbar = document.getElementById('blaze-skillbar'); if (skillbar) skillbar.innerHTML = '';
            let skillTxt = document.getElementById('blaze-skill'); if (skillTxt) skillTxt.innerText = '';
            document.getElementById('blaze-bottom').style.display = on ? '' : 'none';
            let cross = document.getElementById('blaze-crosshair-anchor');
            if (cross && cross.previousElementSibling) cross.previousElementSibling.style.display = on ? 'none' : '';
            let ex = document.getElementById('blaze-exit-btn');
            if (ex) ex.onclick = on ? jailExit : blazeExit;
            ['blaze-stats', 'blaze-perk', 'blaze-ffa-cards'].forEach(function (id) {
                let e = document.getElementById(id);
                if (e && on) e.classList.add('hidden');
            });
        }

        function jailHud() {
            let me = jail.me;
            let jc = [0, 0];
            jail.actors.forEach(function (a) { if (a.jailed) jc[a.team]++; });
            let c0 = jail.items.filter(function (it) { return it.team === 0; }).length;
            let ic = [c0, jail.items.length - c0];
            let remain = Math.max(0, JAIL.matchTime - jail.clock);
            document.getElementById('blaze-score').innerText = ic[me.team] + ' : ' + ic[1 - me.team] + '　' + Math.ceil(remain) + 's';
            let inEnemy = jailHome(me.p) !== me.team;
            document.getElementById('blaze-round').innerText =
                '监狱救援　我方物品 ' + ic[me.team] + '　对面物品 ' + ic[1 - me.team] +
                '　我方被抓 ' + jc[me.team] + '　对面被抓 ' + jc[1 - me.team] +
                (me.jailed ? '　在监狱里' : inEnemy ? '　敌方地盘' : '　自己地盘') +
                (me.invulT > 0 ? '　无敌 ' + me.invulT.toFixed(1) + 's' : '') +
                (me.carrying ? '　扛着东西' : '');
            if (inEnemy && !me.jailed) introOnce('jail.enemy', '对面的地盘', '这里是对面的地盘，被对面的人碰到就进监狱。回到自己这边就安全了。');
            if (me.carrying) introOnce('jail.carry', '扛东西', '扛着东西走得慢。跑回自己家就算抢到，路上被抓东西会掉在原地。');
            if (me.jailed) introOnce('jail.jailed', '进监狱了', '等队友跑过来碰一下监狱，就能出来。');
            document.getElementById('blaze-roster').innerHTML = '';
            // 体力条：借超燃的血条槽位
            let pct = Math.max(0, me.stamina / JAIL.staminaMax * 100);
            let bar = document.getElementById('blaze-hpbar');
            bar.style.width = pct + '%';
            bar.style.background = pct < 34 ? '#e57373' : '#66bb6a';
            document.getElementById('blaze-hptxt').innerText = '体力 ' + Math.round(me.stamina) + ' / ' + JAIL.staminaMax;
        }

        // 第三人称镜头：吊在角色身后偏上方，跟竞速那套一样看 camera 朝向反推位置。
        // 监狱救援这张图是真的有墙的（乱斗那套开阔场地生成的柱子/墙段），
        // 镜头直接按固定距离摆在身后会穿墙，所以先沿着「人物→镜头」这条线
        // 探几个点，撞墙就把距离缩短，不会出现镜头卡进墙里一片黑的情况。
        function jailCameraPos(me) {
            let dir = chaseCamDir();
            let back = JAIL.camBack;
            let ax = me.p.x, ay = me.p.y + JAIL.camUp, az = me.p.z;
            if (Math.hypot(dir.x, dir.z) > 0.3) {
                for (let t = 0.2; t <= 1; t += 0.2) {
                    let tx = ax - dir.x * back * t, tz = az - dir.z * back * t;
                    if (blazeBlocked(tx, tz, 0)) { back = back * Math.max(0, t - 0.2); break; }
                }
            }
            return { x: ax - dir.x * back, y: ay - dir.y * back, z: az - dir.z * back };
        }

        function jailTick(dt) {
            jail.clock += dt;
            let amHost = !jail.hostId || jail.hostId === gState.id;
            jail.actors.forEach(function (a) {
                if (a.jailed) { a.mvx = 0; a.mvz = 0; return; }
                if (a.isPlayer) jailPlayerMove(a, dt);
                else if (!a.netId && amHost) jailAi(a, dt);
                // 联机的真人队友（netId 有值）跟非房主这边的 AI：位置全靠 JAIL_ME/JAIL_W
                // 网络同步过来，这里不本地再跑一遍逻辑。
            });
            jailCaptureTick(dt);
            jailRescueTick(dt);
            jailItemTick();
            jailFxTick(dt);
            if (jail.netOn) jailNetTick(dt);
            jail.actors.forEach(function (a) {
                a.mesh.position.set(a.p.x, a.p.y, a.p.z);
                a.mesh.visible = true;   // 第三人称，自己也要看得见自己
                let sp = Math.hypot(a.mvx || 0, a.mvz || 0);
                if (sp > 1) a.mesh.rotation.y = Math.atan2(a.mvx, a.mvz);
                a.animT = (a.animT || 0) + dt * (2 + Math.min(1, sp / BLAZE.speed) * 16);
                let u = a.mesh.userData, run = Math.min(1, sp / BLAZE.speed);
                if (u.legs) {
                    u.legs[0].rotation.x = Math.sin(a.animT) * 0.9 * run;
                    u.legs[1].rotation.x = -Math.sin(a.animT) * 0.9 * run;
                }
                if (u.arms) {
                    if (a.gestureT > 0) {
                        a.gestureT -= dt;
                        bodyGesture(u, a.gestureKind, Math.max(0, a.gestureT) / 0.35);
                    } else {
                        u.arms[0].rotation.x = -Math.sin(a.animT) * 0.7 * run;
                        u.arms[1].rotation.x = Math.sin(a.animT) * 0.7 * run;
                    }
                }
                // 扛着物品的人脚下的圈发亮标记出来——普通渲染，会被墙挡住，不是那种能穿墙看见的效果
                if (u.ring) u.ring.material.color.setHex(a.carrying ? 0xffee58 : a.col);
            });
            let me = jail.me;
            let camPos = jailCameraPos(me);
            camera.position.set(camPos.x, camPos.y, camPos.z);
            if (!jail.over && jail.clock >= JAIL.matchTime) {
                let c0 = jail.items.filter(function (it) { return it.team === 0; }).length;
                let c1 = jail.items.length - c0;
                if (c0 === c1) jailEndMatch(null); else jailEndMatch(c0 > c1 ? 0 : 1);
            }
            jailHud();
            renderer.render(scene, camera);   // 漏了这一句，纯黑屏——逻辑照常跑，画面从来没画过
        }

        function jailLoop() {
            if (!jail) return;
            let now = performance.now();
            let dt = Math.min(0.05, (now - jail.last) / 1000);
            jail.last = now;
            if (!jail.over) jailTick(dt);
            jail.raf = requestAnimationFrame(jailLoop);
        }

        // 10 个位置：0~4 是队伍0，5~9 是队伍1。真人一律坐队伍0（跟组队的人是队友，
        // 不是拿真人互相对抗），队伍1 从头到尾都是 AI——跟超燃 2v2 真人配成一队、
        // 对面用 AI 补的思路一样，避免"随便两个匹配到的陌生人被分到敌对两队"这种
        // 更难保证公平、也更难联机同步的设计。
        function jailPlan(humans) {
            let plan = [];
            for (let i = 0; i < JAIL.teamSize * 2; i++) plan.push({ idx: i, team: i < JAIL.teamSize ? 0 : 1, id: null });
            humans.slice(0, JAIL.teamSize).forEach(function (h, i) { plan[i].id = h.id; });
            return plan;
        }
        function jailBegin(plan, hostId) {
            plan = plan || jailPlan([{ id: gState.id }]);
            hostId = hostId || gState.id;
            showModeIntroIfFirstTime('jail');
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.add('hidden');
            document.getElementById('blaze-hud').classList.remove('hidden');
            let pe = document.getElementById('blaze-perk'); if (pe) pe.classList.add('hidden');
            if (blaze) { try { blazeExit(); } catch (e) { } }
            if (race) { try { raceExit(); } catch (e) { } }
            ensureScene();
            scene.background = new THREE.Color(0x8fd3f4);
            scene.fog = new THREE.FogExp2(0x8fd3f4, 0.0012);
            // 借乱斗的场地生成，但墙要少、要平——临时调低生成参数，用完立刻还原，
            // 不影响乱斗自己的地图（那边就是要墙多才热闹）。
            let wallRuns0 = BLAZE.ffaWallRuns, wallMin0 = BLAZE.ffaWallMin, wallMax0 = BLAZE.ffaWallMax, pillars0 = BLAZE.ffaPillars;
            BLAZE.ffaWallRuns = 5; BLAZE.ffaWallMin = 2; BLAZE.ffaWallMax = 4; BLAZE.ffaPillars = 2;
            blazeBuildArena(true, false, false);   // 乱斗的开阔场地生成，天然中心对称
            BLAZE.ffaWallRuns = wallRuns0; BLAZE.ffaWallMin = wallMin0; BLAZE.ffaWallMax = wallMax0; BLAZE.ffaPillars = pillars0;

            let n = JAIL.teamSize;
            let cornerA = { x: 4, z: 4 }, cornerB = { x: mSize - 5, z: mSize - 5 };
            // 出生点和物品摆放点各要一批不重复的空地——多要几个，前 n 个当出生点，剩下的摆物品
            let cellsA = jailOpenCellsNear(cornerA.x, cornerA.z, n + JAIL.itemsPerTeam);
            let cellsB = jailOpenCellsNear(cornerB.x, cornerB.z, n + JAIL.itemsPerTeam);
            let spawnsA = cellsA.slice(0, n), itemSlotsA = cellsA.slice(n);
            let spawnsB = cellsB.slice(0, n), itemSlotsB = cellsB.slice(n);
            let jailPosA = jailOpenCellsNear(mSize - 10, mSize - 10, 1)[0];   // 队伍0 的监狱：深在队伍1 地盘
            let jailPosB = jailOpenCellsNear(9, 9, 1)[0];                    // 队伍1 的监狱：深在队伍0 地盘

            // 地板按地盘染色，一眼看出哪边是谁的家
            for (let z = 1; z < mSize - 1; z++) for (let x = 1; x < mSize - 1; x++) {
                let c = maze[0][z][x];
                if (c && c.type === 0 && c.mesh) {
                    let home = (x + z) < (mSize - 1) ? 0 : 1;
                    c.mesh.material.color.setHex(home === 0 ? 0xbbdefb : 0xffcdd2);
                }
            }

            let netOn = plan.filter(function (q) { return q.id; }).length > 1;
            jail = {
                over: false, clock: 0, actors: [], fx: [], items: [],
                jails: [jailPosA, jailPosB],
                homeCorner: [cornerA, cornerB],
                markers: [jailMakeMarker(jailPosA.x, jailPosA.z, 0x42a5f5), jailMakeMarker(jailPosB.x, jailPosB.z, 0xef5350)],
                last: performance.now(), raf: null, hostId: hostId, netOn: netOn
            };

            // 每队 5 件物品，摆在自己家门口的空地上，起手各归各队
            [itemSlotsA, itemSlotsB].forEach(function (slots, t) {
                let col = t === 0 ? 0x42a5f5 : 0xef5350;
                slots.slice(0, JAIL.itemsPerTeam).forEach(function (slot) {
                    let mesh = jailItemMesh(col);
                    mesh.position.set(slot.x * TILE, 0, slot.z * TILE);
                    scene.add(mesh);
                    jail.items.push({ idx: jail.items.length, mesh: mesh, team: t, carrier: null });
                });
            });

            [0, 1].forEach(function (t) {
                let sps = t === 0 ? spawnsA : spawnsB;
                let col = t === 0 ? 0x42a5f5 : 0xef5350;
                for (let i = 0; i < n; i++) {
                    let slot = plan[jail.actors.length];
                    let isP = slot.id === gState.id;
                    let mesh = raceMakeBody(col, JAIL.handRange, false, isP ? gState.acc : (slot.id ? peerAccOf(slot.id) : aiRandomAcc()), isP ? myFace() : (slot.id ? peerFaceOf(slot.id) : aiRandomFace()));
                    scene.add(mesh);
                    let sp = sps[i];
                    let a = {
                        idx: jail.actors.length, team: t, isPlayer: isP, netId: slot.id || null, col: col,
                        name: slot.id ? (dispName(slot.id) || '你') : ('队员' + (jail.actors.length + 1)),
                        p: new THREE.Vector3(sp.x * TILE, 0, sp.z * TILE),
                        home: { x: sp.x * TILE, z: sp.z * TILE },
                        floor: 0, mvx: 0, mvz: 0, jailed: 0, invulT: 0, raiding: 0,
                        vy: 0, stamina: JAIL.staminaMax, carrying: null, gestureT: 0, gestureKind: null,
                        mesh: mesh, aiT: Math.random() * 0.5, animT: 0
                    };
                    jail.actors.push(a);
                }
            });
            jail.me = jail.actors.filter(function (a) { return a.isPlayer; })[0] || jail.actors[0];
            camera.rotation.set(0, Math.PI * 0.75, 0);   // 从队伍0 的角落大致朝对角线中心看

            document.body.onmousedown = function (e) {
                if (!jail || jail.over) return;
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal'))) return;
                if (!document.pointerLockElement) { safeLockPointer(); }
            };
            document.body.onmouseup = null;
            jailTouchUI(true);
            bgmStart();
            jailLoop();
        }

        function jailExit() {
            if (!jail) return;
            jail.over = true;
            if (jail.raf) cancelAnimationFrame(jail.raf);
            if (document.pointerLockElement) document.exitPointerLock();
            (jail.fx || []).forEach(function (f) { scene.remove(f.o); });
            (jail.markers || []).forEach(function (m) { scene.remove(m); });
            (jail.items || []).forEach(function (it) { scene.remove(it.mesh); });
            jail.actors.forEach(function (a) { scene.remove(a.mesh); });
            jail = null;
            jailTouchUI(false);
            bgmStop();
            document.body.onmousedown = null;
            document.getElementById('blaze-hud').classList.add('hidden');
            let bd = document.getElementById('blaze-ffa-board'); if (bd) { bd.classList.add('hidden'); bd.style.left = ''; bd.style.right = '12px'; bd.style.width = '190px'; bd.style.top = '44px'; }
            nav('screen-lobby'); selectGameMode('jail');
        }

        // 组了队直接带队友进（全部坐队伍0，队伍1 从头到尾是 AI）；没组队先等最多
        // 15 秒看房间里有没有人也想玩，凑不到就照旧配 AI——跟超燃/竞速/密室是同一套。
        function jailStartGo() {
            if (lobbyParty.length > 0) {
                let ids = [gState.id].concat(lobbyParty.slice(0, JAIL.teamSize - 1));
                let plan = jailPlan(ids.map(function (id) { return { id: id }; }));
                if (ids.length > 1) bc.postMessage({ type: 'JAIL_START', target: '*', sender: gState.id, plan: plan, host: gState.id });
                jailBegin(plan, gState.id);
                return;
            }
            mmStart('jail', JAIL.teamSize, function (ids) {
                let plan = jailPlan(ids.map(function (id) { return { id: id }; }));
                if (ids.length > 1) bc.postMessage({ type: 'JAIL_START', target: '*', sender: gState.id, plan: plan, host: gState.id });
                jailBegin(plan, gState.id);
            });
        }
        function jailOnStart(m) {
            if (!m.plan || !m.plan.some(function (q) { return q.id === gState.id; })) return;
            if (!netStartAllowed('jail', m)) return;
            mmCancel();
            if (jail) { if (jail.raf) cancelAnimationFrame(jail.raf); jail = null; }
            jailBegin(m.plan, m.host);
        }
        const JAIL_ME_HZ = 15, JAIL_W_HZ = 10;
        function jailNetTick(dt) {
            jail._meT = (jail._meT || 0) + dt;
            if (jail._meT >= 1 / JAIL_ME_HZ) {
                jail._meT = 0;
                let me = jail.me;
                bc.postMessage({
                    type: 'JAIL_ME', target: '*', sender: gState.id,
                    x: me.p.x, z: me.p.z, yaw: me.mesh.rotation.y
                });
            }
            if (jail.hostId === gState.id) {
                jail._wT = (jail._wT || 0) + dt;
                if (jail._wT >= 1 / JAIL_W_HZ) {
                    jail._wT = 0;
                    let list = jail.actors.filter(function (a) { return !a.netId; }).map(function (a) {
                        return { i: a.idx, x: a.p.x, z: a.p.z, yaw: a.mesh.rotation.y, jailed: a.jailed, invulT: a.invulT };
                    });
                    bc.postMessage({ type: 'JAIL_W', target: '*', sender: gState.id, ai: list });
                }
            }
        }
        function jailOnMe(m) {
            if (!jail || m.sender === gState.id) return;
            let a = jail.actors.filter(function (o) { return o.netId === m.sender; })[0];
            if (!a) return;
            // 之前直接拿网络坐标覆盖 a.p，没算过 mvx/mvz——腿摆动画看的正是这两个值，
            // 结果联机队友的身体在别人屏幕上是"贴地滑过去"，腿不摆、转身也卡帧。
            // 按收包间隔（1/JAIL_ME_HZ）把这次位移换算成一个速度，喂给走路动画用，
            // 跟竞速联机对手同一个思路（raceTickRacer 里那段"合成速度"）。
            a.mvx = (m.x - a.p.x) * JAIL_ME_HZ; a.mvz = (m.z - a.p.z) * JAIL_ME_HZ;
            a.p.x = m.x; a.p.z = m.z; a.mesh.rotation.y = m.yaw;
        }
        // 非房主这边：AI 的位置、被抓/无敌状态直接套用房主广播的，跟超燃的 BZ_W 一个思路——
        // 抓人/捡东西这些判定已经靠事件（JAIL_EV）同步过一遍了，这里的 jailed/invulT
        // 只是多一层保险，万一事件哪次没接上，下一条世界状态广播也能把状态掰回来。
        function jailOnW(m) {
            if (!jail || m.sender === gState.id || jail.hostId !== m.sender) return;
            (m.ai || []).forEach(function (q) {
                let a = jail.actors[q.i];
                if (!a || a.isPlayer || a.netId) return;
                a.mvx = (q.x - a.p.x) * JAIL_W_HZ; a.mvz = (q.z - a.p.z) * JAIL_W_HZ;
                a.p.x = q.x; a.p.z = q.z; a.mesh.rotation.y = q.yaw;
                a.jailed = q.jailed; a.invulT = q.invulT;
            });
        }
        // 抓人/救援/捡物/交物这四种事件，谁广播的就是谁拍的板（本机真人自己，或者
        // 房主替所有 AI 拍板），收到别人的广播直接照单应用，不用再自己判一遍。
        function jailOnEv(m) {
            if (!jail || m.sender === gState.id) return;
            if (m.ev === 'capture') jailApplyCapture(m.by, m.i);
            else if (m.ev === 'rescue') jailApplyRescue(m.team, m.by);
            else if (m.ev === 'pickup') jailApplyPickup(m.i, m.by);
            else if (m.ev === 'deliver') jailApplyDeliver(m.i, m.team, m.by);
        }

