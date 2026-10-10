        // 大厅选模式面板里每个模式都已经有一块完整的规则说明（xxx-only 那些 div），
        // 但那是选模式的时候才看得到的——真进了局，尤其是没细看就点了开始的人，
        // 完全没有任何提醒。第一次进某个模式的时候，把那块面板的文字原样弹出来
        // 当一次性教程：不重复维护一份文案，面板改了这里也跟着改。
        // ══════════════ 游戏规则 + 第一次碰到新东西时的介绍 ══════════════
        // 局内画面上只留状态（分数、时间、剩几个人），怎么玩全放这里：大厅「规则」按钮看，
        // 第一次进某个模式自动弹一次；局里第一次碰到新机关/新道具，用 introOnce 弹一张小卡片。
        const MODE_RULES = {
            hunt: { title: '寻宝队', lines: function () { return [
                '迷宫里开箱子找宝贝，拿回起点那一格上交。',
                '上交的东西值够了就能撤离，撤离出去才算赢。',
                '上交不给钱，撤离后东西进仓库，卖掉才有钱。',
                '没撤出去（倒下后离开、中途退出、关页面）算失败：上交的和背包里的全没了。',
                '怪物会追人。倒地了队友能救你，开了 AI 补齐的话 AI 也会来救。',
                kTxt('<b>F / 左键</b> 开箱子、捡东西、打怪　<b>右键</b> 用手上的东西', '<b>互动</b> 开箱子、捡东西、打怪　<b>道具</b> 用手上的东西'),
                kTxt('<b>1 2 3</b> 换手上的东西　<b>Q</b> 扔　<b>E</b> 背包　<b>M</b> 地图', '点下面的格子换手上的东西，<b>背包</b> 看全部'),
                kTxt('<b>Shift</b> 跑　<b>空格</b> 跳', '<b>跑</b> <b>跳</b> 在右下角'),
                '每个腰包自带 3 格。在背包或仓库里点一下腰包打开，东西拖进拖出；腰包不能放进腰包。',
                kTxt('手上拿着腰包时按 <b>1 2 3</b> 把里面的东西拿到手上。', '腰包里的东西要拖出来才能用。'),
                '用了信号接收器，跟着蓝线走就能找到那件东西，换楼层也会带路。',
                '绿色猫盾能回血，黄色猫盾能翻滚躲开攻击。'
            ]; } },
            night: { title: '惊魂夜', lines: function () { return [
                '1 个追捕者对 4 个逃生者。',
                '<b>逃生者</b>：修好 5 台矿机，逃生门就能开，从门里跑出去。',
                '被打两下会倒地，倒地被挂上椅子就出局，队友能救你。',
                '<b>追捕者</b>：把人打倒、挂上椅子。',
                kTxt('<b>左键</b> 互动 / 普攻　<b>空格</b> 动作（校准、抓人、挂椅子）　<b>E</b> 破坏板子　<b>Q</b> 切换', '按钮名字会跟着你在做的事变'),
                '屏幕中间会提示现在能做什么。'
            ]; } },
            blaze: { title: '超燃', lines: function () { return [
                '<b>2v2</b>：一条命，一队全灭输一局，先赢 ' + BLAZE.roundsToWin + ' 局。局间能选一项加成。',
                '毒圈会收，站在圈外掉血。',
                '<b>乱斗</b>：16 人混战 5 分钟，死了 10 秒后复活。击杀 +2、助攻 +2、死亡 −1。',
                '乱斗里会慢慢进账，' + kTxt('按 <b>C</b>', '点 <b>商店</b>') + ' 花钱买卡。',
                kTxt('<b>空格</b> 普攻　<b>左键</b> 1 技能　<b>右键</b> 2 技能（按住瞄准，松手放）　<b>Shift</b> 跳', '<b>普攻</b> <b>1技能</b> <b>2技能</b>（按住瞄准，松手放）<b>跳</b>')
            ]; } },
            race: { title: '竞速', lines: function () { return [
                '16 人五轮淘汰：16 → 12 → 8 → 4 → 2，每轮最后几名出局。',
                '开跑前 7 秒被栏杆拦着，可以往前挤，顺便选这轮的技能。',
                '掉下去不算输，会回到检查点。路上的箱子能开出道具。',
                '<b>双人</b>：两人一队，按名次算分，加起来最少的队出局。',
                '出局了还能换人看。',
                kTxt('<b>WASD</b> 跑　<b>空格</b> 跳　<b>左键 / Shift</b> 冲刺　<b>右键 / E</b> 技能　<b>Q</b> 道具', '右下角 <b>跳</b> <b>冲刺</b> <b>技能</b> <b>道具</b>')
            ]; } },
            jail: { title: '监狱救援', lines: function () { return [
                '5v5，两队各占一半地盘。',
                '在对面地盘被对面的人碰到，就进监狱。在自己家很安全。',
                '去对面监狱碰一下，能把队友全救出来。',
                '每队家门口有 5 件东西，扛回自己家就算抢到。被抓了东西掉在原地。',
                '东西多的队赢，一队全进监狱直接输。一局 4 分钟。',
                kTxt('<b>Shift</b> 跑（耗体力）　<b>空格</b> 跳', '<b>跑</b>（耗体力）<b>跳</b>')
            ]; } },
            dodge: { title: '躲避球', lines: function () { return [
                '两队各占半场，不能过中线。被砸中就出局。',
                kTxt('<b>左键</b> 点一下捡球或放下，按住瞄准，松手扔。', '<b>投</b> 点一下捡球或放下，按住瞄准，松手扔。'),
                kTxt('<b>右键</b> 接球，要掐准时间。接住能救回一个队友。', '<b>接</b> 接球，要掐准时间。接住能救回一个队友。'),
                '中线的球捡起来，要先跑回自己底线才能扔。',
                '球投进中间的篮筐，全队复活。',
                '一队全灭就输，时间到了比人数。',
                '<b>疯狂模式</b>：多了金色复活球、碰到就出局的黑球，还会空投新球。'
            ]; } },
            escape: { title: '合作密室', lines: function () { return [
                '四个人一起开机关，全员走到出口（绿色地面）就过关。',
                '脚下圆圈的颜色就是你的颜色。',
                '<b>彩色板</b> 只有同色的人能站，<b>灰板</b> 谁都行，<b>×2</b> 要两个人。',
                '<b>拉杆</b> 有人站着门才开，<b>按钮</b> 踩一下门开 4 秒。',
                '<b>钥匙、顺序板、密码</b> 要你来做，AI 帮你站岗。',
                '红激光躲开，碰到会退回去。橙激光和矮栏跳过去。',
                '前 8 关是入门关，一关教一样东西。越快过关星越多。'
            ]; } },
            park: { title: '猫盾乐园', lines: function () { return [
                '玩别人用积木做的小游戏，每个游戏的规则都不一样。',
                kTxt('<b>WASD</b> 走，<b>空格</b> 跳', '左半屏拖着走，<b>跳</b> 在右下角'),
                '点「自己做一个」进创作界面，像 Scratch 一样拖积木做游戏。',
                '别人玩你做的游戏，你也有猫盾币（要在同一个房间）。'
            ]; } },
            cake: { title: '松饼大作战', lines: function () { return [
                '不分队，谁都能抓人。',
                '面朝一个人、让他进到你手的范围，他就出局。',
                '地上的东西能加速、加长手，或者挡一次。',
                '最后剩下的人赢，时间到了比谁抓得多。',
                kTxt('<b>空格</b> 跳', '<b>跳</b> 在右下角')
            ]; } },
            sumo: { title: '推推乐', lines: function () { return [
                '8 个人站在圆台上，20 秒后台子开始缩小。',
                kTxt('<b>左键 / E</b> 往前一撞，面前的人会飞出去。', '<b>推</b> 往前一撞，面前的人会飞出去。'),
                '掉下去就出局，最后站着的赢。时间到了比谁推下去的多。'
            ]; } },
            paint: { title: '彩弹占地', lines: function () { return [
                '4v4，走过的地方变成你们队的颜色。',
                kTxt('<b>左键 / E</b> 扔颜料，落地炸开一片。', '<b>喷</b> 扔颜料，落地炸开一片。'),
                '砸中对面的人他会愣一下。踩在对面颜色上走得慢。',
                '2 分钟后地盘大的队赢。'
            ]; } },
            tower: { title: '爬塔', lines: function () { return [
                '跳台绕着柱子往上盘，底下的岩浆一直在涨，越往后涨得越快。',
                '<b>单人</b>：看你能爬多高。',
                '<b>双人</b>：两个人都到顶才赢。有人掉下去，另一个爬到下一面绿旗就能救回来。',
                '<b>多人</b>：6 个人比谁先到顶。',
                '起点和每面绿旗是存档点，站上去就记住（旗子变金色）。',
                '掉进岩浆时，岩浆还没淹到存档点，就回存档点接着爬。',
                '淹过了再掉：单人结束，多人出局，双人倒下等队友救。'
            ]; } }
        };
        function rulesHtml(key) {
            let R = MODE_RULES[key]; if (!R) return '';
            return '<div style="text-align:left; max-height:62vh; overflow-y:auto; font-size:14px; line-height:1.75;">' +
                R.lines().map(function (l) { return '<div style="padding:3px 0; border-bottom:1px dashed #eee;">' + l + '</div>'; }).join('') + '</div>';
        }
        function openRules(key) {
            key = key || gState.gameMode || 'hunt';
            let R = MODE_RULES[key]; if (!R) return;
            introPush(R.title + ' · 规则', rulesHtml(key));
        }
        // 弹卡片排队：同时碰到好几样新东西，一张一张来，不互相盖掉。
        // 卡片开着时别的弹窗也盖不掉它（规则见 01-core.js 的 showSysModal / sysModalSync）。
        // introOpen 由 sysModalSync 维护：弹窗开着、而且开着的是卡片才是 true，不管弹窗是怎么关的都会回到 false
        let introQ = [], introOpen = false;
        function introPush(title, html) { introQ.push({ title: title, html: html }); introPump(); }
        function introPump() {
            if (!introQ.length) return;
            if (sysModalVisible()) { if (sysModalKind !== 'intro') setTimeout(introPump, 600); return; }   // 普通弹窗开着：等它关（关的时候也会再叫一次）
            let it = introQ.shift();
            sysModalRender(it.title, it.html, [{ label: '知道了', color: '#43a047' }], 'intro');
        }
        // 单人的时候弹卡片会把这一局停住（escape / 乐园 / 新模式单机都看这个）
        function introPaused() { return introOpen; }
        function introOnce(key, title, text) {
            if (!gState.introSeen || typeof gState.introSeen !== 'object') gState.introSeen = {};
            if (gState.introSeen[key]) return;
            gState.introSeen[key] = 1; saveProgress();
            introPush(title, '<div style="text-align:left; font-size:14px; line-height:1.75;">' + text + '</div>');
        }
        function showModeIntroIfFirstTime(key) {
            if (!gState.modeIntroShown) gState.modeIntroShown = {};
            if (gState.modeIntroShown[key]) return;
            gState.modeIntroShown[key] = true; saveProgress();
            if (MODE_RULES[key]) setTimeout(function () { openRules(key); }, 400);
        }

        // ── 通用匹配等待：给没组队直接点"开始"的人用——先等最多 15 秒看房间里还有
        // 没有陌生人也想玩这个模式，凑到人就真联机，凑不到就跟以前一样自己配 AI。
        // 跟惊魂夜本来就写好的那套（nightMatch/matchPool/matchLeader）走的是同一条
        // 心跳（roomSelfMsg/roomOnHello/roomSync 里的 mm 字段），UI 也直接复用
        // #night-wait 那个浮层——不单独起一份、不跟玩家报"15秒"这种绝对数字，
        // 显示的是"这一屋子里等得最久的人还剩多少秒"（mmMinLeft），跟惊魂夜一个逻辑：
        // 谁先开始等，倒计时就以谁为准，晚进来的人不会让别人多等。
        const MM_WAIT = 15;
        // 不告诉玩家具体还剩几秒：一是不同人加入的时间点不一样，写死一个数字反而经常
        // 对不上（有人一进来看到"3秒"，实际又等了好几秒才真的匹配到）；二是干脆藏起来，
        // 等多久心里没底，比盯着一个精确又经常"说话不算数"的倒计时数字要舒服。
        function mmSuspenseDots() {
            return '·'.repeat(1 + Math.floor(performance.now() / 400) % 3);
        }
        let mmActive = null;      // 我自己在等：{ mode, cap, t0, left, onResolve, timer }
        let mmRoomPool = {};      // roomSync() 每次心跳都重新算一遍：{ id: { mode, left } }
        const MM_MODE_LABEL = { blaze: '超燃 · 2v2', blazeffa: '超燃 · 乱斗', cake: '松饼大作战', race: '竞速', escape: '合作密室', jail: '监狱救援', dodge: '躲避球', sumo: '推推乐', paint: '彩弹占地', tower: '爬塔' };
        function mmMinLeft() {
            let v = mmActive ? mmActive.left : Infinity;
            Object.keys(mmRoomPool).forEach(function (id) {
                if (id === gState.id) return;
                let l = mmRoomPool[id].left;
                if (typeof l === 'number' && l < v) v = l;
            });
            return v;
        }
        // 跟惊魂夜 matchLeader() 一模一样的思路：剩得最少的人排最前，
        // 一样的话按 ID 字典序兜底——两边都能各自独立算出同一个结果。
        function mmLeader() {
            let ids = Object.keys(mmRoomPool);
            if (!ids.length) return gState.id;
            // 每个人对"别人还剩多少"的了解都是上一次心跳时的快照（心跳 1.2 秒一次，
            // 房间里超过 5 秒没消息才会被清出池子——最坏也就差这么多），只有自己这份
            // 是随时最新的——這一步差距一旦比桶粒度还大，两边各自算出来的"谁最少"就
            // 可能不一样，导致两边同时以为自己该发起，都各自广播了一次开局。桶跟"多久
            // 没消息就算掉线"用同一个 5 秒，只要大家剩的时间差不多，就统一交给 ID 字典序
            // 兜底——两边用的是完全一样的字符串，肯定算出同一个人，不会因为心跳没到齐就
            // 各算各的。
            ids.sort(function (a, b) {
                let la = mmRoomPool[a].left, lb = mmRoomPool[b].left;
                la = (typeof la === 'number') ? Math.round(la / 5) : 99999;
                lb = (typeof lb === 'number') ? Math.round(lb / 5) : 99999;
                if (la !== lb) return la - lb;
                return a < b ? -1 : (a > b ? 1 : 0);
            });
            return ids[0];
        }
        function mmStart(mode, cap, onResolve) {
            if (mmActive || nightMatch) return;   // 已经在排队（这个或惊魂夜那个），别重复点
            mmActive = { mode: mode, cap: cap || 99, t0: performance.now(), left: MM_WAIT, onResolve: onResolve };
            document.getElementById('night-wait').classList.remove('hidden');
            bc.postMessage(roomSelfMsg());
            mmActive.timer = setInterval(mmTick, 250);
            mmTick();
        }
        function mmTick() {
            if (!mmActive) return;
            let elapsed = (performance.now() - mmActive.t0) / 1000;
            mmActive.left = Math.max(0, MM_WAIT - elapsed);
            let n = Object.keys(mmRoomPool).length || 1;
            document.getElementById('night-wait-sub').innerText =
                '正在匹配 ' + (MM_MODE_LABEL[mmActive.mode] || mmActive.mode) + '　等真人进来，等不到就用 AI 补';
            let shown = mmMinLeft();
            document.getElementById('night-wait-count').innerText = mmSuspenseDots();
            let ids = Object.keys(mmRoomPool).sort();
            document.getElementById('night-wait-list').innerHTML = ids.map(function (id) {
                return '<div style="color:' + (id === gState.id ? '#7fd1ff' : '#cfe8ff') + ';">' +
                    dispName(id) + (id === gState.id ? '（你）' : '') + '</div>';
            }).join('') || '<div style="color:#888;">还没人加入</div>';
            let full = n >= mmActive.cap;
            // 兜底交给"发起人的心跳掉线了"来判断（roomSync 每次心跳都会把 5 秒没
            // 消息的人清出 mmRoomPool），不能光看自己这边的钟走到多少——发起人其实
            // 好好地活着、消息就是差那零点几秒还没到，自己这边计时一到就抢着替他
            // 广播开局，两边各开一次，虽然最后会被真消息盖过去，但会闪一下、还会
            // 白白多发一条错的开局广播。只要发起人还在 mmRoomPool 里（没被判定掉线），
            // 就说明他还没消失，稳稳等他自己发，而不是抢跑。
            if (mmLeader() === gState.id) {
                if (full || shown <= 0) mmGo();
            }
        }
        function mmCancel() {
            if (!mmActive) return;
            clearInterval(mmActive.timer);
            mmActive = null;
            document.getElementById('night-wait').classList.add('hidden');
            bc.postMessage(roomSelfMsg());
        }
        function mmGo() {
            if (!mmActive) return;
            clearInterval(mmActive.timer);
            let onResolve = mmActive.onResolve;
            let ids = Object.keys(mmRoomPool).sort();
            if (ids.indexOf(gState.id) < 0) ids.unshift(gState.id);
            mmActive = null;
            document.getElementById('night-wait').classList.add('hidden');
            // 先让 onResolve 把真正的开局广播（BZ_START 之类）发出去，"我不等了"这条
            // 心跳最后再发——顺序不能反，反了的话，另一个人如果刚好也卡在自己的
            // 截止点上，会先收到"发起人从池子里消失了"，赶在真开局消息到之前，
            // 误以为发起人挂了，自己抢着广播了一次（等真消息到了才被盖过去，但已经
            // 白白多开了一次局，人眼能看到画面闪一下）。
            onResolve(ids);
            bc.postMessage(roomSelfMsg());
        }
        // 大厅那个浮层的"取消"按钮惊魂夜/这套通用匹配共用，谁在等就取消谁。
        function nightOrMmCancel() {
            if (nightMatch) { nightCancelMatch(); return; }
            if (mmActive) { mmCancel(); return; }
        }

        function nav(id) {
            document.querySelectorAll('.screen').forEach(function (s) { s.classList.add('hidden'); });
            if (id !== 'none') { document.getElementById(id).classList.remove('hidden'); }
            // 大厅现在就是那个能走动的 3D 广场——回大厅自动站在里面，离开大厅
            // （进任何一个实际模式）就把它收起来，不用每个模式自己记得处理。
            if (id === 'screen-lobby') { if (typeof hub !== 'undefined' && !hub) hubBegin(); }
            else if (typeof hub !== 'undefined' && hub) { hubExit(); }
        }

        // 选设备/填 ID 合并成一屏之后，选设备不用再跳转，原地切换 + 高亮按钮就行。
        // gState.control 默认就是 'laptop'（跟两个按钮的初始样式对应），就算谁都没点，
        // 点"确定"的时候 requestLobbyAccess 也会补一次，不会漏设成默认值。
        function selectControl(deviceStr) {
            gState.control = deviceStr;
            applyControlHints();
            let padUI = document.querySelectorAll('.joystick-zone, .action-btn, #phone-backpack-toggle');
            if (deviceStr === 'pad') { padUI.forEach(function (e) { e.style.display = 'flex'; }); document.getElementById('crosshair').style.display = 'none'; }
            else { padUI.forEach(function (e) { e.style.display = 'none'; }); document.getElementById('crosshair').style.display = 'block'; }
            let bl = document.getElementById('ctrl-btn-laptop'), bp = document.getElementById('ctrl-btn-pad');
            if (bl) { bl.style.background = deviceStr === 'laptop' ? '#5cb85c' : '#eceff1'; bl.style.color = deviceStr === 'laptop' ? '#fff' : '#555'; }
            if (bp) { bp.style.background = deviceStr === 'pad' ? '#5cb85c' : '#eceff1'; bp.style.color = deviceStr === 'pad' ? '#fff' : '#555'; }
        }
        // 设备选择每次刷新都是从"电脑"这个默认值开始——手机/平板用户打开第一屏，
        // 明明摸得到屏幕，却要先自己点一下"平板"才对。触屏 + 窄屏就猜"平板"（宽屏
        // 触屏笔记本不猜，那种还是键鼠为主），猜错了用户自己点一下就是，比每次都要
        // 手动切换省事。
        // ── 设置（跟着设备走，不跟账号走，存在 TH_settings 里）──
        // 键盘和触屏一直都能用；"触屏按键"只管屏幕上那些摇杆/按钮显不显示。
        // 没设置过的时候：手指操作的设备（粗指针）或者窄屏触屏默认显示，其它默认隐藏。
        // 灵敏度原来存在 gState 里但 saveProgress 没带上它，每次刷新都回到 1——现在也放这儿存。
        // P1：寻宝队难度、AI 补齐队友、惊魂夜选的角色也存在这里（null = 没选过，用默认），进大厅时恢复
        let SETTINGS = { touch: null, sens: 1, invertY: false, sfx: true, hq: false, mapDiff: null, aiFill: null, nightChar: null };
        function settingsLoad() {
            try { let v = JSON.parse(localStorage.getItem('TH_settings') || 'null'); if (v) Object.keys(SETTINGS).forEach(function (k) { if (v[k] !== undefined) SETTINGS[k] = v[k]; }); } catch (e) { }
        }
        function settingsSave() { try { localStorage.setItem('TH_settings', JSON.stringify(SETTINGS)); } catch (e) { } }
        function touchUiDefault() {
            let coarse = false; try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { }
            let touch = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
            return coarse || (touch && window.innerWidth < 1100);
        }
        function settingsApply() {
            gState.mouseSensitivity = SETTINGS.sens || 1;
            SFX_ENABLED = SETTINGS.sfx !== false;
            let touch = SETTINGS.touch === null ? touchUiDefault() : SETTINGS.touch;
            selectControl(touch ? 'pad' : 'laptop');
            if (renderer) { renderer.setPixelRatio(SETTINGS.hq ? Math.min(2, window.devicePixelRatio || 1) : 1); renderer.setSize(window.innerWidth, window.innerHeight); }
        }
        function lookY() { return SETTINGS.invertY ? -1 : 1; }
        // P1：进大厅时把上次的三个选择放回去。不在加载时做：NIGHT_CHARS 定义在这个文件后面
        function settingsRestoreChoices() {
            if (['easy', 'med', 'hard'].indexOf(SETTINGS.mapDiff) >= 0) {
                gState.mapDifficulty = SETTINGS.mapDiff;
                let r = document.querySelector('input[name="map_diff"][value="' + SETTINGS.mapDiff + '"]'); if (r) r.checked = true;
            }
            if (typeof SETTINGS.aiFill === 'boolean') gState.aiFill = SETTINGS.aiFill;
            if (SETTINGS.nightChar && NIGHT_CHARS[SETTINGS.nightChar]) gState.nightChar = SETTINGS.nightChar;
        }
        function settingsRemember(k, v) { if (SETTINGS[k] === v) return; SETTINGS[k] = v; settingsSave(); }
        settingsLoad();
        (function () {
            gState.mouseSensitivity = SETTINGS.sens || 1;
            let touch = SETTINGS.touch === null ? touchUiDefault() : SETTINGS.touch;
            if (touch) selectControl('pad');
        })();

        function openSettings() {
            let touchOn = gState.control === 'pad';
            let row = function (label, ctrl) {
                return '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 0; border-bottom:1px solid #eee;">' +
                    '<span style="font-size:14px; color:#444;">' + label + '</span>' + ctrl + '</div>';
            };
            let sw = function (id, on, a, b) {
                let btn = function (val, txt) {
                    let sel = on === val;
                    return '<button id="' + id + '-' + (val ? 'on' : 'off') + '" onclick="settingsPick(\'' + id + '\', ' + val + ')" style="margin:0; padding:4px 10px; font-size:12px; border:none; border-radius:4px; background:' + (sel ? '#5cb85c' : '#eceff1') + '; color:' + (sel ? '#fff' : '#555') + ';">' + txt + '</button>';
                };
                return '<span style="display:flex; gap:4px;">' + btn(true, a) + btn(false, b) + '</span>';
            };
            let sens = SETTINGS.sens || 1;
            let body = '<div style="text-align:left; min-width:250px;">' +
                row('触屏按键', sw('set-touch', touchOn, '显示', '隐藏')) +
                row('转视角快慢', '<span style="display:flex; align-items:center; gap:6px;"><input type="range" id="set-sens" min="0.3" max="2.5" step="0.05" value="' + sens + '" style="width:110px;" oninput="settingsSens(this.value)"><span id="set-sens-val" style="font-size:12px; color:#777; width:32px;">' + sens.toFixed(2) + '</span></span>') +
                row('上下视角反转', sw('set-inv', !!SETTINGS.invertY, '开', '关')) +
                row('背景音乐', sw('set-bgm', !bgmMuted(), '开', '关')) +
                row('音效', sw('set-sfx', SETTINGS.sfx !== false, '开', '关')) +
                row('画面', sw('set-hq', !!SETTINGS.hq, '清晰', '流畅')) +
                row('快捷语', '<button onclick="openChatSetup()" style="margin:0; padding:4px 12px; font-size:12px; background:#607d8b; color:#fff; border:none; border-radius:4px;">改一下</button>') +
                '</div>';
            showSysModal('设置', body, [{ label: '好了', color: '#5cb85c' }]);
        }
        function settingsPick(id, on) {
            if (id === 'set-touch') SETTINGS.touch = on;
            else if (id === 'set-inv') SETTINGS.invertY = on;
            else if (id === 'set-sfx') SETTINGS.sfx = on;
            else if (id === 'set-hq') SETTINGS.hq = on;
            else if (id === 'set-bgm') { if (bgmMuted() === on) bgmToggle(); }
            settingsSave(); settingsApply();
            let a = document.getElementById(id + '-on'), b = document.getElementById(id + '-off');
            if (a && b) {
                a.style.background = on ? '#5cb85c' : '#eceff1'; a.style.color = on ? '#fff' : '#555';
                b.style.background = !on ? '#5cb85c' : '#eceff1'; b.style.color = !on ? '#fff' : '#555';
            }
        }
        function settingsSens(v) {
            SETTINGS.sens = parseFloat(v) || 1; settingsSave(); gState.mouseSensitivity = SETTINGS.sens;
            let el = document.getElementById('set-sens-val'); if (el) el.innerText = SETTINGS.sens.toFixed(2);
        }

        // 大厅里那几段静态说明，选完设备再按设备填进去
        function applyControlHints() {
            let set = function (id, html) { let e = document.getElementById(id); if (e) e.innerHTML = html; };
            let ct = document.getElementById('chat-toggle');
            if (ct && (typeof chatMode === 'undefined' || chatMode === 0)) ct.innerText = gState.control === 'pad' ? '发言' : '发言（回车）';
            set('calib-help-keys', kTxt('按 <b>空格</b> 校准。', '点屏幕任意处校准。'));
        }

        // 起名撞车是真正的问题根源（联机全靠 ID 认人）——单靠事后踢人治标不治本，
        // 从根上让不同设备基本不会撞出同一个最终 ID：每台设备第一次用的时候
        // 生成一段专属小尾巴、永久存在本地，新建的 ID 都带上它。已经有存档的老 ID
        // （没带尾巴）原样放过，不然现有玩家进来就找不到自己存档了。
        function deviceSuffix() {
            try {
                let s = localStorage.getItem('TH_device_suffix');
                if (!s) { s = Math.random().toString(36).slice(2, 6); localStorage.setItem('TH_device_suffix', s); }
                return s;
            } catch (e) { return Math.random().toString(36).slice(2, 6); }
        }
        // 清空本地数据：测试的时候经常想拿个"全新号"重来，手动一个个清 localStorage
        // 太麻烦——这游戏所有本地存储的 key 都用 TH_ 开头，直接扫一遍全删掉，
        // 删完刷新页面，跟真的第一次打开一样。
        function clearLocalCache() {
            showSysModal('清空本地数据', '这台设备上的存档、猫盾币、皮肤、好友全部清掉，清完没法恢复。确定？', [
                {
                    label: '确定清空', color: '#d9534f', onClick: function () {
                        try {
                            let keys = [];
                            for (let i = 0; i < localStorage.length; i++) { let k = localStorage.key(i); if (k && k.indexOf('TH_') === 0) keys.push(k); }
                            keys.forEach(function (k) { localStorage.removeItem(k); });
                        } catch (e) { }
                        location.reload();
                    }
                },
                { label: '取消' }
            ]);
        }
        function resolvePlayerId(raw) {
            try { if (localStorage.getItem('TH_save_' + raw)) return raw; } catch (e) { }
            return raw + '#' + deviceSuffix();
        }
        // resolvePlayerId 加的 #xxxx 小尾巴只是为了后台防撞车，玩家不需要看到它——
        // 显示的时候统一用这个把尾巴去掉（AI 名字是 "本名#xxxx_AI_1" 这种，也要连着摘掉）。
        // 返回的是已经转义过的文本，可以直接拼进 innerHTML（A1）
        // C7：同一个房间里有人显示名一样（两台设备都叫 d），这几个人名字后面都加设备尾巴的前两位，
        // 比如"d·a1""d·k7"；前两位也一样就用整个尾巴。没重名就只显示名字。
        // 只看房间名单里的 ID 算（roomSync 时重算），各端名单一样，算出来就一样。
        let dispDup = {};   // 显示名 → 房间里用这个显示名、带设备尾巴的 ID（2 个以上才记）
        function dispNameBase(id) { return String(id || '').replace(/#[0-9a-z]{4}(?=(_AI_\d+)?$)/, ''); }
        function dispDupRebuild(ids) {
            let by = {}, next = {};
            ids.forEach(function (id) { if (!/#[0-9a-z]{4}$/.test(id)) return; let b = dispNameBase(id); (by[b] = by[b] || []).push(id); });
            Object.keys(by).forEach(function (b) { if (by[b].length > 1) next[b] = by[b].slice().sort(); });
            let changed = JSON.stringify(next) !== JSON.stringify(dispDup);
            dispDup = next;
            return changed;
        }
        // 名字原文（去掉设备尾巴，重名时带尾巴前两位）：给 innerText、画到画布上、发出去的纯文本用
        function dispNameText(id) {
            let s = String(id || ''), base = dispNameBase(s), dup = dispDup[base], m = /#([0-9a-z]{4})$/.exec(s);
            if (!dup || !m || dup.indexOf(s) < 0) return base;
            let short = m[1].slice(0, 2);
            let clash = dup.filter(function (x) { return x.slice(-4, -2) === short; }).length > 1;
            return base + '·' + (clash ? m[1] : short);
        }
        // 转义后的名字：给拼进 innerHTML 用
        function dispName(id) {
            return chatEscape(dispNameText(id));
        }
        // ID 会原样广播给房间里所有人，好多地方（房间列表、好友列表、组队邀请弹窗、
        // 匹配等待名单……）是直接把它拼进 innerHTML 里显示的，不是当纯文本塞进
        // innerText——不过滤的话，随便什么人把自己 ID 起成带 <img onerror=...> 这种，
        // 就能在所有看到这个 ID 的人的浏览器里跑代码。只挡真正有危险的几个 HTML
        // 特殊字符，中文/emoji/别的标点都不受影响，正常起名基本感觉不到。
        function sanitizeId(raw) {
            return String(raw || '').replace(/[<>&"']/g, '');
        }
        function requestLobbyAccess() {
            // 没点过设备按钮（默认就是电脑）也要走一遍——不然摇杆/十字准星那些
            // 跟设备挂钩的 UI 状态就没套上过，直接照默认值补一次。
            selectControl(gState.control);
            let raw = sanitizeId(document.getElementById('player-id').value.trim());
            if (!raw) { showSysModal('错误', '请输入ID', [{ label: '确定' }]); return; }
            let pid = resolvePlayerId(raw);
            pendingIdCheck = pid; bc.postMessage({ type: 'CHECK_ID', target: '*', id: pid });
            idCheckTimeout = setTimeout(() => { if (pendingIdCheck === pid) { pendingIdCheck = ''; proceedToLobby(pid); } }, 300);
        }

        function proceedToLobby(pid) {
            let ai1Name = pid + "_AI_1"; let ai2Name = pid + "_AI_2"; gState.id = pid;
            gState.team = [{ id: pid, isLeader: true, isReady: true, isAI: false }, { id: ai1Name, isLeader: false, isReady: true, isAI: true }, { id: ai2Name, isLeader: false, isReady: true, isAI: true }];
            loadProgress(pid); parkRefundOld(); loadEggs(); friendLoad(); settingsRestoreChoices(); updateTeamListUI(); teamRenderUI(); changelogBadgeSync(); checkinBadgeSync(); nav('screen-lobby'); selectGameMode(gState.gameMode || 'hunt');
            chatLoad();
            // 之前得自己敲房间号、点"进入"才算联机——两台设备各自打开游戏，
            // 谁都没点那一下，大厅里当然看不到对方，跟单机一样。现在默认自动
            // 进一个大家都一样的房间号，不用手动这一步；想私下开小房间的话
            // 还是可以自己在输入框里改成别的号再点"进入"。
            try {
                let r = localStorage.getItem('TH_room') || DEFAULT_ROOM_CODE;
                document.getElementById('net-room').value = r;
                netJoinRoom(r);
            } catch (e) { }
            dataWipeNotice();
            let eb = document.getElementById('btn-egg-book');
            if (eb) eb.innerText = '彩蛋图鉴 ' + eggCount() + ' / ' + Object.keys(EGGS).length;
        }

        function updateTeamListUI() { roomRender(); }

        function requestStartGame() {
            // 大厅现在默认自动进同一个房间，"房间里还有别人"不等于"跟我一队"——
            // 只有真的组了队（lobbyParty 非空）才需要等房主，单纯房间里有陌生人
            // 不该拦你自己开寻宝队。
            if (lobbyParty.length && !peerIsHost) { showSysModal('提示', '等房主开局。', [{ label: '确定' }]); return; }
            huntOptOut = false;
            huntRebuildTeam();
            bc.postMessage({ type: 'START_GARAGE', target: '*', sender: gState.id });
            nav('screen-garage'); initGarage();
        }

        // ── 仓库「返回大厅」（H7）：谁都能点。自己的寻宝队伍恢复成单人（+AI），
        // 用现有的 PLAYER_LEFT 告诉队友；房主把这个人从队伍里拿掉、补 AI，再用 TEAM_SYNC 同步给其他人。
        // 其他人留在仓库不受影响；回了大厅的人不会再被这局的 START_MAP 拉进去，直到房主再开一次仓库。
        let huntOptOut = false;
        function huntSoloTeam() {
            let team = [{ id: gState.id, isLeader: true, isReady: true, isAI: false }];
            if (huntAiOn()) for (let n = 1; team.length < HUNT_TEAM_SIZE; n++) team.push({ id: gState.id + '_AI_' + n, isLeader: false, isReady: true, isAI: true });
            gState.team = team; updateTeamListUI();
        }
        function huntDropFromTeam(id) {
            if (!id || id === gState.id || !gState.team) return;
            if (!gState.team.some(function (m) { return m.id === id && !m.isAI; })) return;
            gState.team = gState.team.filter(function (m) { return m.id !== id; });
            if (lobbyParty.length === 0 || peerIsHost) {
                if (huntAiOn()) {
                    let n = 1;
                    while (gState.team.length < HUNT_TEAM_SIZE) {
                        while (gState.team.some(function (m) { return m.id === gState.id + '_AI_' + n; })) n++;
                        gState.team.push({ id: gState.id + '_AI_' + n, isLeader: false, isReady: true, isAI: true });
                    }
                }
                broadcastTeam();
            } else updateTeamListUI();
        }
        function garageBackToLobby() {
            if (isPlaying) return;
            huntOptOut = true;
            bc.postMessage({ type: 'PLAYER_LEFT', sender: gState.id, target: '*', alive: false });
            huntSoloTeam();
            ['shop-modal', 'book-modal'].forEach(function (id) { let e = document.getElementById(id); if (e) e.classList.add('hidden'); });
            gState.selectedSlot = 0; gState.selectedContainer = 'inv';
            saveProgress();
            nav('screen-lobby');
        }

        function requestEnterMap() {
            if (lobbyParty.length && !peerIsHost) { showSysModal('提示', '等房主开局。', [{ label: '确定' }]); return; }
            mSize = HUNT_SIZE;
            {
                let s = Math.floor(Math.random() * 1000000);
                gState.extractTarget = mapConfigs[gState.mapDifficulty].extr;

                let tempSeed = s;
                let rnd = () => { tempSeed = (tempSeed * 9301 + 49297) % 233280; return tempSeed / 233280; };

                let waves;
                if (gState.mapDifficulty === 'easy') waves = [[1, 2], [1, 2], [1, 2, 1]];
                else if (gState.mapDifficulty === 'med') waves = [[1, 2], [1, 2, 3], [1, 2, 3, 4]];
                else waves = [[1, 2, 5], [1, 2, 5], [1, 1, 2, 2, 5, 5]];

                let spawns = [];
                waves.forEach(function (list, wi) {
                    list.forEach(function (t) {
                        let fx = 3 + Math.floor(rnd() * (mSize - 4));
                        let fz = 3 + Math.floor(rnd() * (mSize - 4));
                        let fl = Math.floor(rnd() * FLOORS);
                        spawns.push({ fx: fx, fz: fz, fl: fl, type: t, wave: wi + 1 });
                    });
                });

                bc.postMessage({ type: 'START_MAP', target: '*', sender: gState.id, seed: s, mapDiff: gState.mapDifficulty, spawns: spawns });
                startGameMap(s, spawns);
            }
        }

        function refreshRankUI() {
            let el = document.getElementById('lobby-rank'); if (!el) return;
            let m = gState.gameMode;
            if (!RANK_MODES[m]) { el.innerText = '这个模式没有排位'; return; }
            el.innerText = '段位：' + rankTierName(m) + '　（分数不公开，只用来定 AI 强度）';
        }

        function renderDailyModBanner() {
            let el = document.getElementById('daily-mod-banner');
            if (!el) return;
            el.innerHTML = '<b>今日效果：' + DAILY_MOD.name + '</b>　' + DAILY_MOD.desc + '（惊魂夜、密室、乐园之外全模式生效，每天换一条）' +
                '<div style="margin-top:4px; color:#e65100;"><b>本周活动：' + MODE_CN[weeklyMode()] + '</b>　猫盾币翻倍</div>';
        }
        function toggleModeDetail() {
            let p = document.getElementById('mode-detail-panel');
            if (p) p.classList.toggle('hidden');
        }
        function selectGameMode(m) {
            gState.gameMode = m;
            refreshRankUI();
            renderDailyModBanner();
            let isHunt = m === 'hunt', isNight = m === 'night', isBlaze = m === 'blaze', isRace = m === 'race', isJail = m === 'jail', isDodge = m === 'dodge', isEscape = m === 'escape', isPark = m === 'park', isCake = m === 'cake';
            ['sumo', 'paint', 'tower'].forEach(function (k) { let e = document.getElementById(k + '-only'); if (e) e.classList.toggle('hidden', m !== k); });
            if (m === 'tower') { let tb = document.getElementById('tower-best'); if (tb) tb.innerText = gState.towerBest ? '你的最好成绩：第 ' + gState.towerBest + ' 块' : ''; }
            document.getElementById('hunt-only').classList.toggle('hidden', !isHunt);
            document.getElementById('night-only').classList.toggle('hidden', !isNight);
            document.getElementById('blaze-only').classList.toggle('hidden', !isBlaze);
            document.getElementById('race-only').classList.toggle('hidden', !isRace);
            document.getElementById('jail-only').classList.toggle('hidden', !isJail);
            document.getElementById('dodge-only').classList.toggle('hidden', !isDodge);
            document.getElementById('escape-only').classList.toggle('hidden', !isEscape);
            if (isEscape) { escRenderLevels(); escDailyInfoRender(); }
            document.getElementById('park-only').classList.toggle('hidden', !isPark);
            document.getElementById('cake-only').classList.toggle('hidden', !isCake);
            // 保底之前完全是黑箱，连续输几把之后悄悄给你保底，玩家自己感觉不到，
            // 只会觉得"这把运气真好"或者怀疑概率是不是假的——露出来一点，让人知道
            // 这不是纯随机，是系统在补偿连续没出货的人。
            let pityHint = document.getElementById('hunt-pity-hint');
            if (pityHint) {
                let showPity = false;
                pityHint.style.display = showPity ? 'block' : 'none';
                if (showPity) pityHint.innerText = '';   // 不告诉玩家有保底
            }
            let modeName = isHunt ? '寻宝队' : (isNight ? '惊魂夜' : isRace ? '竞速' : isJail ? '监狱救援' : isDodge ? '躲避球' : isEscape ? '合作密室' : isPark ? '猫盾乐园' : isCake ? '松饼大作战' : MODE_CN[m] && NM_DEFS[m] ? MODE_CN[m] : '超燃');
            document.getElementById('lobby-title').innerText = modeName;
            let mbc = document.getElementById('mode-bar-current'); if (mbc) mbc.innerText = isEscape ? modeName + ' · 第 ' + (escProg().sel || 1) + ' 关' : modeName;
            if (isNight) selectNightChar(gState.nightChar || 'cat');
            if (isBlaze) blazeRenderChars();
            if (isPark) { let pc = document.getElementById('park-coin-disp'); if (pc) pc.innerText = coinsOf(); }
            if (isRace) raceTestCardBtnSync();
            if (isJail || isDodge || isEscape) applyControlHints();
            let cb = document.getElementById('hunt-ai-fill');
            if (cb) cb.checked = gState.aiFill !== false;
            [['btn-mode-hunt', isHunt, '#5cb85c'],
            ['btn-mode-night', isNight, '#9b59b6'],
            ['btn-mode-blaze', isBlaze, '#ff5722'],
            ['btn-mode-race', isRace, '#00897b'],
            ['btn-mode-jail', isJail, '#4527a0'],
            ['btn-mode-dodge', isDodge, '#e65100'],
            ['btn-mode-escape', isEscape, '#2e7d32'],
            ['btn-mode-park', isPark, '#ad1457'],
            ['btn-mode-cake', isCake, '#f57f17'],
            ['btn-mode-sumo', m === 'sumo', '#e65100'],
            ['btn-mode-paint', m === 'paint', '#0277bd'],
            ['btn-mode-tower', m === 'tower', '#4527a0']].forEach(function (e) {
                let b = document.getElementById(e[0]); if (!b) return;
                b.style.borderColor = e[1] ? e[2] : '#ccc';
                b.style.color = e[1] ? e[2] : '#333';
            });
        }

        function setAiFill(v) { gState.aiFill = !!v; settingsRemember('aiFill', gState.aiFill); }
        function huntAiOn() { return gState.aiFill !== false; }

        const NIGHT_CHARS = {
            cat: {
                side: 'survivor', name: '1号', role: '辅助',
                desc: '被动：<br>受伤的队友脚下撒 3 条小鱼干，吃满回 1 血。<br><br>主动：<br>冷却：40 秒<br>治疗 3.5 身位内一人 1 血。'
            },
            dog: {
                side: 'survivor', name: '2号', role: '救人',
                desc: '被动：<br>救人时双方 +50% 移速，持续 2 秒。<br><br>主动：<br>冷却：充能 2 次，每 20 秒回 1 次<br>抵消 5 身位内一次伤害，之后可砸地眩晕追捕 3 秒。'
            },
            meow: {
                side: 'survivor', name: '3号', role: '救援',
                desc: '被动：<br>被它救起的队友获得 30 秒临时生命值。<br><br>主动：<br>冷却：24 秒<br>冲刺 6 身位，撞追捕眩晕 3 秒，撞队友直接救起。'
            },
            mi: {
                side: 'survivor', name: '4号', role: '挖煤',
                desc: '被动：<br>挖煤速度 +50%。<br><br>主动：<br>冷却：40 秒<br>当前矿机 +（已修好台数 × 20，最少 20）。'
            },
            c1: {
                side: 'survivor', name: '5号', role: '救援',
                desc: '被动：<br>朝追捕方向移动时 +50% 移速。<br><br>主动：<br>冷却：45 秒<br>眩晕 6 身位内的追捕 3 秒，被扛的队友掉下来，自己加速 4 秒。'
            },
            c2: {
                side: 'survivor', name: '6号', role: '辅助',
                desc: '被动：<br>开局暗中指定一名队友，他挖煤 +10%，没人知道是谁。<br><br>主动：<br>冷却：30 秒<br>任选一台有人在挖的矿机 +50% 挖煤，施法定身 1 秒。'
            },
            hunter: {
                side: 'hunter', name: '1号', role: '追击', spd: 1.0,
                desc: '被动：<br>命中后 5 秒内 +15% 移速。<br><br>主动：<br>冷却：24 秒<br>冲刺 10 身位并造成 1 伤害，冲不过放倒的板子。'
            },
            hmi: {
                side: 'hunter', name: '2号', role: '控场', spd: 1.0,
                desc: '被动：<br>选中的矿机标红，只有你看得见。<br><br>主动：<br>冷却：40 秒<br>花 2 秒飞向选中的矿机，途中隐身，落地后 +30% 移速 3 秒。'
            },
            hgou: {
                side: 'hunter', name: '3号', role: '守尸', spd: 1.0,
                desc: '被动：<br>有人被挂在椅子上时 +10% 移速。<br><br>主动：<br>冷却：12.8 秒<br>埋下钉刺，踩中的人 −50% 移速、−30% 交互速度，持续 3 秒。'
            },
            h3: {
                side: 'hunter', name: '4号', role: '追击', spd: 1.0,
                desc: '被动：<br>钩锁结束后 +40% 移速，持续 4 秒。<br><br>主动：<br>冷却：20 秒<br>任意方向射出钩锁，钩住就被拉过去；拉拽中可再按一次借惯性前冲。'
            },
            h4: {
                side: 'hunter', name: '5号', role: '控场', spd: 1.0,
                desc: '被动：<br>封锁点 8 身位内每有一名逃生者，他们挖煤 −12%，最多 −40%。<br><br>主动：<br>冷却：35 秒<br>封住一块立着的板子或一道未开的门 20 秒，放不倒也开不了。'
            },
            hmeow: {
                side: 'hunter', name: '6号', role: '综合', spd: 0.9,
                desc: '被动：<br>击倒逃生者时，投矛剩余冷却 −7 秒。<br><br>主动：<br>冷却：14 秒<br>投出长矛造成 1 伤害，板子挡不住。'
            }
        };

        function selectNightChar(c) { gState.nightChar = c; settingsRemember('nightChar', c); }

        function enterNightMatch(side) {
            nightStartMatch(side);
        }

        let nightMatch = null;
        let matchPool = {};

        function nightMatchCap(side) { return side === 'hunter' ? 1 : 4; }

        function nightMatchCount(side) {
            return Object.keys(matchPool).filter(function (k) { return matchPool[k].side === side; }).length;
        }

        function matchMinLeft() {
            let v = nightMatch ? nightMatch.left : Infinity;
            Object.keys(matchPool).forEach(function (id) {
                if (id === gState.id) return;
                let l = matchPool[id].left;
                if (typeof l === 'number' && l < v) v = l;
            });
            return v;
        }

        function matchLeader() {
            let ids = Object.keys(matchPool);
            if (!ids.length) return gState.id;
            // 跟通用匹配 mmLeader() 一样的道理：别人剩多少时间对我来说只是上一次心跳的
            // 快照（最坏能差到 5 秒），桶跟"多久没消息算掉线"用同一个 5 秒，让大家在
            // "差不多"的情况下都统一交给 ID 字典序兜底，不然两边可能各自以为自己剩得
            // 最少，都抢着广播。
            ids.sort(function (a, b) {
                let la = matchPool[a].left, lb = matchPool[b].left;
                la = (typeof la === 'number') ? Math.round(la / 5) : 99999;
                lb = (typeof lb === 'number') ? Math.round(lb / 5) : 99999;
                if (la !== lb) return la - lb;
                return a < b ? -1 : (a > b ? 1 : 0);
            });
            return ids[0];
        }

        function nightStartMatch(side) {

            if (NIGHT_MATCH_WAIT <= 0) {
                let seed = Math.floor(Math.random() * 1000000);
                let variant = Math.floor(Math.random() * 3);
                netMatchSetup(null, gState.id);
                nightEnterWith(side, seed, variant);
                return;
            }
            nightMatch = { side: side, t0: performance.now(), left: NIGHT_MATCH_WAIT };
            matchPool[gState.id] = { side: side, left: NIGHT_MATCH_WAIT };
            document.getElementById('night-wait').classList.remove('hidden');
            document.getElementById('night-wait-sub').innerText =
                '你选了' + (side === 'hunter' ? '追捕' : '逃生者') + '　等真人进来，等不到就用 AI 补';
            bc.postMessage(roomSelfMsg());

            nightMatch.timer = setInterval(nightMatchTick, 250);
            nightMatchTick();
        }

        function nightMatchTick() {
            if (!nightMatch) return;
            let elapsed = (performance.now() - nightMatch.t0) / 1000;
            nightMatch.left = Math.max(0, NIGHT_MATCH_WAIT - elapsed);
            if (matchPool[gState.id]) matchPool[gState.id].left = nightMatch.left;

            let shown = matchMinLeft();
            document.getElementById('night-wait-count').innerText = mmSuspenseDots();

            let hn = nightMatchCount('hunter'), sn = nightMatchCount('survivor');
            let rows = [];
            Object.keys(matchPool).sort().forEach(function (id) {
                let l = matchPool[id].left;
                rows.push('<div style="color:' + (id === gState.id ? '#7fd1ff' : '#cfe8ff') + ';">' +
                    dispName(id) + '　' + (matchPool[id].side === 'hunter' ? '追捕' : '逃生') +
                    (id === gState.id ? '（你）' : '') +
                    (typeof l === 'number' ? ' <span style="color:#888;">' + Math.ceil(l) + 's</span>' : '') +
                    '</div>');
            });
            if (hn < 1) rows.push('<div style="color:#888;">AI　追捕</div>');
            for (let i = sn; i < 4; i++) rows.push('<div style="color:#888;">AI　逃生</div>');
            document.getElementById('night-wait-list').innerHTML = rows.join('');

            let full = (hn >= 1 && sn >= 4);
            // 跟通用匹配 mmTick() 一样的道理：兜底要看发起人是不是真掉线（心跳 5 秒
            // 没消息才会被清出 matchPool），不能只看自己这边的钟——发起人明明还在，
            // 只是消息还没到，自己这边一到点就抢着广播开局，会跟发起人真正的广播
            // 撞在一起，各开一次局，虽然最后真消息会盖过去，但会白白闪一下、多发
            // 一条错的开局。
            if (matchLeader() === gState.id) {
                if (full || shown <= 0) nightMatchGo();
            }
        }

        function nightBuildSides() {
            let ids = Object.keys(matchPool).sort();
            ids.sort(function (a, b) { return (a === gState.id ? 0 : 1) - (b === gState.id ? 0 : 1); });
            let map = {}, hunterTaken = false, survN = 0;
            ids.forEach(function (id) {
                if (matchPool[id].side === 'hunter') { if (!hunterTaken) { map[id] = 'hunter'; hunterTaken = true; } }
                else if (survN < 4) { map[id] = 'survivor'; survN++; }
            });
            return map;
        }

        function nightMatchGo() {
            if (!nightMatch) return;
            let side = nightMatch.side;
            clearInterval(nightMatch.timer); nightMatch = null;
            document.getElementById('night-wait').classList.add('hidden');
            let seed = Math.floor(Math.random() * 1000000);
            let variant = Math.floor(Math.random() * 3);
            let sides = null;
            if (Object.keys(matchPool).length > 1) {
                sides = nightBuildSides();
                bc.postMessage({
                    type: 'START_NIGHT', target: '*', sender: gState.id, seed: seed, variant: variant,
                    sides: sides, host: gState.id
                });
                if (sides[gState.id]) side = sides[gState.id];
            }
            matchPool = {};
            netMatchSetup(sides, gState.id);
            nightEnterWith(side, seed, variant);
        }

        const NET_SELF_HZ = 15, NET_WORLD_HZ = 10;

        function netMatchSetup(sides, hostId) {
            gState.netRoster = sides || null;
            gState.netHostId = hostId || gState.id;
            gState.netChars = {};
        }
        function netOn() { return !!(gState.netRoster && Object.keys(gState.netRoster).length > 1); }
        function netIsHost() { return !netOn() || gState.netHostId === gState.id; }
        function netIds(side) {
            let r = gState.netRoster || {};
            return Object.keys(r).filter(function (id) { return r[id] === side; }).sort();
        }

        function netOnChar(msg) {
            if (!msg.id || !msg.char) return;
            gState.netChars = gState.netChars || {};
            gState.netChars[msg.id] = msg.char;
            netCharCheck();
        }
        function netCharWait(k) {
            gState.netChars = gState.netChars || {};
            gState.netChars[gState.id] = k;
            bc.postMessage({ type: 'NCHAR', target: '*', id: gState.id, char: k });
            let w = document.getElementById('night-wait');
            document.getElementById('night-wait-sub').innerText = '等其他人选角色';
            document.getElementById('night-wait-count').innerText = '…';
            w.classList.remove('hidden');
            gState.netCharT0 = performance.now();
            if (gState.netCharTimer) clearInterval(gState.netCharTimer);
            gState.netCharTimer = setInterval(netCharCheck, 200);
            netCharCheck();
        }
        function netCharCheck() {
            if (!gState.netCharT0) return;
            let need = Object.keys(gState.netRoster || {});
            let have = need.filter(function (id) { return gState.netChars[id]; });
            document.getElementById('night-wait-list').innerHTML = need.map(function (id) {
                let c = gState.netChars[id];
                return '<div style="color:' + (c ? '#7fd1ff' : '#888') + ';">' + dispName(id) + '　' +
                    (c ? (NIGHT_CHARS[c] ? NIGHT_CHARS[c].name : chatEscape(c)) : '选择中…') + '</div>';
            }).join('');

            let done = (have.length >= need.length) || (performance.now() - gState.netCharT0 > 12000);
            if (!done) return;
            clearInterval(gState.netCharTimer); gState.netCharTimer = null; gState.netCharT0 = 0;
            document.getElementById('night-wait').classList.add('hidden');
            let k = gState.netChars[gState.id] || gState.nightChar;
            gState.nightChar = k;
            startNightGameSafe(NIGHT_CHARS[k].side, k);
        }

        function netSurvKeys(playerSide) {
            let real = netIds('survivor');
            let keys = [];
            if (playerSide === 'survivor') keys.push(gState.id || 'me');
            real.forEach(function (id) { if (id !== gState.id) keys.push(id); });
            let n = 1;
            while (keys.length < 4) keys.push('ai' + (n++));
            return keys.slice(0, 4);
        }
        function netActorByKey(k) {
            if (!night) return null;
            if (night.hunter && night.hunter.key === k) return night.hunter;
            return night.survivors.find(function (a) { return a.key === k; }) || null;
        }

        function netSendSelf() {
            if (!night || night.over || !netOn()) return;
            let me = night.side === 'hunter' ? night.hunter : night.survivors[0];
            if (!me) return;
            let d = new THREE.Vector3(); camera.getWorldDirection(d);
            bc.postMessage({
                type: 'NS_ME', target: '*', key: me.key, side: night.side,
                x: +me.p.x.toFixed(1), z: +me.p.z.toFixed(1), gy: +(me.gy || 0).toFixed(1),
                fa: +Math.atan2(d.z, d.x).toFixed(2),
                hp: me.hp, dn: !!me.downed, ch: !!me.onChair, es: !!me.escaped, ot: !!me.out,
                hpg: +(me.healProg || 0).toFixed(2),
                rep: night.repairing ? gState.machines.indexOf(night.repairing) : -1
            });
        }
        function netOnSelfState(m) {
            if (!night || night.over || !netOn() || m.key === undefined) return;
            let a = netActorByKey(m.key);
            if (!a || a.isPlayer) return;
            a.lastSeen = performance.now();
            // 之前因为掉线（切后台、网卡了）被 AI 接管的人又发消息了：控制权还给他。
            // 每台机器都收得到这条 NS_ME，各自还原，不用额外广播。主动离开的人不会再发，也不接受还原。
            if (a.aiTakeover && !a.leftForGood) {
                a.remote = true; a.aiTakeover = null;
                if (gState.netRoster && m.side) gState.netRoster[m.key] = m.side;
                nightFlash(dispNameText(m.key) + ' 回来了');
            }
            if (!a.remote) return;
            a.netTo = { x: m.x, z: m.z, gy: m.gy };
            a.faceA = m.fa;
            a.hp = m.hp; a.downed = m.dn; a.onChair = m.ch; a.escaped = m.es; a.out = m.ot;
            a.healProg = m.hpg;
            a.netRep = (m.rep === undefined) ? -1 : m.rep;
            if (a.mesh) a.mesh.visible = !(a.out || a.escaped);
        }

        function netRemoteRepairTick(dt) {
            if (!netOn() || !netIsHost() || !night) return;
            night.survivors.forEach(function (a) {
                if (!a.remote || a.netRep === undefined || a.netRep < 0) return;
                if (a.out || a.escaped || a.downed || a.onChair) return;
                let m = gState.machines[a.netRep];
                if (!m || m.done) return;
                let mult = a.charKey === 'mi' ? SKILL.miRepairMult : 1;
                if (m.c2Boost) mult *= SKILL.c2BoostMul;
                m.progress = Math.min(100, m.progress + nightBaseRate() * mult * dt * NIGHT.gamePerReal);
                nightCheckMachine(m);
            });
        }

        function netSendWorld() {
            if (!night || night.over || !netOn() || !netIsHost()) return;
            let acts = [];
            night.survivors.forEach(function (a) {
                if (a.isPlayer || a.remote) return;
                acts.push({
                    k: a.key, x: +a.p.x.toFixed(1), z: +a.p.z.toFixed(1), gy: +(a.gy || 0).toFixed(1),
                    fa: +(a.faceA || 0).toFixed(2), hp: a.hp, dn: !!a.downed, ch: !!a.onChair,
                    es: !!a.escaped, ot: !!a.out, hpg: +(a.healProg || 0).toFixed(2)
                });
            });
            let h = night.hunter, hd = null;
            if (h && !h.isPlayer && !h.remote) {
                hd = {
                    x: +h.p.x.toFixed(1), z: +h.p.z.toFixed(1), gy: +(h.gy || 0).toFixed(1),
                    fa: +(h.faceA || 0).toFixed(2), c: h.carrying ? h.carrying.key : null
                };
            }
            bc.postMessage({
                type: 'NS_W', target: '*', sender: gState.id, a: acts, h: hd, t: +night.t.toFixed(1), done: night.done,
                m: gState.machines.map(function (o) { return +o.progress.toFixed(1); }),
                p: gState.pallets.map(function (o) { return o.state === 'up' ? 0 : (o.state === 'down' ? 1 : 2); }),
                d: gState.doors.map(function (o) { return o.open ? -1 : +o.openProgress.toFixed(1); })
            });
        }
        function netOnWorld(m) {
            if (!night || night.over || !netOn()) return;
            if (m.sender && !(gState.netRoster || {})[m.sender]) return;   // 已经离开的原房主路上还没到的旧包
            if (m.sender && m.sender !== gState.netHostId) {
                // 别人已经接手当房主了（原房主离开/掉线）。两边都以为自己是房主的时候按 ID 定一个，
                // 另一边收到对方的 NS_W 会照同样的规则让位，不会僵持。
                if (netIsHost() && gState.id < m.sender) return;
                gState.netHostId = m.sender;
            }
            if (netIsHost()) return;
            night.lastWorldAt = performance.now();
            (m.a || []).forEach(function (o) {
                let a = netActorByKey(o.k);
                if (!a || a.isPlayer) return;
                a.netTo = { x: o.x, z: o.z, gy: o.gy };
                a.faceA = o.fa; a.hp = o.hp; a.downed = o.dn; a.onChair = o.ch;
                a.escaped = o.es; a.out = o.ot; a.healProg = o.hpg;
                if (a.mesh) a.mesh.visible = !(a.out || a.escaped);
            });
            let h = night.hunter;
            if (m.h && h && !h.isPlayer) {
                h.netTo = { x: m.h.x, z: m.h.z, gy: m.h.gy };
                h.faceA = m.h.fa;
                h.carrying = m.h.c ? netActorByKey(m.h.c) : null;
            }
            night.t = m.t; night.done = m.done;
            (m.m || []).forEach(function (v, i) {
                let o = gState.machines[i];
                if (o) { o.progress = v; if (v >= 100 && !o.done) nightCheckMachine(o); }
            });
            (m.p || []).forEach(function (v, i) {
                let o = gState.pallets[i]; if (!o) return;
                if (v === 1 && o.state === 'up') nightDropPallet(o);
                else if (v === 2 && o.state !== 'broken') nightBreakPallet(o);
            });
            (m.d || []).forEach(function (v, i) {
                let o = gState.doors[i]; if (!o) return;
                if (v < 0) { if (!o.open) nightOpenDoor(o); }
                else o.openProgress = v;
            });
        }

        function netEvent(what, extra) {
            if (!netOn()) return;
            let m = { type: 'NEV', target: '*', ev: what };
            if (extra) Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
            bc.postMessage(m);
        }
        function netOnEvent(m) {
            if (!night || night.over || !netOn()) return;
            if (m.ev === 'handover') { nightNetHandover(m.key, m.gone, m.host, m.left); return; }
            let a = m.key !== undefined ? netActorByKey(m.key) : null;
            if (m.ev === 'dmg') { if (a) nightDamage(a, true); }
            else if (m.ev === 'carry') { if (a) { night.hunter.carrying = a; a.struggle = 0; } }
            else if (m.ev === 'chair') { if (a) nightPutOnChair(a, true); }
            else if (m.ev === 'rescue') { if (a) nightRescue(a); }
            else if (m.ev === 'pallet') {
                let o = gState.pallets[m.i];
                if (o && m.st === 1 && o.state === 'up') nightDropPallet(o, true);
                else if (o && m.st === 2 && o.state !== 'broken') nightBreakPallet(o);
            }
            else if (m.ev === 'stun') { nightStunHunter(m.sec, null, true); }
            else if (m.ev === 'end') { endNightGame(m.text, true); }
        }

        function netLerpRemotes(dt) {
            if (!netOn() || !night) return;
            let k = Math.min(1, dt * 12);
            let step = function (a) {
                if (!a || !a.netTo || a.isPlayer) return;
                a.p.x += (a.netTo.x - a.p.x) * k;
                a.p.z += (a.netTo.z - a.p.z) * k;
                a.gy = (a.gy || 0) + (a.netTo.gy - (a.gy || 0)) * k;
                a.p.y = EYE_H + a.gy;
                if (a.mesh && a.faceA !== undefined) a.mesh.rotation.y = -a.faceA + Math.PI / 2;
                nightSyncMesh(a);
            };
            night.survivors.forEach(step);
            step(night.hunter);
        }

        // 联机惊魂夜的"交接"：有人离开或掉线，他的角色交给 AI；走的/掉的是房主，就换一个人当房主。
        // 房主这个身份本来就只管三件事——跑 AI、广播世界状态、判结束，都是看 netIsHost()，
        // 换了 netHostId 新房主下一帧就接着跑，AI 从已经同步好的位置继续走。
        const NET_DROP_MS = 6000;
        function nightNetHandover(key, gone, host, left) {
            if (!night) return;
            let a = key ? netActorByKey(key) : null;
            if (a && !a.isPlayer && a.remote) {
                a.remote = false; a.aiTakeover = gone || key; a.netRep = -1;
                if (left) a.leftForGood = true;
                if (!a.out && !a.escaped) nightFlash(dispNameText(gone || key) + (left ? ' 离开了' : ' 掉线了') + '，AI 接管');
            }
            // 主动离开的从名单里拿掉（掉线的留着，回来了还能接回控制权）；
            // 只剩自己一个真人的话 netOn() 变 false，这局就按单机继续打完。
            if (left && gone && gState.netRoster) delete gState.netRoster[gone];
            if (host) gState.netHostId = host;
            night.lastWorldAt = performance.now();
        }

        // 自己主动离开联机局（活着中途走、或者观战时点离开）：不结束别人的局，只交接后自己回大厅。
        function nightNetLeave(text) {
            if (!night || night.over) return;
            let me = night.side === 'hunter' ? night.hunter : night.survivors[0];
            let others = Object.keys(gState.netRoster || {}).filter(function (id) { return id !== gState.id; }).sort();
            let host = netIsHost() ? (others[0] || null) : gState.netHostId;
            netEvent('handover', { key: me ? me.key : gState.id, gone: gState.id, host: host, left: true });
            if (others.length) {
                let leftSec = Math.max(0, (NIGHT.limit - night.t) / NIGHT.gamePerReal);
                nightAway = { until: performance.now() + (leftSec + 30) * 1000 };
            }
            endNightGame(text, true);
        }

        function netTick(dt) {
            if (!netOn() || !night || night.over) return;
            let now = performance.now();
            // 自己这台刚从"睡着"里醒来（切后台 rAF 停了）：这段时间别人多半已经接手当房主了，
            // 先让出来，等收到新房主的 NS_W 认主；没人接手的话下面的超时逻辑会再选回来。
            if (night.netRawLast && now - night.netRawLast > NET_DROP_MS && netIsHost()) {
                let others = Object.keys(gState.netRoster || {}).filter(function (id) { return id !== gState.id; }).sort();
                if (others.length) gState.netHostId = others[0];
            }
            night.netRawLast = now;
            if (!night.lastWorldAt) night.lastWorldAt = now;
            if (netIsHost()) {
                [night.hunter].concat(night.survivors).forEach(function (a) {
                    if (!a || !a.remote) return;
                    if (a.lastSeen === undefined) { a.lastSeen = now; return; }
                    if (now - a.lastSeen > NET_DROP_MS) {
                        netEvent('handover', { key: a.key, gone: a.key });
                        nightNetHandover(a.key, a.key, null, false);
                    }
                });
            } else if (now - night.lastWorldAt > NET_DROP_MS) {
                // 房主那边没动静了：剩下的人按 ID 排序选第一个当新房主，每台机器算出来都一样，不用商量
                let old = gState.netHostId;
                let cand = Object.keys(gState.netRoster || {}).filter(function (id) { return id !== old; }).sort();
                if (cand.length) nightNetHandover(old, old, cand[0], false);
            }
            night.netSelfT = (night.netSelfT || 0) + dt;
            if (night.netSelfT >= 1 / NET_SELF_HZ) { night.netSelfT = 0; netSendSelf(); }
            night.netWorldT = (night.netWorldT || 0) + dt;
            if (night.netWorldT >= 1 / NET_WORLD_HZ) { night.netWorldT = 0; netSendWorld(); }
        }

        function nightCancelMatch() {
            if (nightMatch) {
                clearInterval(nightMatch.timer); nightMatch = null;
                bc.postMessage(roomSelfMsg());
            }
            delete matchPool[gState.id];
            document.getElementById('night-wait').classList.add('hidden');
        }

        function startNightFromNet(seed, variant, side) {
            nightEnterWith(side === 'hunter' ? 'hunter' : 'survivor', seed, variant);
        }

        function nightEnterWith(side, seed, variant) {
            gState.nightSide = (side === 'hunter') ? 'hunter' : 'survivor';
            ensureScene();
            nav('none');
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('night-hud').classList.add('hidden');
            nightDisposeActors();
            night = null;
            gState.nightVariant = variant;
            gState.nightSeed = seed;
            gameSeed = seed;
            buildNightMap();
            nightMapReady = true;
            let mid = (mSize - 1) / 2 * TILE;
            camera.position.set(mid, 300, mid + 1); camera.lookAt(mid, 0, mid);
            renderer.render(scene, camera);

            let isHunter = gState.nightSide === 'hunter';
            let accent = isHunter ? '#d9534f' : '#9b59b6';
            document.getElementById('night-pick-title').innerHTML =
                '选择角色 <span style="color:' + accent + ';">· ' + (isHunter ? '追捕' : '逃生者') + '</span>';
            nightPickAccent = accent;
            nightPickSel = null;
            let grid = document.getElementById('night-pick-grid'); grid.innerHTML = '';
            (isHunter ? ['hunter', 'hmi', 'hgou', 'hmeow', 'h3', 'h4'] : ['cat', 'dog', 'meow', 'mi', 'c1', 'c2']).forEach(function (k) {
                let ch = NIGHT_CHARS[k];
                let card = document.createElement('div');
                card.dataset.k = k;
                card.style.cssText = 'background:#fff; border-radius:6px; padding:9px 4px; cursor:pointer; text-align:center; border:2px solid transparent;';

                card.onclick = function () {
                    if (nightPickSel === k) { nightPickChar(k); return; }
                    nightPickSel = k; nightPickRender();
                };
                card.innerHTML = '<div style="font-size:15px; font-weight:bold; color:#333;">' + ch.name + '</div>' +
                    '<div style="font-size:11px; color:' + accent + '; margin-top:2px;">' + ch.role + '</div>';
                grid.appendChild(card);
            });
            nightPickRender();
            document.getElementById('night-pick-back').style.display = netOn() ? 'none' : '';
            document.getElementById('night-pick').classList.remove('hidden');
        }

        let nightPickSel = null, nightPickAccent = '#9b59b6';

        function nightPickRender() {
            let accent = nightPickAccent;
            let grid = document.getElementById('night-pick-grid');
            [].forEach.call(grid.children, function (c) {
                let on = c.dataset.k === nightPickSel;
                c.style.borderColor = on ? accent : 'transparent';
                c.style.background = on ? '#fff' : '#e9e9ec';
            });

            let box = document.getElementById('night-pick-detail');
            if (!nightPickSel) {
                box.innerHTML = '<div style="color:#999; font-size:13px;">左边选一个角色</div>';
            } else {
                let ch = NIGHT_CHARS[nightPickSel];
                box.innerHTML =
                    '<div style="font-size:20px; font-weight:bold; color:#333;">' + ch.name +
                    '<span style="font-size:12px; color:' + accent + ';"> · ' + ch.role + '</span></div>' +
                    '<div style="font-size:12px; color:#555; line-height:1.9; margin:12px 0 16px;">' + ch.desc + '</div>' +
                    '<button onclick="nightPickChar(nightPickSel)" style="width:100%; margin:0; background:' + accent +
                    '; color:#fff; border:none; padding:9px; font-size:15px; cursor:pointer;">用它开局</button>';
            }

            let team = document.getElementById('night-pick-team');
            let rows = ['<div style="color:#7fd1ff;">' + dispName(gState.id) + '（你）<br><span style="color:#fff;">' +
                (nightPickSel ? NIGHT_CHARS[nightPickSel].name : '未选') + '</span></div>'];
            let others = roomList.filter(function (r) { return r.id !== gState.id; });
            if (others.length) {
                others.forEach(function (r) { rows.push('<div>' + dispName(r.id) + '<br><span style="color:#999;">真人</span></div>'); });
            }
            let aiSlots = (gState.nightSide === 'hunter') ? 0 : 3;   // 追捕者是一个人，没有队友（B2，重做夜间 PR #16）
            for (let i = others.length; i < aiSlots; i++) rows.push('<div style="color:#888;">AI 队友</div>');
            team.innerHTML = rows.join('');
        }

        // 选角色这一页原来没有任何退路——点了惊魂夜、匹配完就只能硬选一个开局。
        // 单机的时候给个返回；联机大家已经一起进了同一张图，半路退掉别人会卡在等你选角色，不给。
        function nightPickBack() {
            if (netOn()) return;
            document.getElementById('night-pick').classList.add('hidden');
            nightMapReady = false;
            nav('screen-lobby'); selectGameMode('night');
        }

        function nightPickChar(k) {
            document.getElementById('night-pick').classList.add('hidden');
            gState.nightChar = k; settingsRemember('nightChar', k);

            if (netOn()) { netCharWait(k); return; }
            startNightGameSafe(NIGHT_CHARS[k].side, k);
        }

        const CALIB = {
            interval: 10, sweep: 2.0, stun: 2.0, buffAt: 240,
            zones: [
                [0.00, 0.25, 'gray'], [0.25, 0.45, 'white'], [0.45, 0.55, 'red'],
                [0.55, 0.75, 'white'], [0.75, 1.00, 'gray']
            ]
        };
        let calib = null;

        function calibZoneAt(p) {
            for (let z of CALIB.zones) if (p >= z[0] && p < z[1]) return z[2];
            return 'gray';
        }

        function calibGain(zone, elapsed) {
            let buffed = elapsed >= CALIB.buffAt;
            if (zone === 'red') return buffed ? 5.5 : 4.5;
            if (zone === 'white') return buffed ? 4.5 : 3.5;
            return -5;
        }

        function openCalibPractice() {
            nav('screen-calib');
            // 平板没有空格，点屏幕就是校准（按钮上的点击归按钮自己）
            let sc = document.getElementById('screen-calib');
            if (sc && !sc.dataset.tapBound) {
                sc.dataset.tapBound = '1';
                let tap = function (e) {
                    if (e.target && e.target.closest && e.target.closest('button')) return;
                    e.preventDefault(); calibPress();
                };
                sc.addEventListener('touchstart', tap, { passive: false });
                sc.addEventListener('mousedown', function (e) { if (padOn()) tap(e); });
            }
            calib = { progress: 0, elapsed: 0, nextAt: CALIB.interval, marker: null, stunTimer: 0, last: performance.now(), raf: null, hits: { red: 0, white: 0, miss: 0 } };
            calibLoop();
        }

        function closeCalibPractice() {
            if (calib && calib.raf) cancelAnimationFrame(calib.raf);
            calib = null; nav('screen-lobby');
        }

        function calibPress() {
            if (!calib || calib.stunTimer > 0) return;
            if (!calib.marker) return;
            let zone = calibZoneAt(calib.marker.pos);
            calib.marker = null;
            applyCalibResult(zone);
        }

        function applyCalibResult(zone) {
            let gain = calibGain(zone, calib.elapsed);
            calib.progress = Math.max(0, Math.min(100, calib.progress + gain));
            let el = document.getElementById('calib-status');
            if (zone === 'red') { calib.hits.red++; el.style.color = '#e91e8c'; el.innerText = `红区！+${gain}`; }
            else if (zone === 'white') { calib.hits.white++; el.style.color = '#5cb85c'; el.innerText = `白区 +${gain}`; }
            else { calib.hits.miss++; calib.stunTimer = CALIB.stun; el.style.color = '#d9534f'; el.innerText = `校准失败 ${gain}，眩晕 2 秒`; }
        }

        function calibLoop() {
            if (!calib) return;
            calib.raf = requestAnimationFrame(calibLoop);
            let now = performance.now(); let dt = Math.min(0.05, (now - calib.last) / 1000); calib.last = now;
            calib.elapsed += dt;
            if (calib.stunTimer > 0) calib.stunTimer = Math.max(0, calib.stunTimer - dt);

            if (!calib.marker && calib.stunTimer <= 0 && calib.elapsed >= calib.nextAt) {
                calib.marker = { pos: 0 }; calib.nextAt = calib.elapsed + CALIB.interval;
            }
            if (calib.marker) {
                calib.marker.pos += dt / CALIB.sweep;
                if (calib.marker.pos >= 1) { calib.marker = null; applyCalibResult('gray'); }
            }
            drawCalib();
            let p = calib.progress;
            document.getElementById('calib-progress').innerText = p.toFixed(1);
            document.getElementById('calib-progress-fill').style.width = p + '%';
            let buffed = calib.elapsed >= CALIB.buffAt;
            document.getElementById('calib-stats').innerHTML =
                `已进行 ${Math.floor(calib.elapsed / 60)}:${String(Math.floor(calib.elapsed % 60)).padStart(2, '0')}` +
                `　当前档位: ${buffed ? '红 +5.5 / 白 +4.5（4 分钟后）' : '红 +4.5 / 白 +3.5'}<br>` +
                `红区 ${calib.hits.red} 次　白区 ${calib.hits.white} 次　失败 ${calib.hits.miss} 次` +
                (calib.stunTimer > 0 ? `<br><span style="color:#d9534f;">眩晕中 ${calib.stunTimer.toFixed(1)}s</span>` : '');
        }

        function drawCalib() {
            let c = document.getElementById('calib-canvas'); if (!c) return;
            let ctx = c.getContext('2d'), W = c.width, H = c.height;
            ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
            CALIB.zones.forEach(function (z) {
                let y0 = H - z[1] * H, y1 = H - z[0] * H;
                ctx.fillStyle = z[2] === 'red' ? '#e91e8c' : (z[2] === 'gray' ? '#b0b0b0' : '#ffffff');
                ctx.fillRect(0, y0, W, y1 - y0);
                ctx.strokeStyle = '#ccc'; ctx.strokeRect(0, y0, W, y1 - y0);
            });
            if (calib && calib.marker) {
                let y = H - calib.marker.pos * H;
                ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(W - 4, y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(W / 2, y); ctx.lineTo(W / 2, y + 14); ctx.stroke();
                ctx.lineWidth = 1;
            }
        }

        function selectChar(c) {
            gState.char = c;
            document.getElementById('btn-green').style.borderColor = c === 'green' ? '#5cb85c' : '#ccc'; document.getElementById('btn-green').style.color = c === 'green' ? '#5cb85c' : '#333';
            document.getElementById('btn-yellow').style.borderColor = c === 'yellow' ? '#f0ad4e' : '#ccc'; document.getElementById('btn-yellow').style.color = c === 'yellow' ? '#f0ad4e' : '#333';
        }

        const INV_BASE = 6, POUCH_SLOTS = 3;

        // ── 腰包（H14）：背包固定 6 格；每个腰包自带 3 格，东西存在腰包这件物品身上（it.bag），
        // 跟着腰包走——放仓库、扔地上、捡回来都还在。腰包不能放进腰包。重量算上里面的东西。
        function isPouch(it) { return !!(it && it.type === 'backpack_ext'); }
        function pouchBag(it) {
            if (!isPouch(it)) return null;
            if (!Array.isArray(it.bag)) it.bag = [];
            while (it.bag.length < POUCH_SLOTS) it.bag.push(null);
            return it.bag;
        }
        function pouchCount(it) { let b = pouchBag(it); return b ? b.filter(function (q) { return q; }).length : 0; }
        function itemWeight(it) {
            if (!it) return 0;
            let w = it.w || 0;
            if (isPouch(it)) pouchBag(it).forEach(function (q) { w += itemWeight(q); });
            return w;
        }
        function invWeight() { return gState.inv.reduce(function (s, i) { return s + itemWeight(i); }, 0); }
        // 身上所有的格子（背包 6 格 + 背包里每个腰包的 3 格），返回 [数组, 下标]
        function carriedSlots() {
            let out = [];
            for (let i = 0; i < INV_BASE; i++) out.push([gState.inv, i]);
            gState.inv.forEach(function (it) { if (isPouch(it)) pouchBag(it).forEach(function (q, k) { out.push([it.bag, k]); }); });
            return out;
        }
        // 身上找个空格放 it：先背包，再背包里的腰包（腰包本身不能进腰包）
        function carryFreeSlot(it) {
            let L = carriedSlots();
            for (let k = 0; k < L.length; k++) {
                if (L[k][0][L[k][1]]) continue;
                if (L[k][0] !== gState.inv && isPouch(it)) continue;
                return L[k];
            }
            return null;
        }

        // 名字是老的（到处在调），现在只做两件事：背包固定 6 格、每个腰包都有 3 格；
        // 老存档里腰包撑出来的第 7~9 格的东西，挪进腰包（放不下就放背包空格或仓库）。
        function expandInventory() {
            let extra = gState.inv.length > INV_BASE ? gState.inv.slice(INV_BASE).filter(function (q) { return q; }) : [];
            if (gState.inv.length > INV_BASE) gState.inv.length = INV_BASE;
            while (gState.inv.length < INV_BASE) gState.inv.push(null);
            gState.inv.forEach(pouchBag);
            (gState.garage || []).forEach(pouchBag);
            extra.forEach(function (it) {
                // 先放进背包里的腰包（原来就是腰包撑出来的格子），再背包空格，再仓库
                let slot = null;
                if (!isPouch(it)) gState.inv.some(function (p) { let b = pouchBag(p); let k = b ? b.indexOf(null) : -1; if (k >= 0) { slot = [b, k]; return true; } return false; });
                if (!slot) slot = carryFreeSlot(it);
                if (slot) { slot[0][slot[1]] = it; return; }
                let g = gState.garage.findIndex(function (q) { return q === null; });
                if (g !== -1) gState.garage[g] = it;
            });
            gState.maxInv = INV_BASE;
        }

        // ── 宝物不能带上场 ──
        // 只有商店买的家伙事（鱼叉、医疗包、腰包、徽章……）能跟着进图，
        // 捡来的宝物一律留在仓库。不然可以把上一局的战利品带进去直接凑够上交额度。
        // 找到的功能道具（信号器、时空沙漏、圣剑这些）本身也是宝物，同样留下。
        function isCarryOn(it) { return !!(it && it.isShop); }

        // 旧存档兵库：背包（和背包里的腰包）里本来就不该有宝物（UI 已经不让放了），
        // 但以前存的档可能带着。开局静静挪回仓库，仓库满了就留着 ——
        // 宁可放它过去，也绝不把玩家的东西弄丢。
        function stashLootBeforeRun() {
            expandInventory();
            let moved = [], stuck = 0;
            carriedSlots().forEach(function (sl) {
                let it = sl[0][sl[1]];
                if (!it || isCarryOn(it)) return;
                let g = gState.garage.findIndex(function (q) { return q === null; });
                if (g === -1) { stuck++; return; }
                gState.garage[g] = it; sl[0][sl[1]] = null; moved.push(it.n);
            });
            if (moved.length) { tidyInv(); saveProgress(); }
            return { moved: moved, stuck: stuck };
        }

        // 自动整理：背包里把空位挤掉，东西往前排。不把东西移进或移出腰包。
        function tidyInv() {
            expandInventory();
            let items = gState.inv.filter(function (i) { return i; });
            for (let i = 0; i < INV_BASE; i++) gState.inv[i] = items[i] || null;
        }

        function tidyGarage() {
            let items = gState.garage.filter(function (i) { return i; });
            for (let i = 0; i < gState.garage.length; i++) gState.garage[i] = items[i] || null;
        }

        function tidyAll() { tidyInv(); tidyGarage(); if (!isPlaying) initGarage(); else updateHUD(); saveProgress(); }

        let isDragging = false; let dragSourceObj = null; let dragGhost = null;
        // 按下以后移动不到 6 像素就松手，算点一下（选中这格），不算拖（H3）。
        // 以前一按下就开始拖，松手时 endDrag 重画了所有格子，click 就丢了，鼠标怎么点都选不中。
        let slotPress = null, slotTapAt = 0;
        const SLOT_DRAG_PX = 6;
        // 当前展开的腰包（同一时间只展开一个）。它的 3 格在界面上的容器名是 'bag'
        let openPouch = null;
        function slotArr(c) { return c === 'inv' ? gState.inv : c === 'garage' ? gState.garage : c === 'bag' ? pouchBag(openPouch) : null; }
        // 点了一个格子：点腰包就展开/收起它，点别的格子收起
        function pouchToggleFor(item) { openPouch = (isPouch(item) && openPouch !== item) ? item : null; }

        // U1：仓库里用手指（触屏）时，上下滑是滚动列表；按住约 0.3 秒不动才开始拖，拖起来格子放大发亮；
        // 点一下还是选中。鼠标、局内（背包/快捷栏扔东西）都跟原来一样。
        const SLOT_HOLD_MS = 300, SLOT_SCROLL_PX = 10;
        function setupSlotDrag(el, container, idx) {
            el.setAttribute('data-container', container); el.setAttribute('data-idx', idx);
            el.addEventListener('pointerdown', function (e) {
                let arr = slotArr(container), item = arr && arr[idx]; if (!item) return;
                slotPress = { el: el, container: container, idx: idx, x: e.clientX, y: e.clientY };
                if (e.pointerType === 'touch' && !isPlaying) {
                    let p = slotPress; p.hold = true;
                    p.timer = setTimeout(function () {
                        if (slotPress !== p) return;
                        el.classList.add('lifting');
                        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (er) { } }
                        slotBeginDrag(e);
                        if (dragGhost) { dragGhost.style.left = p.x - 30 + 'px'; dragGhost.style.top = p.y - 30 + 'px'; }
                    }, SLOT_HOLD_MS);
                    return;   // 不 preventDefault：让浏览器能滚动列表
                }
                e.preventDefault();
            });
            // 点一下已经在 pointerup 里处理了，浏览器随后补发的 click 不再处理第二遍
            el.addEventListener('click', function (e) { if (performance.now() - slotTapAt < 500) { e.stopImmediatePropagation(); e.preventDefault(); } });
        }
        function slotBeginDrag(e) {
            let p = slotPress; slotPress = null;
            isDragging = true; dragSourceObj = { container: p.container, idx: p.idx };
            dragGhost = document.createElement('div'); dragGhost.className = 'slot'; dragGhost.style.position = 'fixed'; dragGhost.style.pointerEvents = 'none'; dragGhost.style.zIndex = '1000'; dragGhost.style.opacity = '0.8';
            dragGhost.innerHTML = p.el.innerHTML; document.body.appendChild(dragGhost);
            p.el.style.opacity = '0.3';
        }
        function slotPressCancel() { if (slotPress && slotPress.timer) clearTimeout(slotPress.timer); slotPress = null; }
        function moveGhost(e) {
            // 拖着的时候手指移动不让列表跟着滚
            if (isDragging && e.type === 'touchmove' && e.cancelable) e.preventDefault();
            if (slotPress) {
                let x = e.clientX || (e.touches && e.touches[0].clientX) || 0, y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
                let far = Math.hypot(x - slotPress.x, y - slotPress.y);
                if (slotPress.hold) { if (far >= SLOT_SCROLL_PX) slotPressCancel(); }   // 还没按够就动了：是在滑列表
                else if (far >= SLOT_DRAG_PX) slotBeginDrag(e);
            }
            if (!isDragging || !dragGhost) return;
            dragGhost.style.left = (e.clientX || (e.touches && e.touches[0].clientX)) - 30 + 'px';
            dragGhost.style.top = (e.clientY || (e.touches && e.touches[0].clientY)) - 30 + 'px';
        }
        window.addEventListener('pointermove', moveGhost); window.addEventListener('touchmove', moveGhost, { passive: false });
        // 点格子以外的地方，展开的腰包收起来
        ['screen-garage', 'backpack-overlay-page'].forEach(function (id) {
            let el = document.getElementById(id); if (!el) return;
            el.addEventListener('click', function (e) {
                if (!openPouch || e.target.closest('.slot')) return;
                openPouch = null; if (isPlaying) updateHUD(); else initGarage();
            });
        });
        window.addEventListener('pointerup', endDrag); window.addEventListener('touchend', endDrag);
        // 浏览器接手去滚动列表了：这次按下作废（已经在拖了就不管，拖的时候不让滚）
        window.addEventListener('pointercancel', function () { if (slotPress && slotPress.hold) slotPressCancel(); });

        // 拖一件东西过去行不行；不行就返回原因（H2、H14）。空格当然可以放。
        // 腰包不能放进腰包（局里局外都管）。
        // 宝物放不进背包和腰包（只在仓库里管；进图之后捡到的照常放）：拖进去不行，把工具换出来、宝物换进去也不行。
        function garageDropProblem(srcC, srcI, dstC, dstI) {
            let srcArr = slotArr(srcC), dstArr = slotArr(dstC);
            if (!srcArr || !dstArr) return '这里放不了。';
            let a = srcArr[srcI], b = dstArr[dstI];
            if (srcArr === dstArr && srcI === dstI) return '';
            if ((dstC === 'bag' && isPouch(a)) || (srcC === 'bag' && isPouch(b))) return '腰包不能放进腰包。';
            if (isPlaying) return '';
            let carry = function (c) { return c === 'inv' || c === 'bag'; };
            if ((carry(dstC) && a && !isCarryOn(a)) || (carry(srcC) && b && !isCarryOn(b))) return '宝物不能带上场，只有商店买的道具能放进背包和腰包。';
            return '';
        }

        function endDrag(e) {
            if (slotPress) {
                let p = slotPress; slotPressCancel(); slotTapAt = performance.now();
                if (p.el.onclick) p.el.onclick();
                return;
            }
            if (!isDragging) return; isDragging = false; if (dragGhost) { dragGhost.remove(); dragGhost = null; }

            let clientX = e.clientX; let clientY = e.clientY;
            if (e.changedTouches && e.changedTouches.length > 0) { clientX = e.changedTouches[0].clientX; clientY = e.changedTouches[0].clientY; }
            let targetEl = document.elementFromPoint(clientX, clientY); let targetSlot = targetEl ? targetEl.closest('.slot') : null;

            if (targetSlot && targetSlot.hasAttribute('data-idx')) {
                let destContainer = targetSlot.getAttribute('data-container'); let destIdx = parseInt(targetSlot.getAttribute('data-idx'));
                let srcArr = slotArr(dragSourceObj.container), destArr = slotArr(destContainer);
                let temp = srcArr ? srcArr[dragSourceObj.idx] : null;
                let why = garageDropProblem(dragSourceObj.container, dragSourceObj.idx, destContainer, destIdx);
                if (why) showSysModal('放不了', why, [{ label: '知道了' }]);
                else { srcArr[dragSourceObj.idx] = destArr[destIdx]; destArr[destIdx] = temp; }
            } else {
                if (isPlaying && !gState.isDead && dragSourceObj.container === 'inv') {
                    let hudBox = document.getElementById('hud-hotbar-container'); let bpBox = document.getElementById('backpack-grid-box');
                    let inBox = function (box) { if (!box || box.offsetParent === null) return false; let rect = box.getBoundingClientRect(); return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom; };
                    if (!inBox(hudBox) && !inBox(bpBox)) { executeThrow(dragSourceObj.idx); }
                }
            }
            let allSlots = document.querySelectorAll('.slot'); allSlots.forEach(s => { s.style.opacity = '1'; s.classList.remove('lifting'); });
            if (isPlaying) updateHUD(); else initGarage();
        }

        function bookOpen() { document.getElementById('book-modal').classList.remove('hidden'); bookRender(); }
        function bookClose() { document.getElementById('book-modal').classList.add('hidden'); }

        function bookRender() {
            let el = document.getElementById('book-body'); if (!el) return;
            let list = allRecipes();
            let got = list.filter(function (r) { return huntFoundRecipe(r.id); }).length;
            el.innerHTML =
                '<div style="font-size:12px; color:#888; margin-bottom:10px;">' +
                '配方要自己试：两样东西丢地上挨着放，合出来了这里会记一笔。' +
                '<br><b>已发现 ' + got + ' / ' + list.length + '</b></div>' +
                list.map(function (r) {
                    let on = huntFoundRecipe(r.id);
                    if (!on) {
                        return '<div style="margin:5px 0; padding:7px 9px; border-radius:5px; background:#f4f4f4; color:#bbb;">' +
                            '??? ＋ ??? → ???</div>';
                    }
                    return '<div style="margin:5px 0; padding:7px 9px; border-radius:5px; background:#f3efff; color:#444;">' +
                        r.a + ' ＋ ' + r.b + ' → <b style="color:#5e35b1;">' + r.out.n + '</b>' +
                        ' <span style="color:#999;">$' + r.out.v.toLocaleString() + '</span></div>';
                }).join('');
        }

        // 格子里显示的字：名字 + 重量（腰包算上里面的），腰包再标上装了几件、是不是展开着
        function slotLabelHtml(it) {
            if (!it) return '';
            let extra = isPouch(it) ? '<div style="font-size:10px; color:#e65100;">' + pouchCount(it) + '/' + POUCH_SLOTS + (openPouch === it ? ' ▾' : ' ▸') + '</div>' : '';
            return '<div>' + it.n + '</div><div>重:' + itemWeight(it) + '</div>' + extra;
        }
        // 展开的腰包：在 anchor 后面画一行 3 格（容器名 'bag'），能和背包、仓库互相拖
        function pouchRowEl(anchor, id) {
            let row = document.getElementById(id);
            if (!row) { row = document.createElement('div'); row.id = id; anchor.parentNode.insertBefore(row, anchor.nextSibling); }
            row.innerHTML = '';
            return row;
        }
        function renderPouchSlots(row, rerender) {
            let bag = pouchBag(openPouch);
            if (!bag) { row.style.display = 'none'; return; }
            row.style.cssText = 'display:flex; gap:6px; justify-content:center; align-items:center; margin:6px auto; padding:6px; border:1px dashed #e65100; border-radius:6px; max-width:320px;';
            let t = document.createElement('div'); t.style.cssText = 'font-size:12px; color:#e65100;'; t.innerText = '腰包'; row.appendChild(t);
            bag.forEach(function (q, k) {
                let div = document.createElement('div'); div.className = 'slot';
                div.innerHTML = slotLabelHtml(q);
                setupSlotDrag(div, 'bag', k); div.onclick = function () { rerender(); };
                row.appendChild(div);
            });
        }
        function garageRenderPouchRow(actDiv) { renderPouchSlots(pouchRowEl(actDiv, 'garage-pouch-row'), initGarage); }

        function initGarage() {
            if (HUNT_TEST_MONEY) gState.money = 99999999;
            document.getElementById('garage-money').innerText = gState.money;
            let actDiv = document.getElementById('garage-active-inv'); actDiv.innerHTML = '';
            let sthDiv = document.getElementById('garage-stash-container'); sthDiv.innerHTML = '';
            let sellDiv = document.getElementById('sell-btn-container'); sellDiv.innerHTML = '';

            expandInventory();
            tidyGarage();
            if (openPouch && gState.inv.indexOf(openPouch) < 0 && gState.garage.indexOf(openPouch) < 0) openPouch = null;
            for (let i = 0; i < gState.maxInv; i++) {
                let div = document.createElement('div'); div.className = 'slot' + (gState.selectedContainer === 'inv' && gState.selectedSlot === i ? ' selected' : '');
                div.innerHTML = slotLabelHtml(gState.inv[i]);
                setupSlotDrag(div, 'inv', i); div.onclick = function () { gState.selectedContainer = 'inv'; gState.selectedSlot = i; pouchToggleFor(gState.inv[i]); initGarage(); }; actDiv.appendChild(div);
            }
            garageRenderPouchRow(actDiv);

            for (let i = 0; i < 200; i++) {
                let div = document.createElement('div'); div.className = 'slot' + (gState.selectedContainer === 'garage' && gState.selectedSlot === i ? ' selected' : '');
                div.innerHTML = slotLabelHtml(gState.garage[i]);
                setupSlotDrag(div, 'garage', i); div.onclick = function () { gState.selectedContainer = 'garage'; gState.selectedSlot = i; pouchToggleFor(gState.garage[i]); initGarage(); }; sthDiv.appendChild(div);
            }

            if (gState.selectedContainer === 'garage' && gState.garage[gState.selectedSlot]) {
                let item = gState.garage[gState.selectedSlot];
                if (item.type === 'badge') {
                    let t = document.createElement('div'); t.innerText = '地窖徽章不能卖'; t.style.cssText = 'color:#999; font-size:13px; margin:6px 0;'; sellDiv.appendChild(t);
                } else {
                    let sBtn = document.createElement('button'); sBtn.innerText = '卖掉（$' + garageSellPrice(item).toLocaleString() + '）' + kTxt('　Backspace', ''); sBtn.style.background = '#f39c12'; sBtn.style.color = '#fff'; sBtn.style.minWidth = '200px';
                    sBtn.onclick = garageSellSelected; sellDiv.appendChild(sBtn);
                }

                // 选中的是王冠底座：把仓库里现有的宝石列出来，点一下就镚上去。
                // 地上扔在一起也能镚，两边走的是同一个函数。
                if (item.type === 'base') {
                    let box = document.createElement('div');
                    box.style.cssText = 'position:relative; z-index:5; margin:8px auto 0; padding:8px 10px; background:#fff; border:1px solid #ddd; border-radius:6px; font-size:12px; color:#666; max-width:320px;';
                    box.innerHTML = '镚宝石（' + crownSockCount(item) + '/' + HUNT_GEMS.length + '）—— 六颗镚满变成皇冠<br>';
                    HUNT_GEMS.forEach(function (g) {
                        if (item.sock && item.sock[g.id]) return;
                        let gi = gState.garage.findIndex(function (q) { return q && q.type === 'gem' && q.gem === g.id; });
                        if (gi < 0) return;
                        let b = document.createElement('button');
                        b.innerText = g.n;
                        b.style.cssText = 'margin:3px; padding:4px 8px; font-size:12px; background:#' +
                            ('000000' + g.c.toString(16)).slice(-6) + '; color:#fff; border:none;';
                        b.onclick = function () {
                            if (!crownSocketGem(item, g.id)) return;
                            gState.garage[gi] = null;
                            saveProgress(); initGarage();
                        };
                        box.appendChild(b);
                    });
                    sellDiv.appendChild(box);
                }
            }

            let me = gState.team.find(function (t) { return t.id === gState.id; }); document.getElementById('start-game-btn').style.display = (me && me.isLeader) ? 'block' : 'none';
            saveProgress();
        }

        // 卖掉仓库里选中的那一件（H3）：宝物原价，商店道具半价；地窖徽章不能卖。卖完清空选中
        function garageSellPrice(item) { return item.isShop ? Math.floor(item.v / 2) : item.v; }
        function garageSellSelected() {
            let item = gState.selectedContainer === 'garage' ? gState.garage[gState.selectedSlot] : null;
            if (!item) return;
            if (item.type === 'badge') { showSysModal('卖不了', '地窖徽章不能卖。', [{ label: '知道了' }]); return; }
            if (pouchCount(item) > 0) { showSysModal('卖不了', '腰包里还有东西，先拿出来再卖。', [{ label: '知道了' }]); return; }
            if (openPouch === item) openPouch = null;
            gState.money += garageSellPrice(item); gState.garage[gState.selectedSlot] = null;
            gState.selectedSlot = -1;
            initGarage();
        }

        function buy(n, cost) {
            let emptyIdx = gState.garage.findIndex(function (item) { return item === null; });
            if (gState.money < cost) { showSysModal('钱不够', '买' + n + '还差 $' + (cost - gState.money).toLocaleString() + '。', [{ label: '知道了' }]); return; }
            if (emptyIdx === -1) { showSysModal('仓库满了', '仓库没空位了，先卖掉点东西再买。', [{ label: '知道了' }]); return; }
            gState.money -= cost; gState.garage[emptyIdx] = { ...shopItems[n], isShop: true }; initGarage();
        }
        function repairSelected() {

            let arr = (!isPlaying && gState.selectedContainer === 'garage') ? gState.garage : gState.inv;
            let item = (gState.selectedSlot !== -1) ? arr[gState.selectedSlot] : null;
            if (!item) { showSysModal('提示', '请先选择要充能维护的物品', [{ label: '确定' }]); return; }

            let cost = 0;
            if (item.type === 'badge') cost = BADGE_REPAIR_COST;
            else if (item.type === 'med') cost = (item.maxUses - item.uses) * 1000;
            else { showSysModal('提示', '该物品无法充能维护', [{ label: '确定' }]); return; }

            if (item.uses >= item.maxUses) { showSysModal('提示', '该物品还是满的，不需要维护', [{ label: '确定' }]); return; }
            if (gState.money < cost) { showSysModal('提示', '钱不够维修！', [{ label: '确定' }]); return; }

            gState.money -= cost; item.uses = item.maxUses;
            if (isPlaying) { updateHUD(); saveProgress(); } else initGarage();
        }
        window.addEventListener('keydown', function (e) {
            let tg = e.target, tn = tg && tg.tagName;
            if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || (tg && tg.isContentEditable)) return;
            if (!document.getElementById('screen-garage').classList.contains('hidden') && (e.key === 'Delete' || e.key === 'Backspace')) {
                e.preventDefault();
                if (e.repeat) return;
                garageSellSelected();
            }
        });

        const textureCache = {};
        function cssColor(c, fallback) {
            if (typeof c === 'number') return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
            if (typeof c === 'string' && c) return c;
            return fallback;
        }
        function createProceduralTexture(type, mainColor, detailColor) {
            const main = cssColor(mainColor, '#3498db'), detail = cssColor(detailColor, '#ffffff');
            const key = type + '|' + main + '|' + detail;
            if (textureCache[key]) return textureCache[key];
            const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64; const ctx = canvas.getContext('2d');
            ctx.fillStyle = main; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = detail;
            if (type === 'wall') { ctx.fillStyle = '#e5e5ea'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#d1d1d6'; for (let i = 0; i < 64; i += 16) { ctx.fillRect(i, 0, 2, 64); ctx.fillRect(0, i, 64, 2); } }
            else if (type === 'floor') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#e5e5ea'; for (let i = 0; i < 64; i += 32) { ctx.fillRect(0, i, 64, 2); ctx.fillRect(i, 0, 2, 64); } }
            else if (type === 'safe_wall') { ctx.fillStyle = '#1abc9c'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#16a085'; ctx.fillRect(0, 0, 64, 8); ctx.fillRect(0, 56, 64, 8); }
            else if (type === 'safe_floor') { ctx.fillStyle = '#a8e6cf'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#dcedc1'; ctx.fillRect(16, 16, 32, 32); }
            else if (type === 'gold_shop_floor' || type === 'gold_shop_wall') { ctx.fillStyle = '#ffd700'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#b8860b'; for (let i = 0; i < 64; i += 16) { ctx.fillRect(i, 0, 2, 64); ctx.fillRect(0, i, 64, 2); } }
            else if (type === 'table' || type === 'stair') { ctx.fillStyle = '#7f8c8d'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#95a5a6'; ctx.fillRect(0, 0, 64, 4); ctx.fillRect(0, 60, 64, 4); }
            else if (type === 'wood_chest') { ctx.fillStyle = '#8a5a36'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#5c3a21'; ctx.fillRect(4, 4, 56, 6); ctx.fillRect(4, 54, 56, 6); }
            else if (type === 'silver_chest') { ctx.fillStyle = '#bdc3c7'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 8, 64, 4); ctx.fillRect(0, 52, 64, 4); }
            else if (type === 'gold_chest') { ctx.fillStyle = main; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = detail; ctx.fillRect(24, 20, 16, 24); }
            else if (type === 'safe_box') { ctx.fillStyle = '#55555a'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#333335'; ctx.fillRect(4, 4, 56, 4); ctx.fillRect(4, 56, 56, 4); }
            else if (type === 'pouch') { ctx.fillStyle = '#e67e22'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#d35400'; ctx.fillRect(16, 24, 32, 16); }
            else if (type === 'carriage') { ctx.fillStyle = '#ff6b6b'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#ffd700'; ctx.fillRect(16, 16, 32, 32); }
            else { for (let i = 0; i < 25; i++) { ctx.fillRect(Math.random() * 64, Math.random() * 64, 4, 4); } }
            const tex = new THREE.CanvasTexture(canvas); textureCache[key] = tex; return tex;
        }

        let scene, camera, renderer, clock, raycaster;
        let maze = [], chests = [], groundItems = [], entities = [], walkableMeshes = [], explored = [];
        const TILE = 24;

        const HUNT_SIZE = 21, NIGHT_SIZE = 27;
        let mSize = HUNT_SIZE;
        const P_RADIUS = 4;
        const MAX_STEP_UP = 4;

        let isPlaying = false, timeSecs = 8 * 3600, endTime = 24 * 3600;
        // pVel/viewFrustum/viewProjMatrix 之前是顶层代码一加载就 new THREE.xxx()——
        // 如果 three.min.js 那个 CDN 没连上（网络问题/被墙/CDN 抽风），THREE 是 undefined，
        // 这两行直接抛异常，会让这份 <script> 后面几千行代码（包括 hub/blaze 这些用 let
        // 声明的模式状态）全部停在"暂时性死区"，之后随便什么地方一碰这些变量就报
        // "Cannot access 'x' before initialization"，界面看着还在但到处是坏的。
        // 挪到 ensureScene() 里跟 camera/scene 一起建，真正进图之前才需要，不影响别的。
        let pVel = null, onGround = true;
        let actionTimer = 0, actionTarget = null, abilityCd = 0, abilityActive = 0, gHpRegenAcc = 0, stamina = 100;

        let viewFrustum = null, viewProjMatrix = null;

        function playerFloor() { let f = Math.floor((camera.position.y - 9) / TILE); if (f < 0) f = 0; if (f > FLOORS - 1) f = FLOORS - 1; return f; }

        function checkCol(x, z, y, bandY) {
            let cf = Math.floor((bandY === undefined ? y : bandY) / TILE); if (cf < 0) cf = 0; if (cf > 2) cf = 2;
            let cX = Math.floor((x + TILE / 2) / TILE); let cZ = Math.floor((z + TILE / 2) / TILE);
            if (!maze[cf] || !maze[cf][cZ] || !maze[cf][cZ][cX]) return true;
            let type = maze[cf][cZ][cX].type;
            if (type === 1) return true;
            if (type === 2 && y < cf * TILE + 13) return true;
            if (type === 3) {

                let s = maze[cf][cZ][cX].stair;
                if (s) {
                    let t = s.sign * ((s.axis === 'z' ? z : x) - s.edge);
                    let i = Math.floor(t / s.depth); if (i < 0) i = 0; if (i > s.count - 1) i = s.count - 1;
                    let stepTop = s.base * TILE + s.rise * (i + 1);
                    if (y < stepTop - 1) return true;
                }
            }
            return false;
        }

        const EDGE_INSET = P_RADIUS - 0.01;

        function blockedX(x, z, y, dir) { let ex = x + dir * P_RADIUS, b = y - 9; return checkCol(ex, z - EDGE_INSET, y, b) || checkCol(ex, z + EDGE_INSET, y, b); }
        function blockedZ(x, z, y, dir) { let ez = z + dir * P_RADIUS, b = y - 9; return checkCol(x - EDGE_INSET, ez, y, b) || checkCol(x + EDGE_INSET, ez, y, b); }

        // ── 寻宝队玩家移动（H1、H8）──
        // 墙按身体边缘挡；楼梯和桌子按"表面高度"、看身体中心落点：脚到那里表面的落差不超过 MAX_STEP_UP 才能走进去。
        // 楼梯格（type 3）在上下两层都有，平台那段也算最高一级；桌子面高 8。
        // 脚离上一层地面不到 MAX_STEP_UP（比如从二楼楼梯井掉下来、脚在 20–24 之间）时，上一层那一格也算：
        // 墙就挡，桌子按桌面算，地板就能踩上去。
        const HUNT_TABLE_H = 8;
        function huntCellAt(fl, x, z) {
            let r = maze[fl] && maze[fl][Math.floor((z + TILE / 2) / TILE)];
            return (r && r[Math.floor((x + TILE / 2) / TILE)]) || null;
        }
        function huntCellTop(fl, c, x, z) {
            if (!c || c.type === 1) return Infinity;
            if (c.type === 2) return fl * TILE + HUNT_TABLE_H;
            if (c.type === 3 && c.stair) {
                let s = c.stair, t = s.sign * ((s.axis === 'z' ? z : x) - s.edge);
                let i = Math.floor(t / s.depth); if (i < 0) i = 0; if (i > s.count - 1) i = s.count - 1;
                return s.base * TILE + s.rise * (i + 1);
            }
            return fl * TILE;
        }
        function huntFloorOf(feet) { let cf = Math.floor(feet / TILE); return cf < 0 ? 0 : cf > FLOORS - 1 ? FLOORS - 1 : cf; }
        function huntNearUpper(cf, feet) { return cf + 1 < FLOORS && feet >= (cf + 1) * TILE - MAX_STEP_UP; }
        function huntSurfaceAt(x, z, feet) {
            let cf = huntFloorOf(feet), top = huntCellTop(cf, huntCellAt(cf, x, z), x, z);
            if (huntNearUpper(cf, feet)) top = Math.max(top, huntCellTop(cf + 1, huntCellAt(cf + 1, x, z), x, z));
            return top;
        }
        function huntWallAt(x, z, feet) {
            let cf = huntFloorOf(feet), c = huntCellAt(cf, x, z);
            if (!c || c.type === 1) return true;
            if (c.type === 2 && feet < cf * TILE + HUNT_TABLE_H - MAX_STEP_UP) return true;   // 桌子侧面：脚太低时边缘也挡，免得身体插进桌子
            if (huntNearUpper(cf, feet)) { let u = huntCellAt(cf + 1, x, z); if (!u || u.type === 1) return true; }
            return false;
        }
        function huntBlockedAt(x, z, feet, dx, dz) {
            if (dx) { let ex = x + Math.sign(dx) * P_RADIUS; if (huntWallAt(ex, z - EDGE_INSET, feet) || huntWallAt(ex, z + EDGE_INSET, feet)) return true; }
            if (dz) { let ez = z + Math.sign(dz) * P_RADIUS; if (huntWallAt(x - EDGE_INSET, ez, feet) || huntWallAt(x + EDGE_INSET, ez, feet)) return true; }
            return huntSurfaceAt(x, z, feet) - feet > MAX_STEP_UP;
        }
        // 一帧的移动 + 重力 + 落地。位移超过 1 个单位拆成小步；挡住的轴就不走，没挡的轴走的就是检查过的距离。
        function huntPhysics(dt, mx, mz, speed) {
            let len = Math.hypot(mx, mz), vx = 0, vz = 0;
            if (len > 0) { vx = mx / len * speed; vz = mz / len * speed; }
            let n = Math.max(1, Math.ceil(Math.hypot(vx, vz) * dt / 1));
            let h = dt / n, p = camera.position;
            for (let k = 0; k < n; k++) {
                let dx = vx * h, dz = vz * h;
                if (dx && !huntBlockedAt(p.x + dx, p.z, p.y - 9, dx, 0)) p.x += dx;
                if (dz && !huntBlockedAt(p.x, p.z + dz, p.y - 9, 0, dz)) p.z += dz;
                pVel.y -= 120 * h; p.y += pVel.y * h;
                let hits = new THREE.Raycaster(p, new THREE.Vector3(0, -1, 0), 0, 30).intersectObjects(walkableMeshes);
                let ground = playerFloor() * TILE + 9;
                if (hits.length > 0) ground = hits[0].point.y + 9;
                if ((ground - p.y <= MAX_STEP_UP) && (p.y <= ground + 0.1)) { p.y = ground; pVel.y = 0; onGround = true; }
                else onGround = false;
                // 保底：已经在台阶、桌子里面或平台下面了，直接托到表面
                let top = huntSurfaceAt(p.x, p.z, p.y - 9);
                if (top !== Infinity && p.y - 9 < top) { p.y = top + 9; if (pVel.y < 0) pVel.y = 0; onGround = true; }
                // 脚快到上一层、头顶那一格是上一层的墙：当成撞到天花板，压回下面（不会停在墙里）
                let cf = huntFloorOf(p.y - 9);
                if (huntNearUpper(cf, p.y - 9)) { let u = huntCellAt(cf + 1, p.x, p.z); if (!u || u.type === 1) { p.y = (cf + 1) * TILE - MAX_STEP_UP - 0.01 + 9; if (pVel.y > 0) pVel.y = 0; } }
            }
        }

        function moveWithCollision(obj, dx, dz) {
            if (!obj) return;
            if (!checkCol(obj.position.x + dx, obj.position.z, obj.position.y)) obj.position.x += dx;
            if (!checkCol(obj.position.x, obj.position.z + dz, obj.position.y)) obj.position.z += dz;
        }

        function toggleBackpackUI() {
            if (gState.largeMapOpen) return;
            gState.backpackOpen = !gState.backpackOpen;
            const bpPage = document.getElementById('backpack-overlay-page');
            if (gState.backpackOpen) { bpPage.classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }
            else { bpPage.classList.add('hidden'); gState.needsLock = true; }
            updateHUD();
        }

        function toggleLargeMapUI() {
            if (gState.backpackOpen) return;
            gState.largeMapOpen = !gState.largeMapOpen;
            const mapPage = document.getElementById('large-map-panel');
            if (gState.largeMapOpen) { mapPage.classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); refreshLargeMinimap(); }
            else { mapPage.classList.add('hidden'); gState.needsLock = true; }
        }

        let isDraggingCamera = false; let camTouchId = null; let lastCamX = 0, lastCamY = 0;
        // 第三人称吊镜（hub/cake/jail/dodge/escape/race/blaze 共用这套）——之前这里把
        // dir.y 直接归零，只用水平朝向算镜头位置，垂直偏移量('up' 参数)是个固定值。
        // 结果是：左右转（yaw）人物确实一直在正中间，但一抬头/低头（pitch）人物就会
        // 偏出正中间——镜头的俯仰角变了，但镜头跟人物的相对位置没跟着抬头低头调整。
        // 现在改成用完整的 3D 朝向（pitch 也算进去）算镜头位置：人物在"镜头位置 + 朝向×距离"
        // 这条线上，不管怎么转（yaw 还是 pitch）人物永远精确落在屏幕正中间。
        let chaseCamLastDir = { x: 0, y: 0, z: -1 };
        function chaseCamDir() {
            let dir = new THREE.Vector3(); camera.getWorldDirection(dir);
            if (dir.lengthSq() < 0.0001) return chaseCamLastDir;
            dir.normalize();
            chaseCamLastDir = { x: dir.x, y: dir.y, z: dir.z };
            return chaseCamLastDir;
        }

