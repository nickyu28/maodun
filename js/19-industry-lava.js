// 猫盾工业：岩浆、火把取火、地热发电机（任务 70 补充 3～5）。放在 19-industry-home.js 后面。
// 岩浆：出门地图的火山口（ind.map.volc）里一池，半径 = 火山半径 × 0.3，红色发光；碰到烫死（硬核每秒 −30、悠闲 −10），装不走（桶、瓶子对着它没反应）。
// 扔进去的东西（掉在地上的）：木头 → 木炭，生肉 → 熟肉，别的烧没。手里没点着的火把靠近岩浆 2 米内右键点着（无限次），30% 烧焦变木炭。
// 火苗仔（19-industry-mob.js）：不会死，点数 3（每 90 秒回 1）、寿命 5 次，右键点火把用掉 1 点 1 寿命；离岩浆 3 米内寿命每 60 秒 +1；用完"燃尽了"。
// 地热发电机：汽轮发电机 1 + 钢锭 8 + 铜线 10；离岩浆和水（水池，或开着的水泵）都在 3 米内才发电，24 V。基地里没有岩浆（以后做了能装岩浆的容器，倒在基地里才有），
// 所以现在只有测试里能让它发电；岩浆登记在 ind.base.lava（基地）和 ind.map 火山口（远征）两处。
        const LV = { rK: 0.3, burnHard: 30, burnCasual: 10, torchR: 2, charP: 0.3, devR: 3, volt: 24 };
        Object.assign(IND_ITEMS_RAW, { dev_geo: { name: '地热发电机', col: 0xe65100, dev: 'geo', use: '放在离岩浆和水都在 3 米内的地方，不用燃料，24 V' } });
        IND_DEVS.geo = { name: '地热发电机', col: 0xe65100, src: true, volt: LV.volt, size: [1.4, 1.2, 1.2] };
        IND_CRAFT.push({ out: 'dev_geo', in: { dev_turbine: 1, steel: 8, wire: 10 }, hard: true });
        // 岩浆池列表：远征里是火山口，基地里是 ind.base.lava
        function lvPools() {
            if (ind.where === 'trip' && ind.map && ind.map.volc && !ind.cave) return ind.map.volc.map(function (v) { return { x: v.x, z: v.z, r: v.r * LV.rK }; });
            if (ind.where === 'base') return (ind.base.lava || []);
            return [];
        }
        function lvDist(x, z) { let m = 1e9; lvPools().forEach(function (p) { m = Math.min(m, Math.hypot(x - p.x, z - p.z) - p.r); }); return m; }   // 离最近一池岩浆边缘的距离（里面是负的）
        function lvBuild() {
            if (ind.lvMap === ind.map) return; ind.lvMap = ind.map;
            if (ind.where !== 'trip' || !ind.map || !ind.map.volc || ind.cave) return;
            ind.map.volc.forEach(function (v) {
                let r = v.r * LV.rK, m = new THREE.Mesh(indGeo(new THREE.CircleGeometry(r, 24)), indMat(new THREE.MeshBasicMaterial({ color: 0xff3d00 })));
                m.rotation.x = -Math.PI / 2; m.position.set(v.x, indHeight(ind.map, v.x, v.z) + 0.08, v.z); indAdd(m);
            });
        }
        function lvTick(dt) {
            if (!ind || ind.dead || ind.over) return;
            lvBuild();
            if (ind.where !== 'trip' || ind.cave) return;
            let P = lvPools(); if (!P.length) return;
            if (lvDist(ind.p.x, ind.p.z) < 0 && !ind.onRaft) indHurt((indHard() ? LV.burnHard : LV.burnCasual) * dt, 'burn', '碰到了岩浆');
            let G = ind.tripGround, changed = false;
            if (G && G.length) {
                for (let i = G.length - 1; i >= 0; i--) {
                    let g = G[i], p = P.filter(function (q) { return Math.hypot(g.x - q.x, g.z - q.z) < q.r; })[0]; if (!p) continue;
                    G.splice(i, 1); changed = true;
                    let out = g.k === 'wood' ? 'charcoal' : g.k === 'meat_raw' ? 'meat_roast' : (g.k === 'fish_raw' && IND_ITEMS_RAW.fish_cooked) ? 'fish_cooked' : null;
                    if (out) { let a = Math.atan2(g.z - p.z, g.x - p.x); G.push({ k: out, x: p.x + Math.cos(a) * (p.r + 0.6), z: p.z + Math.sin(a) * (p.r + 0.6) }); }
                }
            }
            if (changed) { ind.itemDirty = true; if (typeof nkTripItemsSync === 'function') nkTripItemsSync(); }
        }
        // 右键拿着没点着的火把：靠近火苗仔（点数 −1、寿命 −1）或岩浆（30% 烧焦变木炭）点着。返回 true 就是这一下右键用掉了
        function lvTorchUse() {
            if (!ind || ind.where !== 'trip' || indSel() !== 'torch' || ind.torchT > 0) return false;
            let f = (ind.mobs || []).filter(function (m) { return m.ty === 'flame' && !m.dead && Math.hypot(m.x - ind.p.x, m.z - ind.p.z) <= LV.torchR; })[0];
            if (f) {
                if (!(f.pts > 0)) return true;   // 点数 0：灰黑冒烟，没反应，也不弹字
                f.pts--; f.pt = 0; f.life--; f.shake = 0.3;
                cvLightTorch(); mbFlameLook(f);
                if (f.life <= 0) mbFlameOut(f);
                return true;
            }
            if (lvDist(ind.p.x, ind.p.z) <= LV.torchR) {
                if (indRand() < LV.charP) { indBagDel('torch', 1); indBoxAdd('charcoal', 1); indFlash('火把烧焦了，变成了木炭'); ind.hudSig = ''; return true; }
                cvLightTorch(); return true;
            }
            return false;
        }
        // 地热发电机：离岩浆和水都在 3 米内
        function lvGeoOn(d) {
            if (lvDist(d.x, d.z) > LV.devR) return false;
            let P = IND_BASE_ST.pool, pool = !ind.base.off.pool && Math.hypot(P.x - d.x, P.z - d.z) <= LV.devR + P.r;
            return pool || ind.base.devs.some(function (p) { return p.ty === 'pump' && p.pw && Math.hypot(p.x - d.x, p.z - d.z) <= LV.devR; });
        }
        IND_DEV_VOLT.geo = function (d) { return lvGeoOn(d) ? LV.volt : 0; };
