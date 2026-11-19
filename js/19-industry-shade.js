// 猫盾工业：农田中暑和基地里种树（作者 11-19）。放在 19-industry-grab.js 后面。
// 夏天白天在农田边干活（离田 2.4 米内），没遮阴，体温每秒涨 0.06°C，比身体自己往回调的 0.02 快，喝过水（口渴 ≥ 60）慢三成，穿得厚涨得快；体温到 39.5 头晕、体力掉得快，到 41 中暑，硬核掉血，悠闲不死。
// 树苗（砍树掉的，右键地面）能种在基地里，3 个游戏日长成树，长大了 3.2 米内有树荫：站在荫里不涨，体感气温低 3 度。喝水、泡池子本来就降体温。
        const SH = { growT: 3 * IND_DAY, shadeR: 3.2, cap: 30, farmR: 2.4, rate: 0.06, dizzy: 39.5, stroke: 41, hp: 1.5, drain: 0.4, cool: 3, farmKeep: 20 };
        function shTrees() { return ind.base.btrees = Array.isArray(ind.base.btrees) ? ind.base.btrees : []; }
        function shGrowth(t) { return Math.max(0, Math.min(1, ((ind.base.clock || 0) - t.born) / SH.growT)); }
        function shShadeAt(x, z) { return shTrees().some(function (t) { return shGrowth(t) >= 1 && Math.hypot(x - t.x, z - t.z) < SH.shadeR; }); }
        // 右键拿着树苗对着基地地面：种下
        function shPlant(k) {
            let kind = k.slice(8), f = indFace(), x = ind.p.x + f.x * 1.5, z = ind.p.z + f.z * 1.5;
            if (x < IND_BASE.x0 + 1 || x > IND_BASE.x1 - 1 || z < IND_BASE.z0 + 1 || z > IND_BASE.z1 - 1) { indFlash('种在基地里面'); return false; }
            if (shTrees().length >= SH.cap) { indFlash('树够多了'); return false; }
            if (shTrees().some(function (t) { return Math.hypot(x - t.x, z - t.z) < 1.6; })) { indFlash('离别的树太近了'); return false; }
            if (!indSpotFree(x, z, 0.7)) { indFlash('这里种不了，换个空地'); return false; }
            indBagDel(k, 1); shTrees().push({ k: kind, x: x, z: z, born: ind.base.clock || 0 }); ind.btDirty = true; indSave();
            indFlash('种下了，三天长成树，长大了有树荫'); return true;
        }
        function shUse(k, a) { if (ind.where !== 'base' || a || !k || k.indexOf('sapling_') !== 0) return false; return shPlant(k); }
        // 画基地里的树：树苗小、长大变高，长到头换成大树冠
        function shDraw() {
            if (ind.where !== 'base') return;
            let T = shTrees(), stage = T.map(function (t) { return Math.floor(shGrowth(t) * 10); }).join(',');
            if (!ind.btM) ind.btM = [];
            if (!ind.btDirty && ind.btSig === stage && ind.btM.every(function (m) { return m.parent; })) return;
            ind.btM.forEach(function (m) { if (m.parent) m.parent.remove(m); }); ind.btM = []; ind.btSig = stage; ind.btDirty = false;
            T.forEach(function (t) {
                let g = shGrowth(t), th = 0.5 + 1.9 * g, cs = 0.3 + 1.4 * g, col = t.k === 'pine' ? 0x1b5e20 : t.k === 'rubber' ? 0x7cb342 : 0x43a047;
                let tr = new THREE.Mesh(indGeo(new THREE.CylinderGeometry(0.1 + 0.15 * g, 0.14 + 0.2 * g, th, 6)), indMat(new THREE.MeshLambertMaterial({ color: 0x6d4c41 }))); tr.position.set(t.x, th / 2, t.z); indAdd(tr); ind.btM.push(tr);
                let cr = new THREE.Mesh(indGeo(new THREE.DodecahedronGeometry(cs, 0)), indMat(new THREE.MeshLambertMaterial({ color: col }))); cr.position.set(t.x, th + cs * 0.6, t.z); cr.scale.y = t.k === 'pine' ? 1.5 : 1; indAdd(cr); ind.btM.push(cr);
            });
        }
        // 农田边干活的热：每帧调（indBodyTick 里）
        function shFarmHeat(dt) {
            if (!ind || ind.where !== 'base' || !ind.base.rule) return;
            let S = ind.base.surv, B = ind.base, near = (B.tiles || []).some(function (t) { return Math.hypot(ind.p.x - t.x, ind.p.z - t.z) < SH.farmR; });
            if (indSeason() === 1 && !indIsNight() && near && !shShadeAt(ind.p.x, ind.p.z)) {
                S.temp += SH.rate * (S.water >= 60 ? 0.7 : 1) * Math.max(0.3, 1 - indWarmth() * 0.05) * dt; ind.farmT = SH.farmKeep;
            } else ind.farmT = Math.max(0, (ind.farmT || 0) - dt);
            if (!(ind.farmT > 0)) { ind.dizzyHint = false; return; }
            if (S.temp >= SH.dizzy) {
                S.energy = Math.max(0, S.energy - SH.drain * dt);
                if (!ind.dizzyHint) { ind.dizzyHint = true; indFlash('头晕，快进树荫或喝点水'); }
            } else if (S.temp < SH.dizzy - 1) ind.dizzyHint = false;
            if (S.temp >= SH.stroke) { if (indHard()) indHurt(SH.hp * dt, 'heat', '在农田里晒中暑了，体温 ' + S.temp.toFixed(1) + '°C'); if (!ind.strokeHint) { ind.strokeHint = true; indFlash('中暑了，快进树荫'); } } else if (S.temp < SH.stroke - 1) ind.strokeHint = false;
        }
        // 存档整理：树的列表
        function shFixBase(b) { b.btrees = Array.isArray(b.btrees) ? b.btrees.filter(function (t) { return t && ['oak', 'pine', 'rubber'].indexOf(t.k) >= 0 && isFinite(t.x) && isFinite(t.z) && isFinite(t.born); }).slice(0, SH.cap) : []; }
