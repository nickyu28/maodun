// 猫盾工业：矿洞、火把、灯泡（任务 66）。放在 19-industry-tree.js 后面。
// 硬核远征图的山地、古老岩层里随机有 2～4 个洞口（黑洞洞的石门，写"矿洞"）。走进去：一条往下的坡道，下面是一条洞（30 × 70 米），
// 洞就在这张图的山肚子里（作者 11-12 去传送门）：没有换场景、没有瞬移，洞里的路按洞口的位置往里走，走回洞口就出来了。每次进去洞里的矿重新随机。
// 洞里按现实只有洞口进来的自然光：白天洞口 8 米内看得见，8～15 米越来越暗，超过 15 米全黑；夜里洞口也黑。
// 光源只照自己身边一圈：火把 8 米（木 1 + 煤或木炭 1 → 2 根，右键点一根，烧 90 秒），灯泡 12 米（戴在头上，一节锂电池 720 U，洞里每秒 0.4 U，没电就黑）。
// 40% 的洞深处有天然气喷口（瓦斯）：拿着点着的火把走到洞口 15 米以里会爆炸；灯泡没有明火不炸。
// 洞里硬岩（炸出锂锗镓）、萤石、方铅矿比地面多、更集中。悠闲没有矿洞（里面的东西都是硬核的）。
        const CV = { ramp: 12, head: 3, w: 15, len: 70, floor: 0.5, mouthR: 1.8, exitR: 2.2, lit: 8, dim: 15, natR: 30, d0: 2, d0Torch: 4, d0Bulb: 6, torch: 90, torchR: 8, bulbR: 12, bulbU: 720, bulbDraw: 0.4, gasP: 0.4, gasD: 15, gasR: 4, gasHp: 60, cool: 2, back: 3, backMove: 0.3 };
        Object.assign(IND_ITEMS_RAW, {
            torch: { name: '火把', col: 0xff8f00, use: '右键点一根，烧 90 秒，照亮身边 8 米。洞里有瓦斯别点' },
            bulb: { name: '灯泡', col: 0xfff59d, wear: 'head', warm: 0, use: '戴头上，矿洞里照亮 12 米，吃锂电池' },
            bulb_dead: { name: '没电的灯泡', col: 0x9e9e9e, use: '在工作台加一节锂电池就又亮了' }
        });
        IND_ITEMS_RAW.dev_lamp.later = '老存档里的电灯，配方改成灯泡了';
        IND_CRAFT.push({ out: 'torch', n: 2, in: { wood: 1, coal: 1 }, hard: true }, { out: 'torch', n: 2, in: { wood: 1, charcoal: 1 }, hard: true }, { out: 'bulb', in: { bulb_dead: 1, battery_li: 1 }, hard: true });
        // 远征图生成时（indGoTrip）：在山地、古老岩层里找 2～4 个洞口。用自己的随机数，不打乱别的东西
        function cvGen(M) {
            ind.caves = []; ind.cave = null;
            let r = indRng((M.seed ^ 0x2c1b3c6d) >>> 0), want = IND_K * (2 + Math.floor(r() * 3));
            for (let t = 0; t < 3000 * IND_K && ind.caves.length < want; t++) {
                let x = (r() * 2 - 1) * (IND_MAP - 20), z = (r() * 2 - 1) * (IND_MAP - 20), bm = indBiome(M, x, z);
                if (bm !== 'mountain' && bm !== 'ancient') continue;
                if (ind.caves.some(function (c) { return Math.hypot(c.x - x, c.z - z) < 60; })) continue;
                let y = indHeight(M, x, z), F = cvPlan(M, x, z, y); if (F === null) continue;
                let i = ind.caves.length;
                ind.caves.push({ i: i, x: x, z: z, y: y, bm: bm, cx: x, cz: z, F: F, built: false, gas: false });
            }
            if (typeof orExtraCave === 'function') orExtraCave(M, r);   // 平原森林沙漠偶尔多一个洞口（19-industry-ore.js）
            ind.caves.forEach(cvDrawMouth);
        }
        // 洞身在山肚子里：洞口往 +z 方向深 70 米，开头 12 米是往下的坡，下面是平的。洞底要比头上的地面至少低 3 米，不够就往下挖，挖到 13 米还不行这个地方就不要
        function cvFloorY(c, d) { return d <= 0 ? c.y : d >= CV.ramp ? c.F : c.y + (c.F - c.y) * d / CV.ramp; }
        function cvHW(d) { return Math.min(CV.w - 0.6, 2.4 + 1.1 * Math.max(0, d)); }   // 洞口窄，往里渐渐宽到 30 米
        function cvPlan(M, x, z, y) {
            if (x - CV.w < -IND_MAP + 2 || x + CV.w > IND_MAP - 2 || z < -IND_MAP + 2 || z + CV.len > IND_MAP - 2) return null;
            for (let dep = 7; dep <= 13; dep++) {
                let c = { y: y, F: y - dep }, ok = true;
                for (let d = 6; d <= CV.len && ok; d += 4) for (let u = -12; u <= 12 && ok; u += 12) { let h = indHeight(M, x + u, z + d); if (h < cvFloorY(c, d) + CV.head || h < IND_WATER_Y + 0.5) ok = false; }
                if (ok) return c.F;
            }
            return null;
        }
        function cvDrawMouth(c) {
            let y = c.y, k = 0x4e342e;
            indBox(0.8, 3, 0.8, 0x616161, c.x - 1.6, y + 1.5, c.z); indBox(0.8, 3, 0.8, 0x616161, c.x + 1.6, y + 1.5, c.z); indBox(4, 0.8, 0.9, 0x616161, c.x, y + 3.2, c.z);
            indBox(2.4, 2.8, 0.3, 0x050505, c.x, y + 1.4, c.z + 0.2);
            indBox(4.4, 0.25, 2, k, c.x, y + 0.12, c.z - 0.6);
            indSign('矿洞', c.x, y + 4.4, c.z, 2, 0.6);
        }
        // 洞跟洞口一样的地貌
        function cvAt(x, z) { return null; }   // 洞在图里，没有单独的地方了
        function cvBiome(x, z) { let c = cvAt(x, z); return c ? c.bm : 'mountain'; }
        // 洞的局部：洞口在 (x, z)，往 +z 方向深 70 米，宽 30 米
        function cvDepth(c, x, z) { return Math.hypot(x - c.cx, z - c.cz); }
        function cvBuild(c) {
            if (c.built) return; c.built = true; let n0 = ind.objs.length;
            let X = c.x, Z = c.z, L = CV.len, W = CV.w, R = CV.ramp, F = c.F, g = 0x37474f, f = c.bm === 'ancient' ? 0x4a3b47 : 0x3e3a36;
            let rl = Math.hypot(R, c.y - F), ang = Math.atan2(c.y - F, R);
            let ramp = new THREE.Mesh(new THREE.PlaneGeometry(2 * W + 4, rl), indMat(new THREE.MeshLambertMaterial({ color: f, side: THREE.DoubleSide })));
            ramp.rotation.x = -Math.PI / 2 + ang; ramp.position.set(X, (c.y + F) / 2 + 0.02, Z + R / 2); indAdd(ramp);
            indPlane(2 * W + 4, L - R + 4, f, X, F + 0.01, Z + R + (L - R) / 2);
            indBox(1, 6, L - R + 2, g, X - W - 0.5, F + 3, Z + R + (L - R) / 2); indBox(1, 6, L - R + 2, g, X + W + 0.5, F + 3, Z + R + (L - R) / 2);
            indBox(2 * W + 2, 6, 1, g, X, F + 3, Z + L + 1);
            for (let d = 1; d < R; d += 2) { let hw = cvHW(d) + 0.5, y = cvFloorY(c, d); indBox(1, 6, 2.1, g, X - hw, y + 3, Z + d); indBox(1, 6, 2.1, g, X + hw, y + 3, Z + d); }
            for (let i = n0; i < ind.objs.length; i++) ind.objs[i].userData.cv = true;   // 进洞时别的东西都收起来，这几块留着
        }
        // 每次进洞重新撒矿：硬岩 3～5、萤石 2～3 个露头、方铅矿 2～3 个露头，都在 15 米以里；40% 深处有天然气喷口（不会枯竭）
        function cvFill(c) {
            ind.nodes = ind.nodes.filter(function (o) { return o.cave === undefined; });
            let X = c.x, Z = c.z, pt = function (d0) { let d = d0 + indRand() * (CV.len - 5 - d0); return { x: X + (indRand() * 2 - 1) * (CV.w - 3), z: Z + d }; };
            let nh = 3 + Math.floor(indRand() * 3);
            for (let i = 0; i < nh; i++) { let p = pt(15); ind.nodes.push({ key: 'rock_hard', rock: true, hard: true, cave: c.i, x: p.x, z: p.z, y: CV.floor, n: 1, seed: IND_SEED_KINDS[0], dead: false }); }
            ['fluorite', 'ore_pb'].forEach(function (k) {
                let n = 2 + Math.floor(indRand() * 2), p0 = pt(15);
                for (let i = 0; i < n; i++) { let m = 10 + Math.floor(indRand() * 21); ind.nodes.push({ key: k, cave: c.i, out: true, x: p0.x + (indRand() * 2 - 1) * 3, z: p0.z + (indRand() * 2 - 1) * 3, y: CV.floor, n: m, n0: m, seed: IND_SEED_KINDS[0], dead: false }); }
            });
            orCaveOre(c);   // 洞里的矿点（19-industry-ore.js）
            c.gas = indRand() < CV.gasP;
            if (c.gas) { let p = pt(40); ind.nodes.push({ key: 'vent_ng', cave: c.i, x: p.x, z: p.z, y: CV.floor, n: 1, seed: IND_SEED_KINDS[0], dead: false, until: 1e12 }); }
            ind.nodes.forEach(function (o) { if (o.cave === c.i) o.y = cvFloorY(c, o.z - c.z); });   // 洞里的点站在洞底上
            ind.nodeDirty = true;
        }
        // 洞在山肚子里：进洞时地面、水、树、洞口这些全收起来（不然从下面看得见绿草地），只留洞自己和洞里的点；出洞放回去
        function cvWorldVis(on) {
            let keep = [ind.nodeMesh]; if (ind.wd) ['trunk', 'crown', 'rock', 'ore', 'stump', 'pit'].forEach(function (k) { keep.push(ind.wd[k]); });
            ind.objs.forEach(function (o) {
                if (o.userData.cv || o.isLight || keep.indexOf(o) >= 0) return;
                if (on) { if (o.userData.pv !== undefined) { o.visible = o.userData.pv; delete o.userData.pv; } }
                else if (o.userData.pv === undefined) { o.userData.pv = o.visible; o.visible = false; }
            });
        }
        function cvEnter(c) {
            if (ind.ride && typeof rdDismount === 'function') rdDismount('进洞了，下车');
            cvBuild(c); cvFill(c);
            ind.cave = c; ind.cvMobs = ind.mobs || []; ind.cvMobs.forEach(function (m) { if (m.g) m.g.visible = false; }); ind.mobs = [];   // 没有传送：地面上的怪先收起来，出洞再放回来
            ind.p.vy = 0; cvWorldVis(false);
            scene.background = new THREE.Color(0x000000); if (scene.fog) scene.fog.color.setHex(0x000000);
            if (c.gas) indFlash('有股怪味');
        }
        function cvLeave() {
            let c = ind.cave; if (!c) return;
            ind.cave = null; ind.nodes = ind.nodes.filter(function (o) { return o.cave === undefined; }); ind.nodeDirty = true; cvWorldVis(true);
            (ind.mobs || []).forEach(function (m) { if (typeof mbDrop === 'function') mbDrop(m); });
            ind.mobs = ind.cvMobs || []; ind.cvMobs = null; ind.mobs.forEach(function (m) { if (m.g) m.g.visible = true; });
            ind.p.y = Math.max(IND_WATER_Y, indHeight(ind.map, ind.p.x, ind.p.z)); ind.p.vy = 0; ind.caveCool = CV.cool;   // 出洞后 2 秒内不会又进去
            scene.background = new THREE.Color(0xbfe3ff); if (scene.fog) scene.fog.color.setHex(0xbfe3ff);
        }
        // 洞里能看多远：自然光（只看离洞口多深、白天黑夜）和身上的光取大的
        function cvNatR(depth) { let day = 1 - indDark(); if (day <= 0) return 0; let v = depth <= CV.lit ? CV.natR : depth >= CV.dim ? 0 : CV.natR * (CV.dim - depth) / (CV.dim - CV.lit); return v * day; }
        function cvBulbIs() { return ind.base.wear.head === 'bulb' || ind.base.wear.head === 'bulb_ar'; }   // 氩气灯泡（19-industry-asu.js）耗电减半
        function cvBulbDraw() { return CV.bulbDraw * (ind.base.wear.head === 'bulb_ar' ? 0.5 : 1); }
        function cvBulbOn() { return cvBulbIs() && (ind.base.bulbU === undefined || ind.base.bulbU > 0); }
        function cvLightR() { return Math.max(ind.torchT > 0 ? CV.torchR : 0, cvBulbOn() ? CV.bulbR : 0); }
        // 任务 96：洞里一个东西的可见度 = min(1, (d0 ÷ d)³)，d 是离玩家的距离。d0：空手 2 米、火把 4 米、亮着的灯泡 6 米；洞口白天的自然光按它照得到的距离折成 d0
        function cvVis(d, d0) { return Math.min(1, Math.pow(d0 / Math.max(d, 1e-6), 3)); }
        function cvD0() { if (!ind.cave) return null; return Math.max(CV.d0, ind.torchT > 0 ? CV.d0Torch : 0, cvBulbOn() ? CV.d0Bulb : 0, cvNatR(cvDepth(ind.cave, ind.p.x, ind.p.z)) / 2); }
        function cvViewR() { if (!ind.cave) return null; return 2 * cvD0(); }   // 看得清的距离：可见度 ≥ 1/8 的地方（= 2 × d0：空手 4 米、火把 8 米、灯泡 12 米）
        function cvRender(nightEl) {
            let d0 = cvD0(), cam = IND_CAM.back;
            if (scene.fog) { scene.fog.near = cam + d0; scene.fog.far = cam + 3 * d0; }   // 雾从 d0（可见度 1）渐变到 3 × d0（可见度 0.04），不是一圈硬边
            if (nightEl) nightEl.style.opacity = (0.15 + 0.45 * (1 - Math.min(1, d0 / 10))).toFixed(3);
        }
        function cvClamp(p) {
            let c = ind.cave, d = Math.max(-0.4, Math.min(CV.len - 0.6, p.z - c.z)), hw = cvHW(d);
            p.z = c.z + d; p.x = Math.max(c.x - hw, Math.min(c.x + hw, p.x));
        }
        // 右键点火把：一根烧 90 秒（手里还有就接着用下一根）
        function cvLightTorch() {
            if (ind.torchT > 0) { return true; }
            indBagDel('torch', 1); ind.torchT = CV.torch; 
            cvGasCheck(); return true;
        }
        function cvGasCheck() {
            let c = ind.cave; if (!c || !c.gas || !(ind.torchT > 0) || cvDepth(c, ind.p.x, ind.p.z) < CV.gasD) return false;
            c.gas = false; ind.torchT = 0; ind.lastBoom = { x: ind.p.x, z: ind.p.z, R: CV.gasR };
            indFlash('瓦斯爆炸了！洞里有瓦斯别点明火');
            indHurt(CV.gasHp * (1 - indBlastCut()), 'boom', '矿洞里有瓦斯，火把点着了', true);   // 跟喷口旁点火一样 60 血
            return true;
        }
        // 每帧（远征里）：火把烧、灯泡耗电、进洞出洞、瓦斯
        function cvTick(dt) {
            if (ind.torchT > 0) { ind.torchT -= dt; if (ind.torchT <= 0) { ind.torchT = 0; indFlash('火把烧完了'); } }
            if (ind.where !== 'trip') { ind.cave = null; return; }
            let B = ind.base;
            if (ind.cave) {
                if (cvBulbIs()) {
                    if (!(B.bulbU >= 0)) B.bulbU = CV.bulbU;
                    B.bulbU = Math.max(0, B.bulbU - cvBulbDraw() * dt);
                    if (B.bulbU <= 0) { B.wear.head = 'bulb_dead'; B.bulbU = CV.bulbU; indFlash('灯泡没电了'); }
                }
                cvGasCheck(); if (!ind || ind.dead) return;
                if (ind.p.z - ind.cave.z <= -0.2) cvLeave();   // 往回走过洞口线就出来了
                return;
            }
            if (ind.caveCool > 0) { ind.caveCool -= dt; return; }
            (ind.caves || []).forEach(function (c) { let d = ind.p.z - c.z; if (!ind.cave && Math.abs(ind.p.x - c.x) <= CV.mouthR + 0.6 && d >= 0 && d <= 1.5) cvEnter(c); });
        }
        function cvHint() {
            if (!ind.cave) return '';
            let v = cvViewR(); return '矿洞里　' + (v > 2 * CV.d0 + 0.5 ? '看得清 ' + Math.round(v) + ' 米' : '很暗，只看得见身边') + (ind.torchT > 0 ? '　火把还剩 ' + Math.ceil(ind.torchT) + ' 秒' : '') + (cvBulbIs() ? '　灯泡电量 ' + Math.ceil(ind.base.bulbU >= 0 ? ind.base.bulbU : CV.bulbU) + ' U' : '');
        }
        function cvFixBase(b) { if (b.bulbU !== undefined) b.bulbU = indNum(b.bulbU, CV.bulbU, 0, CV.bulbU); }
        function cvBookLines() {
            if (!indHard()) return [];
            return [{ ins: ['torch', 'bulb'], outs: ['rock_hard', 'fluorite', 'ore_pb', 'vent_ng'], name: '矿洞', txt: '山地、古老岩层里有洞口，走进去。洞里黑：白天洞口 ' + CV.lit + ' 米内看得见，超过 ' + CV.dim + ' 米、夜里只看得清身边 ' + 2 * CV.d0 + ' 米，离得越远越暗。火把照 ' + CV.torchR + ' 米烧 ' + CV.torch + ' 秒，灯泡照 ' + CV.bulbR + ' 米。里面硬岩、萤石、方铅矿多；有怪味的洞别点火把，瓦斯', where: '硬核远征，走回洞口出来' },
                { ins: ['torch'], outs: [], name: '火把', txt: '右键点一根：照亮身边 ' + CV.torchR + ' 米，烧 ' + CV.torch + ' 秒', where: '手上' },
                { ins: ['bulb'], outs: ['bulb_dead'], name: '灯泡', txt: '戴在头上：矿洞里照亮身边 ' + CV.bulbR + ' 米，一节锂电池 ' + CV.bulbU + ' U，洞里每秒 ' + CV.bulbDraw + ' U，没电变成没电的灯泡', where: '头上' }];
        }
