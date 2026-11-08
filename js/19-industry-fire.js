// 猫盾工业：起火（docs/tools-trees.md 第 1 节、分步第 2 步；任务 70 补充 2 的取舍；硬核）。放在 19-industry-cast.js 后面。
// 硬核里炉子（灶台、石炉、小熔炉、大窑）灭着的时候火候按钮点不着，要先拿火源左键点炉子；篝火放下时要有火源。点着以后照旧用按钮调大小，关火（或燃料烧完）就灭了，要重新点。悠闲照旧。
// 火源：
//  钻木取火：选中干木头点一下右键开始，背包里要有引火物（草或松脂），手上拿着干木头进度才走，15 秒，一定成功，用掉干木头 1 + 引火物 1，得 1 个火种
//  火种：拿着左键点炉子就着；60 秒灭（变草木灰）。火苗仔打掉 35% 掉火种（概率，但一下就有）
//  打火石：燧石（山地、古老岩层挖大石头 15% 多掉 1 个），背包里还要有铁锭和引火物，左键点炉子 90% 着，每打一次用掉 1 份引火物
//  火柴：工作台 硫 1 + 木头 1 → 5 根，一根点一次
//  打火机：工作台 黄铜 2 + 铁锭 1，拿着对装了石油的桶右键加满 50 次，一次点一次
//  点着的火把（任务 66）：左键点炉子就着；拿火把左键点着着的炉子或篝火，火把又能烧 90 秒
// 干木头：木头放在基地地上 120 秒变干木头（灶台、炉子 3 米内 30 秒）；远征砍的是湿的。
        const FI = { drill: 15, ember: 60, flintP: 0.9, flintDrop: 0.15, matchN: 5, lighterN: 50, dry: 120, dryNear: 30, nearR: 3, emberFromFlame: 0.35 };
        // 冒烟测试页（?notut=1）默认不用点火，免得几百处"直接调火候"的老检查全挂；IND95 关掉它测起火
        let IND_FIRE_FREE = /[?&]notut\b/.test(location.search);
        Object.assign(IND_ITEMS_RAW, {
            wood_dry: { name: '干木头', col: 0xbcaaa4, fuel: 60, use: '选中点一下右键钻木取火（背包里要有草或松脂），拿着 15 秒得 1 个火种' },
            ember: { name: '火种', col: 0xff6f00, use: '拿着左键点炉子、篝火就点着。60 秒就灭' },
            flint: { name: '燧石', col: 0x37474f, use: '打火石：拿着左键点炉子，背包里要有铁锭和草／松脂，90% 点着' },
            match: { name: '火柴', col: 0xd84315, use: '拿着左键点炉子、篝火，一根点一次' },
            lighter: { name: '打火机', col: 0xffd54f, use: '拿着左键点炉子、篝火。对着装石油的桶右键加满 50 次' }
        });
        IND_CRAFT.push({ out: 'match', n: FI.matchN, in: { sulfur: 1, wood: 1 }, hard: true }, { out: 'lighter', in: { brass: 2, ingot_fe: 1 }, hard: true });
        function fiOn() { return indHard() && !IND_FIRE_FREE; }
        function fiTinder() { return (ind.bag.grass || 0) > 0 ? 'grass' : (ind.bag.resin || 0) > 0 ? 'resin' : null; }
        // 拿着的东西能不能点火；能就点（用掉该用的），返回 true；不能点返回 false；点不着（打火石没打着）返回 'miss'
        function fiUseSource(k) {
            let B = ind.base;
            if (k === 'ember' && ind.bag.ember > 0) { indBagDel('ember', 1); fiEmberDel(); return true; }
            if (k === 'match' && ind.bag.match > 0) { indBagDel('match', 1); return true; }
            if (k === 'lighter' && ind.bag.lighter > 0) { if (!(B.lighterN > 0)) { indFlash('打火机没油了'); return 'miss'; } B.lighterN--; return true; }
            if (k === 'torch' && ind.torchT > 0) return true;
            if (k === 'flint' && ind.bag.flint > 0) {
                let t = fiTinder(); if (!(ind.bag.ingot_fe > 0)) { indFlash('打火石还要一块铁锭'); return 'miss'; } if (!t) { indFlash('打火石要草或松脂引火'); return 'miss'; }
                indBagDel(t, 1); if (indRand() < FI.flintP) return true; indFlash('没打着，再打一次'); return 'miss';
            }
            return false;
        }
        // 左键点炉子：炉子灭着、手上拿着火源 → 点着（小火）；拿着没点的火把点着着的炉子 → 火把烧 90 秒
        function fiLightCook(a) {
            if (!fiOn() || !a || (a.kind !== 'stove' && a.kind !== 'cook')) return false;
            let c = a.kind === 'stove' ? indCookById('stove') : indCookById(a.o.id); if (!c) return false;
            let k = indSel(), S = c.C;
            if (S.fire > 0) { if (k === 'torch' && !(ind.torchT > 0)) { indBagDel('torch', 1); ind.torchT = CV.torch; return true; } return false; }
            if (['ember', 'match', 'lighter', 'torch', 'flint'].indexOf(k) < 0) return false;
            if (!(S.fuel > 0)) return false;   // 任务 113：没柴不吃这次左键，照样开面板（面板顶上写"没柴，点不着"）
            let r = fiUseSource(k); if (r !== true) { if (r === false) return false; return true; }
            fiIgnite(c); indSave(); ind.hudSig = '';
            return true;
        }
        // 点着（任务 113）：降温中途再点，从现在的温度接着往上走——挑目标温度高过现在温度的最小一档（最多大火），正在烧的东西进度不动
        function fiIgnite(c) {
            let S = c.C, lv = 1;
            while (lv < 3 && indFireDef(c.ty, lv).t <= S.temp) lv++;
            S.fire = lv; S.lit = true;
        }
        // 面板里的"点火"按钮（任务 113）：背包里有火种、火柴、打火机（有油）、点着的火把、打火石（带铁锭和引火物）任一就行，用掉一次；要有柴
        function fiPanelSources() {
            let o = [];
            if (ind.bag.ember > 0) o.push('ember');
            if (ind.bag.match > 0) o.push('match');
            if (ind.bag.lighter > 0 && ind.base.lighterN > 0) o.push('lighter');
            if (ind.torchT > 0) o.push('torch');
            if (ind.bag.flint > 0 && ind.bag.ingot_fe > 0 && fiTinder()) o.push('flint');
            return o;
        }
        function fiPanelLight() {
            if (!ind || !fiOn()) return;
            let c = indCookCur(); if (!c) return; let S = c.C;
            if (S.fire > 0) return;
            if (!(S.fuel > 0)) { indFlash('没柴，点不着'); return; }
            let src = fiPanelSources()[0];
            if (!src) { indFlash('要火种、火柴、打火机或点着的火把'); return; }
            let r = fiUseSource(src);
            if (r === true) { fiIgnite(c); indSave(); ind.hudSig = ''; }
            indPanelStove();
        }
        // 面板顶上那一行（任务 113）：灭着时写清楚怎么办
        function fiPanelLine(S) {
            if (!fiOn() || S.fire > 0) return '';
            let btn = '<button id="ind-stove-light" style="' + IND_BTN + 'background:#e65100;" onclick="fiPanelLight()">点火</button>';
            if (!(S.fuel > 0)) return '<div style="color:#c62828;font-weight:bold;">没柴，点不着</div>';
            return '<div style="color:#c62828;">灭了，要先点火 ' + btn + '</div>';
        }
        // 面板的火候按钮：灭着的时候点不着
        function fiStoveBlocked(S, lv) { return fiOn() && lv > 0 && !(S.fire > 0); }
        // 篝火放下：硬核要用掉一次火源（手上拿着篝火，所以从背包里找：火种 → 火柴 → 打火机 → 点着的火把）
        function fiCampfireOk() {
            if (!fiOn()) return true;
            if (ind.bag.ember > 0) { indBagDel('ember', 1); fiEmberDel(); return true; }
            if (ind.bag.match > 0) { indBagDel('match', 1); return true; }
            if (ind.bag.lighter > 0 && ind.base.lighterN > 0) { ind.base.lighterN--; return true; }
            if (ind.torchT > 0) return true;
            indFlash('篝火要火种、火柴、打火机或点着的火把才点得着'); return false;
        }
        // ── 钻木取火：选中干木头点一下右键开始，边走边做 ──
        function fiDrillStart() {
            if (!indHard()) return false;
            if (ind.drill) { return true; }
            if (!fiTinder()) { indFlash('钻木取火要草或松脂引火'); return true; }
            ind.drill = { t: 0 }; return true;
        }
        function fiTick(dt) {
            let D = ind.drill;
            if (D) {
                if (!(ind.bag.wood_dry > 0) || !fiTinder()) { ind.drill = null; indFlash('干木头或引火物没了，停了'); }
                else if (indSel() === 'wood_dry') {
                    D.t += dt;
                    if (D.t >= FI.drill) { ind.drill = null; let t = fiTinder(); indBagDel('wood_dry', 1); indBagDel(t, 1); indBagAdd('ember', 1); fiEmberAdd(); indFlash('钻出火种了'); ind.hudSig = ''; }
                }
            }
            // 火种 60 秒灭
            let E = ind.base.emberAt = ind.base.emberAt || [];
            while (E.length < (ind.bag.ember || 0)) E.push(ind.t + FI.ember);   // 新捡到的（地上的、读档带着的）从现在算 60 秒
            if (E.length) {
                while (E.length && E[0] <= ind.t) { E.shift(); if (ind.bag.ember > 0) { indBagDel('ember', 1); indBagAdd('ash', 1); indFlash('火种灭了'); } }
                if ((ind.bag.ember || 0) < E.length) E.splice(0, E.length - (ind.bag.ember || 0));
            }
            // 地上的木头晾干（只在基地）
            if (ind.where === 'base' && indHard()) {
                let ch = false, hot = indCooks().filter(function (c) { return c.C.fire > 0; });
                ind.base.ground.forEach(function (g) {
                    if (g.k !== 'wood') return;
                    let near = hot.some(function (c) { return Math.hypot(c.x - g.x, c.z - g.z) <= FI.nearR + IND_COOK[c.ty].r; });
                    g.dry = (g.dry || 0) + dt * (FI.dry / (near ? FI.dryNear : FI.dry));
                    if (g.dry >= FI.dry) { g.k = 'wood_dry'; delete g.dry; ch = true; }
                });
                if (ch) ind.itemDirty = true;
            }
        }
        function fiEmberAdd() { (ind.base.emberAt = ind.base.emberAt || []).push(ind.t + FI.ember); }
        function fiEmberDel() { let E = ind.base.emberAt; if (E && E.length) E.pop(); }
        // 打火机加油：拿着打火机对着装石油的桶……这里简化成：拿着打火机右键，背包里有装石油的桶就加满（用掉一桶，还空桶）
        function fiFillLighter() {
            if (!(ind.bag.lighter > 0)) return false;
            let k = Object.keys(ind.bag).filter(function (x) { let c = indContOf(x); return c && c.base === 'oil' && ind.bag[x] > 0; })[0];
            if (!k) { indFlash('打火机还剩 ' + (ind.base.lighterN || 0) + ' 次'); return true; }
            if ((ind.base.lighterN || 0) >= FI.lighterN) { indFlash('打火机是满的（' + FI.lighterN + ' 次）'); return true; }
            indBagDel(k, 1); indBagAdd(indEmptyKey(indContOf(k).mat), 1); ind.base.lighterN = FI.lighterN; indSave(); 
            return true;
        }
        // 山地、古老岩层挖大石头 15% 多掉 1 个燧石
        (function () {
            let g0 = indGather;
            indGather = function (o) {
                let n0 = o && o.n, d0 = o && o.dead, rock = o && o.rock && !o.hard && o.key === 'stone' && ind.where === 'trip' && indHard(), bm = rock ? indBiome(ind.map, o.x, o.z) : '';
                let r = g0.apply(this, arguments);
                if (rock && (bm === 'mountain' || bm === 'ancient') && (o.n !== n0 || o.dead !== d0) && indRand() < FI.flintDrop) { indBagAdd('flint', 1); }
                return r;
            };
        })();
        function fiFixBase(b) {
            b.lighterN = indNum(b.lighterN, 0, 0, FI.lighterN) | 0;
            if (!Array.isArray(b.emberAt)) delete b.emberAt; else b.emberAt = [];   // 火种的倒计时按这一局的时间记，读档清掉（读档时背包里的火种当刚点的，60 秒灭）
        }
        function fiHud() {
            if (ind.drill) return '钻木取火 ' + Math.min(99, Math.floor(ind.drill.t / FI.drill * 100)) + '%' + (indSel() === 'wood_dry' ? '' : '　<b style="color:#c62828">停着：拿上干木头</b>');
            if (indSel() === 'ember' && ind.base.emberAt && ind.base.emberAt.length) return '火种还剩 ' + Math.max(0, Math.ceil(ind.base.emberAt[0] - ind.t)) + ' 秒';
            if (indSel() === 'lighter') return '打火机还剩 ' + (ind.base.lighterN || 0) + ' 次';
            return '';
        }
