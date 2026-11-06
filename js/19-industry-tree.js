// 猫盾工业：树种（docs/tools-trees.md 第 6 节、步骤 7）。放在 19-industry-ach.js 后面，只做"能拿到"：
// 松树：拿小刀或斧子右键割松脂，一棵 3 份，割一份 300 秒后再长 1 份；橡胶树：森林里 1/12 的树，右键割胶（站在 3 米内 8 秒，可以边走），一棵 4 份乳胶；椰子树：空手左键摇，掉 1～2 个椰子，一棵一趟一次。
// 乳胶 2 + 硫 1，灶台 150°C 20 秒 → 橡胶。椰子右键喝（口渴 +15），喝完变椰壳。椰壳装水、橡胶的用处（电线外皮、手柄）这次不做。
// 割松脂、割胶、摇椰子悠闲也有；熬橡胶要硫，只给硬核。远征地图不存档，树上剩多少只记在这一趟的树上。
        const TR = { resin: 3, resinT: 300, latex: 4, tap: 8, tapR: 3, rubber: 1 / 12 };
        WD_TREE.rubber = { th: 2.4, tw: 0.5, cy: 3.4, cs: [1.4, 1.7, 1.4], col: 0x7cb342 };
        WD_TREE_NAME.rubber = '橡胶树';
        Object.assign(IND_ITEMS_RAW, {
            latex: { name: '乳胶', col: 0xfffde7, use: '2 份乳胶加 1 份硫，在灶台 150°C 熬 20 秒成橡胶' },
            rubber: { name: '橡胶', col: 0x212121, use: '以后做电线外皮、手柄' },
            resin: { name: '松脂', col: 0xffb300, use: '引火物' },
            coconut: { name: '椰子', col: 0x795548, eat: { w: 15, back: 'coconut_shell' }, use: '右键喝，口渴 +15，喝完剩椰壳' },
            coconut_shell: { name: '椰壳', col: 0x5d4037, use: '喝完椰子剩下的壳' }
        });
        IND_RECIPES.push({ in: { latex: 2, sulfur: 1 }, out: { rubber: 1 }, cls: 'bulk', minT: 150, time: 20, hard: true });   // 硫只有硬核有，熬橡胶只给硬核
        // 森林里 1/12 的树是橡胶树（按位置算，不吃随机数，别的树的位置和老地图不变）
        function trKind(M, x, z, base) { return base === 'oak' && indBiome(M, x, z) === 'forest' && indHash(Math.floor(x), Math.floor(z), 4141) < TR.rubber ? 'rubber' : base; }
        function trHaveKnife() { let k = indSel(); return tlKind(k) === 'knife' || tlKind(k) === 'axe'; }   // 各档的刀、斧都行
        function trResinLeft(o) {
            if (o.rs === undefined) o.rs = TR.resin;
            while (o.rs < TR.resin && ind.t >= o.rt) { o.rs++; o.rt += TR.resinT; }
            return o.rs;
        }
        // 右键对着树：松树割松脂（一下一份）、橡胶树开始割胶；别的返回 false，走原来的右键
        function trTap(a) {
            if (!ind || ind.where !== 'trip' || !a || a.kind !== 'node' || !a.o.tree || a.o.dead) return false;
            let o = a.o;
            if (o.tree !== 'pine' && o.tree !== 'rubber') return false;
            if (!trHaveKnife()) { indFlash('拿小刀或斧子才割得了'); return true; }
            if (o.tree === 'pine') {
                if (trResinLeft(o) < 1) { indFlash('这棵的松脂割完了，过一阵会再长'); return true; }
                if (o.rs === TR.resin) o.rt = ind.t + TR.resinT;
                o.rs--; indBoxAdd('resin', 1); ind.hudSig = ''; return true;
            }
            if (o.lx === undefined) o.lx = TR.latex;
            if (o.pin && o.lx < TR.latex && ind.t - (o.lr || 0) >= TR.resinT) { o.lx++; o.lr = ind.t; }   // 钉住的块里的橡胶树：割完 300 秒长回 1 份（任务 74）
            if (o.lx < 1) { indFlash('这棵橡胶树割完了'); return true; }
            if (ind.tap && ind.tap.o === o) return true;
            ind.tap = { o: o, t: 0 }; return true;
        }
        function trTick(dt) {
            let P = ind && ind.tap; if (!P) return;
            if (ind.where !== 'trip' || P.o.dead) { ind.tap = null; return; }
            if (!trHaveKnife()) { ind.tap = null; indFlash('割胶停了：手上要拿小刀或斧子'); return; }
            if (Math.hypot(ind.p.x - P.o.x, ind.p.z - P.o.z) > TR.tapR) { ind.tap = null; indFlash('离树太远，割胶停了'); return; }
            P.t += dt; if (P.t < TR.tap) return;
            ind.tap = null; P.o.lx--; P.o.lr = ind.t; let r = indBoxAdd('latex', 1); if (P.o.lx < 1) indFlash('这棵割完了'); ind.hudSig = '';
        }
        // 空手左键摇椰子树：掉 1～2 个椰子，一棵一趟一次；手上拿着斧子、小刀、稿子就是砍树，不摇
        function trShake(o) {
            if (!ind || ind.where !== 'trip' || !o || o.tree !== 'palm' || o.dead) return false;
            let k = indSel(); if (k === 'axe' || k === 'knife' || (k && IND_ITEMS[k] && IND_ITEMS[k].tool)) return false;
            if (o.sh && !(o.pin && ind.t - o.sh >= TR.resinT)) { indFlash('这棵树上的椰子已经摇下来了'); return true; }   // 钉住的块里的椰子树 300 秒再长
            o.sh = ind.t + 1; let n = 1 + Math.floor(indRand() * 2), r = indBoxAdd('coconut', n);
            ind.hudSig = ''; return true;
        }
        const wdNodeHint0 = wdNodeHint;
        wdNodeHint = function (o) {
            let h = wdNodeHint0(o);
            if (!o.tree) return h;
            if (o.tree === 'pine') return h + '<br><small>右键：割松脂（还有 ' + trResinLeft(o) + ' 份，要小刀或斧子）</small>';
            if (o.tree === 'rubber') return h + '<br><small>右键：割胶（还有 ' + (o.lx === undefined ? TR.latex : o.lx) + ' 份，要小刀或斧子）</small>';
            if (o.tree === 'palm') return h + '<br><small>空手左键：摇椰子' + (o.sh && !(o.pin && ind.t - o.sh >= TR.resinT) ? '（摇过了）' : '') + '</small>';
            return h;
        };
