// 猫盾工业：自行车、车（任务 46、47）。放在 19-industry-power.js 后面、19-industry-farm.js 前面（farm 末尾给用皮的配方统一加人造革备选，这里的皮配方要先登记）。
// 上下车：背包里选中自行车／车，右键 = 上车／下车；左键 = 打开面板（车在里面放电池）。猫盾工业是单人，座位数记着 2，但没有乘客，也没有联机同步（NET_PROTO 不动）。
// 速度（固定，鞋和药不乘）：自行车 = 2 × 冲刺速度（脚踏，每秒吃 3 体力，没体力就只有走路速度）；车 = 3 × 冲刺速度（电机：电池组 12～24 V 才启动，不在范围里不启动也不炸，行驶时每秒耗 10 U，没电停住）。
// 撞到树、石头、硬岩、水就停（不掉血）；在深水里自动下车；基地里能骑能开，不撞设备。
// 骑着（自行车和车的司机）只能做单手的事：吃喝、拔刺、编织、扇扇子、看地图、扔东西；挖矿、砍树、放置设备、合成（编织除外）、烧炉子、搬东西提示"骑着没法用"。
        Object.assign(IND_ITEMS_RAW, {
            wheel: { name: '轮子', col: 0x424242, use: '做自行车、车（皮 1 + 草绳 2，或者塑料 2）' },
            chain: { name: '钢链条', col: 0x78909c, use: '做自行车、车的传动' },
            seat: { name: '座椅', col: 0x8d6e63, use: '做自行车、车（皮或人造革 2 + 毛线 2）' },
            motor: { name: '电机', col: 0x5d4037, use: '车的电机（额定 24 V、12 V 才启动）；以后自动驾驶也要用' },
            veh_bike: { name: '自行车', col: 0x43a047, veh: 'bike', use: '选中右键上车／下车，左键开面板：2 × 冲刺速度，脚踏吃体力；撞树石头水就停；骑着只能做单手的事（吃喝、拔刺、编织、扇扇子、看地图、扔东西）' },
            veh_car: { name: '车', col: 0x1e88e5, veh: 'car', seats: 2, use: '选中右键上车／下车，左键开面板放电池：3 × 冲刺速度，电池组 12～24 V 才启动；司机只能做单手的事；撞树石头水就停' }
        });
        IND_CRAFT.push(
            { out: 'wheel', in: { hide: 1, rope: 2 }, hard: true },
            { out: 'wheel', in: { plastic: 2 }, hard: true },
            { out: 'chain', n: 2, in: { steel: 1 }, hard: true },
            { out: 'seat', in: { hide: 2, yarn: 2 }, hard: true },
            { out: 'motor', in: { coil: 2, steel: 2, wire: 10 }, hard: true },
            { out: 'veh_bike', in: { steel: 4, wheel: 2, chain: 1, seat: 1 }, hard: true },
            { out: 'veh_bike', in: { ingot_al: 4, wheel: 2, chain: 1, seat: 1 }, hard: true },
            { out: 'veh_car', in: { steel: 8, wheel: 4, motor: 1, seat: 1, chain: 2 }, hard: true },
            { out: 'veh_car', in: { ingot_al: 8, wheel: 4, motor: 1, seat: 1, chain: 2 }, hard: true }
        );
        const RD = { bike: 2, car: 3, pedal: 3, draw: 10, autoMul: 1.5, autoStep: 2.5, autoArrive: 3, animalR: 4, cliff: 2.5, vmin: 12, vmax: 24, hit: 1.1, cells: ['battery', 'battery_ni', 'battery_li'] };
        const RD_KNIT = { yarn: 1, sweater: 1, wool_hat: 1, wool_scarf: 1, scarf: 1, hat: 1, rope: 1, shoe_straw: 1, pack_grass: 1, fan: 1 };   // 编织、草编的活：骑着也能做
        function rdKnitOk(r) { return !!r && !!RD_KNIT[r.out]; }
        // 车里的电池槽（一个，存在存档里 base.car）：用电池组一样的规则（先替换用完的、满了才加节、防超压、不能混装）
        function rdCar() { let B = ind.base; if (!B.car) B.car = { bats: 0, u: 0, um: 0, ni: 0, li: false }; return B.car; }
        function rdFixBase(b) {
            let c = b.car; if (!c || typeof c !== 'object') { delete b.car; return; }
            c.auto = !!c.auto; c.li = !!c.li; c.bats = indNum(c.bats, 0, 0, c.li ? 128 : 64) | 0; c.ni = indNum(c.ni, 0, 0, 64) | 0; c.um = indNum(c.um, 0, 0, 128 * 720); c.u = indNum(c.u, 0, 0, c.um);
        }
        function rdCarV() { return indBankV(rdCar()); }
        function rdCarOk() { let c = rdCar(), v = indBankV(c); return c.u > 0 && v >= RD.vmin - 1e-6 && v <= RD.vmax + 1e-6; }
        function rdCarWhy() {
            let c = rdCar(), v = indBankV(c);
            if (!(c.bats > 0) || !(c.u > 0)) return '车里没电（左键点车打开面板放电池）';
            if (v < RD.vmin - 1e-6) return '电池组只有 ' + v.toFixed(1) + ' V，要 ' + RD.vmin + '～' + RD.vmax + ' V 才启动';
            if (v > RD.vmax + 1e-6) return '电池组 ' + v.toFixed(1) + ' V，超过 ' + RD.vmax + ' V，车不启动（不会炸，减几节电池）';
            return '';
        }
        function rdSpeed() { return IND_T.speed * IND_T.run; }   // 冲刺速度
        // 上下车
        function rdToggle(k) {
            if (!ind || ind.where === 'trip' && false) return false;
            let ty = IND_ITEMS[k].veh;
            if (ind.ride) { rdDismount('下车了'); return true; }
            if (ind.onRaft) { indFlash('在筏上不能上车'); return false; }
            if (ty === 'car' && !rdCarOk()) { indFlash(rdCarWhy()); return false; }
            ind.ride = { ty: ty, k: k, m: null, why: 0 }; ind.k = {}; 
            return true;
        }
        function rdDismount(msg) {
            if (!ind || !ind.ride) return;
            if (ind.ride.m) { scene.remove(ind.ride.m); let i = ind.objs.indexOf(ind.ride.m); if (i >= 0) ind.objs.splice(i, 1); }
            ind.ride = null; if (msg) indFlash(msg);
        }
        // 单手的事：吃喝（有 eat 的、药）、拔刺（仙人掌）、扇扇子、上下车；空手只能看（喝一口）
        function rdOneHand(k, a) { return !k ? true : !!(IND_ITEMS[k].eat || IND_ITEMS[k].potion || k === 'cactus' || k === 'fan' || IND_ITEMS[k].veh || indContOf(k)); }
        // 左键：骑着只能开工作台编织（合成会按配方挡）和看地图；别的都"没法用"
        function rdBlockAction(a) {
            let k = indSel();
            if (k && IND_ITEMS[k].veh) { rdPanel(); return true; }
            if (!ind.ride) return false;
            if (a && a.kind === 'bench') return false;
            indFlash('骑着没法用'); return true;
        }
        // 走路速度：骑着的固定速度；返回 0 = 动不了（车没电）
        function rdMoveSpeed(dt, moving) {
            let R = ind.ride; if (!R) return -1;
            if (R.ty === 'bike') return ind.stam > 0 ? rdSpeed() * RD.bike : IND_T.speed;
            let c = rdCar();
            if (!rdCarOk()) { if (moving && !(R.why > ind.t)) { R.why = ind.t + 4; indFlash(rdCarWhy()); } return 0; }
            if (moving) c.u = Math.max(0, c.u - RD.draw * (R.dest ? RD.autoMul : 1) * dt);   // 自动驾驶耗电多一半
            return rdSpeed() * RD.car;
        }
        // 撞树、石头、水就停
        function rdBlocked(x, z) {
            if (!ind.ride) return false;
            if (ind.where !== 'trip') return false;
            if (indWaterDepth(x, z) > IND_WATER.wet) return true;
            return ind.nodes.some(function (o) { return !o.dead && (o.tree || o.rock || o.hard || o.key === 'cactus') && Math.abs(o.x - x) < RD.hit && Math.abs(o.z - z) < RD.hit && Math.hypot(o.x - x, o.z - z) < RD.hit; });
        }
        // 每帧：模型跟着人、背包里没有这辆车就下车
        function rdTick(dt) {
            let R = ind.ride; if (!R) return;
            if (!ind.bag[R.k]) { rdDismount('车不在身上了，下车'); return; }
            if (ind.where === 'trip' && ind.onRaft) { rdDismount(); return; }
            if (!R.m) {
                let g = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(R.ty === 'car' ? 1.6 : 0.35, R.ty === 'car' ? 0.7 : 0.45, R.ty === 'car' ? 2.8 : 1.5), new THREE.MeshLambertMaterial({ color: IND_ITEMS[R.k].col }));
                body.position.y = 0.45; g.add(body); R.m = g; ind.objs.push(g); scene.add(g);
            }
            R.m.position.set(ind.p.x, ind.p.y, ind.p.z); if (ind.me) R.m.rotation.y = ind.me.rotation.y;
        }
        // 面板：自行车写说明；车放电池（跟电池组一样的规则）
        function rdPanel() {
            let k = indSel(); if (!k || !IND_ITEMS[k].veh) return;
            let ty = IND_ITEMS[k].veh, c = rdCar();
            let body = ty === 'bike' ? '<div style="line-height:1.7;">2 × 冲刺速度，脚踏吃体力（没体力只有走路速度）。<br>撞树、石头、水就停；骑着只能做单手的事。</div>' :
                '<div style="line-height:1.7;">电池槽：' + c.bats + ' 节　' + indBankV(c).toFixed(1) + ' V　电量 ' + Math.ceil(c.u) + ' / ' + c.um + '<br>' + (rdCarOk() ? '能开：3 × 冲刺速度，行驶每秒耗 ' + RD.draw + ' U' : '<span style="color:#c62828">' + rdCarWhy() + '</span>') + '<br>背包里有电池 ' + (ind.bag.battery || 0) + ' 节' + (ind.bag.battery_ni ? '，镍电池 ' + ind.bag.battery_ni : '') + (ind.bag.battery_li ? '，锂电池 ' + ind.bag.battery_li : '') + '</div>' +
                '<div style="margin-top:6px;"><button style="' + IND_BTN + '" onclick="rdPutCells(1)">放 1 节</button><button style="' + IND_BTN + '" onclick="rdPutCells(99)">全放</button></div>' +
                '<div style="margin-top:6px;">自动驾驶：' + (c.auto ? '装着（开着车按 M 点地图设目的地）' : '没装') + '<button style="' + IND_BTN + '" onclick="rdAutoToggle()">' + (c.auto ? '拆下来' : '装芯片') + '</button></div>';
            indPanelShow('veh', '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">' + IND_ITEMS[k].name + '</div>' + body + '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>');
        }
        // ── 自动驾驶（任务 50）：车里装上自动驾驶芯片，在地图上点目的地，车自己开：直线 + 简单绕障（树、石头）；水、悬崖、动物、没电就停并提示；碰方向键就接管；耗电多一半 ──
        Object.assign(IND_ITEMS_RAW, { chip_auto: { name: '自动驾驶芯片', col: 0x00e676, use: '装进车（左键点车开面板）：开着车按 M 点地图设目的地，车自己开；也是以后无人设备的控制芯片' } });
        IND_CRAFT.push({ out: 'chip_auto', in: { dev_cchip: 1, ingot_ge: 2, ingot_ga: 2, wire: 4 }, hard: true });
        function rdMapDest(x, z) {
            let R = ind.ride; if (!R || R.ty !== 'car' || !rdCar().auto) return false;
            R.dest = { x: x, z: z }; if (ind.panel === 'map') wdMapDraw(); return true;
        }
        function rdStopAuto(msg) { let R = ind.ride; if (R) R.dest = null; if (msg) indFlash(msg); }
        function rdNodeHit(x, z) { return ind.nodes.some(function (o) { return !o.dead && (o.tree || o.rock || o.hard || o.key === 'cactus') && Math.hypot(o.x - x, o.z - z) < RD.hit + 0.6; }); }
        // 返回这一帧的行进方向 { x, z }（单位向量）；null = 没有（到了、停了、被接管了）
        function rdAuto(manual) {
            let R = ind.ride; if (!R || !R.dest) return null;
            if (manual) { rdStopAuto('接管了'); return null; }
            if (R.ty !== 'car' || !rdCar().auto) { R.dest = null; return null; }
            if (!rdCarOk()) { rdStopAuto('没电了，自动驾驶停了'); return null; }
            let dx = R.dest.x - ind.p.x, dz = R.dest.z - ind.p.z, d = Math.hypot(dx, dz);
            if (d < RD.autoArrive) { rdStopAuto('到了'); return null; }
            let a0 = Math.atan2(dz, dx), tr = ind.where === 'trip', h0 = tr ? indHeight(ind.map, ind.p.x, ind.p.z) : 0;
            if (tr) {
                let ax = ind.p.x + Math.cos(a0) * RD.autoStep, az = ind.p.z + Math.sin(a0) * RD.autoStep;
                if (indWaterDepth(ax, az) > IND_WATER.wet) { rdStopAuto('前面是水，停下了'); return null; }
                if (Math.abs(indHeight(ind.map, ax, az) - h0) > RD.cliff) { rdStopAuto('前面是悬崖，停下了'); return null; }
                if ((ind.wild || []).some(function (w) { return !w.follow && Math.hypot(w.x - ax, w.z - az) < RD.animalR; })) { rdStopAuto('前面有动物，停下了'); return null; }
            }
            let offs = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5];
            for (let i = 0; i < offs.length; i++) {
                let a = a0 + offs[i], x = ind.p.x + Math.cos(a) * RD.autoStep, z = ind.p.z + Math.sin(a) * RD.autoStep;
                if (tr && (rdNodeHit(x, z) || indWaterDepth(x, z) > IND_WATER.wet)) continue;
                return { x: Math.cos(a), z: Math.sin(a) };
            }
            rdStopAuto('绕不过去，停下了'); return null;
        }
        function rdAutoToggle() {
            let c = rdCar();
            if (c.auto) { c.auto = false; indBagAdd('chip_auto', 1); }
            else if (ind.bag.chip_auto > 0) { indBagDel('chip_auto', 1); c.auto = true; }
            else indFlash('背包里没有自动驾驶芯片');
            indSave(); if (ind.panel === 'veh') rdPanel();
        }
        function rdPutCells(n) {
            let key = ind.bag.battery ? 'battery' : ind.bag.battery_ni ? 'battery_ni' : ind.bag.battery_li ? 'battery_li' : 'battery';
            indBankPut(rdCar(), n, key); if (ind.panel === 'veh') rdPanel(); indSave();
        }
