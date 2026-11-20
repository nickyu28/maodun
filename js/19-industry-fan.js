// 猫盾工业：电风扇（作者 11-20「加入风扇」）。放在 19-industry-touch.js 后面。只有硬核。手摇的扇子（fan）不动，这个叫电风扇（dev_fan）。
// 通电设备（铜线接电池组，12 V，耗电不大），放在基地里朝一个方向吹，吹 7 米，左右各 40 度。叶片通电才转，有声音。只有三个效果：
// 1 降温自己：站在风里，热天和炉边的热度（有效气温）降 8°C，体温高于 37 还每秒多降 0.04°C。
// 2 缓慢升温炉子：对着烧着的炉子吹，炉温目标慢慢多涨 120°C，30 秒涨满，比风箱慢，不用人拉。
// 3 降温锭和其他：风里的烫东西（出料槽里的、地上的、身上带的）凉得快，30 秒的变 10 秒。
        const FN = { range: 7, half: 0.7, rated: 12, minV: 6, draw: 0.4, bodyEff: 8, bodyRate: 0.04, boost: 120, ramp: 30, coolMul: 3 };
        Object.assign(IND_ITEMS_RAW, { dev_fan: { name: '电风扇', col: 0x90caf9, dev: 'fan', use: '通电转，朝一个方向吹：降体温，慢慢吹旺炉子，烫的锭凉得快' } });
        IND_DEVS.fan = { name: '电风扇', col: 0x90caf9, rated: FN.rated, minV: FN.minV, draw: FN.draw, size: [0.35, 1.2, 0.35] };
        IND_CRAFT.push(
            { out: 'dev_fan', in: { ingot_fe: 2, wire: 6, motor: 1, ingot_al: 2 }, hard: true },
            { out: 'dev_fan', in: { ingot_fe: 2, wire: 6, motor: 1, plastic: 2 }, hard: true }
        );
        function fnFans() { return ind && ind.where === 'base' && ind.base ? ind.base.devs.filter(function (d) { return d.ty === 'fan' && d.pw; }) : []; }
        function fnHit(d, x, z) {
            let dx = x - d.x, dz = z - d.z, r = Math.hypot(dx, dz); if (r > FN.range || r < 0.4) return false;
            let a = d.dir || 0; return (dx * Math.cos(a) + dz * Math.sin(a)) / r >= Math.cos(FN.half);
        }
        function fnWind(x, z) { return fnFans().some(function (d) { return fnHit(d, x, z); }); }
        // 自己：站在风里，高于中性的有效气温降 8 度（不低于中性）
        function fnEff(eff) { if (eff > IND_BODY.hot && ind && ind.p && fnWind(ind.p.x, ind.p.z)) return Math.max(IND_BODY.hot, eff - FN.bodyEff); return eff; }
        function fnBodyCool(S, dt) { if (S.temp > 37 && ind && ind.p && fnWind(ind.p.x, ind.p.z)) S.temp = Math.max(37, S.temp - FN.bodyRate * dt); }
        // 炉子：烧着的炉子在风里，目标温度慢慢多涨；风停了慢慢退
        function fnTargetAdd(c, dt) {
            let S = c.C, on = S.fire > 0 && fnWind(c.x, c.z), w = S.fanW || 0;
            w = on ? Math.min(1, w + dt / FN.ramp) : Math.max(0, w - dt / FN.ramp); S.fanW = w;
            return FN.boost * w;
        }
        // 烫的东西：在风里凉得快
        function fnCoolMul(x, z) { return fnWind(x, z) ? FN.coolMul : 1; }
        // 转向：每次 45 度
        function fnTurn(id, dlt) { let d = indDev(id); if (!d) return; d.dir = ((d.dir || 0) + dlt * Math.PI / 4) % (2 * Math.PI); indSave(); ind.panelDirty = true; ind.fanSig = ''; }
        function fnDeg(d) { return Math.round((((d.dir || 0) * 180 / Math.PI) % 360 + 360) % 360); }
        IND_DEV_HTML.fan = function (d) {
            let V = indDevVolt(d);
            return '<div style="font-size:18px;font-weight:bold;margin-bottom:6px;">电风扇</div><div style="line-height:1.7;">电压 <b>' + V.toFixed(1) + ' V</b>，额定 ' + FN.rated + ' V　' + (d.pw ? '转着' : '没电，不转') + '</div>' +
                '<div style="margin-top:6px;">朝向 <b>' + fnDeg(d) + '</b> 度　<button style="' + IND_BTN + '" onclick="fnTurn(' + d.id + ',-1)">左转 45 度</button><button style="' + IND_BTN + '" onclick="fnTurn(' + d.id + ',1)">右转 45 度</button></div>' +
                '<div style="margin-top:6px;color:#888;font-size:13px;">吹 ' + FN.range + ' 米，左右各 40 度。站在风里降体温；对着烧着的炉子吹，炉温慢慢多涨 ' + FN.boost + '°C；风里烫的锭、地上和出料槽里的凉得快。铜线接电池组。</div>' +
                '<div style="margin-top:8px;text-align:right;"><button style="' + IND_BTN + '" onclick="indPanelClose()">关上</button></div>';
        };
        // 摆下时朝玩家看的方向
        function fnPlaced(nd, f) { nd.dir = Math.atan2(f.z, f.x); }
        // 看得见的叶片：每台风扇一个小模型，通电才转；转向跟着 dir 变
        function fnSync(dt) {
            if (!ind || ind.where !== 'base' || !ind.base) return;
            let G = ind.fanG = ind.fanG || {}, fans = ind.base.devs.filter(function (d) { return d.ty === 'fan'; }), seen = {};
            fans.forEach(function (d) {
                seen[d.id] = 1; let g = G[d.id];
                if (!g) {
                    let grp = new THREE.Group(), mat = indMat(new THREE.MeshLambertMaterial({ color: 0x90caf9 })), dark = indMat(new THREE.MeshLambertMaterial({ color: 0x455a64 }));
                    let hub = new THREE.Mesh(indGeo(new THREE.BoxGeometry(0.22, 0.22, 0.22)), dark); hub.position.set(0.16, 0, 0); grp.add(hub);
                    let rotor = new THREE.Group(); rotor.position.set(0.3, 0, 0);
                    for (let i = 0; i < 3; i++) { let b = new THREE.Mesh(indGeo(new THREE.BoxGeometry(0.04, 0.5, 0.14)), mat); b.position.set(0, 0.25, 0); let arm = new THREE.Group(); arm.rotation.x = i * Math.PI * 2 / 3; arm.add(b); rotor.add(arm); }
                    grp.add(rotor); grp.userData.rotor = rotor; g = G[d.id] = indAdd(grp);
                }
                g.position.set(d.x, 1.2, d.z); g.rotation.y = -(d.dir || 0);
                if (d.pw) g.userData.rotor.rotation.x += 14 * dt;
                if (d.pw && ind.p && Math.hypot(d.x - ind.p.x, d.z - ind.p.z) < 10 && (!d.snd || ind.t - d.snd > 0.5) && typeof sfxNoise === 'function') { d.snd = ind.t; try { sfxNoise(0.4, 0.012, 700, 450, 1); } catch (e) { } }
            });
            Object.keys(G).forEach(function (id) { if (!seen[id]) { if (G[id].parent) G[id].parent.remove(G[id]); delete G[id]; } });
        }
        (function () {
            let t0 = indTick;
            indTick = function (dt) { let r = t0.apply(this, arguments); if (ind && !ind.over) fnSync(dt); return r; };
        })();
