// 猫盾工业：电磁线圈、手摇发电机（任务 32）。放在 19-industry-nuke.js 后面。
// 电磁线圈（工作台）：磁石 2 + 铜线 10 + 铅 1。用途：手摇发电机、变压器（任务 30）、以后的时间加速器。
// 手摇发电机：不用燃料，站在旁边按住右键摇，摇的时候是 6 V 电源（能让电解槽、水泵、压缩机、粉碎机跑；离心机、压力机、电炉不行），松手 0.3 秒后没电。
// 摇不花体力（没必要），要站在 3 米内、准星对着它。短按右键还是收起。
        Object.assign(IND_ITEMS_RAW, {
            coil: { name: '电磁线圈', col: 0xb87333, use: '做手摇发电机、变压器（以后还有时间加速器）' },
            dev_crank: { name: '手摇发电机', col: 0x7cb342, dev: 'crank', use: '放下，按住右键摇，摇的时候是 6 V 电源；也能给铜线接的用电器（电解槽、水泵）应急' }
        });
        IND_CRAFT.push(
            { out: 'coil', in: { magnet: 2, wire: 10, ingot_pb: 1 }, hard: true },
            { out: 'dev_crank', in: { coil: 2, steel: 2, wood: 4 }, hard: true }
        );
        const PW = { volt: 6, hold: 0.3, near: 3 };
        Object.assign(IND_DEVS, { crank: { name: '手摇发电机', col: 0x7cb342, src: true, volt: PW.volt, size: [1, 0.9, 0.9] } });
        IND_DEV_VOLT.crank = function (d) { return d.cr > 0 ? PW.volt : 0; };
        IND_DEV_INFO.crank = function (d) { return '手摇发电机 ' + (d.cr > 0 ? '摇着 ' + PW.volt + ' V' : '没在摇（按住右键摇）'); };
        IND_DEV_FIX.crank = function (d) { d.cr = 0; };
        // 右键按下对着手摇发电机：开始摇（indRightDown 里调用）；短按（< 0.25 秒）还是收起
        function pwCrankDown(a) {
            if (!a || a.kind !== 'dev' || a.o.ty !== 'crank') return false;
            let k = indSel(); if (k && IND_ITEMS[k].dev) return false;   // 手里拿着设备是要放设备
            ind.crank = { d: a.o, t: 0 }; return true;
        }
        function pwCrankUp() {
            let c = ind && ind.crank; if (!c) return false;
            ind.crank = null;
            if (c.t < 0.25) indPickDev(c.d);
            return true;
        }
        // 每帧：摇着的刷新电压，没摇的衰减；摇要站在 3 米内、准星还对着它、有体力
        function pwCrankTick(dt) {
            if (ind.where !== 'base') { ind.crank = null; return; }
            ind.base.devs.forEach(function (d) { if (d.ty === 'crank' && d.cr > 0) d.cr = Math.max(0, d.cr - dt); });
            let c = ind.crank; if (!c) return;
            let a = indAim();
            if (!(a && a.kind === 'dev' && a.o === c.d) || Math.hypot(ind.p.x - c.d.x, ind.p.z - c.d.z) > PW.near + 0.5 || !indDev(c.d.id)) { ind.crank = null; return; }
            c.t += dt;
            if (c.t < 0.25) return;   // 先看是不是短按
            c.d.cr = PW.hold;
        }

// ── 变压器（任务 30）──
// 核电的汽轮发电机 48 V，别的用电器额定 6～24 V。变压器：输入端当用电器（额定 48 V，超了才炸），输出端当电源，点一下切换输出 6 / 12 / 24 V；
// 输出不会高于输入（输入低于选的就按输入输出，不升压）；输出的耗电折算回输入端的电池组。一个变压器输出可以接多个用电器。
        Object.assign(IND_ITEMS_RAW, { dev_xfmr: { name: '变压器', col: 0x5d4037, dev: 'xfmr', use: '接在汽轮发电机（48 V）和用电器之间降压；也能把电池组的电降到 6 V 给电灯用' } });
        IND_CRAFT.push({ out: 'dev_xfmr', in: { steel: 4, coil: 4, brass: 2 }, hard: true });
        Object.assign(IND_DEVS, { xfmr: { name: '变压器', col: 0x5d4037, src: true, rated: 48, minV: 1.5, draw: 0, size: [1.2, 1.1, 1] } });
        const PW_OUT = [6, 12, 24];
        function pwIsXfmr(d) { return !!d && d.ty === 'xfmr'; }
        // 输入电压：接进变压器的电源里最高的（变压器接变压器时往上一层找，最多 4 层，防循环）
        function pwInV(d, depth) {
            if (depth > 4) return 0;
            return indDevSrcs(d).reduce(function (m, s) { return Math.max(m, s === d ? 0 : (s.ty === 'xfmr' ? pwOutV(s, depth + 1) : indSrcVolt(s))); }, 0);
        }
        function pwOutV(d, depth) { let v = pwInV(d, depth || 0); return v > 0 ? Math.min(d.out || 12, v) : 0; }
        IND_DEV_VOLT.xfmr = function (d) { return pwOutV(d, 0); };
        IND_DEV_INFO.xfmr = function (d) { let vi = pwInV(d, 0); return '变压器　输入 ' + vi.toFixed(1) + ' V → 输出 ' + pwOutV(d, 0).toFixed(1) + ' V（选了 ' + (d.out || 12) + ' V，点一下切换）'; };
        IND_DEV_FIX.xfmr = function (d) { d.out = PW_OUT.indexOf(d.out) >= 0 ? d.out : 12; };
        function pwXfmrCycle(d) { d.out = PW_OUT[(PW_OUT.indexOf(d.out || 12) + 1) % PW_OUT.length]; indSave(); indFlash('变压器输出 ' + d.out + ' V（输出不会高于输入）'); return true; }
        // 接线谁是电源谁是用电器：一头是变压器时——另一头是电源 → 变压器是用电器；另一头是用电器 → 变压器是电源；两头都是变压器 → 先选的当电源
        function pwWireRoles(a, d) {
            if (!pwIsXfmr(a) && !pwIsXfmr(d)) return null;
            let x = pwIsXfmr(d) ? d : a, o = x === d ? a : d;
            if (pwIsXfmr(o)) return { src: a, dev: d };
            if (IND_DEVS[o.ty].src) return { src: o, dev: x };
            return { src: x, dev: o };
        }
        // 把一串电源展开到最上游：变压器换成它输入端的电源
        function pwUpstream(live, depth) {
            depth = depth || 0; let out = [];
            live.forEach(function (s) {
                if (s.ty === 'xfmr' && depth < 4) out = out.concat(pwUpstream(indDevSrcs(s).filter(function (u) { return u !== s && indSrcVolt(u) > 0; }), depth + 1));
                else out.push(s);
            });
            return out;
        }
