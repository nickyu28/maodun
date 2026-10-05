        // ══════════════════════════════════════════════════════════
        //  《竞速》· 3D 跑酷淘汰赛
        //  地基部分：赛道生成 + 平台物理 + 惯性移动 + 轮次淘汰
        //  这个模式不用 maze 网格判定 —— 跑酷要的是任意高度的悬空平台，
        //  所以水平方向完全自由（掉下去就是玩法本身），只做向下射线找落点。
        // ══════════════════════════════════════════════════════════
        // 双人赛专用节奏：跟单人共用同一套赛道/道具/技能系统，
        // 只有淘汰方式不一样 —— 不按名次直接卡人数，是按队伍分数淘汰。
        const RACE_DUO = {
            ladder: [8, 6, 4, 2],        // 每轮开跑的队伍数，最后一轮再砍到 1 队冠军
            segLen: [8, 7, 6, 5]
        };

        const RACE = {
            count: 16,
            ladder: [16, 12, 8, 4, 2],   // 每轮开跑人数，相邻两项之差就是淘汰数
            segLen: [8, 7, 6, 5, 4],     // 每轮赛道有几段
            width: 5 * TILE,             // 赛道标准宽度
            segZ: 14 * TILE,             // 一段的长度
            spawnGap: 6,                 // 起跑线上人与人的间距
            gravity: 150,
            jumpV: 52,
            moveSpeed: 46,
            accel: 0.16,                 // 加速到满速要多久（惯性）
            brake: 0.13,                 // 松手滑停要多久 —— 调低=摩擦力更大，不再脚底抹油乱滑
            airCtrl: 0.40,               // 空中操控只有地面的四成
            dashV: 90, dashT: 0.22, dashCd: 4,
            eye: 9,
            camBack: 40, camUp: 26,
            fallY: -60,                  // 掉到这个高度以下就算掉下去了
            respawnT: 1.2,               // 复位要多久
            readyT: 7,                   // 开跑前的等待：这段时间里选技能、往前挤位置，栏杆放下才能跑
            gateZ: -TILE * 4 + 14,       // 起跑栏杆的位置（第一排前面一点）
            cardChance: 0.70,            // 每轮有多大概率发一张牌（剩下的 30% 就是裸跑）
            boxEvery: 10,                // 道具箱大约每几秒跑程放一个
            roundLimit: 210,             // 一轮的时间上限
            pickT: 10                    // 选技能的时间，超时自动随机一个
        };



        // ── 赛道积木 ──
        // 每种段落一个 build，往 out 里塞 mesh，返回这一段的「可站立面」信息。
        // 八种段落每场至少各出现一次，这条约束让不同场次的赛道构成大致可比。
        const RACE_SEGS = [
            { id: 'straight', name: '直跑道' },
            { id: 'gaps', name: '断桥' },
            { id: 'narrow', name: '窄桥' },
            { id: 'spinner', name: '旋转横杆' },
            { id: 'crumble', name: '塌陷地板' },
            { id: 'bounce', name: '弹跳板' },
            { id: 'boost', name: '加速带' },
            { id: 'lift', name: '升降台' },
            { id: 'zigzag', name: '回廊' },
            { id: 'chasm', name: '裂谷' },
            { id: 'gate', name: '扫杆闸' }
        ];

        // 竞速自己的粒子池。blazeBurst 依赖全局 blaze，这个模式里 blaze 是 null。
        function raceBurst(x, y, z, color, r0, r1, life) {
            if (!race) return;
            let mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
            let m = new THREE.Mesh(new THREE.RingGeometry(r0 * 0.7, r0, 18), mat);
            m.rotation.x = -Math.PI / 2; m.position.set(x, y + 1, z);
            scene.add(m);
            race.fx.push({ o: m, mat: mat, t: life, life: life, r0: r0, r1: r1 });
        }
        function raceFxTick(dt) {
            race.fx = race.fx.filter(function (f) {
                f.t -= dt;
                if (f.t <= 0) { scene.remove(f.o); f.mat.dispose(); return false; }
                let frac = 1 - f.t / f.life;
                let r = f.r0 + (f.r1 - f.r0) * frac;
                f.o.scale.set(r / f.r0, r / f.r0, 1);
                f.mat.opacity = 0.85 * (1 - frac * frac);
                return true;
            });
        }

        function raceMat(hex, emis) {
            return new THREE.MeshLambertMaterial({ color: hex, emissive: emis === undefined ? 0x000000 : emis });
        }

        // 一块平台。所有能站的东西都从这里出来，统一进 race.ground 供射线查询。
        function racePlat(x, y, z, w, d, hex, opt) {
            opt = opt || {};
            let h = opt.h || 3;
            let m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), raceMat(hex, opt.emis));
            m.position.set(x, y - h / 2, z);
            m.userData.raceTop = y;
            if (opt.kind) m.userData.kind = opt.kind;
            scene.add(m);
            race.meshes.push(m);
            race.ground.push(m);
            return m;
        }

        function raceDeco(mesh) { scene.add(mesh); race.meshes.push(mesh); }

        // 每段都从 z0 开始，往 +z 铺 RACE.segZ 那么长
        function raceBuildSeg(id, z0) {
            let W = RACE.width, L = RACE.segZ, half = W / 2;
            if (id === 'straight') {
                racePlat(0, 0, z0 + L / 2, W, L, 0x78909c);
            }
            else if (id === 'gaps') {
                // 四块平台夹三个缺口，缺口宽度递增，最后一个要冲刺或二段跳
                // 满速起跳大约飞 32 单位，三个缺口取 16 / 22 / 28，
                // 最后一个要踩准才过得去，但不是不可能
                let gaps = [14, 18, 22], z = z0, plat = (L - 54) / 4;
                for (let i = 0; i < 4; i++) {
                    racePlat(0, 0, z + plat / 2, W, plat, 0x8d6e63);
                    z += plat + (gaps[i] || 0);
                }
            }
            else if (id === 'narrow') {
                // 一格宽的独木桥，中间还拐一下 —— 挤人的主战场
                let a = L * 0.36, b = L * 0.14, c = L - a - b, off = TILE * 1.6, nw = TILE * 1.6;
                racePlat(0, 0, z0 + a / 2, nw, a, 0x546e7a);
                racePlat(off / 2, 0, z0 + a + b / 2, off + nw, b, 0x546e7a);   // 拐弯的连接段
                racePlat(off, 0, z0 + a + b + c / 2, nw, c, 0x546e7a);
            }
            else if (id === 'spinner') {
                racePlat(0, 0, z0 + L / 2, W, L, 0x6d4c41);
                // 两根转臂，扫到人就把人打飞（复用击退那套手感）
                [0.3, 0.7].forEach(function (t, i) {
                    let arm = new THREE.Mesh(new THREE.BoxGeometry(W * 1.5, 5, 5), raceMat(0xff7043, 0x5d1f00));
                    arm.position.set(0, 5, z0 + L * t);
                    raceDeco(arm);
                    race.spinners.push({ mesh: arm, z: z0 + L * t, a: i * Math.PI / 2, spd: 1.6 + i * 0.5 });
                });
            }
            else if (id === 'crumble') {
                // 整条通道横着切成 5 块，每块踩上去 1.2 秒后塌 —— 先过的人给后面挖坑。
                // 塌了 3 秒会长回来：不留这一条的话，16 个人一起过，
                // 后面复位的人会被永久堵死，整轮没人完赛。
                let n = 5, plat = L / n;
                for (let i = 0; i < n; i++) {
                    let m = racePlat(0, 0, z0 + i * plat + plat / 2, W, plat * 0.9, 0xa1887f, { kind: 'crumble' });
                    m.userData.fuse = -1;
                    m.userData.home = 0;
                    race.crumbles.push(m);
                }
            }
            else if (id === 'bounce') {
                let padD = 16, gap = 40, rest = L * 0.38, run = L - padD - gap - rest;
                racePlat(0, 0, z0 + run / 2, W, run, 0x78909c);
                let pad = racePlat(0, 0, z0 + run + padD / 2, W, padD, 0x66bb6a, { kind: 'bounce', emis: 0x1b5e20 });
                pad.userData.power = 2.3;
                racePlat(0, 0, z0 + L - rest / 2, W, rest, 0x78909c);
            }
            else if (id === 'boost') {
                racePlat(0, 0, z0 + L / 2, W, L, 0x78909c);
                let b = racePlat(0, 0.3, z0 + L / 2, W * 0.7, L * 0.7, 0x29b6f6, { kind: 'boost', h: 0.6, emis: 0x01579b });
                b.userData.power = 1.7;
            }
            else if (id === 'chasm') {
                // 裂谷：实测数据 —— 只跳能飞 32，跳到顶点再冲 43，先冲再跳 48。
                // 缺口定在 38：不冲刺绝对过不去，冲刺早了（冷却还没转好）也过不去，
                // 必须踩着起跳的点放。落地后还有一个 20 的普通缺口喘口气。
                let run = L * 0.34, gap = 36, mid = 44, gap2 = 22;
                racePlat(0, 0, z0 + run / 2, W, run, 0x78909c);
                // 对面是块只有 44 深的窄岛，冲过头照样滑进第二个缺口
                racePlat(0, 0, z0 + run + gap + mid / 2, W, mid, 0x78909c);
                let rest = L - run - gap - mid - gap2;
                racePlat(0, 0, z0 + L - rest / 2, W, rest, 0x78909c);
            }
            else if (id === 'gate') {
                // 闸口：两道横着来回平移的挡板，各自留一条通道。
                // 挡板扫过来的时候硬挤会被推回去，得等自己这条道空出来那一瞬间冲过去。
                racePlat(0, 0, z0 + L / 2, W, L, 0x546e7a);
                [0.36, 0.70].forEach(function (t, i) {
                    let bw = W * 0.52, amp = W * 0.30;
                    let bar = new THREE.Mesh(new THREE.BoxGeometry(bw, 6, 7), raceMat(0xef5350, 0x7f0000));
                    bar.position.set(0, 3, z0 + L * t);
                    raceDeco(bar);
                    race.sweeps.push({ mesh: bar, z: z0 + L * t, w: bw, amp: amp, spd: 1.5 + i * 0.45, t: i * 1.7 });
                });
            }
            else if (id === 'zigzag') {
                // 回廊：三段直角折返。每一段都短到冲刺必然冲过头，
                // 想快只能靠走位，冲刺在这儿是负收益。
                let w = TILE * 1.5, armZ = L / 3, armX = RACE.width * 0.4;
                for (let i = 0; i < 3; i++) {
                    let z = z0 + i * armZ;
                    let x = (i % 2 ? 1 : -1) * armX / 2;
                    let runZ = armZ * 0.68, linkZ = armZ - runZ;
                    racePlat(x, 0, z + runZ / 2, w, runZ, 0x607d8b);                   // 竖着跑的一段
                    racePlat(0, 0, z + runZ + linkZ / 2, armX + w, linkZ, 0x607d8b);   // 拐过去的连接段
                }
            }
            else if (id === 'lift') {
                // 缺口收到 10，升降幅度收到 8 —— 它是「等一下再走」，不是「必死」
                let apr = (L - TILE * 3 - 20) / 2;
                racePlat(0, 0, z0 + apr / 2, W, apr, 0x78909c);
                let lift = racePlat(0, 0, z0 + apr + 10 + TILE * 1.5, W * 0.9, TILE * 3, 0xffb74d, { kind: 'lift', emis: 0x6d4c00 });
                race.lifts.push({ mesh: lift, base: 0, amp: 8, spd: 1.0, t: Math.random() * 6 });
                racePlat(0, 0, z0 + L - apr / 2, W, apr, 0x78909c);
            }
            return z0 + L;
        }

        // 抽这一轮的段落顺序。规则：整场里八种至少各出现一次，
        // 所以先把「还没出现过的」优先塞进来，剩下的名额再随便抽。
        function racePickSegs(n) {
            // 塌陷地板原来在人多的轮次会堵死，那其实是「塌了长不回来」的 bug，
            // 修好之后 16 个人跑纯塌陷赛道也就 80 秒，不用再挑人数了。
            let ok = RACE_SEGS;
            let unseen = ok.filter(function (s) { return !race.segSeen[s.id]; });
            let out = [];
            blazeShuffle(unseen).forEach(function (s) { if (out.length < n) out.push(s.id); });
            while (out.length < n) {
                let pool = ok.filter(function (c) { return out.indexOf(c.id) < 0; });
                if (!pool.length) pool = ok;
                out.push(pool[Math.floor(Math.random() * pool.length)].id);
            }
            out = blazeShuffle(out);
            // 第一段永远是直跑道，给个起步缓冲。
            // 用「换到头部」而不是「覆盖第一个」，不然会把某一种段落挤掉
            let si = out.indexOf('straight');
            if (si > 0) { out[si] = out[0]; out[0] = 'straight'; }
            else if (si < 0) out[0] = 'straight';   // 不能 unshift，会把段数顶多一个
            out.forEach(function (id) { race.segSeen[id] = 1; });
            return out;
        }

        function raceClearTrack() {
            (race.meshes || []).forEach(function (m) { scene.remove(m); });
            race.meshes = []; race.ground = []; race.spinners = []; race.sweeps = [];
            race.crumbles = []; race.lifts = []; race.checkpoints = []; race.savePads = []; race.boxes = [];
        }

        function raceBuildTrack(nSeg, presetSegs) {
            raceClearTrack();
            let segs = presetSegs || racePickSegs(nSeg);
            race.boxes = [];
            race.segs = segs;
            let z = 0;
            // 起跑平台
            racePlat(0, 0, -TILE * 3, RACE.width * 1.6, TILE * 6, 0x455a64);
            race.checkpoints.push(new THREE.Vector3(0, 0, -TILE * 2));
            segs.forEach(function (id) {
                race.checkpoints.push(new THREE.Vector3(0, 0, z + TILE));
                z = raceBuildSeg(id, z);
            });
            // 终点平台 + 一道亮门
            racePlat(0, 0, z + TILE * 3, RACE.width * 1.6, TILE * 6, 0x2e7d32);
            race.finishZ = z + TILE;
            let gate = new THREE.Mesh(new THREE.BoxGeometry(RACE.width * 1.7, 40, 2),
                new THREE.MeshBasicMaterial({ color: 0xffee58, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
            gate.position.set(0, 20, race.finishZ);
            raceDeco(gate);
            race.trackEnd = z + TILE * 6;
            // 道具箱：位置固定，沿赛道大约每 10 秒跑程一个（满速 46 → 约 460 单位）。
            // 「道具雨」事件翻倍，「空赛道」事件一个都不放。
            if (!raceEv('nobox')) {
                let gap = RACE.moveSpeed * RACE.boxEvery / (raceEv('boxrain') ? 2 : 1);
                for (let bz = gap * 0.6; bz < z; bz += gap) {
                    for (let k = -1; k <= 1; k++) {
                        if (k !== 0 && !raceEv('boxrain')) continue;   // 平时只放中间一个
                        raceSpawnBox(k * RACE.width * 0.3, bz);
                    }
                }
            }
        }

        // 一个道具箱。撞到就开，开出什么完全随机。
        function raceSpawnBox(x, z) {
            let g = new THREE.Group();
            let box = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 9),
                raceMat(0xffca28, 0x8d6a00));
            box.position.y = 9; g.add(box);
            let mark = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 2),
                new THREE.MeshBasicMaterial({ color: 0xfff59d }));
            mark.position.y = 9; g.add(mark);
            g.position.set(x, 0, z);
            scene.add(g);
            race.meshes.push(g);
            race.boxes.push({ mesh: g, x: x, z: z, t: Math.random() * 6, gone: 0 });
        }

        function raceBoxTick(dt) {
            (race.boxes || []).forEach(function (b) {
                if (b.gone > 0) {
                    b.gone -= dt;
                    if (b.gone <= 0) { b.mesh.visible = true; }   // 6 秒后补货，后面的人也有得拿
                    return;
                }
                b.t += dt;
                b.mesh.rotation.y += dt * 1.4;
                b.mesh.position.y = Math.sin(b.t * 2.2) * 1.6;
                race.racers.forEach(function (r) {
                    if (b.gone > 0 || r.out || r.finished || r.respawnT > 0) return;
                    if (Math.abs(r.p.y - b.mesh.position.y) > 22) return;
                    if (Math.hypot(r.p.x - b.x, r.p.z - b.z) > 11) return;
                    b.gone = 6; b.mesh.visible = false;
                    r.item = raceRollItem();      // 开出什么完全看运气
                    raceBurst(b.x, r.p.y, b.z, 0xffca28, 6, 16, 0.35);
                    if (r.isPlayer) { blazeFlash('开到【' + raceItemDef(r.item).name + '】'); introOnce('race.item', '道具', '路上的箱子能开出道具，' + kTxt('按 <b>Q</b>', '点 <b>道具</b>') + ' 用掉。一次只能拿一个。'); }
                });
            });
        }

        // ── 找脚下 ──
        function raceGroundAt(p) {
            let from = new THREE.Vector3(p.x, p.y + 6, p.z);
            let ray = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0), 0, 40);
            let hit = ray.intersectObjects(race.ground);
            return hit.length ? hit[0] : null;
        }

        // ── 选手模型 ──
        // 竞速里不分角色，所有人都是同一只普通猫盾 —— 没有弓没有剑没有盾牌，
        // 只有颜色不一样。跑酷要的是一眼分清谁是谁，不是看谁背着什么。
        const RACE_COLORS = [
            0xef5350, 0x42a5f5, 0x66bb6a, 0xffca28, 0xab47bc, 0xff7043,
            0x26c6da, 0xd4e157, 0x8d6e63, 0xec407a, 0x5c6bc0, 0x9ccc65,
            0xffa726, 0x78909c, 0x26a69a, 0xba68c8
        ];
        // 皮肤：15 种颜色抽奖，另外掺 5 个「谢谢参与」空签，一共 20 签，抽中颜色才进口袋。
        // 只在没有队伍含义的地方（大厅广场/竞速/松饼大作战/密室，都是靠名字认人，不靠颜色分队）
        // 才用玩家自己选的皮肤颜色覆盖默认色；监狱救援/躲避球这种颜色代表队伍的地方不能乱套。
        const SKIN_COLORS = RACE_COLORS.slice(0, 15);
        const SKIN_BLANKS = 5;
        const SKIN_PRICE = 10;
        const SKIN_PITY_LIMIT = 12;
        // 配饰：不走抽奖，直接花钱买断，买完永久拥有，两个部位（头饰/腰饰）各自独立
        // 装备互不影响，随便搭——真正的"自由 DIY"，不是开箱子看运气。跟皮肤颜色一样，
        // 只在没有队伍色含义的地方生效；但配饰是联机同步的（见 roomSelfMsg 的 acc 字段/
        // peerAccOf），房间里其他真人能看到你戴的，这点跟只有自己能看见的皮肤颜色不一样。
        const ACCESSORY_DEFS = {
            head: [
                { id: 'cap', n: '普通帽子', price: 10 },
                { id: 'party', n: '生日帽', price: 10 },
                { id: 'crown', n: '皇冠', price: 20 },
                { id: 'glasses', n: '眼镜', price: 10 },
                { id: 'shades', n: '墨镜', price: 10 },
                { id: 'star', n: '星星', price: 15 }
            ],
            waist: [
                { id: 'fish', n: '小鱼干', price: 10 },
                { id: 'coin', n: '猫盾币挂件', price: 10 },
                { id: 'bell', n: '铃铛', price: 8 },
                { id: 'yarn', n: '毛线球', price: 10 }
            ]
        };
        const ACC_SLOT_NAME = { head: '头饰', waist: '腰饰' };
        function accDefOf(id) {
            for (let slot in ACCESSORY_DEFS) {
                let hit = ACCESSORY_DEFS[slot].find(function (a) { return a.id === id; });
                if (hit) return hit;
            }
            return null;
        }
        function accEquip(slot, id) {
            if (!gState.acc) gState.acc = { head: null, waist: null };
            if (id !== null && !(gState.ownedAcc && gState.ownedAcc[id])) return;
            gState.acc[slot] = (gState.acc[slot] === id) ? null : id;
            saveProgress();
            shopTab('skin');
        }
        function accBuy(slot, id) {
            if (gState.ownedAcc && gState.ownedAcc[id]) { accEquip(slot, id); return; }
            let def = accDefOf(id);
            if (!def) return;
            if (!shopSpend(def.price)) return;
            if (!gState.ownedAcc) gState.ownedAcc = {};
            gState.ownedAcc[id] = true;
            accEquip(slot, id);
        }
        // 配饰部位从帽子/眼镜/脖子三槽改成头饰/腰饰两槽那天存下的老存档，acc 字段还是
        // 旧形状——帽子/眼镜的选择直接搬进头饰（id 没变，兼容），脖子直接扔（新方案没有
        // 对应部位）。顺手也兜底一下目录里已经下架的 id（比如腰饰这边试过又撤掉的蝴蝶结
        // 腰带）——查不到对应商品就当没戴，不会出现挂了个不存在的东西的怪状态。
        function migrateAccData(rawAcc) {
            rawAcc = rawAcc || {};
            let out = ('head' in rawAcc || 'waist' in rawAcc)
                ? { head: rawAcc.head || null, waist: rawAcc.waist || null }
                : { head: rawAcc.hat || rawAcc.eye || null, waist: null };
            if (out.head && !accDefOf(out.head)) out.head = null;
            if (out.waist && !accDefOf(out.waist)) out.waist = null;
            return out;
        }
        // AI/路人配饰：给同屏的电脑角色也随机戴点东西活跃画面，但按概率抽、多数时候
        // 什么都不戴——同屏一堆人全戴满配饰会多出很多网格，卡的话把 AI_ACC_CHANCE
        // 调低（0 就是 AI 全不戴），下面"测试开关"面板里也能直接勾。
        let AI_ACC_CHANCE = 0.3;
        // 商店里的东西 AI 也会随机戴（规则：以后商店加什么，AI 都要按概率戴上，见 CLAUDE.md）
        const AI_FACE_CHANCE = 0.45, AI_SKIN_CHANCE = 0.35, AI_PET_CHANCE = 0.25;
        function aiRandomFace() {
            if (Math.random() > AI_FACE_CHANCE) return 'cat';
            let ks = Object.keys(SHOP_FACES).filter(function (k) { return k !== 'cat'; });
            return ks[Math.floor(Math.random() * ks.length)];
        }
        // 身体颜色：不分队伍颜色的模式里，一部分 AI 换成商店皮肤颜色
        function aiSkinColor(def) {
            return Math.random() < AI_SKIN_CHANCE ? SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)] : def;
        }
        function aiRandomAcc() {
            if (Math.random() > AI_ACC_CHANCE) return null;
            let acc = {};
            if (Math.random() < 0.6) acc.head = ACCESSORY_DEFS.head[Math.floor(Math.random() * ACCESSORY_DEFS.head.length)].id;
            if (Math.random() < 0.35) acc.waist = ACCESSORY_DEFS.waist[Math.floor(Math.random() * ACCESSORY_DEFS.waist.length)].id;
            return (acc.head || acc.waist) ? acc : null;
        }
        function mySkinColor(defaultColor) { return (gState.skinColor !== null && gState.skinColor !== undefined) ? gState.skinColor : defaultColor; }
        function skinDraw() {
            if (!shopSpend(SKIN_PRICE)) return;
            if (!gState.skins) gState.skins = {};
            let pity = gState.skinPity || 0;
            let unowned = SKIN_COLORS.filter(function (c) { return !gState.skins[c]; });
            let forcedNew = pity >= SKIN_PITY_LIMIT && unowned.length > 0;
            let col = forcedNew ? unowned[Math.floor(Math.random() * unowned.length)] : null;
            if (col === null && !forcedNew) {
                let roll = Math.floor(Math.random() * (SKIN_COLORS.length + SKIN_BLANKS));
                if (roll < SKIN_COLORS.length) col = SKIN_COLORS[roll];
            }
            if (col !== null) {
                let already = !!gState.skins[col];
                gState.skins[col] = true;
                gState.skinPity = already ? pity + 1 : 0;
                saveProgress();
                blazeFlash(already ? '重复了，这个颜色已经有了' : '抽到新颜色！');
            } else {
                gState.skinPity = pity + 1;
                saveProgress();
                blazeFlash('谢谢参与');
            }
            shopTab('skin');
        }
        function shopEquipSkin(col) {
            if (col !== null && !(gState.skins && gState.skins[col])) return;
            gState.skinColor = col;
            saveProgress();
            shopTab('skin');
        }
        function shopSkinHtml() {
            // 保底规则不写出来（不告诉玩家有保底），只说抽什么、管什么
            let out = '<div style="font-size:12px; color:#888; margin-bottom:8px; text-align:left;">' +
                '随机抽一个身体颜色，也可能谢谢参与。只是好看，不加属性；分队伍颜色的模式里不显示。</div>' +
                '<button onclick="skinDraw()" style="width:100%; margin:0 0 10px; background:#e6a23c; color:#fff; border:none; padding:9px 0; font-size:14px;">抽一次（' + SKIN_PRICE + ' 猫盾币）</button>' +
                '<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px;">';
            SKIN_COLORS.forEach(function (col) {
                let owned = !!(gState.skins && gState.skins[col]);
                let on = gState.skinColor === col;
                let hex = '#' + col.toString(16).padStart(6, '0');
                out += '<div onclick="' + (owned ? 'shopEquipSkin(' + col + ')' : '') + '" style="cursor:' + (owned ? 'pointer' : 'default') + '; aspect-ratio:1; border-radius:8px; background:' + hex +
                    '; opacity:' + (owned ? '1' : '0.25') + '; border:3px solid ' + (on ? '#333' : 'transparent') + '; display:flex; align-items:flex-end; justify-content:center;">' +
                    (owned ? '' : '<span style="font-size:10px; color:#fff; background:rgba(0,0,0,.4); border-radius:3px; padding:0 3px;">未解锁</span>') + '</div>';
            });
            out += '</div>' +
                (gState.skinColor !== null ? '<button onclick="shopEquipSkin(null)" style="width:100%; margin-top:10px; background:#999; color:#fff; border:none; font-size:12px; padding:6px 0;">换回默认颜色</button>' : '');
            out += '<div style="margin-top:16px; padding-top:12px; border-top:1px solid #eee; text-align:left;">' +
                '<div style="font-size:13px; color:#555; font-weight:bold; margin-bottom:4px;">配饰 · 自由 DIY</div>' +
                '<div style="font-size:11px; color:#888; margin-bottom:8px;">买了就一直有，头饰和腰饰随便搭，别人也看得到。</div>';
            ['head', 'waist'].forEach(function (slot) {
                out += '<div style="font-size:12px; color:#666; margin:8px 0 4px;">' + ACC_SLOT_NAME[slot] + '</div>' +
                    '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">';
                ACCESSORY_DEFS[slot].forEach(function (a) {
                    let owned = !!(gState.ownedAcc && gState.ownedAcc[a.id]);
                    let on = gState.acc && gState.acc[slot] === a.id;
                    out += '<button onclick="accBuy(\'' + slot + '\',\'' + a.id + '\')" style="margin:0; font-size:11px; padding:8px 2px; background:' +
                        (on ? '#5cb85c' : (owned ? '#eceff1' : '#fff')) + '; color:' + (on ? '#fff' : '#555') + '; border:1px solid ' + (on ? '#4a9c4a' : '#ddd') + ';">' +
                        a.n + '<br>' + (owned ? (on ? '已装备' : '点击装备') : (a.price + ' 猫盾币')) + '</button>';
                });
                out += '</div>';
            });
            out += '</div>';
            return out;
        }
        // 猫盾脸——两个水平对齐的圆点眼睛 + 一个椭圆嘴巴，中间一条竖直线分两半，
        // 右半边涂实。贴图只画一次缓存起来，所有猫盾角色共用同一张。
        let catFaceTex = null;
        function catFaceTexture() {
            if (catFaceTex) return catFaceTex;
            let cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
            drawCatFace(cv.getContext('2d'));
            catFaceTex = new THREE.CanvasTexture(cv);
            return catFaceTex;
        }
        // 身体上贴哪张脸：每种表情一张贴图，缓存起来大家共用
        let faceTexCache = {};
        function faceTexFor(k) {
            if (!k || !SHOP_FACES[k] || SHOP_FACES[k].special === 'cat') return catFaceTexture();
            if (!faceTexCache[k]) faceTexCache[k] = makeFaceTexture(k);
            return faceTexCache[k];
        }
        function myFace() { return shopState().face || 'cat'; }
        function peerFaceOf(id) { let p = roomPeers[id]; return (p && p.face) || 'cat'; }
        function drawCatFace(g2) {
            g2.fillStyle = '#222';
            g2.beginPath(); g2.arc(22, 19, 2.6, 0, Math.PI * 2); g2.fill();
            g2.beginPath(); g2.arc(41, 19, 2.6, 0, Math.PI * 2); g2.fill();
            let cx = 31, cy = 36, rx = 15, ry = 9;
            // 右半边涂实：裁切到右半边区域再填椭圆，左半边保持空心
            g2.save();
            g2.beginPath(); g2.rect(cx, cy - ry - 2, rx + 2, (ry + 2) * 2); g2.clip();
            g2.beginPath(); g2.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g2.fill();
            g2.restore();
            g2.strokeStyle = '#222'; g2.lineWidth = 3; g2.lineCap = 'round';
            g2.beginPath(); g2.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g2.stroke();
            g2.beginPath(); g2.moveTo(cx, cy - ry); g2.lineTo(cx, cy + ry); g2.stroke();
        }
        // 脸贴在身体正面（+Z，跟 faceDir 的朝向公式对上），是个普通 Mesh 不是 Sprite——
        // 要跟着身体一起转向移动方向，不能像宠物表情那样永远正对镜头。
        function addCatFace(g, y, z, faceKey) {
            let face = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2),
                new THREE.MeshBasicMaterial({ map: faceTexFor(faceKey), transparent: true, depthWrite: false }));
            face.position.set(0, y, z); g.add(face);
        }
        // "星星"配饰要的是头顶几颗真正的五角星，绕中心缓慢旋转——不是静态摆几个
        // 尖角，也不只是一团光晕。贴图画成实心五角星（10 个点，外/内半径交替连线）
        // 再垫一层柔光晕，兼顾"星形"和"发光"；旋转靠 g.userData.accStarOrbit 挂出去，
        // 由各个模式自己的每帧 tick 调 tickAccStarOrbit() 转（跟腿部摆动动画一个套路，
        // 都是 tick 里按 dt 更新 userData 上的东西，不是配饰自己会转）。
        let star5Tex = null;
        function star5Texture() {
            if (star5Tex) return star5Tex;
            let cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
            let g2 = cv.getContext('2d');
            let cx = 32, cy = 32;
            let glow = g2.createRadialGradient(cx, cy, 0, cx, cy, 30);
            glow.addColorStop(0, 'rgba(255,235,130,0.9)');
            glow.addColorStop(0.5, 'rgba(255,213,79,0.35)');
            glow.addColorStop(1, 'rgba(255,213,79,0)');
            g2.fillStyle = glow; g2.fillRect(0, 0, 64, 64);
            g2.save(); g2.translate(cx, cy);
            g2.beginPath();
            let outerR = 22, innerR = 9;
            for (let i = 0; i < 10; i++) {
                let r = (i % 2 === 0) ? outerR : innerR;
                let ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
                let px = Math.cos(ang) * r, py = Math.sin(ang) * r;
                if (i === 0) g2.moveTo(px, py); else g2.lineTo(px, py);
            }
            g2.closePath();
            g2.fillStyle = '#ffd740';
            g2.fill();
            g2.strokeStyle = 'rgba(255,255,255,0.85)'; g2.lineWidth = 1.5; g2.stroke();
            g2.restore();
            star5Tex = new THREE.CanvasTexture(cv);
            return star5Tex;
        }
        const ACC_STAR_SPIN = 0.9;   // 弧度/秒——"缓慢旋转"，转一圈大概 7 秒
        function tickAccStarOrbit(u, dt) {
            if (u && u.accStarOrbit) u.accStarOrbit.rotation.y += dt * ACC_STAR_SPIN;
        }
        // 配饰渲染：acc 是调用方传进来的 {head, waist} 数据（本人传 gState.acc，联机对面
        // 真人传 peerAccOf(id) 从房间心跳里查来的，AI/路人传 aiRandomAcc() 随机抽的，都不传
        // 就是没配饰）——不读全局 gState.acc，这样同一份代码才能既画自己也画别人。
        // 固定配色（不跟随皮肤色），挂在 addCatFace 定的脸高度/朝向坐标系上，
        // 两种身体（raceMakeBody 的方盒子/cakeMakeBody 的圆柱）分别传各自的高度参数就行。
        function addAccHead(g, id, hatY, faceY, faceZ) {
            if (id === 'cap' || id === 'party' || id === 'crown' || id === 'star') {
                let grp = new THREE.Group(); grp.position.y = hatY;
                if (id === 'cap') {
                    // 真要"遮住耳朵"，靠调大小/位置去刚好包住两只圆锥耳朵太碰运气——
                    // 直接把耳朵网格藏起来最可靠，跟戴帽子压住耳朵的实际效果一样。
                    // 耳朵一藏，帽子就能放心往下放（更贴近头顶原本的位置），不用再
                    // 为了不穿模而故意往上抬一截。
                    if (g.userData.ears) g.userData.ears.forEach(function (e) { e.visible = false; });
                    let mat = new THREE.MeshLambertMaterial({ color: 0xe53935 });
                    let top = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
                    top.position.y = -0.7; grp.add(top);
                    let brim = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 10), mat);
                    brim.position.set(0, -0.75, 1.9); brim.rotation.x = 0.2; grp.add(brim);
                } else if (id === 'party') {
                    let mat = new THREE.MeshLambertMaterial({ color: 0xab47bc });
                    let cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.2, 10), mat);
                    cone.position.y = 1.4; grp.add(cone);
                    let pom = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), new THREE.MeshLambertMaterial({ color: 0xffeb3b }));
                    pom.position.y = 3.1; grp.add(pom);
                } else if (id === 'crown') {
                    let mat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
                    let band = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 1.0, 8), mat);
                    grp.add(band);
                    for (let i = 0; i < 5; i++) {
                        let spike = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), mat);
                        let ang = (i / 5) * Math.PI * 2;
                        spike.position.set(Math.cos(ang) * 1.8, 1.0, Math.sin(ang) * 1.8);
                        grp.add(spike);
                    }
                } else if (id === 'star') {
                    let mat = new THREE.SpriteMaterial({ map: star5Texture(), transparent: true, depthWrite: false });
                    let orbit = new THREE.Group(); orbit.position.y = 1.3;
                    let n = 3, r = 1.7;
                    for (let i = 0; i < n; i++) {
                        let spr = new THREE.Sprite(mat);
                        spr.scale.set(1.3, 1.3, 1);
                        let ang = (i / n) * Math.PI * 2;
                        spr.position.set(Math.cos(ang) * r, Math.sin(ang * 2) * 0.4, Math.sin(ang) * r);
                        orbit.add(spr);
                    }
                    grp.add(orbit);
                    g.userData.accStarOrbit = orbit;
                }
                g.add(grp);
            } else if (id === 'glasses' || id === 'shades') {
                // 眼镜要跟脸贴图上画的那两个黑眼珠对上，不能瞎猜位置——catFaceTexture()
                // 里眼珠画在 64x64 画布的 (22,19)/(41,19)，换算到 addCatFace 那张 4.2x4.2
                // 的脸片上：x = -2.1+(px/64)*4.2，y = faceY+2.1-(py/64)*4.2，算出来大概是
                // x=∓0.62，y=faceY+0.85——眼镜挂这两个点上才是真的"对着眼睛"。
                let ex = 0.62, ey = faceY + 0.85, ez = faceZ + 0.15;
                let mat = new THREE.MeshBasicMaterial({ color: id === 'shades' ? 0x111111 : 0x333333 });
                if (id === 'shades') {
                    [-1, 1].forEach(function (sdir) {
                        let lens = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.6, 0.2), mat);
                        lens.position.set(sdir * ex, ey, ez); g.add(lens);
                    });
                    let bridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.15), mat);
                    bridge.position.set(0, ey, ez); g.add(bridge);
                } else {
                    [-1, 1].forEach(function (sdir) {
                        let ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 6, 12), mat);
                        ring.position.set(sdir * ex, ey, ez); g.add(ring);
                    });
                    let bridge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), mat);
                    bridge.position.set(0, ey, ez); g.add(bridge);
                }
            }
        }
        // 挂饰跟身体之间拉一根细绳/带子，从身体表面接到挂饰上——不然光是把挂饰摆
        // 在旁边，就算不嵌进身体，看着也是凭空飘在半空，不像"挂"在身上。绳子用
        // 两点算长度和朝向（quaternion 对齐默认竖直的圆柱），两头一头贴身体表面、
        // 一头接到挂饰，视觉上才读得出"真的挂着"。
        function addAccStrap(g, from, to, mat) {
            let dir = new THREE.Vector3().subVectors(to, from);
            let len = dir.length();
            if (len < 0.05) return;
            let mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
            let strap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 6), mat);
            strap.position.copy(mid);
            strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
            g.add(strap);
        }
        // 小鱼干挂件的贴图直接复用商店猫盾币图标那张 SVG（同一份形状数据，见
        // coinIconShapesSvg），保证挂件和图标长得一模一样。
        let fishAccTex = null;
        function fishAccTexture() {
            if (fishAccTex) return fishAccTex;
            let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 20 20">' +
                coinIconShapesSvg() + '</svg>';
            fishAccTex = new THREE.TextureLoader().load('data:image/svg+xml;base64,' + btoa(svg));
            // CylinderGeometry 圆片面的 UV 展开跟贴图的 X/Y 轴对不上，直接贴上去鱼是
            // 竖着的（头上尾下）——用 texture.rotation 转 90° 摆正，跟商店图标一致。
            fishAccTex.center.set(0.5, 0.5);
            fishAccTex.rotation = Math.PI / 2;
            return fishAccTex;
        }
        function addAccWaist(g, id, y, z) {
            // 挂在身体侧面时人物从正面看基本看不清（侧面贴身体那面被自己的宽度挡住
            // 大半），改成挂在正面——猫脸所在那一面（z 用 addCatFace 同一个
            // faceZ）。反馈进一步要求别摆在正中间，挪到身体右下角——是角色自己身
            // 体的左侧（腰部左侧），正对镜头看起来在画面右边、偏下，更像是挂在胯
            // 侧而不是贴在肚脐眼上。每件挂饰用自己的深度半径顶到正面，不留空隙也
            // 不嵌进身体。
            let hy = y - 1.1;
            let hipX = 1.5;
            let strapMat = new THREE.MeshBasicMaterial({ color: 0x6d4c41 });
            let strapFrom = new THREE.Vector3(hipX, hy + 0.55, z);
            if (id === 'fish') {
                // 小鱼干形状改成跟猫盾币挂件一样——同样的圆片形状，正反两面贴猫盾币
                // 图标那张贴图（金色圆底 + 小鱼干图案），侧边缘还是素色金边。
                let hz = z + 0.1;
                let rim = new THREE.MeshLambertMaterial({ color: 0xe0a233 });
                let face = new THREE.MeshBasicMaterial({ map: fishAccTexture(), transparent: true });
                let fish = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 14), [rim, face, face]);
                fish.rotation.x = Math.PI / 2; fish.position.set(hipX, hy, hz); g.add(fish);
                addAccStrap(g, strapFrom, new THREE.Vector3(hipX, hy + 0.55, hz), strapMat);
            } else if (id === 'coin') {
                let hz = z + 0.1;
                let mat = new THREE.MeshLambertMaterial({ color: 0xffd54f });
                let coin = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 14), mat);
                coin.rotation.x = Math.PI / 2; coin.position.set(hipX, hy, hz); g.add(coin);
                addAccStrap(g, strapFrom, new THREE.Vector3(hipX, hy + 0.55, hz), strapMat);
            } else if (id === 'bell') {
                let hz = z + 0.55;
                let mat = new THREE.MeshLambertMaterial({ color: 0xffca28 });
                let bell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mat);
                bell.position.set(hipX, hy, hz); g.add(bell);
                let slit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), new THREE.MeshBasicMaterial({ color: 0x5d4037 }));
                slit.position.set(hipX, hy - 0.15, hz + 0.5); g.add(slit);
                addAccStrap(g, strapFrom, new THREE.Vector3(hipX, hy + 0.45, hz), strapMat);
            } else if (id === 'yarn') {
                let hz = z + 0.9;
                let mat = new THREE.MeshLambertMaterial({ color: 0xef5350 });
                let ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mat);
                ball.position.set(hipX, hy, hz); g.add(ball);
                let strMat = new THREE.MeshBasicMaterial({ color: 0xffcdd2 });
                [0, Math.PI / 3, -Math.PI / 3].forEach(function (rot) {
                    let strand = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 4, 12), strMat);
                    strand.rotation.set(Math.PI / 2, 0, rot); strand.position.copy(ball.position); g.add(strand);
                });
                addAccStrap(g, strapFrom, new THREE.Vector3(hipX, hy + 0.7, hz), strapMat);
            }
        }
        function addAccessories(g, faceY, faceZ, hatY, waistY, acc) {
            if (!acc) return;
            if (acc.head) addAccHead(g, acc.head, hatY, faceY, faceZ);
            if (acc.waist) addAccWaist(g, acc.waist, waistY, faceZ);
        }
        function raceMakeBody(col, handRange, hideRing, acc, faceKey) {
            let g = new THREE.Group();
            let mat = new THREE.MeshLambertMaterial({ color: col });
            let body = new THREE.Mesh(new THREE.BoxGeometry(6, 11, 4), mat);
            body.position.y = 5.5; g.add(body);
            addCatFace(g, 8, 2.02, faceKey);
            // 身体半宽 3，耳朵半径 1.6，偏移收到 1.2 避免外沿(2.8)超出身体边缘（大厅/竞速/
            // 监狱救援/躲避球全用这个身体，之前 1.8 的偏移会让耳朵支棱到身体外面去）。
            let earGeo = new THREE.ConeGeometry(1.6, 3.4, 8);
            let ears = [];
            [-1, 1].forEach(function (sdir) {
                let ear = new THREE.Mesh(earGeo, mat);
                ear.position.set(sdir * 1.2, 12.5, 0); g.add(ear); ears.push(ear);
            });
            g.userData.ears = ears;
            let legs = [];
            [-1, 1].forEach(function (sdir) {
                let hip = new THREE.Group();
                hip.position.set(sdir * 1.7, 3.2, 0);
                let leg = new THREE.Mesh(new THREE.BoxGeometry(2, 3.6, 2), mat);
                leg.position.y = -1.6; hip.add(leg);
                g.add(hip); legs.push(hip);
            });
            g.userData.legs = legs;
            g.userData.body = body;
            // 手臂：肩膀是个可以转的枢轴，跑步甩、抓东西/扔东西/接东西也靠转它——
            // 「所有动作都要有动画」，这两条胳膊是最基础的载体。
            // 改成短短一截、紧贴身体，不再是伸得老远的细长方块（跟松饼大作战那版一个思路）。
            let arms = [];
            [-1, 1].forEach(function (sdir) {
                let shoulder = new THREE.Group();
                shoulder.position.set(sdir * 3.1, 9.1, 0);
                // 手臂那截长方体删掉了，直接从肩膀伸出爪子——半圆片，直径贴着肩膀。
                let hand = new THREE.Mesh(new THREE.CircleGeometry(1.0, 12, 0, Math.PI),
                    new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide }));
                hand.position.y = -1.0; hand.rotation.z = Math.PI; shoulder.add(hand);
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
            if (acc) addAccessories(g, 8, 2.02, 12.9, 4.2, acc);
            return g;
        }

        // 抓/扔/接的手势：frac 从 1（刚触发）线性衰减到 0（播完），
        // 拿 sin 包一层做成「伸出去再收回来」的一次性摆动，不用单独管状态机。
        function bodyGesture(u, kind, frac) {
            if (!u || !u.arms || frac <= 0) { if (u && u.arms) { u.arms[0].rotation.x = 0; u.arms[1].rotation.x = 0; } return; }
            let swing = Math.sin((1 - frac) * Math.PI);
            if (kind === 'throw') {
                u.arms[1].rotation.x = -swing * 2.2;
                u.arms[0].rotation.x = -swing * 0.4;
            } else {
                // 捡 / 接：双手一起往前伸
                u.arms[0].rotation.x = -swing * 1.7;
                u.arms[1].rotation.x = -swing * 1.7;
            }
        }

        // 双人模式下队友共用一个颜色，好在混战里一眼认出自己人
        function raceRecolorRacer(r, hex) {
            r.col = hex;
            if (r.mesh.userData.body) r.mesh.userData.body.material.color.setHex(hex);
            if (r.mesh.userData.ring) r.mesh.userData.ring.material.color.setHex(hex);
        }
        function raceTeammateOf(r) {
            if (!race.duo || r.teamIdx === undefined) return null;
            let team = race.teams[r.teamIdx];
            let otherIdx = (team[0] === r.idx) ? team[1] : team[0];
            return race.racers[otherIdx];
        }

        function raceMakeRacer(i, isPlayer, key, netId) {
            let col = isPlayer ? mySkinColor(RACE_COLORS[i % RACE_COLORS.length]) : (netId ? RACE_COLORS[i % RACE_COLORS.length] : aiSkinColor(RACE_COLORS[i % RACE_COLORS.length]));
            let acc = isPlayer ? gState.acc : (netId ? peerAccOf(netId) : aiRandomAcc());
            let mesh = raceMakeBody(col, null, false, acc, isPlayer ? myFace() : (netId ? peerFaceOf(netId) : aiRandomFace()));
            scene.add(mesh);
            return {
                idx: i, isPlayer: isPlayer, key: key,
                name: isPlayer ? (dispName(gState.id) || '你') : '猫盾' + (i + 1), col: col,
                p: new THREE.Vector3(0, 4, 0), vel: new THREE.Vector3(),
                onGround: false, mesh: mesh, cp: 0, best: 0,
                dashCd: 0, dashT: 0, stunT: 0, respawnT: 0,
                finished: false, time: 0, out: false, place: 0,
                animT: 0, boostT: 0, item: null,
                aiLane: (Math.random() - 0.5) * RACE.width * 0.5, aiT: 0
            };
        }

        function raceLineUp() {
            let alive = race.racers.filter(function (r) { return !r.out; });
            alive.forEach(function (r, i) {
                let col = i % 6, row = Math.floor(i / 6);
                r.p.set((col - 2.5) * RACE.spawnGap * 1.4, 4, -TILE * 4 - row * RACE.spawnGap);
                r.vel.set(0, 0, 0);
                r.onGround = false; r.cp = 0; r.finished = false; r.time = 0;
                r.dashCd = 0; r.dashT = 0; r.stunT = 0; r.respawnT = 0; r.place = 0;
                r.jumpBuf = 0; r.dashBuf = 0; r.coyote = 0;
                r.skillCd = 0; r.smallT = 0; r.item = null; r.charm = 0; r.springLeft = 0;
                r.gooT = 0; r.bigDash = 0; r.invulT = 0; r.boostT = 0;
                if (raceEv('gift')) r.item = raceRollItem();   // 开局礼包
                r.mesh.visible = true;
            });
        }

        // ── 惯性移动 ──
        // 竞速的手感一半在这儿：不是按下就满速、松手就停，而是加速到满速要 0.2 秒、
        // 松手滑停 0.3 秒，空中只有四成操控力。急转会甩出去，窄桥上得提前减速。
        function raceMove(r, wishX, wishZ, dt) {
            let sp = raceSpeedOf(r) * (r.boostT > 0 ? 1.7 : 1) * (r.gooT > 0 ? 0.6 : 1);
            let wish = new THREE.Vector3(wishX, 0, wishZ);
            if (wish.lengthSq() > 1) wish.normalize();
            wish.multiplyScalar(sp);
            let rate = (wish.lengthSq() > 0.01 ? 1 / raceAccelOf(r) : 1 / raceBrakeOf(r)) * (r.onGround ? 1 : raceAirOf(r));
            let k = Math.min(1, rate * dt);
            r.vel.x += (wish.x - r.vel.x) * k;
            r.vel.z += (wish.z - r.vel.z) * k;
        }

        // 返回值表示这一下到底跳出去没有 —— 缓冲要靠它决定清不清
        function raceJump(r) {
            if (r.stunT > 0) return false;
            if (!r.onGround && !(r.coyote > 0)) return false;
            r.coyote = 0;
            let k = 1;
            if (r.springLeft > 0) { k = 1.6; r.springLeft--; }
            r.vel.y = raceJumpOf(r) * k; r.onGround = false;
            return true;
        }

        function raceDash(r) {
            if ((r.dashCd > 0 && !RACE_TEST_NO_CD) || r.stunT > 0) return false;
            let d = new THREE.Vector3(r.vel.x, 0, r.vel.z);
            if (d.lengthSq() < 1) d.set(0, 0, 1);
            d.normalize().multiplyScalar(RACE.dashV * (r.bigDash ? 2 : 1));
            r.bigDash = 0;
            r.vel.x = d.x; r.vel.z = d.z;
            r.dashCd = RACE_TEST_NO_CD ? 0 : raceDashCdOf(r); r.dashT = RACE.dashT;
            raceBurst(r.p.x, r.p.y, r.p.z, 0x80deea, 5, 12, 0.25);
            return true;
        }

        function raceKnock(r, dx, dz, power) {
            if (r.smallT > 0 || r.invulT > 0) return;    // 缩小或无敌期间谁也撞不动你
            power *= raceKnockOf(r);
            r.vel.x += dx * power; r.vel.z += dz * power; r.vel.y = Math.max(r.vel.y, 22);
            r.stunT = 0.4;
        }

        function raceRespawn(r) {
            let cp = race.checkpoints[Math.max(0, Math.min(race.checkpoints.length - 1, r.cp))];
            r.p.set(cp.x + (Math.random() - 0.5) * 10, cp.y + 8, cp.z);
            r.vel.set(0, 0, 0);
            r.respawnT = 0; r.stunT = 0; r.onGround = false;
            r.mesh.visible = true;
            raceBurst(r.p.x, r.p.y, r.p.z, 0xffffff, 6, 16, 0.4);
        }

        function raceTickRacer(r, dt) {
            if (r.finished || r.out) return;

            // 联机里别人的真身：不在本机模拟物理（没有对方的按键输入），
            // 只朝网络位置平滑靠过去；这具身体的终点判定/淘汰都由对方自己那台机器
            // 检测后广播过来（raceOnFinish），不靠这具本地假身体自己撞线。
            if (r.netId && r.netId !== gState.id) {
                if (r.target) {
                    let dx = r.target.x - r.p.x, dy = (r.target.y || 0) - r.p.y, dz = r.target.z - r.p.z;
                    let k = Math.min(1, dt * 12);
                    // 合成一个"速度"喂给外层的走路动画/朝向计算（外层是按 r.vel 算腿摆动和转身的），
                    // 不然联机对手的身体会看起来在原地滑步，不会转身、也不会摆手摆腿。
                    r.vel.set(dx * k / dt, dy * k / dt, dz * k / dt);
                    r.p.x += dx * k; r.p.y += dy * k; r.p.z += dz * k;
                }
                return;
            }

            if (r.respawnT > 0) {
                r.respawnT -= dt;
                r.mesh.visible = false;
                if (r.respawnT <= 0) raceRespawn(r);
                return;
            }
            if (r.dashCd > 0) r.dashCd -= dt;
            if (r.skillCd > 0) r.skillCd -= dt;
            if (r.smallT > 0) r.smallT -= dt;
            if (r.gooT > 0) r.gooT -= dt;
            if (r.dashT > 0) r.dashT -= dt;
            if (r.stunT > 0) r.stunT -= dt;
            if (r.boostT > 0) r.boostT -= dt;
            if (r.jumpBuf > 0) r.jumpBuf -= dt;
            if (r.dashBuf > 0) r.dashBuf -= dt;
            if (r.coyote > 0) r.coyote -= dt;

            // 输入
            let wx = 0, wz = 0;
            if (r.isPlayer) {
                let dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
                let side = new THREE.Vector3(-dir.z, 0, dir.x);
                let f = 0, s = 0;
                if (keys['w']) f += 1; if (keys['s']) f -= 1;
                if (keys['a']) s -= 1; if (keys['d']) s += 1;
                if (f === 0 && s === 0) { f = -tMove.y; s = tMove.x; }
                wx = dir.x * f + side.x * s; wz = dir.z * f + side.z * s;
                // 按下只负责记一笔，能不能放出去交给下面每帧重试
                if (keys[' '] || touchBtn.jump) { r.jumpBuf = 0.16; keys[' '] = false; touchBtn.jump = false; }
                if (keys['shift'] || touchBtn.ability) { r.dashBuf = 0.16; keys['shift'] = false; touchBtn.ability = false; }
                if (r.jumpBuf > 0 && raceJump(r)) r.jumpBuf = 0;
                if (r.dashBuf > 0 && raceDash(r)) r.dashBuf = 0;
                // 栏杆收起之前技能和道具都放不出来（按了也吃掉，不留到开跑那一刻自动放）
                if (keys['e'] || touchBtn.interact) { if (race.phase === 'run') raceSkill(r); keys['e'] = false; touchBtn.interact = false; }
                if (keys['q'] || touchBtn.item) { if (race.phase === 'run') raceUseItem(r); keys['q'] = false; touchBtn.item = false; }
            } else {
                raceAi(r, dt);
                wx = r.aiWx || 0; wz = r.aiWz || 0;
            }
            if (r.stunT > 0) { wx = 0; wz = 0; }
            if (r.dashT <= 0) raceMove(r, wx, wz, dt);

            // 重力 + 落点
            r.vel.y -= RACE.gravity * dt;
            r.p.x += r.vel.x * dt;
            r.p.z += r.vel.z * dt;
            r.p.y += r.vel.y * dt;
            if (race.phase === 'ready' && r.p.z > RACE.gateZ - 3) { r.p.z = RACE.gateZ - 3; if (r.vel.z > 0) r.vel.z = 0; }

            let hit = raceGroundAt(r.p);
            if (hit) {
                let top = hit.object.userData.raceTop !== undefined
                    ? hit.object.userData.raceTop : hit.point.y;
                if (r.p.y <= top + 0.6 && r.vel.y <= 0) {
                    r.p.y = top; r.vel.y = 0;
                    if (!r.onGround) raceBurst(r.p.x, r.p.y, r.p.z, 0xcfd8dc, 4, 9, 0.2);
                    r.onGround = true;
                    raceOnStand(r, hit.object);
                    r.coyote = 0;
                } else { if (r.onGround) r.coyote = 0.11; r.onGround = false; }
            } else { if (r.onGround) r.coyote = 0.11; r.onGround = false; }

            // 掉下去
            if (r.p.y < RACE.fallY) {
                if (r.charm) {   // 护身符：就地捞回来，还送 1.5 秒无敌
                    r.charm = 0;
                    r.p.y = 6; r.vel.set(0, 0, Math.max(0, r.vel.z));
                    let m = racePlat(r.p.x, 0, r.p.z, 22, 22, 0xffee58, { h: 2, emis: 0x8d6a00 });
                    race.savePads.push({ mesh: m, t: 3 });
                    r.invulT = 1.5;
                    raceBurst(r.p.x, r.p.y, r.p.z, 0xffee58, 7, 20, 0.45);
                    if (r.isPlayer) blazeFlash('护身符接住了你！');
                } else {
                    r.respawnT = raceRespawnOf(r);
                    if (r.isPlayer) blazeFlash('掉下去了 —— 回到检查点');
                }
            }
            if (r.invulT > 0) r.invulT -= dt;

            // 检查点：过一段就记一次，复位不会退回起点
            for (let i = race.checkpoints.length - 1; i > r.cp; i--) {
                if (r.p.z >= race.checkpoints[i].z) { r.cp = i; break; }
            }

            // 到终点
            if (r.p.z >= race.finishZ && !r.finished) {
                r.finished = true; r.time = race.clock;
                race.finishOrder.push(r);
                r.place = race.finishOrder.length;
                // 联机时我自己撞线得广播出去——对面那具"我"的假身体是靠网络位置摆着的，
                // 不会自己触发这段撞线判定，得靠这条消息让大家的本地状态都知道我冲线了。
                if (race.net && r.isPlayer) bc.postMessage({ type: 'RACE_FINISH', target: '*', sender: gState.id, time: r.time });
                if (r.isPlayer) { blazeFlash('第 ' + r.place + ' 名冲线！' + r.time.toFixed(2) + 's'); sfxChime(r.place <= 3 ? 4 : 2); }
                else if (race.finishOrder.length <= 3) blazeFlash(r.name + ' 第 ' + r.place + ' 名冲线');
                if (!r.isPlayer) {
                    let mate = raceTeammateOf(r);
                    if (race.duo && mate && mate.isPlayer) aiSay(r, r.name, 'finish', RACE_LINES.finishMate);
                    else if (r.place <= 3) aiSay(r, r.name, 'finish', RACE_LINES.finish);
                }
            }
        }

        // 踩到特殊平台
        function raceOnStand(r, obj) {
            let k = obj.userData.kind;
            if (k === 'bounce') { r.vel.y = RACE.jumpV * (obj.userData.power || 1.9); r.onGround = false; }
            else if (k === 'boost') { r.boostT = 1.2; }
            else if (k === 'goo') { r.gooT = 1.5; }
            else if (k === 'crumble' && obj.userData.fuse < 0 && !(obj.userData.calm > 0) && !raceEv('solid')) { obj.userData.fuse = 3.0; }
        }

        // ── AI ──
        // 沿赛道中线往前跑，带一点横向噪声；前面没地板就跳。
        function raceAi(r, dt) {
            r.aiT -= dt;
            if (r.aiT <= 0) { r.aiT = 0.5 + Math.random() * 0.7; r.aiJitter = (Math.random() - 0.5) * 10; }
            // 往前 18 探五条线，挑一条脚下有地板的走。
            // 原来它朝一个随机横向车道冲，碰上窄桥和 Z 字路整队掉下去。
            let best = r.p.x, bestSc = -1e9, anyNear = false;
            for (let i = -3; i <= 3; i++) {
                let x = r.p.x + i * 16;
                let g = raceGroundAt(new THREE.Vector3(x, r.p.y + 4, r.p.z + 18));
                if (g) anyNear = true;
                let sc = (g ? 100 : 0) - Math.abs(i) * 3 - Math.abs(x - (r.aiJitter || 0)) * 0.05;
                if (sc > bestSc) { bestSc = sc; best = x; }
            }
            // 近处一条线都没有 —— 说明面前是个缺口。看看 45 开外哪条线有落脚点，
            // 先横着挪过去再起跳，别直着跳进虚空。
            if (!anyNear) {
                let fx = null, fd = 1e9;
                for (let i = -3; i <= 3; i++) {
                    let x = r.p.x + i * 16;
                    if (!raceGroundAt(new THREE.Vector3(x, r.p.y + 4, r.p.z + 45))) continue;
                    if (Math.abs(i) < fd) { fd = Math.abs(i); fx = x; }
                }
                if (fx !== null) best = fx;
            }
            // 前面有闸口挡板：往空出来的那半边挪，挡板正对着自己就先站住等
            let hold = 0;
            for (let i = 0; i < race.sweeps.length; i++) {
                let s = race.sweeps[i], d = s.z - r.p.z;
                if (d < 0 || d > 46) continue;
                let bx = raceSweepX(s), lim = s.w / 2 + 8;
                let side = (bx > 0 ? -1 : 1) * (RACE.width * 0.34);   // 挡板在左就往右走
                best = side;
                if (Math.abs(r.p.x - bx) < lim && d < 16) hold = 1;
                break;
            }
            r.aiWx = Math.max(-1, Math.min(1, (best - r.p.x) / 10));
            r.aiWz = hold ? -0.15 : 1;
            // 前面近处和远处都没地板 → 该起跳了
            let near = raceGroundAt(new THREE.Vector3(best, r.p.y + 4, r.p.z + 5));
            let far = raceGroundAt(new THREE.Vector3(best, r.p.y + 4, r.p.z + 30));
            // 大缺口：先按冲刺再起跳。裸跳只飞 32，裂谷那种 36 的口子必须这么过。
            if (r.onGround && !near && Math.abs(best - r.p.x) < 8) {
                let wide = !raceGroundAt(new THREE.Vector3(best, r.p.y + 4, r.p.z + 26));
                if (wide && r.dashCd <= 0) raceDash(r);
                raceJump(r);
            }
            // 已经在空中、前面还是空的 —— 冲刺是唯一的救命手段
            if (!r.onGround && !far && r.vel.y < 6 && r.dashCd <= 0) raceDash(r);
            // 只在前面是宽路的时候冲 —— 窄桥和拐弯处冲刺就是直接飞出去
            // 冲刺冷却是 4 秒，按满速换算差不多 180 个单位。
            // 所以「前面一直到 140 都是实地」才允许拿冲刺提速 ——
            // 不然到了裂谷边上冲刺还在转，那一跳就是白跳。
            let wideAhead = raceGroundAt(new THREE.Vector3(r.p.x - 14, r.p.y + 4, r.p.z + 30)) &&
                raceGroundAt(new THREE.Vector3(r.p.x + 14, r.p.y + 4, r.p.z + 30)) &&
                [40, 90, 140].every(function (d) {
                    return raceGroundAt(new THREE.Vector3(r.p.x, r.p.y + 4, r.p.z + d));
                });
            if (wideAhead && Math.abs(r.aiWx) < 0.35 && r.onGround && r.dashCd <= 0 && Math.random() < dt * 0.6) raceDash(r);
            if (r.item && Math.random() < dt * 0.6) raceUseItem(r);
            // AI 也会放技能：二段跳专挑空中，其余的看见就用
            if (r.skillCd <= 0) {
                let def = raceSkillOf(r);
                if (def) {
                    if (def.id === 'dbljump') { if (!r.onGround && r.vel.y < 0 && !far) raceSkill(r); }
                    else if (def.id === 'bridge') { if (!r.onGround && r.vel.y < -20) raceSkill(r); }
                    else if (Math.random() < dt * 0.5) raceSkill(r);
                }
            }
        }

        // 闸口挡板当前挡住的 x 区间中心
        function raceSweepX(s) { return Math.sin(s.t * s.spd) * s.amp; }

        // ── 赛道机关 ──
        function raceTickTrack(dt) {
            race.sweeps.forEach(function (s) {
                s.t += dt;
                let bx = raceSweepX(s);
                s.mesh.position.x = bx;
                race.racers.forEach(function (r) {
                    if (r.out || r.finished || r.respawnT > 0 || r.stunT > 0) return;
                    // 之前这里写的是 12 —— 满速起跳顶多飞到 9 高，
                    // 这道判定线比任何人跳得到的高度都高，等于「怎么跳都过不去」。
                    // 挡板实际只有 6 高，跳过 7 就该算安全，留 1 点余量不用卡帧完美。
                    if (Math.abs(r.p.z - s.z) > 7 || r.p.y > 7) return;
                    if (Math.abs(r.p.x - bx) > s.w / 2 + 4) return;
                    // 被挡板推回去：往后掀一段，冲刺白冲，只能退回去重新等空档
                    raceKnock(r, (r.p.x < bx ? -1 : 1) * 0.5, -1, 50);
                    raceBurst(r.p.x, r.p.y, r.p.z, 0xef5350, 6, 14, 0.3);
                });
            });
            race.spinners.forEach(function (s) {
                s.a += s.spd * dt;
                s.mesh.rotation.y = s.a;
                race.racers.forEach(function (r) {
                    if (r.out || r.finished || r.respawnT > 0) return;
                    if (Math.abs(r.p.z - s.z) > 6) return;
                    // 转臂是一根长条，判定简化成「离中心一定距离 + 角度对得上」
                    let dx = r.p.x, dz = r.p.z - s.z;
                    let ang = Math.atan2(dz, dx);
                    let d = Math.hypot(dx, dz);
                    if (d > RACE.width * 0.8) return;
                    let diff = Math.abs(((ang - s.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
                    if (diff > 0.35 && Math.abs(diff - Math.PI) > 0.35) return;
                    if (r.stunT > 0) return;
                    let ux = -Math.sin(s.a), uz = Math.cos(s.a);
                    raceKnock(r, ux, uz, 70);
                    raceBurst(r.p.x, r.p.y, r.p.z, 0xff7043, 6, 14, 0.3);
                });
            });
            race.crumbles.forEach(function (m) {
                if (m.userData.calm > 0) m.userData.calm -= dt;
                // 已经塌下去了：等它长回来。
                // 这一段必须写在 fuse 判断前面 —— fuse 减到负数会被下面那句拦掉，
                // 之前就是这个顺序反了，塌掉的地板一辈子长不回来，人堆在入口全卡死。
                if (!m.visible) {
                    if (m.userData.back > 0) {
                        m.userData.back -= dt;
                        if (m.userData.back <= 0) {
                            m.visible = true;
                            m.userData.fuse = -1;
                            m.userData.calm = 1.2;   // 刚长回来这一会儿踩不塌，保证后面的人有窗口过
                            race.ground.push(m);
                        }
                    }
                    return;
                }
                if (m.userData.fuse < 0) return;
                m.userData.fuse -= dt;
                m.position.x = m.userData.home + (Math.random() - 0.5) * 1.2;   // 踩上去先抖一抖
                if (m.userData.fuse <= 0) {
                    m.visible = false;
                    m.position.x = m.userData.home;
                    m.userData.back = 1.0;
                    race.ground = race.ground.filter(function (g) { return g !== m; });
                }
            });
            race.savePads = (race.savePads || []).filter(function (q) {
                q.t -= dt;
                if (q.t > 0) return true;
                scene.remove(q.mesh);
                race.ground = race.ground.filter(function (g) { return g !== q.mesh; });
                return false;
            });
            race.lifts.forEach(function (l) {
                l.t += dt * l.spd;
                let y = Math.sin(l.t) * l.amp;
                l.mesh.position.y = y - 1.5;
                l.mesh.userData.raceTop = y;
            });
        }

        // 选手之间互相撞 —— 窄桥上把人挤下去是这个模式一半的乐趣
        function raceSeparate(dt) {
            let list = race.racers.filter(function (r) { return !r.out && !r.finished && r.respawnT <= 0; });
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    let a = list[i], b = list[j];
                    if (Math.abs(a.p.y - b.p.y) > 12) continue;
                    let dx = a.p.x - b.p.x, dz = a.p.z - b.p.z;
                    let d = Math.hypot(dx, dz);
                    if (d >= 12) continue;
                    if (d < 0.01) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = 1; }
                    let rad = (raceRadiusOf(a) + raceRadiusOf(b)) / 2;
                    if (d >= rad) continue;
                    let nx = dx / d, nz = dz / d;   // 分离方向：从 b 指向 a

                    // 肩并肩同向跑不算撞——两人是不是在真的互相靠近，看相对速度
                    // 在分离方向上的分量。同向平跑这个分量接近 0，压根不该有任何反应；
                    // 只有真的一头撞上（分量明显为正）才处理，不然人挤在一起会一直被
                    // 物理判定推来推去，跟真实走路的感觉完全不一样。
                    let rvx = a.vel.x - b.vel.x, rvz = a.vel.z - b.vel.z;
                    let closing = -(rvx * nx + rvz * nz);
                    if (closing <= 4) continue;

                    // 真撞上了：不弹飞，改成「挤」——把两人当前速度做向量加法，
                    // 合成一个方向，两人一起被推着往那边趔趄一小步，力度封顶在走路速度，
                    // 只是这一帧的位移，不会像冲刺撞人那样把人打飞出去。
                    let sx = a.vel.x + b.vel.x, sz = a.vel.z + b.vel.z;
                    let sLen = Math.hypot(sx, sz);
                    if (sLen > 0.01) {
                        let shove = Math.min(RACE.moveSpeed, sLen) * dt * 0.5;
                        let ox = sx / sLen * shove, oz = sz / sLen * shove;
                        a.p.x += ox; a.p.z += oz;
                        b.p.x += ox; b.p.z += oz;
                    }
                    // 位置上也稍微拉开一点，别让两人死死嵌在一起
                    let push = (rad - d) * 0.3;
                    a.p.x += nx * push; a.p.z += nz * push;
                    b.p.x -= nx * push; b.p.z -= nz * push;
                }
            }
        }

        // ── 一轮的流程：选卡(暂缺) → 3 秒准备 → 跑 → 结算淘汰 ──
        // 联机时赛道是随机拼的，各自摇一次就会摇出不一样的赛道——非房主这一轮不自己
        // 摇，等房主摇完广播（RACE_ROUND）再照着建，两边看到的赛道保证一样。
        function raceStartRound() {
            let idx = race.round;
            if (race.net && race.host !== gState.id) {
                race.phase = 'waitRound';   // 等 raceOnRound 收到房主这一轮的赛道数据
                return;
            }
            let segLenArr = race.duo ? RACE_DUO.segLen : RACE.segLen;
            let eventId = race.round === 0 ? 'none'
                : RACE_EVENTS[1 + Math.floor(Math.random() * (RACE_EVENTS.length - 1))].id;
            raceBuildTrack(segLenArr[Math.min(idx, segLenArr.length - 1)], null);
            if (race.net) bc.postMessage({ type: 'RACE_ROUND', target: '*', sender: gState.id, round: idx, segs: race.segs, event: eventId });
            raceApplyRoundCommon(eventId);
        }
        function raceOnRound(m) {
            if (!race || !race.net || race.host === gState.id) return;
            if (m.round !== race.round) return;   // 不是当前这一轮的广播（旧消息/顺序问题），忽略
            raceBuildTrack(0, m.segs);
            raceApplyRoundCommon(m.event);
        }
        function raceApplyRoundCommon(eventId) {
            race.event = eventId;
            raceLineUp();
            camera.rotation.set(-0.22, Math.PI, 0);   // 赛道往 +Z 铺，开局得面朝它，并且略微俯视
            race.finishOrder = [];
            race.clock = 0;
            // 每轮两件事：技能你自己三选一，buff 各人 70% 概率单独摇。
            // 两样都只管这一轮，下一轮重来。
            race.racers.forEach(function (r) {
                if (r.out) return;
                r.skill = null;
                raceDealBuff(r);
                if (r !== race.racers[0]) {
                    let d = raceDrawSkills();
                    if (d.length) raceGive(r, d[Math.floor(Math.random() * d.length)].id);
                }
            });
            // 开跑前 7 秒：栏杆拦着，可以走动往前挤位置、可以选技能，但技能/道具放不出来。
            // 原来是先弹一个挡住全屏的选牌框（10 秒，人不能动），选完再原地干等 3 秒。
            race.phase = 'ready';
            race.wait = RACE.readyT;
            raceGateBuild();
            raceGhostSetup();
            if (RACE_TEST_CARD) { raceGive(race.racers[0], RACE_TEST_CARD); race.draw = null; }   // 测试：直接发指定的那张
            else race.draw = raceDrawSkills();
            raceCardRender();
        }

        // 起跑栏杆：横在第一排前面，倒计时结束往上收起
        function raceGateBuild() {
            let g = new THREE.Group();
            let w = RACE.width * 1.6;
            for (let i = 0; i < 12; i++) {   // 红白相间的横杆
                let seg = new THREE.Mesh(new THREE.BoxGeometry(w / 12, 2.2, 2.2), raceMat(i % 2 ? 0xffffff : 0xe53935));
                seg.position.set(-w / 2 + (i + 0.5) * w / 12, 7, 0); g.add(seg);
            }
            [-1, 1].forEach(function (sd) {
                let post = new THREE.Mesh(new THREE.BoxGeometry(2.5, 10, 2.5), raceMat(0x37474f));
                post.position.set(sd * w / 2, 5, 0); g.add(post);
            });
            g.position.set(0, 0, RACE.gateZ);
            raceDeco(g);
            race.gate = g; race.gateUp = -1;
        }

        function raceCardRender() {
            let bar = document.getElementById('race-cardbar');
            if (!bar) return;
            let me = race.racers[0];
            if (!race.draw || race.phase !== 'ready' || me.out) { bar.style.display = 'none'; return; }
            let pad = padOn();
            bar.innerHTML = '<div style="font-size:12px; color:#ddd; margin-bottom:6px;">选个技能' + (pad ? '' : '（按 1 / 2 / 3）') + '，开跑前没选就随机</div>' +
                '<div style="display:flex; gap:6px; justify-content:center;">' +
                race.draw.map(function (c, i) {
                    return '<button onclick="racePick(\'' + c.id + '\')" style="margin:0; flex:1; min-width:0; max-width:170px; background:#fff; border:2px solid #7e57c2; border-radius:8px; padding:6px 6px; text-align:left; cursor:pointer;">' +
                        '<b style="color:#7e57c2; font-size:13px;">' + (pad ? '' : (i + 1) + ' ') + c.name + '</b>' +
                        '<div style="font-size:11px; color:#666; line-height:1.35; margin-top:2px;">' + c.desc + '</div></button>';
                }).join('') + '</div>';
            bar.style.display = 'block';
        }

        function racePick(id) {
            if (!race || race.phase !== 'ready' || !race.draw) return;
            raceGive(race.racers[0], id);
            race.draw = null;
            raceCardRender();
            let c = raceCardDef(id);
            if (c) blazeFlash('这轮用【' + c.name + '】');
        }

        // 开跑前把本轮的牌和事件一起亮出来
        function raceAnnounceEvent() {
            let ev = raceEventDef(race.event);
            let me = race.racers[0];
            let sk = raceCardDef(me.skill), bf = raceCardDef(me.buff);
            let line = '开跑！' + (sk ? '　【' + sk.name + '】' : '');
            if (sk) introOnce('race.skill', '技能', '这轮选的技能 ' + kTxt('按 <b>E</b> 或 <b>右键</b>', '点 <b>技能</b>') + ' 放，用完要等一会儿才能再放。');
            if (bf) line += '　+【' + bf.name + '】';
            if (ev && ev.id !== 'none') {
                line += '　' + '本轮：' + ev.name;
                introOnce('race.ev.' + ev.id, '本轮：' + ev.name, ev.desc);
            }
            blazeFlash(line);
        }

        function raceRoundOver() {
            race.phase = 'result';
            let alive = race.racers.filter(function (r) { return !r.out; });
            // 没冲线的按跑了多远排在冲线的后面
            let unfinished = alive.filter(function (r) { return !r.finished; })
                .sort(function (a, b) { return b.p.z - a.p.z; });
            let order = race.finishOrder.concat(unfinished);
            order.forEach(function (r, i) { r.place = i + 1; });

            let next = RACE.ladder[race.round + 1] || 1;
            let cut = order.slice(next);
            cut.forEach(function (r) { r.out = true; r.mesh.visible = false; });
            let isChampionRound = next <= 1 || race.round + 1 >= RACE.ladder.length;
            // 联机时房主是唯一算数的结果来源——各自本地摇的 AI 分身跑出来的名次可能不一样，
            // 只广播真人的淘汰名单，对面收到后照着标记，不用重新算一遍。
            if (race.net && race.host === gState.id) {
                bc.postMessage({
                    type: 'RACE_RESULT', target: '*', sender: gState.id, round: race.round,
                    outIds: cut.filter(function (r) { return r.netId; }).map(function (r) { return r.netId; }),
                    champion: isChampionRound
                });
            }

            // 记录：这一轮跑完的时间，按段数分栏
            let me = race.racers[0];
            if (me.finished) raceSubmitRecord(race.round + 1, me.time);

            let lines = order.slice(0, 8).map(function (r, i) {
                return (i + 1) + '. ' + r.name + (r.finished ? '　' + r.time.toFixed(2) + 's' : '　未完赛') +
                    (r === me ? '　← 你' : '') + (cut.indexOf(r) >= 0 ? '　<span style="color:#e57373;">淘汰</span>' : '');
            }).join('<br>');

            let title = '第 ' + (race.round + 1) + ' 轮结束';
            let btns = [{ label: '继续', color: '#5cb85c', onClick: function () { raceAfterResult(); } }];
            let champ = next <= 1 || race.round + 1 >= RACE.ladder.length;
            let justOut = me.out && !race.coinsDone;
            if (justOut || (champ && !race.coinsDone)) {   // 结算一次：前 4 名算赢
                race.coinsDone = true;
                coinsSettle('race', !me.out || me.place <= 4);
                lines += coinsLine();
            }
            if (champ) {
                title = me.out ? '冠军：' + order[0].name : '冠军';
                btns = [{ label: '返回大厅', color: '#5cb85c', onClick: function () { raceExit(); } }];
            } else if (justOut) {
                title = '你被淘汰了 · 第 ' + me.place + ' 名';
                // 淘汰了可以留下来看后面几轮，也可以直接走
                btns = [{ label: '留下观战', color: '#5cb85c', onClick: function () { race.watching = true; raceAfterResult(); } },
                        { label: '返回大厅', color: '#888', onClick: function () { raceExit(); } }];
            } else if (me.out) {
                btns.push({ label: '返回大厅', color: '#888', onClick: function () { raceExit(); } });
            }
            if (title === '冠军') sfxChime(4); else if (justOut) sfxBuzz();
            showSysModal(title, lines, btns);
        }

        function raceRoundOverDuo() {
            race.phase = 'result';
            let alive = race.racers.filter(function (r) { return !r.out; });
            let unfinished = alive.filter(function (r) { return !r.finished; })
                .sort(function (a, b) { return b.p.z - a.p.z; });
            let order = race.finishOrder.concat(unfinished);

            // 名次线性给分：跑在最前的拿满分（等于这轮总人数），最后一名拿 1 分
            let n = order.length;
            order.forEach(function (r, i) { r.roundScore = n - i; });

            let activeTeams = [];
            race.teams.forEach(function (team, ti) {
                if (team.some(function (idx) { return !race.racers[idx].out; })) activeTeams.push(ti);
            });
            let teamScore = {};
            activeTeams.forEach(function (ti) {
                teamScore[ti] = race.teams[ti].reduce(function (sum, idx) {
                    let r = race.racers[idx];
                    return sum + (r.out ? 0 : (r.roundScore || 0));
                }, 0);
            });

            let target = RACE_DUO.ladder[race.round + 1] || 1;
            let ranked = activeTeams.slice().sort(function (a, b) { return teamScore[a] - teamScore[b]; });   // 分低的在前
            let cutCount = Math.max(0, activeTeams.length - target);
            let cutTeams = ranked.slice(0, cutCount);
            cutTeams.forEach(function (ti) {
                race.teams[ti].forEach(function (idx) {
                    let r = race.racers[idx];
                    r.out = true; r.mesh.visible = false;
                });
            });
            let isChampionRound = target <= 1 || race.round + 1 >= RACE_DUO.ladder.length;
            // 跟 raceRoundOver() 的单排版一个道理：AI 的位置每边各跑各的、不联机同步，
            // 分数和淘汰名单只有房主这份数得数，广播出去，对面直接照抄，不自己重算——
            // 不然两边同一轮结果可能对不上号。
            if (race.net && race.host === gState.id) {
                bc.postMessage({
                    type: 'RACE_RESULT_DUO', target: '*', sender: gState.id, round: race.round,
                    teamScore: teamScore, cutTeams: cutTeams, champion: isChampionRound
                });
            }

            let me = race.racers[0];
            if (me.finished) raceSubmitRecord(race.round + 1, me.time);

            let lines = activeTeams.slice().sort(function (a, b) { return teamScore[b] - teamScore[a]; })
                .map(function (ti, i) {
                    let names = race.teams[ti].map(function (idx) { return race.racers[idx].name; }).join(' & ');
                    return (i + 1) + '. ' + names + '　' + teamScore[ti] + ' 分' +
                        (ti === me.teamIdx ? '　← 你' : '') +
                        (cutTeams.indexOf(ti) >= 0 ? '　<span style="color:#e57373;">淘汰</span>' : '');
                }).join('<br>');

            let title = '第 ' + (race.round + 1) + ' 轮结束';
            let btns = [{ label: '继续', color: '#5cb85c', onClick: function () { raceAfterResult(); } }];
            let champ = target <= 1 || race.round + 1 >= RACE_DUO.ladder.length;
            let justOut = me.out && !race.coinsDone;
            if (justOut || (champ && !race.coinsDone)) {
                race.coinsDone = true;
                coinsSettle('race', !me.out);
                lines += coinsLine();
            }
            if (champ) {
                title = me.out ? '冠军队伍出炉' : '冠军队伍';
                btns = [{ label: '返回大厅', color: '#5cb85c', onClick: function () { raceExit(); } }];
            } else if (justOut) {
                title = '你的队伍被淘汰了';
                btns = [{ label: '留下观战', color: '#5cb85c', onClick: function () { race.watching = true; raceAfterResult(); } },
                        { label: '返回大厅', color: '#888', onClick: function () { raceExit(); } }];
            } else if (me.out) {
                btns.push({ label: '返回大厅', color: '#888', onClick: function () { raceExit(); } });
            }
            showSysModal(title, lines, btns);
        }

        function raceAfterResult() {
            race.round++;
            let ladderLen = race.duo ? RACE_DUO.ladder.length : RACE.ladder.length;
            if (race.round >= ladderLen) { raceExit(); return; }
            raceStartRound();
        }

        // ── 记录榜 ──
        // 按段数分栏 —— 不然 4 段的决赛轮会把前 100 名全占了。
        function raceRecords() {
            if (!gState.raceRec) gState.raceRec = {};
            return gState.raceRec;
        }
        function raceSubmitRecord(roundN, t) {
            let all = raceRecords();
            let key = 'r' + roundN;
            let list = all[key] || (all[key] = raceSeedRecords(roundN));
            // 只留自己的最好成绩 —— 不然玩十把这一轮，榜单前十全是自己的名字，
            // 别人的成绩全被自己以前跑得慢的那几次挤下去了。
            let tt = +t.toFixed(2);
            let old = list.find(function (e) { return e.me; });
            if (old) {
                if (tt >= old.t) { saveProgress(); return; }   // 没破自己的纪录，不用重排
                list = list.filter(function (e) { return !e.me; });
            }
            list.push({ n: gState.id || '你', t: tt, me: 1, d: Date.now() });
            list.sort(function (a, b) { return a.t - b.t; });
            all[key] = list.slice(0, 100);
            saveProgress();
            let rank = all[key].findIndex(function (e) { return e.me; }) + 1;
            if (rank > 0 && rank <= 100) blazeFlash('进榜！第 ' + roundN + ' 轮第 ' + rank + ' 名');
        }
        // 预填 AI 记录，不然开服第一天榜是空的没法玩
        const RACE_AI_NAMES = ['猫步', '风筝', '老登', '一脚油', '慢半拍', '铁憨憨', '小碎步', '飞天鼠',
            '不落地', '踩点王', '橘子汽水', '夜航船', '半糖', '钉子户', '空中楼阁', '打滑',
            '三段跳', '拐弯抹角', '起飞', '稳住'];
        function raceSeedRecords(roundN) {
            let segN = RACE.segLen[Math.max(0, Math.min(RACE.segLen.length - 1, roundN - 1))];
            let base = segN * 11;   // 一段大约 11 秒
            let out = [];
            for (let i = 0; i < 60; i++) {
                let t = base * (0.82 + Math.pow(i / 60, 1.6) * 0.75) + Math.random() * 1.5;
                out.push({ n: RACE_AI_NAMES[i % RACE_AI_NAMES.length] + (i > 19 ? (Math.floor(i / 20) + 1) : ''), t: +t.toFixed(2) });
            }
            return out.sort(function (a, b) { return a.t - b.t; });
        }
        function raceBoardOpen(roundN) {
            race_boardSeg = roundN || 1;
            document.getElementById('race-board').classList.remove('hidden');
            raceBoardRender();
        }
        function raceBoardClose() { document.getElementById('race-board').classList.add('hidden'); }
        let race_boardSeg = 1;
        function raceBoardRender() {
            let all = raceRecords();
            let key = 'r' + race_boardSeg;
            if (!all[key]) { all[key] = raceSeedRecords(race_boardSeg); saveProgress(); }
            let list = all[key];
            let tabs = [1, 2, 3, 4, 5].map(function (n) {
                return '<button onclick="race_boardSeg=' + n + ';raceBoardRender()" style="margin:2px; padding:4px 10px; font-size:12px; ' +
                    'background:' + (n === race_boardSeg ? '#5e35b1' : '#eee') + '; color:' + (n === race_boardSeg ? '#fff' : '#666') + '; border:none;">' +
                    '第 ' + n + ' 轮</button>';
            }).join('');
            document.getElementById('race-board-body').innerHTML =
                '<div style="font-size:12px; color:#888; margin-bottom:6px;">单轮最快完赛时间 · ' +
                RACE.ladder[race_boardSeg - 1] + ' 人开跑，' + RACE.segLen[race_boardSeg - 1] + ' 段赛道</div>' +
                '<div style="margin-bottom:8px;">' + tabs + '</div>' +
                '<div style="max-height:52vh; overflow:auto;">' +
                list.slice(0, 100).map(function (e, i) {
                    return '<div style="display:flex; justify-content:space-between; padding:3px 8px; font-size:13px; border-radius:4px;' +
                        (e.me ? 'background:#fff3e0; font-weight:bold; color:#e65100;' : 'color:#555;') + '">' +
                        '<span>' + (i + 1) + '. ' + e.n + '</span><span>' + e.t.toFixed(2) + 's</span></div>';
                }).join('') + '</div>';
        }

        // 测试用：开跑之前在大厅里挑一张，整场每轮都发它。
        // 之所以放在大厅而不是局内的 T 面板：局内和轮间选卡共用同一个 showSysModal，
        // 在选卡阶段点它会把选卡弹窗顶掉，然后那一轮就卡住出不来了。
        function raceTestCardBtnSync() {
            let b = document.getElementById('race-testcard-btn');
            if (!b) return;
            let d = RACE_TEST_CARD ? raceCardDef(RACE_TEST_CARD) : null;
            b.innerText = '测试：自选牌（' + (d ? d.name : '随机') + '）';
            b.style.background = d ? '#7e57c2' : '#eceff1';
            b.style.color = d ? '#fff' : '#607d8b';
        }

        function raceTestPickCard() {
            if (race && !race.over) {
                showSysModal('竞速 · 自选牌', '开跑之前选 —— 先退出回大厅。', [{ label: '知道了' }]);
                return;
            }
            let btns = RACE_CARDS.map(function (c) {
                return {
                    label: c.name, color: c.kind === 'skill' ? '#7e57c2' : '#00897b',
                    onClick: function () { RACE_TEST_CARD = c.id; raceTestCardBtnSync(); }
                };
            });
            btns.push({ label: '恢复随机', color: '#888', onClick: function () { RACE_TEST_CARD = null; raceTestCardBtnSync(); } });
            showSysModal('竞速 · 自选牌（整场生效）',
                '<div style="font-size:12px; color:#888;">选定之后整场每轮都发这张，跳过三选一，方便单独调一个技能。</div>' +
                RACE_CARDS.map(function (c) {
                    return '<div style="margin:3px 0; font-size:12px; color:#666;"><b>' + c.name + '</b>　' + c.desc + '</div>';
                }).join(''), btns);
        }

        // ── 主循环 ──
        function raceLoopBody() {
            let now = performance.now();
            let dt = Math.min(0.05, (now - race.last) / 1000);
            race.last = now;
            raceNetTick(dt);

            if (race.phase === 'ready') {
                if (!(RACE_TEST_NO_PICK_TIMER && race.draw)) race.wait -= dt;
                // 栏杆后面可以走、可以跳、可以往前挤，但过不去（raceTickRacer 里卡住）
                race.racers.forEach(function (r) { raceTickRacer(r, dt); });
                raceSeparate(dt);
                if (race.wait <= 0) {
                    if (race.draw) { let pick = race.draw[Math.floor(Math.random() * race.draw.length)]; racePick(pick.id); }
                    race.phase = 'run';
                    race.gateUp = 0;
                    raceCardRender();
                    raceAnnounceEvent();
                }
            } else if (race.phase === 'run') {
                race.clock += dt;
                raceTickTrack(dt);
                raceBoxTick(dt);
                race.racers.forEach(function (r) { raceTickRacer(r, dt); });
                raceSeparate(dt);
                // 联机时只有房主判定"这一轮结束了没"——非房主自己那份 finishOrder 可能
                // 因为网络延迟不完整（对面的撞线消息还没到），提前判定会跟房主结果对不上。
                if (!race.net || race.host === gState.id) {
                    let alive = race.racers.filter(function (r) { return !r.out; });
                    if (race.duo) {
                        if (race.finishOrder.length >= alive.length || race.clock > RACE.roundLimit) raceRoundOverDuo();
                    } else {
                        let need = RACE.ladder[race.round + 1] || 1;
                        if (race.finishOrder.length >= Math.min(need, alive.length) || race.clock > RACE.roundLimit) raceRoundOver();
                    }
                }
            }

            raceFxTick(dt);
            if (race.gate && race.gateUp >= 0) {
                race.gateUp += dt * 2.5;
                race.gate.position.y = race.gateUp * 26;
                if (race.gateUp >= 1) { race.gate.visible = false; race.gateUp = -1; }
            }
            bgmTick();

            // 模型 + 相机
            race.racers.forEach(function (r) {
                r.mesh.position.set(r.p.x, r.p.y, r.p.z);
                let sp = Math.hypot(r.vel.x, r.vel.z);
                if (sp > 1) r.mesh.rotation.y = Math.atan2(r.vel.x, r.vel.z);
                r.animT = (r.animT || 0) + dt * (2 + Math.min(1, sp / RACE.moveSpeed) * 16);
                let u = r.mesh.userData, run = Math.min(1, sp / RACE.moveSpeed);
                if (u.legs) {
                    u.legs[0].rotation.x = Math.sin(r.animT) * 0.9 * run;
                    u.legs[1].rotation.x = -Math.sin(r.animT) * 0.9 * run;
                }
                tickAccStarOrbit(u, dt);
                if (u.arms) {
                    u.arms[0].rotation.x = -Math.sin(r.animT) * 0.7 * run;
                    u.arms[1].rotation.x = Math.sin(r.animT) * 0.7 * run;
                }
                r.mesh.rotation.x = r.onGround ? run * 0.15 : -0.2;
                let sc = (r.smallT > 0) ? 0.68 : 1;
                if (r.mesh.scale.x !== sc) r.mesh.scale.set(sc, sc, sc);
            });
            let me = race.racers[0];
            let look = me;
            if (me.out) {   // 淘汰后观战：◀ ▶ / A D 换人看
                let list = raceSpecList();
                race.specIdx = ((race.specIdx || 0) % Math.max(1, list.length) + list.length) % Math.max(1, list.length);
                look = list[race.specIdx] || me;
            }
            raceSpecBarSync(look);
            raceGhostTick();
            let dir = chaseCamDir();
            let ay = look.p.y + RACE.camUp;
            camera.position.set(look.p.x - dir.x * RACE.camBack, ay - dir.y * RACE.camBack, look.p.z - dir.z * RACE.camBack);

            raceHud();
            renderer.render(scene, camera);
        }

        function raceSpecList() { return race.racers.filter(function (r) { return !r.out; }).sort(function (a, b) { return b.p.z - a.p.z; }); }
        function raceSpecCycle(d) { if (!race) return; race.specIdx = (race.specIdx || 0) + d; }
        function raceSpecBarSync(look) {
            let bar = document.getElementById('race-spectate-bar'); if (!bar) return;
            let on = race && race.racers[0].out;
            bar.style.display = on ? 'flex' : 'none';
            if (on) {
                let list = raceSpecList(), i = list.indexOf(look);
                document.getElementById('race-spectate-target').innerText = look.name + (i >= 0 ? '（第 ' + (i + 1) + '）' : '');
            }
        }
        // 幽灵：你在"同样段数"的这一轮里跑出过的最好成绩，按那个配速从起点匀速飘到终点。
        // 赛道每轮随机拼，没法逐帧回放；但同样段数的赛道长度一样，配速就能比。
        function raceGhostSetup() {
            if (race.ghost) { scene.remove(race.ghost); race.ghost = null; }
            let me = race.racers[0];
            if (me.out || race.duo) return;
            let rec = (raceRecords()['r' + (race.round + 1)] || []).find(function (e) { return e.me; });
            if (!rec) return;
            let g = raceMakeBody(mySkinColor(0x66bb6a), 0, true, null, myFace());
            g.traverse(function (o) { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.32; o.material.depthWrite = false; } });
            let lb = nightMakeLabel('最好成绩 ' + rec.t.toFixed(1) + 's', 0xffffff, false); lb.position.y = 16; g.add(lb);
            raceDeco(g);
            race.ghost = g; race.ghostT = rec.t; race.ghostZ0 = me.p.z;
        }
        function raceGhostTick() {
            let g = race.ghost; if (!g) return;
            let k = race.phase === 'run' ? Math.min(1, race.clock / race.ghostT) : 0;
            g.position.set(12, 4 + Math.sin(performance.now() / 300) * 0.8, race.ghostZ0 + (race.finishZ - race.ghostZ0) * k);
            g.rotation.y = 0;
        }

        function raceLoop() {
            if (!race || race.over) return;
            race.raf = requestAnimationFrame(raceLoop);
            raceLoopBody();
        }

        function raceHud() {
            let me = race.racers[0];
            let alive = race.racers.filter(function (r) { return !r.out; });
            let ahead = alive.filter(function (r) { return !r.out && r.p.z > me.p.z; }).length;
            document.getElementById('blaze-score').innerText =
                race.phase === 'ready' ? Math.ceil(race.wait) : race.clock.toFixed(1);
            let ladder = race.duo ? RACE_DUO.ladder : RACE.ladder;
            document.getElementById('blaze-round').innerText =
                (race.duo ? '竞速·双人 · 第 ' : '竞速 · 第 ') + (race.round + 1) + ' / ' + ladder.length + ' 轮　' +
                ladder[race.round] + (race.duo ? ' 队开跑，留 ' + (ladder[race.round + 1] || 1) + ' 队　' : ' 人开跑，留 ' + (ladder[race.round + 1] || 1) + ' 人　') +
                (me.out ? (race.duo ? '你的队伍已淘汰（观战）' : '你已淘汰（观战）')
                    : race.duo ? (function () {
                        let mate = raceTeammateOf(me);
                        return '队友：' + mate.name + (mate.out ? '（已出局）' : mate.finished ? '（已完赛）' : '');
                    })()
                        : '当前第 ' + (ahead + 1) + ' 位') +
                (me.dashCd > 0 ? '　冲刺 ' + me.dashCd.toFixed(1) + 's' : '　冲刺就绪') +
                (function () {
                    let sk = raceCardDef(me.skill), bf = raceCardDef(me.buff), out = '';
                    if (sk) out += '　' + sk.name + (me.skillCd > 0 ? ' ' + me.skillCd.toFixed(1) + 's' : ' 就绪');
                    if (bf) out += '　+' + bf.name;
                    return out;
                })() +
                (me.item ? '　' + raceItemDef(me.item).name : '') +
                (function () {
                    let ev = raceEventDef(race.event);
                    return (ev && ev.id !== 'none') ? '　' + ev.name : '';
                })();
            document.getElementById('blaze-roster').innerHTML = '';
            let bd = document.getElementById('blaze-ffa-board');
            if (bd) {
                bd.classList.remove('hidden');
                // 平板/手机右侧那一列是 道具/冲刺/技能/跳 四个键，排位板原来就压在按键上面。
                // 矮屏（手机横屏）挪到左上角只列前 3 + 自己；平板竖屏往下挪，让开顶上那行说明。
                let short = padOn() && window.innerHeight < 600, narrow = window.innerWidth < 1000;
                // 原始位置写在元素自己的 style 属性里（right:12px; width:190px; top:44px），清空会连它一起清掉，得写回原值
                bd.style.left = short ? '10px' : ''; bd.style.right = short ? 'auto' : '12px';
                bd.style.width = short ? '150px' : '190px';
                bd.style.top = short ? '80px' : (narrow ? '96px' : '44px');
                let order = alive.slice().sort(function (a, b) { return b.p.z - a.p.z; });
                let n = short ? 3 : 8, myIdx = order.indexOf(me);
                let rows = order.slice(0, n).map(function (r, i) { return [r, i]; });
                if (myIdx >= n) rows.push([me, myIdx]);   // 自己掉到前几名以外也要能看到自己第几
                bd.innerHTML = '<div style="color:#ffd54f;">本轮排位</div>' +
                    rows.map(function (ri) {
                        let r = ri[0];
                        return '<div style="color:' + (r === me ? '#80d8ff' : '#fff') + ';">' +
                            (ri[1] + 1) + '. ' + r.name + (r.finished ? ' ✔' : '') + '</div>';
                    }).join('');
            }
        }

        // 竞速借用超燃的 HUD 容器，但超燃那套「攻/1/2/卡/血条」在这儿全是多余的。
        // 进竞速就把它们收起来，换成跳和冲刺两个键；退出去再还回原样。
        function raceTouchUI(on) {
            ['blaze-atk-btn', 'blaze-skill1-btn', 'blaze-skill2-btn', 'blaze-card-btn', 'blaze-jump-btn'].forEach(function (id) {
                let e = document.getElementById(id);
                if (e) e.style.display = on ? 'none' : '';
            });
            // 血条、技能条、准星、面板按钮 —— 竞速里全是多余的
            ['blaze-bottom', 'blaze-stats-btn'].forEach(function (id) {
                let e = document.getElementById(id);
                if (e) e.style.display = on ? 'none' : '';
            });
            let cross = document.getElementById('blaze-crosshair-anchor');
            if (cross && cross.previousElementSibling) {
                cross.previousElementSibling.style.display = on ? 'none' : '';
            }
            // 「退出」原来直接调 blazeExit，竞速里 blaze 是 null，点了什么也不会发生
            let ex = document.getElementById('blaze-exit-btn');
            if (ex) ex.onclick = on ? raceExit : blazeExit;
            ['blaze-stats', 'blaze-perk', 'blaze-ffa-cards'].forEach(function (id) {
                let e = document.getElementById(id);
                if (e && on) e.classList.add('hidden');
            });
            // 只有平板才需要这两个键，电脑上不占地方
            let pad = (gState.control === 'pad');
            ['race-jump-btn', 'race-dash-btn', 'race-skill-btn', 'race-item-btn'].forEach(function (id) {
                let e = document.getElementById(id);
                if (e) e.style.display = (on && pad) ? 'flex' : 'none';
            });
        }

        // ── 进出 ──
        // 双人现在也真联机了：组队面板里的人（lobbyParty）+ 自己按 racePlan 挨个填进
        // plan 数组（0/1 号、2/3 号……），duo 模式配队逻辑本来就是"相邻两个编号一队"
        // （见 raceStart 里 race.teams 的生成），所以只要组队邀请的人恰好排在你紧挨着
        // 的位置，就天然会被分到同一队——不用另外写"配对"逻辑。没组队的话还是跟以前
        // 一样纯本地练习（队友是 AI），没有陌生人自动匹配双人搭档，这个先不做。
        function raceDuoStart() {
            if (lobbyParty.length > 0) {
                let ids = [gState.id].concat(lobbyParty.slice(0, RACE.count - 1));
                let humans = ids.map(function (id) { return { id: id }; });
                let plan = racePlan(humans);
                bc.postMessage({ type: 'RACE_START', target: '*', sender: gState.id, plan: plan, host: gState.id, duo: true });
                raceStart(true, plan, gState.id);
                return;
            }
            raceStart(true);
        }

        // 单排竞速真联机：跟超燃一个套路——组队面板里确认过的人（lobbyParty）+ 自己
        // 组成真人名单，剩下的位置照旧用 AI 填满 16 人。
        function racePlan(humans) {
            let plan = [];
            for (let i = 0; i < RACE.count; i++) plan.push({ id: null });
            humans.slice(0, RACE.count).forEach(function (h, i) { plan[i].id = h.id; });
            return plan;
        }
        function raceStartGo() {
            if (lobbyParty.length > 0) {
                let ids = [gState.id].concat(lobbyParty.slice(0, RACE.count - 1));
                let humans = ids.map(function (id) { return { id: id }; });
                let plan = racePlan(humans);
                bc.postMessage({ type: 'RACE_START', target: '*', sender: gState.id, plan: plan, host: gState.id });
                raceStart(false, plan, gState.id);
                return;
            }
            // 没组队：先等最多 15 秒看房间里有没有陌生人也想跑，凑到人就真联机
            mmStart('race', RACE.count, function (ids) {
                let humans = ids.map(function (id) { return { id: id }; });
                let plan = racePlan(humans);
                if (ids.length > 1) bc.postMessage({ type: 'RACE_START', target: '*', sender: gState.id, plan: plan, host: gState.id });
                raceStart(false, plan, gState.id);
            });
        }
        function raceOnStart(m) {
            if (!m.plan || !m.plan.some(function (q) { return q.id === gState.id; })) return;
            if (!netStartAllowed('race', m)) return;
            mmCancel();   // 见 blazeOnStart 里的同一条注释——防止本机自己的匹配计时几秒后又触发一次
            if (race) { if (race.raf) cancelAnimationFrame(race.raf); race = null; }
            raceStart(!!m.duo, m.plan, m.host);
        }
        function raceRacerByNetId(id) { return race ? race.racers.filter(function (r) { return r.netId === id; })[0] : null; }
        // 15Hz 广播自己的位置，跟大厅/超燃一个频率——太快占带宽，太慢对面看着会一卡一卡。
        function raceNetTick(dt) {
            if (!race || !race.net) return;
            race.sendSelf -= dt;
            if (race.sendSelf > 0) return;
            race.sendSelf = 1 / 15;
            let me = race.racers[0];
            bc.postMessage({
                type: 'RACE_ME', target: '*', sender: gState.id,
                x: Math.round(me.p.x), y: Math.round(me.p.y), z: Math.round(me.p.z)
            });
        }
        function raceOnMe(m) {
            if (!race || m.sender === gState.id) return;
            let r = raceRacerByNetId(m.sender);
            if (!r) return;
            r.target = { x: m.x, y: m.y, z: m.z };
        }
        // 对面自己检测到撞线了，广播过来——本机这具对面的假身体不会自己触发终点判定。
        function raceOnFinish(m) {
            if (!race || m.sender === gState.id) return;
            let r = raceRacerByNetId(m.sender);
            if (!r || r.finished || r.out) return;
            r.finished = true; r.time = m.time;
            race.finishOrder.push(r);
            r.place = race.finishOrder.length;
        }
        // 房主结算这一轮谁淘汰、谁进下一轮，广播出来——非房主不自己算，
        // 各自本地摇的 AI 分身跑出来的名次可能不一样，只有房主这份是数的。
        function raceOnResult(m) {
            if (!race || !race.net || race.host === gState.id) return;
            if (m.round !== race.round) return;
            race.phase = 'result';   // 跟 raceRoundOver() 一样先停住本地这具身体的 tick，不然结算modal开着人还在场上晃
            (m.outIds || []).forEach(function (id) {
                let r = raceRacerByNetId(id); if (r) { r.out = true; r.mesh.visible = false; }
            });
            let me = race.racers[0];
            // 非房主自己走 raceRoundOver() 那条本地路径（已经被 host-only 的判定挡住了），
            // 记录榜的提交得在这单独补一次，不然联机跑分永远进不了自己的榜。
            if (me.finished) raceSubmitRecord(race.round + 1, me.time);
            let title = me.out ? '你被淘汰了' : ('第 ' + (race.round + 1) + ' 轮结束');
            race.round++;   // 跟房主的 raceAfterResult() 保持一致，不然下一轮 raceOnRound 的轮次号对不上
            let ended = me.out || m.champion;
            showSysModal(title,
                m.champion ? '恭喜跑完全部轮次！' : (me.out ? '这次先到这——回大厅再来一把。' : '房主结算完了，点继续进下一轮。'),
                [ended
                    ? { label: '返回大厅', color: '#888', onClick: function () { raceExit(); } }
                    : { label: '继续', color: '#5cb85c', onClick: function () { race.phase = 'waitRound'; } }]);
        }
        // 双人版的非房主结算——跟 raceOnResult 一个套路，只是按队伍展示比分/淘汰，
        // 而不是单人名次。teamScore/cutTeams 完全信房主广播过来的这份，自己不重算
        // （AI 的跑位两边不同步，各自算出来的分数对不上号）。
        function raceOnResultDuo(m) {
            if (!race || !race.net || race.host === gState.id) return;
            if (m.round !== race.round) return;
            race.phase = 'result';
            let cutTeams = m.cutTeams || [];
            cutTeams.forEach(function (ti) {
                (race.teams[ti] || []).forEach(function (idx) {
                    let r = race.racers[idx]; if (r) { r.out = true; r.mesh.visible = false; }
                });
            });
            let me = race.racers[0];
            if (me.finished) raceSubmitRecord(race.round + 1, me.time);
            let teamScore = m.teamScore || {};
            let activeTeams = Object.keys(teamScore).map(Number);
            let lines = activeTeams.slice().sort(function (a, b) { return teamScore[b] - teamScore[a]; })
                .map(function (ti, i) {
                    let names = (race.teams[ti] || []).map(function (idx) { return race.racers[idx].name; }).join(' & ');
                    return (i + 1) + '. ' + names + '　' + teamScore[ti] + ' 分' +
                        (ti === me.teamIdx ? '　← 你' : '') +
                        (cutTeams.indexOf(ti) >= 0 ? '　<span style="color:#e57373;">淘汰</span>' : '');
                }).join('<br>');
            let title = me.out ? '你的队伍被淘汰了' : (m.champion ? '冠军队伍' : ('第 ' + (race.round + 1) + ' 轮结束'));
            race.round++;
            let ended = me.out || m.champion;
            showSysModal(title, lines,
                [ended
                    ? { label: '返回大厅', color: '#888', onClick: function () { raceExit(); } }
                    : { label: '继续', color: '#5cb85c', onClick: function () { race.phase = 'waitRound'; } }]);
        }

        function raceStart(duo, plan, hostId) {
            showModeIntroIfFirstTime('race');
            ensureScene();
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.add('hidden');
            document.getElementById('blaze-hud').classList.remove('hidden');
            let pe = document.getElementById('blaze-perk'); if (pe) pe.classList.add('hidden');
            if (blaze) { try { blazeExit(); } catch (e) { } }
            scene.background = new THREE.Color(0x9fd6ff);
            scene.fog = new THREE.FogExp2(0x9fd6ff, 0.0016);

            race = {
                round: 0, phase: 'ready', wait: RACE.readyT, clock: 0, over: false,
                racers: [], meshes: [], ground: [], spinners: [], sweeps: [], crumbles: [], lifts: [],
                checkpoints: [], finishOrder: [], segs: [], segSeen: {}, fx: [], savePads: [], boxes: [], draw: null, event: 'none',
                last: performance.now(), raf: null, finishZ: 0,
                net: plan ? plan.some(function (q) { return q.id && q.id !== gState.id; }) : false,
                host: hostId || gState.id, sendSelf: 0
            };
            if (plan) {
                // 联机：其它地方到处硬编码 race.racers[0] 就是"我"，所以不管 plan 里
                // 我排第几个，本地数组永远把我摆在 0 号，其他真人跟着排，AI（没有 id）照旧垫后。
                let mine = plan.filter(function (q) { return q.id === gState.id; })[0] || { id: gState.id };
                let others = plan.filter(function (q) { return q !== mine; });
                [mine].concat(others).forEach(function (q, i) {
                    let r = raceMakeRacer(i, q.id === gState.id, undefined, q.id);
                    r.netId = q.id || null;
                    race.racers.push(r);
                });
            } else {
                for (let i = 0; i < RACE.count; i++) race.racers.push(raceMakeRacer(i, i === 0));
            }
            race.duo = !!duo;
            if (duo) {
                // 相邻两个编号配一队：0 号是玩家，1 号就是玩家的队友
                race.teams = [];
                for (let i = 0; i < race.racers.length; i += 2) {
                    let ti = race.teams.length;
                    race.teams.push([i, i + 1]);
                    let col = RACE_COLORS[ti % RACE_COLORS.length];
                    raceRecolorRacer(race.racers[i], col);
                    raceRecolorRacer(race.racers[i + 1], col);
                    race.racers[i].teamIdx = ti; race.racers[i + 1].teamIdx = ti;
                }
            }
            document.body.onmousedown = function (e) {
                if (!race || race.over) return;
                // 弹窗和按钮上的点击归它们自己
                if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#sys-modal'))) return;
                // 鼠标还没锁住：这一下先用来锁指针
                if (!document.pointerLockElement) { safeLockPointer(); return; }
                if (e.button === 0) raceDash(race.racers[0]);        // 左键 = 冲刺（同 Shift）
                else if (e.button === 2) raceSkill(race.racers[0]);  // 右键 = 技能（同 E）
                else if (e.button === 1) raceUseItem(race.racers[0]); // 中键 = 道具（同 Q）
            };
            raceTouchUI(true);
            document.body.onmouseup = null;
            raceStartRound();
            bgmStart();
            raceLoop();
        }

        function raceExit() {
            if (!race) return;
            race.over = true;
            if (race.raf) cancelAnimationFrame(race.raf);
            if (document.pointerLockElement) document.exitPointerLock();
            raceClearTrack();
            let cb = document.getElementById('race-cardbar'); if (cb) cb.style.display = 'none';
            let rsb = document.getElementById('race-spectate-bar'); if (rsb) rsb.style.display = 'none';
            (race.fx || []).forEach(function (f) { scene.remove(f.o); });
            race.racers.forEach(function (r) { scene.remove(r.mesh); });
            race = null;
            raceTouchUI(false);
            bgmStop();
            document.body.onmousedown = null;
            document.getElementById('blaze-hud').classList.add('hidden');
            let bd = document.getElementById('blaze-ffa-board'); if (bd) { bd.classList.add('hidden'); bd.style.left = ''; bd.style.right = '12px'; bd.style.width = '190px'; bd.style.top = '44px'; }
            nav('screen-lobby'); selectGameMode('race');
        }

