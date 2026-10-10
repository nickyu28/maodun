        // 局间加成的可选项。only 限定角色，null 表示所有人都能选。
        // ══════════════ 平板：左半屏摇杆 ══════════════
        // moveTouch 记着「哪根手指是移动手指」。一旦认定为移动手指，
        // 它跑到屏幕哪边都还是移动，不会突然变成转视角或者触发技能。
        let moveTouch = { id: null, ax: 0, ay: 0 };
        const TOUCH_STICK_MAX = 52;

        function touchIsPad() { return gState.control === 'pad'; }

        // ── 操作提示：电脑说键，平板说按钮 ──
        // 界面上任何一处提到怎么操作，都得从这里取字，
        // 不然选了平板还在告诉人家「左键点击」，屏幕上根本没这个东西。
        function padOn() { return !!(gState && gState.control === 'pad'); }
        function kTxt(pc, pad) { return padOn() ? pad : pc; }
        // 惊魂夜的按钮名随阵营变，单独一张表
        function nightKey(which) {
            if (!padOn()) return { act: '左键', space: '空格', e: 'E', q: 'Q' }[which];
            let hunter = night && night.side === 'hunter';
            if (which === 'act') return hunter ? '「普攻」' : '「互动」';
            if (which === 'space') return hunter ? '「抓人」' : '「动作」';
            if (which === 'e') return '「破板」';
            return '「切换」';
        }
        function touchInGame() {
            if (gState.backpackOpen || gState.largeMapOpen) return false;
            if (blaze && !blaze.over) return true;
            if (nm && !nm.over) return true;
            if (night && !night.over) return true;
            if (race && !race.over) return true;
            if (jail && !jail.over) return true;
            if (dodge && !dodge.over) return true;
            // 大厅、松饼、密室、乐园之前漏了：只有那个被画布盖住的旧摇杆，按不到，平板上根本走不动
            if (hub) return true;
            if (cake && !cake.over) return true;
            if (escapeRoom && !escapeRoom.over && !escapeRoom.codeOpen) return true;
            if (park && !park.over) return true;
            return isPlaying && !gState.isDead;
        }
        // 这个点是不是压在按钮之类的 UI 上（那种不该当成摇杆）
        function touchOnUI(t) {
            let el = t.target;
            if (!el || !el.closest) return false;
            return !!(touchOverPanel(el) || el.closest('button') || el.closest('.action-btn') || el.closest('.slot') ||
                el.closest('#blaze-skillbar') || el.closest('#blaze-perk') || el.closest('#blaze-ffa-cards') || el.closest('#blaze-stats') || el.closest('#test-panel') ||
                el.closest('#chat-panel') || el.id === 'minimap' || el.id === 'minimap-container');
        }

        function touchStickShow(x, y) {
            let el = document.getElementById('touch-stick');
            if (!el) return;
            el.style.display = 'block'; el.style.left = x + 'px'; el.style.top = y + 'px';
            let k = document.getElementById('touch-knob');
            if (k) k.style.transform = 'translate(0,0)';
        }
        function touchStickMove(dx, dy) {
            let k = document.getElementById('touch-knob');
            if (k) k.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        }
        function touchStickHide() {
            let el = document.getElementById('touch-stick');
            if (el) el.style.display = 'none';
            tMove.x = 0; tMove.y = 0;
        }

        document.addEventListener('touchstart', function (e) {
            if (!touchIsPad() || !touchInGame()) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                let t = e.changedTouches[i];
                if (touchOnUI(t)) continue;
                // 左半屏且还没有移动手指 -> 这根就是移动手指，落点就是锚点
                if (moveTouch.id === null && t.clientX < window.innerWidth / 2) {
                    moveTouch.id = t.identifier; moveTouch.ax = t.clientX; moveTouch.ay = t.clientY;
                    touchStickShow(t.clientX, t.clientY);
                    e.preventDefault();
                }
            }
        }, { passive: false });

        document.addEventListener('touchmove', function (e) {
            if (moveTouch.id === null) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                let t = e.changedTouches[i];
                if (t.identifier !== moveTouch.id) continue;
                let dx = t.clientX - moveTouch.ax, dy = t.clientY - moveTouch.ay;
                let d = Math.hypot(dx, dy);
                if (d > TOUCH_STICK_MAX) { dx = dx / d * TOUCH_STICK_MAX; dy = dy / d * TOUCH_STICK_MAX; }
                touchStickMove(dx, dy);
                tMove.x = dx / TOUCH_STICK_MAX; tMove.y = dy / TOUCH_STICK_MAX;
                e.preventDefault();
            }
        }, { passive: false });

        let touchStickEnd = function (e) {
            if (moveTouch.id === null) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === moveTouch.id) {
                    moveTouch.id = null; touchStickHide();
                }
            }
        };
        document.addEventListener('touchend', touchStickEnd, { passive: false });
        document.addEventListener('touchcancel', touchStickEnd, { passive: false });

        // 平板：右半屏空白处按住 = 瞄准普攻，松手放。技能按钮自己有 ontouchstart。
        let atkTouchId = null;
        document.addEventListener('touchstart', function (e) {
            if (!blaze || blaze.over || !touchIsPad()) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                let t = e.changedTouches[i];
                if (touchOnUI(t)) continue;
                if (moveTouch.id === t.identifier) continue;
                if (t.clientX < window.innerWidth / 2) continue;
                if (atkTouchId === null) { atkTouchId = t.identifier; blazeAimStart(0); }
            }
        }, { passive: false });
        let atkTouchEnd = function (e) {
            if (atkTouchId === null) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === atkTouchId) {
                    atkTouchId = null; blazeAimRelease(0);
                }
            }
        };
        document.addEventListener('touchend', atkTouchEnd, { passive: false });
        document.addEventListener('touchcancel', atkTouchEnd, { passive: false });

        // ══════════════ 测试开关面板 ══════════════
        // 所有测试用的开关都收在这里，游戏里随时按 T 呼出来改，不用回去改代码。
        const TEST_TOGGLES = [
            { get: function () { return BLAZE_TEST_NO_CD; }, set: function (v) { BLAZE_TEST_NO_CD = v; }, label: '超燃：你自己无冷却' },
            { get: function () { return BLAZE_TEST_SKIP_KEY; }, set: function (v) { BLAZE_TEST_SKIP_KEY = v; }, label: '超燃：Q 跳过本局' },
            { get: function () { return BLAZE_TEST_NO_PERK_TIMER; }, set: function (v) { BLAZE_TEST_NO_PERK_TIMER = v; }, label: '超燃：选卡不计时' },
            { get: function () { return SFX_ENABLED; }, set: function (v) { SFX_ENABLED = v; }, label: '通用：音效（击杀播报等）' },
            {
                get: function () { return false; },
                set: function () {
                    if (blaze && blaze.ffa && !blaze.over) { blaze.ffaLeft = 0; blazeFfaEnd(); }
                    else showSysModal('提示', '现在不在乱斗局里', [{ label: '知道了' }]);
                },
                label: '乱斗：一键结束本局'
            },
            {
                get: function () { return false; },
                set: function () {
                    showSysModal('隐藏分', '惊魂夜：' + rankOf('night') + '（' + rankTierName('night') + '）\n' +
                        '超燃：' + rankOf('blaze') + '（' + rankTierName('blaze') + '）\n\n' +
                        'AI 基准强度：惊魂夜 ' + Math.round(aiSkillBase('night') * 100) + '%、' +
                        '超燃 ' + Math.round(aiSkillBase('blaze') * 100) + '%', [{ label: '知道了' }]);
                },
                label: '排位：看一眼当前隐藏分'
            },
            { get: function () { return TEST_INFINITE_COINS; }, set: function (v) { TEST_INFINITE_COINS = v; }, label: '通用：无限猫盾币 / 全解锁' },
            { get: function () { return AI_ACC_CHANCE <= 0; }, set: function (v) { AI_ACC_CHANCE = v ? 0 : 0.3; }, label: '通用：AI/路人不戴配饰（卡的话开这个）' },
            {
                get: function () { return BGM_ENABLED; },
                set: function (v) {
                    BGM_ENABLED = v;
                    if (!v) bgmStop();
                    else if ((night && !night.over) || (blaze && !blaze.over) || isPlaying) bgmStart();
                },
                label: '通用：背景音乐'
            },
            { get: function () { return NIGHT_NO_CD; }, set: function (v) { NIGHT_NO_CD = v; }, label: '惊魂夜：你自己无冷却' },
            { get: function () { return NIGHT_DEBUG_CAM; }, set: function (v) { NIGHT_DEBUG_CAM = v; }, label: '惊魂夜：相机诊断 HUD' },
            { get: function () { return NIGHT_FRIENDLY_DISABLED_FOR_TESTING; }, set: function (v) { NIGHT_FRIENDLY_DISABLED_FOR_TESTING = v; }, label: '惊魂夜：关掉友好局' },
            { get: function () { return NIGHT_MATCH_WAIT === 0; }, set: function (v) { NIGHT_MATCH_WAIT = v ? 0 : 15; }, label: '惊魂夜：跳过匹配等待' },
            { get: function () { return HUNT_TEST_MONEY; }, set: function (v) { HUNT_TEST_MONEY = v; }, label: '寻宝队：无限资金' },
            { get: function () { return HUNT_TEST_GOD; }, set: function (v) { HUNT_TEST_GOD = v; }, label: '寻宝队：血量体力锁满' },
            { get: function () { return HUNT_TEST_NOMOB; }, set: function (v) { HUNT_TEST_NOMOB = v; }, label: '寻宝队：不刷怪' },
            { get: function () { return HUNT_TEST_AI_NOLOOT; }, set: function (v) { HUNT_TEST_AI_NOLOOT = v; }, label: '寻宝队：AI 不抢宝箱' },
            { get: function () { return HUNT_TEST_NOWEIGHT; }, set: function (v) { HUNT_TEST_NOWEIGHT = v; }, label: '寻宝队：无视负重' },
            { get: function () { return RACE_TEST_NO_CD; }, set: function (v) { RACE_TEST_NO_CD = v; }, label: '竞速：冲刺和技能无冷却' },
            { get: function () { return RACE_TEST_NO_PICK_TIMER; }, set: function (v) { RACE_TEST_NO_PICK_TIMER = v; }, label: '竞速：选技能不计时' },
            {
                get: function () { return !!RACE_TEST_CARD; },
                set: function () {
                    showSysModal('竞速 · 自选牌',
                        '这个现在挪到大厅了 —— 选“竞速”模式，在开跑按钮下面选。' +
                        '<br><span style="color:#888; font-size:12px;">放在局内会和轮间选卡抢同一个弹窗。</span>',
                        [{ label: '知道了' }]);
                },
                label: '竞速：自选牌（已挪到大厅）'
            }
        ];

        function testPanelRender() {
            let el = document.getElementById('test-panel-list'); if (!el) return;
            el.innerHTML = TEST_TOGGLES.map(function (t, i) {
                let on = t.get();
                return '<div onclick="testPanelToggle(' + i + ')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;">' +
                    '<span style="color:' + (on ? '#fff' : '#888') + ';">' + t.label + '</span>' +
                    '<span style="color:' + (on ? '#66bb6a' : '#666') + '; font-weight:bold;">' + (on ? '开' : '关') + '</span></div>';
            }).join('');
        }
        function testPanelToggle(i) {
            TEST_TOGGLES[i].set(!TEST_TOGGLES[i].get());
            testPanelRender();
            if (typeof blazeRenderChars === 'function') blazeRenderChars();
        }
        function testSetWinScore(v) {
            BLAZE.roundsToWin = Math.max(1, parseInt(v, 10) || 1);
            let el = document.getElementById('test-win-val');
            if (el) el.innerText = BLAZE.roundsToWin;
        }

        function testPanelShow() {
            let el = document.getElementById('test-panel'); if (!el) return;
            el.classList.toggle('hidden');
            if (!el.classList.contains('hidden')) {
                testPanelRender();
                let sl = document.getElementById('test-win-slider');
                if (sl) { sl.value = BLAZE.roundsToWin; testSetWinScore(BLAZE.roundsToWin); }
            }
        }
        // A5：测试面板只有网址带 ?dev=1 才能用 T 打开
        const DEV_MODE = (function () { try { return new URLSearchParams(location.search).get('dev') === '1'; } catch (e) { return false; } })();
        window.addEventListener('keydown', function (e) {
            if (!DEV_MODE) return;
            if (e.target && /input|textarea/i.test(e.target.tagName)) return;
            if (e.key === 't' || e.key === 'T') testPanelShow();
        });

        // ══════════════ 猫盾币 / 角色解锁 ══════════════
        // 全模式通用的一个钱包（寻宝队自己的钱是另一套，不通用）。免费角色：寻宝队全部；
        // 惊魂夜的 4 号和 1 号；超燃的远程和剑。其余一律 20 猫盾币。
        // 猫盾币是全模式通用的唯一货币（寻宝队的钱是单独一套，不通用）——
        // 以前寻宝队/惊魂夜/超燃解锁角色的"金币"和商店宠物/表情用的"通用币"(gems)
        // 其实一直都是同额度发放的两份重复记账，现在合并成一份，coinsOf/coinsAdd
        // 不再区分 mode，谁存的都是同一个池子。
        const COIN_PRICE = 20;
        const COIN_FREE = {
            night: { mi: 1, cat: 1 },
            blaze: { bow: 1, sword: 1 }
        };
        let TEST_INFINITE_COINS = false;   // 测试用，可以在设置面板里开

        function coinsOf() {
            if (TEST_INFINITE_COINS) return 99999;
            return gState.mcoin || 0;
        }
        // 猫盾币图案：金色圆底 + 中间一个猫盾轮廓（圆角身子 + 两只尖耳朵），
        // 跟登录页那个猫盾 Logo 一个造型，只是换成金币配色，一看就知道是"钱"。
        function coinIconShapesSvg() {
            // 圆中间一条小鱼干：椭圆身子 + 三角尾巴，金色填充、黑色描边，眼睛纯黑——
            // 黑边勾一圈才在金色圆底上分得清轮廓，不然金on金糊成一片。
            // 身子和尾巴合并成一条闭合路径一起描边，中间连接处就不会再多出一道黑线。
            // 单独拆出来是因为腰饰里的小鱼干挂件也要用同一张图案做贴图，两边要长得
            // 一模一样（"小鱼干样子改成跟钱币一样"）。
            return '<circle cx="10" cy="10" r="9" fill="#ffd54f" stroke="#f0b90b" stroke-width="1.2"/>' +
                '<path d="M11.5 8.8 A4 3.1 0 1 0 11.5 11.2 L15.5 12.7 L14.3 10 L15.5 7.3 Z" fill="#ffc107" stroke="#000" stroke-width="0.6" stroke-linejoin="round"/>' +
                '<circle cx="6.5" cy="9" r="0.8" fill="#000"/>';
        }
        function coinIconSvg(size) {
            size = size || 18;
            return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 20 20" style="vertical-align:middle; flex-shrink:0;">' +
                coinIconShapesSvg() + '</svg>';
        }
        // 数额 + 图案拼一起的标准格式：xxx（金额）+ 猫盾币图案，买东西的地方统一用这个。
        function coinBadgeHtml(n, size) {
            return '<span style="display:inline-flex; align-items:center; gap:4px;">' + n + coinIconSvg(size) + '</span>';
        }
        function coinsAdd(mode, n) {
            gState.mcoin = (gState.mcoin || 0) + n;
            saveProgress();
        }
        function charOwned(mode, key) {
            if (TEST_INFINITE_COINS) return true;
            if (mode === 'hunt') return true;                       // 寻宝队的角色全免费
            if (COIN_FREE[mode] && COIN_FREE[mode][key]) return true;
            return !!(gState.owned && gState.owned[mode] && gState.owned[mode][key]);
        }
        function charBuy(mode, key) {
            if (charOwned(mode, key)) return true;
            if (coinsOf() < COIN_PRICE) {
                showSysModal('猫盾币不够', '解锁这个角色需要 ' + COIN_PRICE + ' 猫盾币，你现在有 ' + coinsOf() + ' 个。\n打一局 +3，赢了再 +4，连胜、每天首胜还有额外的。', [{ label: '去打一局赚钱', color: '#5cb85c', onClick: function () { nav('screen-lobby'); selectGameMode('hunt'); } }, { label: '知道了' }]);
                return false;
            }
            coinsAdd(mode, -COIN_PRICE);
            if (!gState.owned) gState.owned = {};
            if (!gState.owned[mode]) gState.owned[mode] = {};
            gState.owned[mode][key] = 1;
            saveProgress();
            return true;
        }

        // ══════════════ 隐藏分（排位）══════════════
        // 只有惊魂夜和超燃有排位。分数不给你看，它唯一的作用是决定
        // 这局的 AI 有多强 —— 打得越好，队友和对手就越难缠。
        const RANK = {
            start: 1000, min: 200, max: 3000,
            win: 25, lose: 20,
            spread: 0.22        // 每个 AI 在基准强度上下随机抖这么多，免得一队人一个模子
        };
        const RANK_TIERS = [
            { at: 0, name: '木牌' }, { at: 800, name: '铁牌' }, { at: 1100, name: '铜牌' },
            { at: 1400, name: '银牌' }, { at: 1700, name: '金牌' }, { at: 2100, name: '铂金' },
            { at: 2500, name: '钻石' }
        ];
        const RANK_MODES = { night: 1, blaze: 1 };   // 寻宝队没有排位

        function rankAll() {
            if (!gState.rank) gState.rank = {};
            return gState.rank;
        }
        function rankOf(mode) {
            if (!RANK_MODES[mode]) return RANK.start;
            let r = rankAll();
            if (typeof r[mode] !== 'number') r[mode] = RANK.start;
            return r[mode];
        }
        function rankAdd(mode, won) {
            if (!RANK_MODES[mode]) return 0;
            let before = rankOf(mode);
            let delta = won ? RANK.win : -RANK.lose;
            rankAll()[mode] = Math.max(RANK.min, Math.min(RANK.max, before + delta));
            saveProgress();
            return rankAll()[mode] - before;
        }
        function rankTierName(mode) {
            let v = rankOf(mode), name = RANK_TIERS[0].name;
            RANK_TIERS.forEach(function (t) { if (v >= t.at) name = t.name; });
            return name;
        }

        // AI 的基准强度 0~1。0 是新手（反应慢、不会撤、瞄不准），
        // 1 是老手（该放技能就放、残血就跑、指哪打哪）。
        function aiSkillBase(mode) {
            let v = (rankOf(mode) - RANK.min) / (RANK.max - RANK.min);
            return Math.max(0, Math.min(1, v));
        }
        function aiSkillRoll(mode) {
            let v = aiSkillBase(mode) + (Math.random() * 2 - 1) * RANK.spread;
            return Math.max(0, Math.min(1, v));
        }

        // 一局打完的猫盾币（原来只有超燃给，寻宝/惊魂夜/竞速/监狱/躲避球/松饼打完一分都没有）：
        //   打完 +3；赢了再 +4；连胜从第 2 连起每多一连 +1（最多 +5）；
        //   每个模式每天第一次赢 +5；本周活动模式整局翻倍。中途退出不给。
        const MODE_CN = { hunt: '寻宝队', night: '惊魂夜', blaze: '超燃', race: '竞速', jail: '监狱救援', dodge: '躲避球', escape: '合作密室', cake: '松饼大作战', sumo: '推推乐', paint: '彩弹占地', tower: '爬塔' };
        const WEEKLY_MODES = ['dodge', 'race', 'jail', 'cake', 'escape', 'night', 'blaze', 'hunt', 'sumo', 'paint', 'tower'];
        function weekNum() { return Math.floor((localDayNum() + 3) / 7); }   // 周一换
        function weeklyMode() { return WEEKLY_MODES[weekNum() % WEEKLY_MODES.length]; }
        let coinsLast = null;
        function coinsSettle(mode, won) {
            if (!gState.streak) gState.streak = {};
            if (!gState.dailyWin) gState.dailyWin = {};
            let parts = [['打完', 3]];
            if (won) {
                parts.push(['赢了', 4]);
                let st = gState.streak[mode] = (gState.streak[mode] || 0) + 1;
                if (st >= 2) parts.push([st + ' 连胜', Math.min(5, st - 1)]);
                let today = localDayNum();
                if (gState.dailyWin[mode] !== today) { gState.dailyWin[mode] = today; parts.push(['今天首胜', 5]); }
            } else gState.streak[mode] = 0;
            let gain = parts.reduce(function (a, p) { return a + p[1]; }, 0);
            if (weeklyMode() === mode) { parts.push(['本周活动', '×2']); gain *= 2; }
            coinsAdd(mode, gain);
            if (typeof achCheck === 'function') achCheck('settle', { mode: mode, won: won });
            coinsLast = { gain: gain, parts: parts };
            saveProgress();
            return gain;
        }
        function coinsBreakText() {
            if (!coinsLast) return '';
            return '猫盾币 +' + coinsLast.gain + '（' + coinsLast.parts.map(function (p) { return p[0] + ' ' + (typeof p[1] === 'number' ? '+' + p[1] : p[1]); }).join('，') + '）';
        }
        function coinsLine() {
            return '<div style="margin-top:8px; color:#e6a23c; font-size:13px;">' + coinsBreakText().replace(/^猫盾币 \+(\d+)/, function (m, n) { return coinBadgeHtml('+' + n, 16); }) + '</div>';
        }


        // ══════════════ 成就 + 称号 ══════════════
        // 成就：做到了点「领取」拿猫盾币，有的顺带送一个称号。
        // 称号：显示在头顶名字上面；成就送的免费，其他的拿猫盾币买（猫盾币多一个用处）。
        // 统计都记在 gState.ach.c 里，打完一局 coinsSettle 会调 achCheck('settle')。
        const ACH_LIST = [
            { id: 'g1', name: '初来乍到', desc: '打完 1 局', stat: 'games', goal: 1, coin: 10 },
            { id: 'g50', name: '老玩家', desc: '打完 50 局', stat: 'games', goal: 50, coin: 40, title: 'old' },
            { id: 'w1', name: '第一次赢', desc: '赢 1 局', stat: 'wins', goal: 1, coin: 10 },
            { id: 'w30', name: '常胜猫', desc: '赢 30 局', stat: 'wins', goal: 30, coin: 40, title: 'winner' },
            { id: 'st5', name: '五连胜', desc: '同一个模式连赢 5 局', stat: 'bestStreak', goal: 5, coin: 30, title: 'streak' },
            { id: 'all', name: '全都玩过', desc: '每个模式都打完一局', stat: 'modes', goal: 12, coin: 50, title: 'allround' },
            { id: 'wk5', name: '活动达人', desc: '本周活动模式打 5 局', stat: 'weekly', goal: 5, coin: 20 },
            { id: 'ht10', name: '跑腿专家', desc: '寻宝队小任务完成 10 次', stat: 'huntTask', goal: 10, coin: 30 },
            { id: 'tw30', name: '半山腰', desc: '爬塔爬到第 30 块', stat: 'tower', goal: 30, coin: 20 },
            { id: 'tw60', name: '塔顶', desc: '爬塔爬到顶', stat: 'tower', goal: 60, coin: 40, title: 'tower' },
            { id: 'es15', name: '密室大师', desc: '合作密室所有关都过', stat: 'escLevels', goal: 22, coin: 60, title: 'escape' },
            { id: 'es30', name: '星星收集', desc: '合作密室拿到 30 颗星', stat: 'escStars', goal: 30, coin: 40 },
            { id: 'dl7', name: '天天来', desc: '今日密室通关 7 天', stat: 'escDaily', goal: 7, coin: 30 },
            { id: 'rich', name: '攒钱', desc: '手上攒到 500 猫盾币', stat: 'coins', goal: 500, coin: 20, title: 'rich' }
        ];
        // buy: 价格；ach: 哪个成就送的
        const TITLES = {
            old: { name: '老玩家', col: '#90caf9', ach: 'g50' },
            winner: { name: '常胜猫', col: '#ffd54f', ach: 'w30' },
            streak: { name: '连胜王', col: '#ff8a65', ach: 'st5' },
            allround: { name: '全能猫盾', col: '#a5d6a7', ach: 'all' },
            tower: { name: '塔顶', col: '#b39ddb', ach: 'tw60' },
            escape: { name: '密室大师', col: '#80cbc4', ach: 'es15' },
            rich: { name: '小富翁', col: '#ffe082', ach: 'rich' },
            nap: { name: '爱睡觉', col: '#ce93d8', buy: 60 },
            fast: { name: '跑得快', col: '#4fc3f7', buy: 80 },
            push: { name: '推人专家', col: '#ffab91', buy: 80 },
            paint: { name: '颜料桶', col: '#f48fb1', buy: 80 },
            fish: { name: '小鱼干爱好者', col: '#ffcc80', buy: 120 },
            shield: { name: '猫盾本盾', col: '#fff176', buy: 200 },
            legend: { name: '传说', col: '#ff5252', buy: 400 }
        };
        function achState() {
            if (!gState.ach || typeof gState.ach !== 'object') gState.ach = { c: {}, done: {}, got: {}, modes: {} };
            ['c', 'done', 'got', 'modes'].forEach(function (k) { if (!gState.ach[k]) gState.ach[k] = {}; });
            return gState.ach;
        }
        function achStat(key) {
            let A = achState();
            if (key === 'modes') return Object.keys(A.modes).length;
            if (key === 'tower') return gState.towerBest || 0;
            if (key === 'coins') return coinsOf();
            if (key === 'escLevels') { let P = escProg(); return Object.keys(P.best || {}).length; }
            if (key === 'escStars') { let P = escProg(); return Object.keys(P.best || {}).reduce(function (a, k) { return a + ((P.best[k] || {}).s || 0); }, 0); }
            if (key === 'bestStreak') return Math.max(A.c.bestStreak || 0, Math.max.apply(null, [0].concat(Object.keys(gState.streak || {}).map(function (k) { return gState.streak[k] || 0; }))));
            return A.c[key] || 0;
        }
        function achCheck(kind, data) {
            let A = achState();
            if (kind === 'settle') {
                A.c.games = (A.c.games || 0) + 1;
                if (data.won) A.c.wins = (A.c.wins || 0) + 1;
                if (data.mode) A.modes[data.mode] = 1;
                if (data.mode && weeklyMode() === data.mode) A.c.weekly = (A.c.weekly || 0) + 1;
                A.c.bestStreak = achStat('bestStreak');
            } else if (kind === 'huntTask') A.c.huntTask = (A.c.huntTask || 0) + 1;
            else if (kind === 'escDaily') A.c.escDaily = (A.c.escDaily || 0) + 1;
            let fresh = ACH_LIST.filter(function (a) { return !A.done[a.id] && achStat(a.stat) >= a.goal; });
            fresh.forEach(function (a) { A.done[a.id] = 1; });
            if (fresh.length) {
                setTimeout(function () { blazeFlash('成就：' + fresh.map(function (a) { return a.name; }).join('、') + '（去大厅领猫盾币）'); }, 1600);
                sfxChime(2);
            }
            saveProgress();
            achBadgeSync();
        }
        function achClaimable() { let A = achState(); return ACH_LIST.filter(function (a) { return A.done[a.id] && !A.got[a.id]; }); }
        function achBadgeSync() { let b = document.getElementById('ach-badge'); if (b) b.style.display = achClaimable().length ? 'block' : 'none'; }
        function achClaim(id) {
            let A = achState(), a = ACH_LIST.filter(function (x) { return x.id === id; })[0];
            if (!a || !A.done[id] || A.got[id]) return;
            A.got[id] = 1;
            coinsAdd(null, a.coin);
            if (a.title) { if (!gState.titles) gState.titles = {}; gState.titles[a.title] = 1; }
            sfxChime(3);
            saveProgress(); achBadgeSync();
            openAchievements('ach');
        }
        function titleOwned(k) { return !!(TITLES[k] && (TEST_INFINITE_COINS || (gState.titles && gState.titles[k]))); }
        function titleBuy(k) {
            let T = TITLES[k]; if (!T || !T.buy || titleOwned(k)) return;
            if (coinsOf() < T.buy) { blazeFlash('还差 ' + (T.buy - coinsOf()) + ' 个猫盾币'); return; }
            coinsAdd(null, -T.buy);
            if (!gState.titles) gState.titles = {};
            gState.titles[k] = 1; gState.title = k;
            saveProgress(); roomHello();
            openAchievements('title');
        }
        function titleWear(k) {
            if (k && !titleOwned(k)) return;
            gState.title = k || null; saveProgress(); roomHello();
            openAchievements('title');
        }
        function myTitle() { return gState.title && titleOwned(gState.title) ? gState.title : null; }
        function peerTitleOf(id) { let p = roomPeers[id]; return p && p.title && TITLES[p.title] ? p.title : null; }
        // AI 也按概率挂称号（跟表情/配饰一个规矩）
        function aiRandomTitle() {
            if (Math.random() > 0.2) return null;
            let ks = Object.keys(TITLES);
            return ks[Math.floor(Math.random() * ks.length)];
        }
        function openAchievements(tab) {
            tab = tab || 'ach';
            let A = achState(), html = '';
            let tabBtn = function (k, label) {
                return '<button onclick="openAchievements(\'' + k + '\')" style="margin:0; padding:5px 14px; font-size:13px; border:none; border-radius:5px; background:' + (tab === k ? '#6a1b9a' : '#e1bee7') + '; color:' + (tab === k ? '#fff' : '#6a1b9a') + ';">' + label + '</button>';
            };
            html += '<div style="display:flex; gap:6px; justify-content:center; margin-bottom:10px;">' + tabBtn('ach', '成就') + tabBtn('title', '称号') + '</div>';
            if (tab === 'ach') {
                html += '<div style="max-height:52vh; overflow-y:auto; text-align:left;">' + ACH_LIST.map(function (a) {
                    let v = Math.min(a.goal, achStat(a.stat)), done = A.done[a.id] || v >= a.goal, got = A.got[a.id];
                    let right = got ? '<span style="color:#9e9e9e; font-size:12px;">已领</span>' :
                        done ? '<button onclick="achClaim(\'' + a.id + '\')" style="margin:0; padding:4px 10px; font-size:12px; background:#e6a23c; color:#fff; border:none;">领取</button>' :
                            '<span style="color:#9e9e9e; font-size:12px;">' + v + ' / ' + a.goal + '</span>';
                    return '<div style="display:flex; align-items:center; gap:8px; padding:7px 4px; border-top:1px solid #eee; opacity:' + (got ? 0.6 : 1) + ';">' +
                        '<div style="flex:1;"><b style="font-size:13px;">' + a.name + '</b>' + (a.title ? ' <span style="font-size:11px; color:#8e24aa;">送称号「' + TITLES[a.title].name + '」</span>' : '') +
                        '<div style="font-size:12px; color:#777;">' + a.desc + '　' + coinBadgeHtml('+' + a.coin, 13) + '</div>' +
                        '<div style="height:4px; background:#eee; border-radius:2px; margin-top:3px;"><div style="height:4px; width:' + Math.round(v / a.goal * 100) + '%; background:' + (done ? '#66bb6a' : '#ba68c8') + '; border-radius:2px;"></div></div></div>' +
                        '<div style="white-space:nowrap;">' + right + '</div></div>';
                }).join('') + '</div>';
            } else {
                let cur = myTitle();
                html += '<div style="font-size:12px; color:#777; margin-bottom:6px;">戴上以后名字上面会显示。现在有 ' + coinBadgeHtml(coinsOf(), 14) + '</div>';
                html += '<div style="max-height:52vh; overflow-y:auto; text-align:left;">' +
                    '<div style="display:flex; align-items:center; padding:6px 4px; border-top:1px solid #eee;"><span style="flex:1; font-size:13px; color:#999;">不戴</span>' +
                    (cur ? '<button onclick="titleWear(null)" style="margin:0; padding:4px 10px; font-size:12px; background:#90a4ae; color:#fff; border:none;">摘掉</button>' : '<span style="font-size:12px; color:#66bb6a;">✓</span>') + '</div>' +
                    Object.keys(TITLES).map(function (k) {
                        let T = TITLES[k], own = titleOwned(k), on = cur === k;
                        let right = on ? '<span style="font-size:12px; color:#66bb6a;">戴着</span>' :
                            own ? '<button onclick="titleWear(\'' + k + '\')" style="margin:0; padding:4px 10px; font-size:12px; background:#7e57c2; color:#fff; border:none;">戴上</button>' :
                                T.buy ? '<button onclick="titleBuy(\'' + k + '\')" style="margin:0; padding:4px 10px; font-size:12px; background:#e6a23c; color:#fff; border:none;">' + coinBadgeHtml(T.buy, 13) + '</button>' :
                                    '<span style="font-size:11px; color:#9e9e9e;">成就「' + ACH_LIST.filter(function (a) { return a.id === T.ach; })[0].name + '」送</span>';
                        return '<div style="display:flex; align-items:center; gap:8px; padding:6px 4px; border-top:1px solid #eee;">' +
                            '<span style="flex:1;"><span style="display:inline-block; padding:1px 8px; border-radius:9px; background:#263238; color:' + T.col + '; font-size:12px; font-weight:bold;">' + T.name + '</span></span>' + right + '</div>';
                    }).join('') + '</div>';
            }
            showSysModal('成就', html, [{ label: '关闭' }]);
        }

        // ══════════════ 商店：宠物 / 表情 / 角色 ══════════════
        // 宠物养成走「你陪它过了多少天」：每个自然日只要开一局就 +1 天。
        // 天数到阈值就进化，模型和加成一起换。加成刻意压得很小，
        // 一张数值卡就是 +100 血 / +20 伤，宠物满级也就一张卡的零头。
        const SHOP_PETS = {
            bud: {
                name: '小芽', price: 30, css: '#7cb342', shape: 'sphere',
                stages: [
                    { day: 0, label: '幼芽', hp: 10, dmg: 1, scale: 0.8 },
                    { day: 3, label: '抽条', hp: 25, dmg: 2, scale: 1.0 },
                    { day: 7, label: '成株', hp: 45, dmg: 4, scale: 1.25 }
                ]
            },
            ember: {
                name: '火种', price: 30, css: '#ef6c00', shape: 'cone',
                stages: [
                    { day: 0, label: '火星', hp: 5, dmg: 2, scale: 0.8 },
                    { day: 3, label: '小焰', hp: 10, dmg: 4, scale: 1.0 },
                    { day: 7, label: '烈焰', hp: 20, dmg: 7, scale: 1.25 }
                ]
            },
            pebble: {
                name: '石子', price: 30, css: '#78909c', shape: 'box',
                stages: [
                    { day: 0, label: '碎石', hp: 20, dmg: 0, scale: 0.8 },
                    { day: 3, label: '顽石', hp: 45, dmg: 1, scale: 1.0 },
                    { day: 7, label: '磐石', hp: 80, dmg: 2, scale: 1.25 }
                ]
            },
            iron: {
                name: '铁球', price: 25, css: '#8d6e63', shape: 'box',
                fixed: true,
                stages: [
                    { day: 0, label: '固定', hp: 30, dmg: 3, scale: 1.0 }
                ]
            },
            spark: {
                name: '灵光', price: 45, css: '#26c6da', shape: 'octa',
                stages: [
                    { day: 0, label: '微光', hp: 8, dmg: 1, scale: 0.7 },
                    { day: 5, label: '流光', hp: 20, dmg: 3, scale: 1.0 },
                    { day: 12, label: '极光', hp: 40, dmg: 6, scale: 1.3 }
                ]
            }
        };

        // 表情只改脸，不影响任何数值
        // 「默认」就是游戏里猫盾本来那张脸（圆点眼 + 半涂实的嘴），原来商店里写"默认"的那张
        // 跟游戏里的脸根本不是一张，而且选了哪张都只贴到超燃宠物身上，角色本身一直是猫盾脸——
        // 所以"换了没用"。现在选哪张，你在所有模式里的身体就贴哪张，联机别人也看得到。
        const SHOP_FACES = {
            cat: { name: '默认', price: 0, special: 'cat' },
            normal: { name: '乖巧', price: 0, eyes: 'dot', mouth: 'line' },
            happy: { name: '开心', price: 15, eyes: 'arc', mouth: 'smile' },
            angry: { name: '生气', price: 15, eyes: 'slant', mouth: 'frown' },
            blank: { name: '呆滞', price: 15, eyes: 'big', mouth: 'o' },
            smug: { name: '得意', price: 25, eyes: 'wink', mouth: 'smirk' },
            cry: { name: '哭', price: 25, eyes: 'tear', mouth: 'frown' }
        };

        function shopState() {
            if (!gState.shop) gState.shop = { pets: {}, faces: { cat: 1, normal: 1 }, pet: null, face: 'cat', faceV2: 1, petDays: {}, lastDay: '' };
            let sh = gState.shop;
            if (!sh.pets) sh.pets = {};
            if (!sh.faces) sh.faces = { cat: 1, normal: 1 };
            sh.faces.cat = 1;
            // 老存档里"默认"指的是 normal，而且当时换脸根本没生效——统一回到真正的默认脸
            if (!sh.faceV2) { if (!sh.face || sh.face === 'normal') sh.face = 'cat'; sh.faceV2 = 1; }
            if (!sh.petDays) sh.petDays = {};
            if (!sh.face || !SHOP_FACES[sh.face]) sh.face = 'cat';
            if (!sh.petFace || !SHOP_FACES[sh.petFace]) sh.petFace = 'normal';   // 宠物原来一直是这张
            return sh;
        }

        function gemsOf() { return coinsOf(); }   // 宠物/表情/皮肤用的也是猫盾币，跟别的花销共用一个池子

        // 每个自然日第一次开局，给当前带着的宠物记一天
        function shopTickDay() {
            let sh = shopState();
            let today = new Date().toISOString().slice(0, 10);
            if (sh.lastDay === today) return;
            sh.lastDay = today;
            if (sh.pet) sh.petDays[sh.pet] = (sh.petDays[sh.pet] || 0) + 1;
            saveProgress();
        }

        // 当前宠物走到哪一阶段了
        function petStage(key) {
            let def = SHOP_PETS[key]; if (!def) return null;
            let days = (shopState().petDays[key] || 0);
            let st = def.stages[0];
            def.stages.forEach(function (q) { if (days >= q.day) st = q; });
            return { def: def, st: st, days: days };
        }

        function petBonus() {
            let sh = shopState();
            if (!sh.pet) return { hp: 0, dmg: 0 };
            let p = petStage(sh.pet);
            return p ? { hp: p.st.hp, dmg: p.st.dmg } : { hp: 0, dmg: 0 };
        }

        function openShop() { shopState(); shopTab(gState.shopTab || 'pet'); nav('screen-shop'); }

        function shopTab(t) {
            gState.shopTab = t;
            ['pet', 'face', 'char', 'skin'].forEach(function (k) {
                let b = document.getElementById('shop-tab-' + k);
                if (b) { b.style.background = (k === t) ? '#e6a23c' : ''; b.style.color = (k === t) ? '#fff' : ''; }
            });
            let w = document.getElementById('shop-wallet');
            if (w) w.innerHTML = coinBadgeHtml(coinsOf(), 22);
            let el = document.getElementById('shop-body'); if (!el) return;
            if (t === 'pet') el.innerHTML = shopPetHtml();
            else if (t === 'face') el.innerHTML = shopFaceHtml();
            else if (t === 'skin') el.innerHTML = shopSkinHtml();
            else el.innerHTML = shopCharHtml();
        }

        function shopRow(inner) {
            return '<div style="background:#eee; border-radius:6px; padding:9px 11px; margin-bottom:7px; text-align:left;">' + inner + '</div>';
        }

        function shopPetHtml() {
            let sh = shopState();
            let out = '<div style="font-size:12px; color:#888; margin-bottom:8px; text-align:left;">' +
                '跟着你飞，加一点生命和伤害。每天玩一局它就长大一天，够天数会进化。</div>';
            Object.keys(SHOP_PETS).forEach(function (k) {
                let d = SHOP_PETS[k], owned = !!sh.pets[k], on = sh.pet === k;
                let p = petStage(k);
                if (d.fixed) {
                    let f = d.stages[0];
                    out += shopRow(
                        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                        '<b style="color:' + d.css + ';">' + d.name + '</b>' +
                        (owned
                            ? '<button onclick="shopEquipPet(\'' + k + '\')" style="margin:0; font-size:12px; padding:4px 12px; background:' + (on ? '#5cb85c' : '#999') + '; color:#fff; border:none;">' + (on ? '使用中' : '装备') + '</button>'
                            : '<button onclick="shopBuyPet(\'' + k + '\')" style="margin:0; font-size:12px; padding:4px 12px; background:#e6a23c; color:#fff; border:none;">' + coinBadgeHtml(d.price, 14) + '</button>') +
                        '</div>' +
                        '<div style="font-size:11px; color:#666; margin-top:4px;">生命 +' + f.hp + '、伤害 +' + f.dmg + '，不会进化。</div>');
                    return;
                }
                let stageTxt = d.stages.map(function (q) {
                    let cur = (q === p.st) && owned;
                    return '<span style="color:' + (cur ? d.css : '#aaa') + ';">' +
                        q.label + '（' + q.day + '天 · 生命+' + q.hp + ' 伤害+' + q.dmg + '）</span>';
                }).join(' → ');
                out += shopRow(
                    '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                    '<b style="color:' + d.css + ';">' + d.name + '</b>' +
                    (owned
                        ? '<button onclick="shopEquipPet(\'' + k + '\')" style="margin:0; font-size:12px; padding:4px 12px; background:' + (on ? '#5cb85c' : '#999') + '; color:#fff; border:none;">' + (on ? '使用中' : '装备') + '</button>'
                        : '<button onclick="shopBuyPet(\'' + k + '\')" style="margin:0; font-size:12px; padding:4px 12px; background:#e6a23c; color:#fff; border:none;">' + coinBadgeHtml(d.price, 14) + '</button>') +
                    '</div>' +
                    '<div style="font-size:11px; color:#666; margin-top:4px; line-height:1.6;">' + stageTxt + '</div>' +
                    (owned ? '<div style="font-size:11px; color:#999; margin-top:2px;">已陪伴 ' + p.days + ' 天 · 当前 ' + p.st.label + '</div>' : ''));
            });
            if (sh.pet) out += '<button onclick="shopEquipPet(null)" style="width:100%; background:#999; color:#fff; border:none; font-size:12px;">不带宠物</button>';
            return out;
        }

        // 表情分两份：角色戴的、宠物戴的，各选各的（原来只有一份，而且只贴在宠物上）。
        // 上面放一张预览——游戏里镜头都在身后，自己的脸平时看不见，得在这儿能看到换上是什么样。
        let shopFaceTarget = 'me';
        function shopFaceHtml() {
            let sh = shopState();
            let pet = shopFaceTarget === 'pet';
            let cur = pet ? sh.petFace : sh.face;
            let seg = function (t, label) {
                let on = shopFaceTarget === t;
                return '<button onclick="shopFaceTarget=\'' + t + '\'; shopTab(\'face\')" style="flex:1; margin:0; padding:6px 0; font-size:13px; border:none; border-radius:6px; background:' +
                    (on ? '#546e7a' : '#eceff1') + '; color:' + (on ? '#fff' : '#555') + ';">' + label + '</button>';
            };
            let out = '<div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">' +
                '<img src="' + shopFacePreviewImg() + '" style="width:84px; height:96px; border-radius:8px; background:#dfe8ee; flex-shrink:0;">' +
                '<div style="flex:1; text-align:left;"><div style="display:flex; gap:6px; margin-bottom:6px;">' + seg('me', '角色的脸') + seg('pet', '宠物的脸') + '</div>' +
                '<div style="font-size:12px; color:#888; line-height:1.5;">' +
                (pet ? (sh.pet ? '宠物跟着你的时候戴这张。' : '还没有宠物，先去「宠物」买一只。') : '所有模式里你都戴这张，别人也看得到。') +
                '</div></div></div>';
            Object.keys(SHOP_FACES).forEach(function (k) {
                let d = SHOP_FACES[k], owned = d.price === 0 || !!sh.faces[k], on = cur === k;
                out += shopRow(
                    '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                    '<span style="display:flex; align-items:center; gap:8px;"><b style="display:inline-block; width:3em;">' + d.name + '</b><img src="' + facePreview(k) + '" ' +
                    'style="width:34px; height:34px; vertical-align:middle; background:#cfd8dc; border-radius:6px;"></span>' +
                    (owned
                        ? '<button onclick="shopEquipFace(\'' + k + '\')" style="margin:0; font-size:12px; padding:4px 12px; background:' + (on ? '#5cb85c' : '#999') + '; color:#fff; border:none;">' + (on ? '使用中' : '换上') + '</button>'
                        : '<button onclick="shopBuyFace(\'' + k + '\')" style="margin:0; font-size:12px; padding:4px 12px; background:#e6a23c; color:#fff; border:none;">' + coinBadgeHtml(d.price, 14) + '</button>') +
                    '</div>');
            });
            return out;
        }
        // 预览图：角色 = 开始页那只猫盾（身体颜色跟皮肤走）；宠物 = 一个圆球。脸直接用游戏里那张贴图。
        function shopFacePreviewImg() {
            let sh = shopState();
            let cv = document.createElement('canvas'); cv.width = 168; cv.height = 192;
            let g = cv.getContext('2d');
            let pet = shopFaceTarget === 'pet';
            let face = faceCanvas(pet ? sh.petFace : sh.face);
            if (pet) {
                let st = sh.pet ? petStage(sh.pet) : null;
                g.fillStyle = st ? st.def.css : '#b0bec5';
                g.beginPath(); g.arc(84, 104, 58, 0, Math.PI * 2); g.fill();
                g.drawImage(face, 34, 50, 100, 100);
            } else {
                let c = mySkinColor(0x66bb6a);
                g.fillStyle = '#' + c.toString(16).padStart(6, '0');
                g.beginPath();   // 两只尖耳朵 + 圆角身体
                g.moveTo(30, 70); g.lineTo(46, 22); g.lineTo(66, 58); g.lineTo(102, 58); g.lineTo(122, 22); g.lineTo(138, 70);
                g.lineTo(138, 164); g.quadraticCurveTo(138, 180, 122, 180); g.lineTo(46, 180); g.quadraticCurveTo(30, 180, 30, 164); g.closePath(); g.fill();
                g.drawImage(face, 42, 62, 84, 84);
            }
            try { return cv.toDataURL(); } catch (e) { return ''; }
        }

        // 商店里的小头像：直接把游戏里那张脸画出来，所见即所得
        function facePreview(k) {
            let cv = faceCanvas(k);
            try { return cv.toDataURL(); } catch (e) { return ''; }
        }

        function shopCharHtml() {
            let modes = [{ m: 'blaze', n: '超燃', list: BLAZE_ORDER, def: BLAZE_CHARS }];
            let out = '';
            modes.forEach(function (g) {
                out += '<div style="font-weight:bold; margin:6px 0 4px; text-align:left;">' + g.n + '</div>';
                g.list.forEach(function (k) {
                    let c = g.def[k], owned = charOwned(g.m, k);
                    out += shopRow(
                        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                        '<b style="color:' + c.css + ';">' + c.name + '</b>' +
                        (owned ? '<span style="font-size:12px; color:#5cb85c;">已拥有</span>'
                            : '<button onclick="shopBuyChar(\'' + g.m + '\',\'' + k + '\')" style="margin:0; font-size:12px; padding:4px 12px; background:#e6a23c; color:#fff; border:none;">' + coinBadgeHtml(COIN_PRICE, 14) + '</button>') +
                        '</div>' +
                        '<div style="font-size:11px; color:#666; margin-top:3px;">' + c.pas + '</div>');
                });
            });
            return out;
        }

        function shopSpend(n) {
            if (TEST_INFINITE_COINS) return true;
            if (coinsOf() < n) {
                showSysModal('猫盾币不够', '还差 ' + (n - coinsOf()) + ' 个。打一局 +3，赢了再 +4。', [{ label: '去打一局赚钱', color: '#5cb85c', onClick: function () { nav('screen-lobby'); selectGameMode('hunt'); } }, { label: '知道了' }]);
                return false;
            }
            gState.mcoin -= n; saveProgress(); return true;
        }

        function shopBuyPet(k) {
            let d = SHOP_PETS[k]; if (!d || !shopSpend(d.price)) return;
            let sh = shopState(); sh.pets[k] = 1; sh.pet = k;
            if (!sh.petDays[k]) sh.petDays[k] = 1;
            saveProgress(); shopTab('pet');
        }
        function shopEquipPet(k) { let sh = shopState(); sh.pet = k; saveProgress(); shopTab('pet'); }
        function shopBuyFace(k) {
            let d = SHOP_FACES[k]; if (!d || !shopSpend(d.price)) return;
            let sh = shopState(); sh.faces[k] = 1; saveProgress();
            shopEquipFace(k);
        }
        function shopEquipFace(k) {
            let sh = shopState();
            if (shopFaceTarget === 'pet') sh.petFace = k; else sh.face = k;
            saveProgress(); shopTab('face');
        }
        function shopBuyChar(mode, k) { if (charBuy(mode, k)) { saveProgress(); shopTab('char'); } }

        // 加成卡分两类：
        //   func = 功能卡，改机制的（专属卡、放技能回血、玻璃大炮）—— 单数回合发
        //   stat = 数值卡，纯堆数字的（+生命 +攻击 +攻速…）—— 偶数回合发
        // max 表示整场最多能选几次，选满了就从列表里消失。
        const BLAZE_PERKS = [
            // ── 数值卡（偶数回合）：通用只剩生命和伤害，其余都是专属 ──
            { id: 'hp', kind: 'stat', label: '生命上限 +100', only: null },
            { id: 'dmg', kind: 'stat', label: '伤害 +20', only: null },
            { id: 'as', kind: 'stat', label: '攻速 +10%', only: 'bow' },
            { id: 'swordstun', kind: 'stat', label: '1 技能眩晕 +1 秒', only: 'sword' },
            { id: 'healpct2', kind: 'stat', label: '回血量 +10%', only: 'heal' },
            { id: 'tankmax', kind: 'stat', label: '每回合生命上限 ×1.2', only: 'tank' },
            { id: 'cut', kind: 'stat', label: '减伤 +10%', only: 'tank' },
            { id: 'lifesteal', kind: 'stat', label: '吸血 +15%', only: 'guard' },
            { id: 'ctrltime', kind: 'stat', label: '控制时长 +0.1 秒', only: 'control' },
            { id: 'invisatk', kind: 'stat', label: '隐身期间每秒攻击力 +5（现身后重置）', only: 'assassin' },
            { id: 'shiftspeed', kind: 'stat', label: '位移结束后 2 秒内移速 +10%', only: 'shift' },
            { id: 'engtime', kind: 'stat', label: '建筑存在时间 +5 秒', only: 'engineer' },
            { id: 'mirblock', kind: 'stat', label: '格挡时长 +0.3 秒', only: 'mirror' },
            { id: 'cdr', kind: 'stat', label: '冷却缩减 +15%（数值卡这一路最多 60%）', only: null },
            { id: 'speed', kind: 'stat', label: '移速 +15%', only: null, max: 1 },
            { id: 'critrate', kind: 'stat', label: '暴击率 +15%', only: null },
            { id: 'critpow', kind: 'stat', label: '暴击倍率 +0.5', only: null },
            { id: 'hppct', kind: 'stat', label: '生命上限 +15%', only: null },
            { id: 'dmgpct', kind: 'stat', label: '伤害 +15%', only: null },
            { id: 'cutuni', kind: 'stat', label: '减伤 +5%', only: null },
            { id: 'laserwide', kind: 'stat', label: '激光变宽 +6', only: 'mage' },
            // ── 功能卡（单数回合）──
            { id: 'healcast', kind: 'func', label: '放技能回 2% 最大生命', only: null, max: 1 },
            { id: 'glass', kind: 'func', label: '伤害 +40%，生命上限 −30%', only: null },
            { id: 'bowstack', kind: 'func', label: '被动层数上限 +3', only: 'bow' },
            { id: 'swordexec', kind: 'func', label: '2 技能命中额外 1% 最大生命伤害，并回等量血', only: 'sword' },
            { id: 'healpct', kind: 'func', label: '治疗量 +15%', only: 'heal' },
            { id: 'tankskill', kind: 'func', label: '技能额外造成 1% 最大生命伤害', only: 'tank' },
            { id: 'guarddash', kind: 'func', label: '闪身距离 +2 身位', only: 'guard' },
            { id: 'ctrlextra', kind: 'func', label: '技能附带 0.2% 最大生命的额外控制', only: 'control', max: 1 },
            { id: 'invisburst', kind: 'func', label: '爆发 ×1.5（隐身中及现身后 3 秒不能用爆发）', only: 'assassin', max: 1 },
            { id: 'blinkfar', kind: 'func', label: '瞬移距离 +2 身位', only: 'mage' },
            { id: 'shiftback', kind: 'func', label: '移速 +20%（跑得越快，充能攒得越快）', only: 'shift' },
            { id: 'engboom', kind: 'func', label: '炮台被打掉时爆炸，4 身位内 25 伤', only: 'engineer' },
            { id: 'mirwide', kind: 'func', label: '格挡成功时，眩晕和减速范围扩大到 5 身位（不只是打你的人）', only: 'mirror' },
            // 通用功能卡（新增）
            { id: 'tough', kind: 'func', label: '生命上限 +30%，伤害 −20%', only: null, max: 1 },
            { id: 'winhp', kind: 'func', label: '每赢一局，生命上限 +100', only: null, max: 1 },
            { id: 'rage', kind: 'func', label: '生命低于 30% 时，造成的伤害 +50%', only: null, max: 1 },
            { id: 'execute', kind: 'func', label: '对生命低于 25% 的敌人伤害 +60%', only: null, max: 1 },
            { id: 'tenacity', kind: 'func', label: '受到的眩晕、定身时长减半', only: null, max: 1 },
            { id: 'regen', kind: 'func', label: '5 秒没挨打后，每秒回 3% 最大生命', only: null, max: 1 },
            { id: 'backstab', kind: 'func', label: '从背后打人伤害 +50%', only: null, max: 1 },
            { id: 'windmg', kind: 'func', label: '每赢一局，伤害 +50', only: null, max: 1 },
            { id: 'crit', kind: 'func', label: '暴击率 +30%（暴击基础 1.5 倍）', only: null, max: 1 },
            { id: 'critdmg', kind: 'func', label: '暴击倍率 1.5 倍 → 2 倍', only: null, max: 1 },
            { id: 'critheal', kind: 'func', label: '暴击时 30% 概率回 20% 最大生命', only: null, max: 1 },
            {
                id: 'critswap2', kind: 'func', only: null,
                label: '暴击倍率 + 暴击率 × 1.0（常驻，后面涨暴击率也算）'
            },
            { id: 'fullhp', kind: 'func', label: '对生命高于 90% 的敌人伤害 +40%', only: null, max: 1 },
            { id: 'skillup', kind: 'func', label: '技能伤害 +30%（普攻不吃）', only: null, max: 1 },
            { id: 'bulk', kind: 'func', label: '生命上限 +200，移速 −10%', only: null, max: 1 },
            { id: 'hpdmg', kind: 'func', label: '每 100 点最大生命，伤害 +5', only: null, max: 1 },
            {
                id: 'dmgcd', kind: 'func', only: null, max: 1,
                label: '固定伤害加成每 10 点，冷却缩减 +5%（最多 +30%）'
            },
            {
                id: 'atkcdr', kind: 'func', only: null, max: 1,
                label: '冷却缩减的一半也作用于普攻（最多 −30%）'
            },
            { id: 'lifecd', kind: 'func', label: '生命上限 −20%，冷却缩减 +20%', only: null, max: 1 },
            { id: 'armor', kind: 'func', label: '受到的伤害 −15%', only: null },
            { id: 'bastion', kind: 'func', label: '生命高于 80% 时，减伤 +25%', only: null },
            { id: 'triple', kind: 'func', label: '每第 3 次普攻命中，伤害 ×2', only: null },
            { id: 'surge', kind: 'func', label: '技能命中后，下一次普攻伤害 +50%', only: null },
            { id: 'opener', kind: 'func', label: '每局开场 10 秒内，伤害 +30%', only: null },
            { id: 'endure', kind: 'func', label: '本局每过 30 秒，伤害 +10', only: null },
            { id: 'refund', kind: 'func', label: '命中敌人时，所有技能冷却 −0.3 秒', only: null },
            { id: 'dslow', kind: 'func', label: '命中的敌人 3 秒内移速 −30%', only: null },
            { id: 'dwound', kind: 'func', label: '命中的敌人 4 秒内受到的治疗减半', only: null },
            { id: 'dweak', kind: 'func', label: '命中的敌人 3 秒内造成的伤害 −25%', only: null },
            { id: 'gale', kind: 'func', label: '移速 +40%，但生命上限 −25%', only: null, max: 3 },
            { id: 'lastone', kind: 'func', label: '队友全部阵亡时，伤害 +120%、减伤 +30%', only: null },
            { id: 'lucky', kind: 'func', label: '随机获得另外一张牌，且效果 ×1.5', only: null }
        ];

        // 回合数直接由比分推出来：打了几局 = 双方得分之和，当前是第 (和+1) 局。
        // 之前 round 是自己单独 ++ 的，跳过回合和开局那次都会让它跟比分对不上。
        function blazeRoundNo() { return blaze ? (blaze.score[0] + blaze.score[1] + 1) : 1; }

        // 单数回合给功能卡，偶数回合给数值卡。
        function blazePerkKindFor(round) { return (round % 2 === 1) ? 'func' : 'stat'; }

        // 这些常量是门槛、周期或计数，随机强化卡不能拿它们乘 1.5
        const BLAZE_NO_SCALE = {
            perkDrawN: 1, perkRerolls: 1, perkNoRepeat: 1, perkPickTime: 1,
            critMulBase: 1, perkTripleEvery: 1, perkHpDmgPer: 1, perkDmgCdPer: 1,
            perkEndurePer: 1, perkOpenerT: 1, perkBastionAt: 1, perkExecPct: 1,
            perkRagePct: 1, perkFullHpAt: 1, perkRegenDelay: 1, perkLuckyMul: 1,
        };

        // 某张牌在某个人身上的强度倍率。常驻类的牌（护甲、三连、持久……）
        // 是在结算时现算的，选牌那一刻放大常量对它们没用，得靠这个。
        function blazePk(a, id, key) {
            return BLAZE[key] * ((a && a.perkMul && a.perkMul[id]) || 1);
        }

        // 这张牌最多能选几次：功能卡一律只能选一次，数值卡默认不限。
        function blazePerkMax(o) {
            if (o.max) return o.max;
            return o.kind === 'func' ? 1 : Infinity;
        }

        function blazePerkOptions(a) {
            let kind = blazePerkKindFor(blazeRoundNo());
            let list = BLAZE_PERKS.filter(function (o) {
                if (o.kind !== kind) return false;
                if (o.only && o.only !== a.key) return false;
                if ((a.perkCount[o.id] || 0) >= blazePerkMax(o)) return false;   // 选满了就不再出现
                if (o.avail && !o.avail(a)) return false;                        // 现在用不上的也不发
                return true;
            });
            // 功能卡有可能被选光（比如没有专属卡的角色），那就退回数值卡，免得没得选
            if (!list.length) {
                list = BLAZE_PERKS.filter(function (o) {
                    if (o.kind !== 'stat') return false;
                    if (o.only && o.only !== a.key) return false;
                    if ((a.perkCount[o.id] || 0) >= blazePerkMax(o)) return false;
                    if (o.avail && !o.avail(a)) return false;
                    return true;
                });
            }
            return list;
        }

        // 从符合条件的池子里随机发几张。抽完存在 a.perkDraw 上，
        // 这样界面重画、倒计时刷新都不会换牌 —— 每回合就这一手。
        function blazePerkDraw(a) {
            if (a.perkDraw && a.perkDraw.length) return a.perkDraw;
            let all = blazePerkOptions(a);
            // 最近几手发过的先排除掉。池子不够开这么多张的话，
            // 就从最老的那一手开始放宽，实在不够再允许重复。
            let hist = a.perkSeen || [];
            let pool = [];
            for (let skip = 0; skip <= hist.length; skip++) {
                let ban = {};
                hist.slice(skip).forEach(function (g) { g.forEach(function (id) { ban[id] = 1; }); });
                pool = all.filter(function (o) { return !ban[o.id]; });
                if (pool.length >= BLAZE.perkDrawN) break;
            }
            if (!pool.length) pool = all.slice(); else pool = pool.slice();

            let out = [];
            for (let i = 0; i < BLAZE.perkDrawN && pool.length; i++) {
                out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            }
            a.perkSeen = hist.concat([out.map(function (o) { return o.id; })]).slice(-BLAZE.perkNoRepeat);
            a.perkDraw = out;
            return out;
        }

        // 「奇遇」本身不给数值：选中它等于当场再抽一张，抽到的那张效果 ×1.5。
        // 抽的结果由拥有这个角色的那台机器掷，掷完广播出去，四边才对得上。
        function blazeRollLucky(a) {
            let pool = blazePerkOptions(a).filter(function (o) { return o.id !== 'lucky'; });
            if (!pool.length) return null;
            return pool[Math.floor(Math.random() * pool.length)].id;
        }

        function blazeTakeLucky(a, rolled) {
            a.perkCount['lucky'] = (a.perkCount['lucky'] || 0) + 1;
            if (rolled) blazeApplyPerk(a, rolled, BLAZE.perkLuckyMul);
        }

        // 买到/拿到一张牌并广播。「奇遇」（lucky）不能直接 blazeApplyPerk——它在 blazeApplyPerkBody 里没有分支，
        // 直接套等于白花钱；要先随机抽一张别的牌再按 ×1.5 套上（跟局间选牌那条路一样）。（B2，重做夜间 PR #12）
        function blazeApplyPerkNet(a, id) {
            if (id === 'lucky') {
                let rolled = blazeRollLucky(a);
                blazeTakeLucky(a, rolled);
                blazeNetEv({ ev: 'perk', i: a.idx, id: 'lucky', r: rolled });
            } else {
                blazeApplyPerk(a, id);
                blazeNetEv({ ev: 'perk', i: a.idx, id: id });
            }
        }

        function blazeLuckyLabel(rolled) {
            let o = BLAZE_PERKS.filter(function (q) { return q.id === rolled; })[0];
            return o ? o.label : '（什么都没抽到）';
        }

        // 换一批：把这三张丢掉重抽。每回合的次数有限，用完按钮就没了。
        // 乱斗的卡池：只有功能卡（改机制的），一张数值卡都不放 ——
        // 想变强就去拿机制，不是靠堆数字。每张只能拿一次。
        // 开关型的卡（放技能回血、荆棘那一类）复选没有意义，拿过就不再发；
        // 其余加数值的卡在乱斗里都能反复拿。
        const BLAZE_ONCE = {
            healcast: 1, winhp: 1, rage: 1, execute: 1, tenacity: 1, regen: 1, backstab: 1,
            windmg: 1, critheal: 1, fullhp: 1, hpdmg: 1, dmgcd: 1, atkcdr: 1, armor: 1,
            bastion: 1, triple: 1, surge: 1, opener: 1, endure: 1, refund: 1,
            dslow: 1, dwound: 1, dweak: 1, lastone: 1, lucky: 1
        };



        // 乱斗里彻底没意义的牌：这两张都是按「赢了几局」算的，
        // 而乱斗压根没有回合，拿了等于白拿。
        // opener（先锋）在乱斗里也没意思：一局 8 分钟、死了就复活，
        // 「开场十秒」这个窗口太碎，拿了基本用不上。
        const BLAZE_FFA_DEAD = { winhp: 1, windmg: 1, opener: 1 };

        function blazeFfaPrice(o) {
            return o.kind === 'func' ? BLAZE.ffaPriceFunc : BLAZE.ffaPriceStat;
        }

        // 货架一次只上一种：买完一件就换另一种，功能 / 数值来回倒
        function blazeFfaKind() { return blaze.ffaShopKind || 'func'; }

        function blazeFfaPool(a, kind) {
            kind = kind || blazeFfaKind();
            return BLAZE_PERKS.filter(function (o) {
                if (o.kind !== kind) return false;
                if (BLAZE_FFA_DEAD[o.id]) return false;
                // 单排没有队友，「队友全死了」这个条件永远成立，等于白送
                if (o.id === 'lastone' && !blaze.ffaDuo) return false;
                if (o.only && o.only !== a.key) return false;
                if (BLAZE_ONCE[o.id] && (a.perkCount[o.id] || 0) >= 1) return false;
                if (o.avail && !o.avail(a)) return false;
                return true;
            });
        }

        // 商店货架：上架 3 件，同一种卡。锁住的那几件不参与刷新，一直留着。
        function blazeFfaDraw() {
            if (blaze.ffaDraw && blaze.ffaDraw.length) return blaze.ffaDraw;
            let out = [];
            let pool = blazeFfaPool(blaze.me);
            while (out.length < BLAZE.ffaShopN && pool.length) {
                out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            }
            blaze.ffaDraw = out;
            return out;
        }

        // 金箱给的免费 5 选 1：单独一手牌，从两种卡里一起抽
        function blazeFfaFreeDraw() {
            if (blaze.ffaFree && blaze.ffaFree.length) return blaze.ffaFree;
            let pool = blazeFfaPool(blaze.me, 'func').concat(blazeFfaPool(blaze.me, 'stat'));
            let out = [];
            for (let i = 0; i < BLAZE.ffaGoldPickN && pool.length; i++) {
                out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            }
            blaze.ffaFree = out;
            return out;
        }

        function blazeFfaFreePick(id) {
            if (!blaze || !blaze.ffa || (blaze.ffaFreeN || 0) <= 0) return;
            blaze.ffaFreeN--;
            blaze.ffaFree = null;
            blazeApplyPerkNet(blaze.me, id);
            blazeFfaCardRender();
        }

        // 任选一张：整个卡池摊开随便挑，但要一大笔钱
        function blazeFfaCustomToggle() {
            blaze.ffaCustom = !blaze.ffaCustom;
            blazeFfaCardRender();
        }

        function blazeFfaCustomPick(id) {
            if (!blaze || !blaze.ffa) return;
            if (blaze.ffaMoney < BLAZE.ffaCustomPrice) {
                blazeFlash('钱不够（任选要 ' + BLAZE.ffaCustomPrice + '）'); return;
            }
            blaze.ffaMoney -= BLAZE.ffaCustomPrice;
            blaze.ffaCustom = false;
            blaze.ffaDraw = null;
            blazeApplyPerkNet(blaze.me, id);
            blazeFfaCardRender();
        }

        function blazeFfaRefreshCost() {
            return BLAZE.ffaRefreshBase + BLAZE.ffaRefreshStep * (blaze.ffaRefreshN || 0);
        }

        // 刷新：换一批货，越刷越贵。每次进账（每 30 秒）把价格重置回底价。
        function blazeFfaRefresh() {
            if (!blaze || !blaze.ffa || blaze.over) return;
            let cost = blazeFfaRefreshCost();
            if (blaze.ffaMoney < cost) { blazeFlash('钱不够刷新（要 ' + cost + '）'); return; }
            blaze.ffaMoney -= cost;
            blaze.ffaRefreshN = (blaze.ffaRefreshN || 0) + 1;
            blaze.ffaDraw = null;
            blazeFfaCardRender();
        }

