// 猫盾工业：自己挖水池（docs/water-fish.md 分步第 1、2 步的"自己挖的池子"这一半）。放在 19-industry-fire.js 后面。
// 拿铲子对着基地空地左键：挖一格（1 × 1 米，4 秒 × 铲子档的倍数，掉 2 精力），出 2 份泥土。挨着的格（四邻）连成一个池子，水在一个池子里是平的。
// 每格最多 4 桶，全家最多 60 格。空桶右键接 1 桶、水桶右键倒 1 桶、空手右键喝一口（0.1 桶）。拿铲子右键填回一格（要 2 份泥土或沙子，这格的水没了）。
// 漏水：没铺的格每分钟渗 0.1 桶；拿 2 黏土右键铺黏土不漏；拿 1 砖右键铺砖不漏、蒸发 −20%。
// 蒸发：每格每分钟白天 0.02、夜里 0.005 桶；木盖（工作台 木头 4）右键盖一格不蒸发，盖着的格接不了水，再右键掀开（还你木盖）。悠闲漏水和蒸发 ×0.5。
// 出生点原来的水池这次不动（还是无限的水），井、养鱼、原水池改成有存量都没做，等下一次。
        const PD = { cap: 4, max: 60, dig: 4, energy: 2, fill: 2, leak: 0.1 / 60, evapDay: 0.02 / 60, evapNight: 0.005 / 60, brickEvap: 0.8, sip: 0.1, reach: 1.6 };
        Object.assign(IND_ITEMS_RAW, { pond_lid: { name: '木盖', col: 0x8d6e63, use: '拿着右键自己挖的水池：盖一格（不蒸发、接不了水），再右键掀开' } });
        IND_CRAFT.push({ out: 'pond_lid', in: { wood: 4 } });
        function pdCells() { return ind.base.pond = ind.base.pond || []; }
        function pdCellAt(i, j) { return pdCells().filter(function (c) { return c.i === i && c.j === j; })[0] || null; }
        function pdFront() { let f = indFace(); return { i: Math.round(ind.p.x + f.x * PD.reach), j: Math.round(ind.p.z + f.z * PD.reach) }; }
        function pdAimCell() { let p = pdFront(); return ind.where === 'base' ? pdCellAt(p.i, p.j) : null; }
        // 一个池子 = 四邻连着的格
        function pdGroup(c) {
            let out = [c], seen = {}; seen[c.i + ',' + c.j] = 1;
            for (let k = 0; k < out.length; k++) { let a = out[k]; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { let n = pdCellAt(a.i + d[0], a.j + d[1]), key = (a.i + d[0]) + ',' + (a.j + d[1]); if (n && !seen[key]) { seen[key] = 1; out.push(n); } }); }
            return out;
        }
        function pdWater(G) { return G.reduce(function (t, c) { return t + (c.w || 0); }, 0); }
        // 池子里的水是平的：总量平均摊到每一格
        function pdLevel(G) { let w = pdWater(G), each = w / G.length; G.forEach(function (c) { c.w = each; }); }
        function pdNear(x, z, r) { return pdCells().some(function (c) { return Math.abs(c.i - x) < 0.5 + r && Math.abs(c.j - z) < 0.5 + r; }); }
        // 挖一格：铲子对着空地左键
        function pdDig() {
            if (ind.where !== 'base' || tlKind(indSel()) !== 'shovel') return false;
            let p = pdFront(), B = ind.base;
            if (pdCellAt(p.i, p.j)) return wlDeepen(pdCellAt(p.i, p.j));   // 已经挖好的格子再往下挖：井（19-industry-fish.js）
            if (pdCells().length >= PD.max) { indFlash('池子太大了（最多 ' + PD.max + ' 格）'); return true; }
            if (Math.abs(p.i) > IND_BASE.x - 1 || Math.abs(p.j) > IND_BASE.z - 1 || !indSpotFree(p.i, p.j, 0.5) || (B.tiles || []).some(function (t) { return Math.abs(t.x - p.i) < 1.5 && Math.abs(t.z - p.j) < 1.5; })) { indFlash('这里挖不了（农田、家具、房子、出发门旁边）'); return true; }
            let sh = indSel();
            return wdChStart({ kind: 'pond', need: PD.dig * tlMul(sh), label: '挖水池', done: function () {
                if (pdCellAt(p.i, p.j)) return;
                pdCells().push({ i: p.i, j: p.j, w: 0 }); let S = B.surv; S.energy = Math.max(0, S.energy - PD.energy);
                let G = pdGroup(pdCellAt(p.i, p.j)); pdLevel(G);
                indBoxAdd('dirt', 2); tlUse(sh); ind.pdDirty = true; indSave(); 
            } });
        }
        // 右键对着自己挖的池子
        function pdUse(k) {
            if (wlUse(k)) return true;
            let c = pdAimCell(); if (!c) return false;
            let G = pdGroup(c), w = pdWater(G), kc = k && indContOf(k);
            if (fhUse(k, c, G)) return true;
            if (k === 'pond_lid') { if (c.lid) { indFlash('这格已经盖了'); return true; } indBagDel(k, 1); c.lid = true; ind.pdDirty = true; indSave(); return true; }
            if (c.lid && !(k && tlKind(k) === 'shovel')) { indBagAdd('pond_lid', 1); c.lid = false; ind.pdDirty = true; indSave(); return true; }
            if (k === 'clay' || k === 'brick') {
                let need = k === 'clay' ? 2 : 1; if (c.l) { indFlash('这格已经铺了'); return true; }
                if ((ind.bag[k] || 0) < need) { indFlash('铺一格要 ' + need + ' 份' + indName(k)); return true; }
                indBagDel(k, need); c.l = k; ind.pdDirty = true; indSave(); return true;
            }
            if (k && tlKind(k) === 'shovel') {
                let soil = (ind.bag.dirt || 0) >= PD.fill ? 'dirt' : (ind.bag.sand || 0) >= PD.fill ? 'sand' : null;
                if (!soil) { indFlash('填回一格要 ' + PD.fill + ' 份泥土或沙子'); return true; }
                indBagDel(soil, PD.fill); let left = w - (c.w || 0); if (c.lid) indBagAdd('pond_lid', 1);
                ind.base.pond = pdCells().filter(function (x) { return x !== c; });
                G.filter(function (x) { return x !== c; }).forEach(function (x) { x.w = 0; }); let rest = G.filter(function (x) { return x !== c; }); if (rest.length) { rest[0].w = left; pdLevel(pdGroup(rest[0])); }
                ind.pdDirty = true; indSave(); return true;
            }
            if (indIsEmptyCont(k)) {
                if (w < 1 - 1e-9) { indFlash('池子里没水了'); return true; }
                G.forEach(function (x) { x.w -= 1 / G.length; }); indBagDel(k, 1); indBagAdd(indFilledKey('water_raw', kc.mat), 1); ind.pdDirty = true; return true;
            }
            if (kc && (kc.base === 'water_raw' || kc.base === 'water_boiled' || kc.base === 'water_sea')) {
                if (w > G.length * PD.cap - 1 + 1e-9) { indFlash('池子满了（' + G.length * PD.cap + ' 桶）'); return true; }
                G.forEach(function (x) { x.w += 1 / G.length; }); indBagDel(k, 1); indBagAdd(indEmptyKey(kc.mat), 1); ind.pdDirty = true; return true;
            }
            if (!k) {
                if (w < PD.sip) { indFlash('池子里没水了'); return true; }
                G.forEach(function (x) { x.w -= PD.sip / G.length; }); let S = ind.base.surv; S.water = Math.min(100, S.water + 10);
                let sick = indRand() < 0.3; if (sick) ind.sickT = IND_SURV.sick; indFlash('喝了一口生水' + (sick ? '，肚子不舒服' : '')); return true;
            }
            return false;
        }
        // 每秒：漏水、蒸发（基地里实时走，出门回来补算也走）
        function pdTick(dt) {
            fhTickAll(dt);
            let L = pdCells(); if (!L.length) return;
            let night = indIsNight(), mul = indHard() ? 1 : 0.5;
            L.forEach(function (c) {
                if (!(c.w > 0)) return;
                let loss = (c.l ? 0 : PD.leak) + (c.lid ? 0 : (night ? PD.evapNight : PD.evapDay) * (c.l === 'brick' ? PD.brickEvap : 1));
                c.w = Math.max(0, c.w - loss * mul * dt);
            });
            ind.pdT = (ind.pdT || 0) + dt; if (ind.pdT >= 1) { ind.pdT = 0; let seen = {}; L.forEach(function (c) { if (seen[c.i + ',' + c.j]) return; let G = pdGroup(c); G.forEach(function (x) { seen[x.i + ',' + x.j] = 1; }); pdLevel(G); }); ind.pdDirty = true; }
        }
        // 画：一格一个方块（空池子土色、有水蓝色、盖了木色、铺了颜色深一点）
        function pdSync() {
            if (ind.where !== 'base') return;
            if (!ind.pdMesh || !ind.pdMesh.parent) { ind.pdMesh = indInst(new THREE.BoxGeometry(1, 0.1, 1), PD.max + 4); ind.pdDirty = true; }
            if (!ind.pdDirty) return; ind.pdDirty = false; indDummy();
            let L = pdCells();
            L.forEach(function (c, n) {
                IND_DUMMY.position.set(c.i, c.lid ? 0.08 : 0.03, c.j); IND_DUMMY.rotation.set(0, 0, 0); IND_DUMMY.scale.set(1, 1, 1); IND_DUMMY.updateMatrix();
                ind.pdMesh.setMatrixAt(n, IND_DUMMY.matrix);
                ind.pdMesh.setColorAt(n, IND_COL.setHex(c.lid ? 0xa1887f : c.w > 0.05 ? (c.l === 'brick' ? 0x0277bd : 0x29b6f6) : c.l === 'brick' ? 0xbf5b3a : c.l === 'clay' ? 0x8d6e63 : 0x5d4037));
            });
            wlList().forEach(function (w, n) { IND_DUMMY.position.set(w.i, 0.03, w.j); IND_DUMMY.rotation.set(0, 0, 0); IND_DUMMY.scale.set(0.8, 1, 0.8); IND_DUMMY.updateMatrix(); ind.pdMesh.setMatrixAt(L.length + n, IND_DUMMY.matrix); ind.pdMesh.setColorAt(L.length + n, IND_COL.setHex(0x01579b)); });
            ind.pdMesh.count = L.length + wlList().length; ind.pdMesh.instanceMatrix.needsUpdate = true; if (ind.pdMesh.instanceColor) ind.pdMesh.instanceColor.needsUpdate = true;
        }
        function pdHint() {
            let c = pdAimCell(); if (!c) return '';
            let G = pdGroup(c), w = pdWater(G), lined = G.filter(function (x) { return x.l; }).length;
            return '水池（自己挖的）' + G.length + ' 格，水 ' + (Math.round(w * 10) / 10) + ' / ' + G.length * PD.cap + ' 桶，铺了 ' + lined + ' 格' + (lined < G.length && w > 0 ? '，漏水中' : '') + (c.lid ? '　这格盖着' : '') + fhHint(G) + '<br><small>空桶右键接水、水桶右键倒水、空手右键喝；黏土 2／砖 1 右键铺；铲子右键填回</small>';
        }
        function pdFixBase(b) {
            if (!Array.isArray(b.pond)) { delete b.pond; return; }
            let seen = {};
            b.pond = b.pond.filter(function (c) { if (!c || !isFinite(c.i) || !isFinite(c.j)) return false; let k = (c.i | 0) + ',' + (c.j | 0); if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, PD.max)
                .map(function (c) { let o = { i: c.i | 0, j: c.j | 0, w: indNum(c.w, 0, 0, PD.cap) }; if (c.l === 'clay' || c.l === 'brick') o.l = c.l; if (c.lid) o.lid = true; if (c.f) o.f = c.f; return o; });
        }
