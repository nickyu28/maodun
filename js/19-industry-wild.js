// 猫盾工业：荒野玩法（第三种，作者 11-28，设计页 docs/wilderness.md）。放在 19-industry-touch.js 后面，W1：世界。
// 一张 2000 × 2000 米的固定地图，种子存在存档里（base.wild.seed），进出都是同一张图；开局没有基地。现在只有调试入口 indWildGo(seed)，选玩法卡片在 W2 接。
        const WILD = { map: 1000, spawnR: 150 };
        function indWildLeave() { if (IND_MAP !== IND_MAP0) { IND_MAP = IND_MAP0; if (typeof wdSizeSync === 'function') wdSizeSync(); } if (ind) ind.wildMode = false; }
        // 进荒野：第一次生成种子存档，以后用同一个；把地图大小改成 2000 米，用同一套远征地图生成，不刷新
        function indWildGo(seed) {
            if (!ind || !ind.base || ind.loading) return false;
            let B = ind.base; if (!B.wild || !(B.wild.seed > 0)) B.wild = { seed: seed > 0 ? seed >>> 0 : (((Date.now() ^ (Math.random() * 1e9)) >>> 0) || 1) };
            IND_MAP = WILD.map; wdSizeSync();
            indGoTrip(B.wild.seed);
            ind.wildMode = true; ind.exits = [];   // 没有撤离点，也没有"回基地"
            indWildSpawn();
            indSave();
            return true;
        }
        // 出生点：离 (0, 0) 150 米内找一个能站的地方（不在水里、不陡、不是山顶），能站的草甸最好
        function indWildSpawn() {
            let M = ind.map, best = null, bs = 1e9;
            for (let r = 0; r <= WILD.spawnR && !best; r += 10) for (let a = 0; a < 6.283; a += 0.5) {
                let x = Math.cos(a) * r, z = Math.sin(a) * r, h = indHeight(M, x, z);
                if (h < 0.4 || h > 12) continue;
                let sl = Math.max(Math.abs(indHeight(M, x + 3, z) - h), Math.abs(indHeight(M, x, z + 3) - h)); if (sl > 1.2) continue;
                let bm = indBiome(M, x, z), sc = r + (bm === 'plain' ? 0 : 40); if (sc < bs) { bs = sc; best = { x: x, z: z, h: h }; }
            }
            if (!best) best = { x: 0, z: 0, h: Math.max(IND_WATER_Y, indHeight(M, 0, 0)) };
            ind.p.x = best.x; ind.p.z = best.z; ind.p.y = best.h; ind.p.vy = 0;
            return best;
        }
