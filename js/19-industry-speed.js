// 倍速（任务 144）：基地里点按钮在 ×1、×2、×4、×8、×16 之间转，游戏时间走得更快（现实里就是等待）。
// 做法：玩家走路、动作冷却还是 1 倍，正常 indTick 之外，每帧再补 (倍数−1)×dt 的"时间"：拆成每步 ≤ 0.1 秒，
// 烧、熔、作物、水池、冷却、饥渴、体温、精神、动物、电都跟着快。只在基地里，不存档；碰到危险自动回 ×1。
// 不跟着快：玩家的移动和动作冷却、电路按钮（走实时）、怪、辐射和毒气这类危险（碰到就停了）。
        const SP = { steps: [1, 2, 4, 8, 16], maxStep: 0.1, hp: 60, mobR: 15 };
        function spMul() { return (ind && ind.speed) || 1; }
        function spReset(why) {
            if (!ind || !(ind.speed > 1)) return;
            ind.speed = 1; spBtn();
            if (why) indFlash('倍速停了：' + why);
        }
        // 该不该停：返回原因，没有就返回空
        function spDanger() {
            let S = ind.base.surv;
            if (ind.where !== 'base') return '出门了';
            if (ind.dead || ind.paused || ind.sleeping || ind.carve) return '先停一下';
            if (ind.panel) return '开着面板';
            if (S.hp < SP.hp) return '你受伤了';
            if (ind.redT > 0) return '你受伤了';
            if (S.food < 20 || S.water < 20) return '饿了或渴了';
            if (S.temp < indChillT() || S.temp > 38.5 || (ind.coldWarn || 0) > 0 || ind.heatHint) return '体温不对';
            if (ind.inGas || ind.radHurt) return '有危险';
            if ((ind.mobs || []).some(function (m) { return !m.dead && !m.tame && Math.hypot(m.x - ind.p.x, m.z - ind.p.z) < SP.mobR; })) return '附近有怪';
            return '';
        }
        // 每帧在 indTick 之后调：补时间。返回补了多少步（给冒烟看）
        function spTick(dt) {
            let m = spMul();
            if (m <= 1) return 0;
            let why = spDanger(); if (why) { spReset(why); return 0; }
            if (!ind.base.rule) return 0;
            let extra = (m - 1) * dt, n = Math.max(1, Math.ceil(extra / SP.maxStep - 1e-9)), h = extra / n;
            for (let i = 0; i < n; i++) {
                spStep(h);
                if (!ind || ind.over || ind.dead) return i + 1;
                if (spDanger()) { spReset(spDanger()); return i + 1; }
            }
            return n;
        }
        // 一小步"时间"：只推按时间走的东西，不动玩家
        function spStep(h) {
            let B = ind.base;
            B.clock += h; ind.t += h;
            indBodyTick(h); indSurvTick(h);
            if (!ind || ind.over || ind.dead) return;
            indCropTick(h); pdTick(h); odStep(h); clStep(h, true, true); scTick(h);
            indFireTick(h); indAnimalTick(h, true); indHotTick(h);
            if (!ind || ind.over || ind.dead) return;
            indElecTick(h);
            if (!ind || ind.over || ind.dead) return;
            indStoveTick(h);
            if (ind) { ind.cropDirty = true; ind.fireDirty = true; ind.devDirty = true; }
        }
        function spCycle() {
            if (!ind || ind.over || ind.dead) return;
            if (ind.where !== 'base') { indFlash('倍速只能在基地里用'); return; }
            if (ind.panel || ind.paused) return;
            let i = SP.steps.indexOf(spMul()); ind.speed = SP.steps[(i + 1) % SP.steps.length];
            if (ind.speed > 1) { let why = spDanger(); if (why) { ind.speed = 1; indFlash('现在不能加速：' + why); } }
            spBtn();
        }
        function spBtn() {
            let b = document.getElementById('ind-btn-speed'); if (!b) return;
            let m = spMul(), off = !ind || ind.where !== 'base';
            b.textContent = '倍速 ×' + m + '　Z';
            b.style.opacity = off ? '0.4' : '1'; b.style.background = m > 1 ? '#c62828' : '';
            b.disabled = !!off;
        }
