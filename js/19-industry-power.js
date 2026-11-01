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
