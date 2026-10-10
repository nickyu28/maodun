        // ── Z1：每台设备清一次所有玩家数据（作者的决定，2026-10-05）──
        // 标记存在不以 TH_ 开头的 key 里（清 TH_* 不会把它清掉，设置里的"清空本地数据"也不会），
        // 对不上就删掉所有 TH_*、写上新值，所以每台设备只清一次。以后别改 DATA_WIPE_VER，除非作者明确说要再清。
        const DATA_WIPE_KEY = 'maodun_data_ver', DATA_WIPE_VER = '2026-10-05';
        (function () {
            try {
                if (localStorage.getItem(DATA_WIPE_KEY) === DATA_WIPE_VER) return;
                let keys = [];
                for (let i = 0; i < localStorage.length; i++) { let k = localStorage.key(i); if (k && k.indexOf('TH_') === 0) keys.push(k); }
                keys.forEach(function (k) { localStorage.removeItem(k); });
                localStorage.setItem(DATA_WIPE_KEY, DATA_WIPE_VER);
                // 有旧数据才提示（全新设备没什么可重置的）；进大厅弹一次就删
                if (keys.length) localStorage.setItem('maodun_wipe_notice', '1');
            } catch (e) { }
        })();
        function dataWipeNotice() {
            try {
                if (localStorage.getItem('maodun_wipe_notice') !== '1') return;
                localStorage.removeItem('maodun_wipe_notice');
            } catch (e) { return; }
            showSysModal('提示', '游戏更新了，之前的数据已经重置。', [{ label: '好' }]);
        }

        let gameSeed = 1;
        function seededRandom() { gameSeed = (gameSeed * 9301 + 49297) % 233280; return gameSeed / 233280; }

        // ── I1：弹窗只有一个（#sys-modal），规则统一在这里 ──
        // 1. 介绍卡片（introPush 排队弹的）开着的时候，别的 showSysModal 不能把它盖掉：排到 sysModalWait 里，卡片关了再出。
        // 2. 普通弹窗开着时再调 showSysModal，还是像以前一样直接换成新的（好多流程是"确认 → 结果"这样接着弹）。
        // 3. 弹窗不管是怎么关的（点按钮、代码直接加 hidden、测试），都由下面的 MutationObserver 收尾：
        //    introOpen 只在"弹窗开着、而且开着的是卡片"时为 true；关了就先出排队的普通弹窗，再出排队的卡片。
        let sysModalKind = null;       // 现在开着的是 'intro' 还是 'normal'
        let sysModalWait = [];         // 卡片开着时排队的普通弹窗
        function sysModalVisible() { return !document.getElementById('sys-modal').classList.contains('hidden'); }
        function sysModalNext() {
            if (sysModalVisible()) return;
            if (sysModalWait.length) { let m = sysModalWait.shift(); sysModalRender(m[0], m[1], m[2], 'normal'); return; }
            if (typeof introPump === 'function') introPump();
        }
        function sysModalSync() {
            let vis = sysModalVisible();
            if (typeof introOpen !== 'undefined') introOpen = vis && sysModalKind === 'intro';
            if (!vis) { sysModalKind = null; setTimeout(sysModalNext, 150); }
        }
        // 代码里要关掉"自己弹的那个普通弹窗"时用这个：开着的是卡片就不动它（它的普通弹窗还在排队，一起撤掉）
        function sysModalCloseNormal() {
            if (sysModalKind === 'intro' && sysModalVisible()) { sysModalWait = []; return; }
            document.getElementById('sys-modal').classList.add('hidden');
        }
        function showSysModal(title, text, buttons) {
            if (sysModalKind === 'intro' && sysModalVisible()) { sysModalWait.push([title, text, buttons]); return; }
            sysModalRender(title, text, buttons, 'normal');
        }
        function sysModalRender(title, text, buttons, kind) {
            // 大厅里鼠标一直是指针锁定状态（转视角用），弹窗一开还锁着的话，
            // 想点弹窗按钮鼠标根本不会动，还一直在转镜头——弹窗前先解锁。
            if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { } }
            document.getElementById('sys-modal-title').innerText = title;
            document.getElementById('sys-modal-text').innerHTML = text;
            let btnContainer = document.getElementById('sys-modal-btns'); btnContainer.innerHTML = '';
            buttons.forEach(btn => {
                let b = document.createElement('button'); b.innerText = btn.label;
                // 这里原本没加花括号，所以没传 color 的按钮也被刷成了白字，
                // 配上默认的浅色底 —— 字和底一个颜色，按钮看起来是空的。
                b.style.background = btn.color || '#666';
                b.style.color = '#fff';
                // 三个按钮并排时窄屏会把"下一关"挤成两行——宁可整排换行，也别把字拆开
                b.style.whiteSpace = 'nowrap';
                b.onclick = () => { document.getElementById('sys-modal').classList.add('hidden'); sysModalSync(); if (btn.onClick) btn.onClick(); };
                btnContainer.appendChild(b);
            });
            sysModalKind = kind;
            document.getElementById('sys-modal').classList.remove('hidden');
            sysModalSync();
        }
        (function () {
            let el = document.getElementById('sys-modal');
            if (el && window.MutationObserver) new MutationObserver(sysModalSync).observe(el, { attributes: true, attributeFilter: ['class'] });
        })();

        let peer = null, peerConns = [], peerIsHost = false, peerRoom = '', peerWant = false, peerRetry = null;
        let bcRaw = null;
        try { if (window.BroadcastChannel) bcRaw = new BroadcastChannel('th_network_v5'); } catch (e) { }

        let bc = {
            onmessage: null,
            postMessage: function (m) {
                if (bcRaw) { try { bcRaw.postMessage(m); } catch (e) { } }
                netSend(m, null);
            }
        };
        if (bcRaw) bcRaw.onmessage = function (ev) { if (bc.onmessage) bc.onmessage(ev); };

        function netSend(m, except) {
            peerConns.forEach(function (c) {
                if (c === except) return;
                if (c && c.open) { try { c.send(m); } catch (e) { } }
            });
        }

        // ── 麦克风：房间里两两之间直接建语音通话，不经过房主转发/混音——
        // 房主的 PeerJS id 是固定公式能算出来（NET_PREFIX+peerRoom），非房主的
        // id 是随机生成的，靠房主在 netDeliver 里认出新连接时广播出来
        // （见上面的 VOICE_PEER）。人少的小房间够用，别指望几十个人一起开麦。
        let localMicStream = null;
        let voiceOptedIn = false;      // 有没有主动点过一次麦克风——没点过就不参与，连别人的都不接
        let voiceCalls = {};           // 游戏 ID -> MediaConnection
        let voicePeerIds = {};         // 游戏 ID -> 真实 PeerJS id（非房主的，靠房主转告）
        let voiceAudioEls = {};        // 游戏 ID -> 播放对方声音的 <audio>

        function voiceRealPeerId(id) {
            let entry = roomList.filter(function (r) { return r.id === id; })[0];
            if (entry && entry.host) return NET_PREFIX + peerRoom;
            return voicePeerIds[id] || null;
        }
        function voicePlayStream(id, stream) {
            let el = voiceAudioEls[id];
            if (!el) {
                el = document.createElement('audio');
                el.autoplay = true;
                document.body.appendChild(el);
                voiceAudioEls[id] = el;
            }
            el.srcObject = stream;
        }
        function voiceCleanupPeer(id) {
            if (voiceCalls[id]) { try { voiceCalls[id].close(); } catch (e) { } delete voiceCalls[id]; }
            if (voiceAudioEls[id]) { voiceAudioEls[id].remove(); delete voiceAudioEls[id]; }
        }
        function voiceCleanupAll() { Object.keys(voiceCalls).forEach(voiceCleanupPeer); }
        function voiceAcceptCall(call) {
            let fromId = call.metadata && call.metadata.id;
            call.answer(localMicStream || undefined);
            call.on('stream', function (remoteStream) { if (fromId) voicePlayStream(fromId, remoteStream); });
            call.on('close', function () { if (fromId) voiceCleanupPeer(fromId); });
            call.on('error', function () { if (fromId) voiceCleanupPeer(fromId); });
            if (fromId) voiceCalls[fromId] = call;
        }
        function voiceDial(id) {
            if (!peer || !peer.open || voiceCalls[id]) return;
            let pid = voiceRealPeerId(id);
            if (!pid) return;
            let call;
            try { call = peer.call(pid, localMicStream || undefined, { metadata: { id: gState.id } }); }
            catch (e) { return; }
            if (!call) return;
            voiceCalls[id] = call;
            call.on('stream', function (remoteStream) { voicePlayStream(id, remoteStream); });
            call.on('close', function () { voiceCleanupPeer(id); });
            call.on('error', function () { voiceCleanupPeer(id); });
        }
        // 谁拨给谁：游戏 ID 字典序小的那个负责拨号，两边各自算都是同一个结果，
        // 不会两头同时拨出重复的两条线。房间成员一变化、拿到新的真实 id 就补拨一次。
        function voiceMeshSync() {
            if (!voiceOptedIn || !peerWant) return;
            roomList.forEach(function (r) {
                if (r.self || voiceCalls[r.id]) return;
                if (gState.id >= r.id) return;
                voiceDial(r.id);
            });
        }
        function voiceHookPeer(p) {
            p.on('call', function (call) {
                if (!voiceOptedIn) { try { call.close(); } catch (e) { } return; }
                voiceAcceptCall(call);
            });
        }

        function netDeliver(m, from) {
            if (!m || typeof m !== 'object') return;
            if (from && peerIsHost) {
                // A2/A3：发送者以连接为准，不信消息里自己写的 sender（能伪造）。
                // 每条连接第一次带 sender 的消息把它绑定到一个游戏 ID（这个 ID 已经被别的连接或房主自己占着就不绑），
                // 之后这条连接发来的所有消息，sender 一律由房主改写成绑定的那个 ID 再处理、再转发；
                // 客人收到房主转发的消息，信房主写的 sender。
                // 顺手记下它真实的 PeerJS id、告诉房间里所有人——语音通话拨号靠的就是这个真实 id。
                if (!from._who && typeof m.sender === 'string' && m.sender) {
                    let claimed = sanitizeId(m.sender);
                    let taken = !claimed || claimed === gState.id || peerConns.some(function (c) { return c !== from && c.open && c._who === claimed; });
                    if (!taken) {
                        from._who = claimed;
                        voicePeerIds[claimed] = from.peer;
                        bc.postMessage({ type: 'VOICE_PEER', target: '*', id: claimed, peerId: from.peer });
                    }
                }
                if (from._who) m.sender = from._who; else delete m.sender;
            } else if (from && m.sender) {
                from._who = m.sender;
            }
            if (peerIsHost) netSend(m, from);
            if (bc.onmessage) bc.onmessage({ data: m });
        }

        function netSetStatus(text, color) {
            let el = document.getElementById('net-status');
            if (el) { el.innerText = text; el.style.color = color || '#999'; }
        }

        function netCount() { return peerConns.filter(function (c) { return c && c.open; }).length + 1; }
        // 显示"在线几人"不能用 netCount——星形拓扑下非房主只跟房主有一条直连，
        // netCount 在客人这边永远是 2，看不出真实房间人数。roomList 是靠
        // ROOM_HELLO 经房主转发汇总出来的，房主/客人两边看到的都是真实总数。
        function roomOnlineCount() { return Math.max(1, roomList.length); }
        let netShownCount = 0;   // 状态栏现在显示的"在线 N 人"（0 = 没在显示人数）
        function netRefreshCount() {
            netShownCount = roomOnlineCount();
            netSetStatus((peerIsHost ? '房主' : '已加入') + '　房间 ' + peerRoom + '　在线 ' + netShownCount + ' 人', '#5cb85c');
        }
        // C2：原来只在房主 open、连接 open/close 时刷新，那时 roomList 还是空的，一直显示 1。
        // 现在 roomList 每次变（roomSync）都看一下：在房间里、人数变了（或者状态栏被别的提示盖掉了）就刷新。
        // 房主和客人都靠心跳汇总 roomList，两边都走这里。
        function netCountSync() {
            let el = document.getElementById('net-status');
            let inRoom = roomList.length > 0 || !!(peer && peer.open && (peerIsHost || peerConns.some(function (c) { return c && c.open; })));
            // 别人都走了、自己也没真连着：把人数改回 1 显示一次就不管了（别一直盖掉"连接出错"之类的提示）
            if (!inRoom) { if (netShownCount > 1) netRefreshCount(); netShownCount = 0; return; }
            if (roomOnlineCount() === netShownCount && el && /在线 \d+ 人/.test(el.innerText)) return;
            netRefreshCount();
        }

        function netHookConn(c) {
            peerConns.push(c);
            // 连接发起了不代表真连上了——之前这里全靠 PeerJS 自己的 open/error 事件，
            // 但对面不在/房间号错的时候经常两边都不触发，状态栏会一直停在"已加入"，
            // 其实什么都没连上。加个超时兜底：迟迟没 open 就当失败处理。
            let openTimeout = setTimeout(function () {
                if (c.open) return;
                try { c.close(); } catch (e) { }
            }, 8000);
            c.on('open', function () { clearTimeout(openTimeout); netRefreshCount(); roomHello(); });
            c.on('data', function (m) { netDeliver(m, c); });
            c.on('close', function () {
                clearTimeout(openTimeout);
                let wasOpen = c.open;
                peerConns = peerConns.filter(function (x) { return x !== c; });
                if (c._who) { delete roomPeers[c._who]; voiceCleanupPeer(c._who); roomSync(); }
                if (!peerIsHost && !wasOpen && peerWant) {
                    netSetStatus('连不上房间 ' + peerRoom + '，重试中…', '#d9534f');
                    if (peerRetry) clearTimeout(peerRetry);
                    peerRetry = setTimeout(function () { if (peerWant) netTryGuest(); }, 3000);
                } else {
                    netRefreshCount();
                }
            });
            c.on('error', function () { try { c.close(); } catch (e) { } });
        }

        // A9：PeerJS 房间 id 带协议版本号。联机消息的格式或含义变了就把它加一，
        // 新旧版本的页面就不会进到同一个房间里（各算各的房间）。
        // v3：密室前面插了 8 个入门关，ESC_START 里的关卡号跟旧版对不上了
        // v4：寻宝队箱子、保险柜、信号接收器的东西改成造图时按种子定好（H13），同一个 START_MAP 新旧版本开出来的不一样
        // v5：寻宝队造图保证每两层之间有楼梯、坏图换种子重造（H15），少数种子新旧版本造出来的图不一样
        // v6：超燃镜猫换位的 'swap' 事件多了楼层字段、收到的一方开始照着换位（原来发了没人收）
        const NET_PROTO = 6;
        const NET_PREFIX = 'maodun-v' + NET_PROTO + '-';
        const DEFAULT_ROOM_CODE = 'lobby';   // 没手动开过小房间的人，默认都进这一个，大厅才是真的"大家在一起"
        // 这一整套匹配等待（matchPool/matchLeader/night-wait 那个浮层）早就写好了，
        // 只是默认值一直是"跳过"（0），测试面板里的"惊魂夜：跳过匹配等待"开关反而是默认生效的
        // 那一档——等于真玩家这么久以来进惊魂夜其实从没真的等过匹配，一直是秒配 AI。
        // 改成 15 秒是把这功能真的打开，不是新写的。
        let NIGHT_MATCH_WAIT = 15;

        function netJoinRoom(code) {
            code = (code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
            if (!code) { netSetStatus('先填一个房间号', '#d9534f'); return; }
            if (typeof Peer === 'undefined') { netSetStatus('联机组件没加载出来（需要联网）', '#d9534f'); return; }
            netLeaveRoom(true);
            peerRoom = code; peerWant = true;
            try { localStorage.setItem('TH_room', code); } catch (e) { }
            netSetStatus('连接中…', '#e8a33d');
            netTryHost();
        }

        // 联机一直卡"连接房主中"连不上——PeerJS 默认只带 STUN，没配 TURN 中继。
        // STUN 只能帮忙穿透一部分 NAT，两边不在同一个网络、或者任一边是运营商级 NAT
        // （常见于手机流量）/严格防火墙的时候，直连路径根本找不出来，WebRTC 连接会
        // 卡在"协商中"永远打不开，表现就是信令层（peer.on('open')）正常，但两边真正
        // 的 DataConnection 一直不触发 open。加一段免费的公共 TURN 中继（Open Relay
        // Project，无需注册，专门给这种小项目用）当兜底：直连打得通就还走直连（TURN
        // 只在真的需要中继时才会被 ICE 选中，不会让所有流量都绕道），打不通就走它转发。
        // 免费额度有限，真到了要撑大量并发语音/联机还得换成付费 TURN，但先把"根本连不上"
        // 这个死结解开。
        const PEER_ICE_CONFIG = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
            ]
        };
        function netDropPeer() {
            peerConns.forEach(function (c) { try { c.close(); } catch (e) { } });
            peerConns = [];
            voiceCleanupAll(); voicePeerIds = {};
            try { if (peer) peer.destroy(); } catch (e) { }
            peer = null;
        }

        function netTryHost() {
            netDropPeer();
            try { peer = new Peer(NET_PREFIX + peerRoom, { config: PEER_ICE_CONFIG }); } catch (e) { netSetStatus('联机初始化失败', '#d9534f'); return; }
            voiceHookPeer(peer);
            peer.on('open', function () {
                peerIsHost = true;
                roomPeers = {}; roomSync(); netRefreshCount();
                peer.on('connection', function (c) { netHookConn(c); });
            });
            peer.on('error', function (err) {
                if (err && err.type === 'unavailable-id') { netTryGuest(); return; }
                if (!peerWant) return;
                netSetStatus('连接出错，重试中…', '#d9534f');
                if (peerRetry) clearTimeout(peerRetry);
                peerRetry = setTimeout(function () { if (peerWant) netTryHost(); }, 3000);
            });
        }

        function netTryGuest() {
            netDropPeer();
            try { peer = new Peer({ config: PEER_ICE_CONFIG }); } catch (e) { netSetStatus('联机初始化失败', '#d9534f'); return; }
            voiceHookPeer(peer);
            peer.on('open', function () {
                peerIsHost = false;
                // 这里只是自己的 peer 对象连上了信令服务器，跟房主之间的连接还没打开——
                // 真正的"已加入"要等 netHookConn 里 c.on('open') 才算数，不然房主已经
                // 下线/房间号打错的时候，状态栏会骗你说连上了，其实什么都没连上。
                netSetStatus('连接房主中…', '#e8a33d');
                netHookConn(peer.connect(NET_PREFIX + peerRoom, { reliable: true }));
            });
            peer.on('error', function () {
                if (!peerWant) return;
                netSetStatus('连接出错，重试中…', '#d9534f');
                if (peerRetry) clearTimeout(peerRetry);
                peerRetry = setTimeout(function () { if (peerWant) netTryGuest(); }, 3000);
            });
        }

        // ── C6b 联机诊断：一项项测，显示"通 / 不通 / 用时"，最后说哪一环不通。
        // 只读：自己另开一个临时的 Peer 和 RTCPeerConnection，测完就关，不碰游戏正在用的连接。
        const NET_DIAG_STEPS = [
            ['lib', '联机组件加载', '联机组件没加载上，刷新一下再试。'],
            ['signal', '牵线服务器', '连不上牵线服务器，进不了房间。'],
            ['stun', '探路服务器', '探路服务器没回地址，不在同一个网络时很难直连，只能靠中转。'],
            ['turn', '中转服务器', '中转服务器没回地址，两边都没法直连时就连不上。']
        ];
        let netDiag = null;
        function netDiagText() {
            if (!netDiag) return '';
            let lines = ['联机诊断　版本 ' + GAME_VERSION + '　' + new Date().toLocaleString()];
            NET_DIAG_STEPS.forEach(function (st, i) {
                let r = netDiag.res[st[0]];
                lines.push((i + 1) + '. ' + st[1] + '：' + (!r ? '测试中…' : (r.ok ? '通' : '不通') + (r.ms !== undefined ? '　' + r.ms + ' 毫秒' : '') + (r.why ? '（' + r.why + '）' : '')));
            });
            lines.push(netDiag.done ? '结论：' + netDiagVerdict() : '还在测…');
            return lines.join('\n');
        }
        function netDiagVerdict() {
            let bad = NET_DIAG_STEPS.filter(function (st) { let r = netDiag.res[st[0]]; return r && !r.ok; });
            return bad.length ? bad.map(function (st) { return st[2]; }).join('') : '四项都通，联机这边没问题。';
        }
        function netDiagRender() {
            let el = document.getElementById('net-diag'); if (!el || !netDiag) return;
            el.innerHTML = NET_DIAG_STEPS.map(function (st, i) {
                let r = netDiag.res[st[0]];
                let state = !r ? '<span style="color:#999;">测试中…</span>' : r.ok ? '<b style="color:#2e7d32;">通</b>' : '<b style="color:#d9534f;">不通</b>';
                return '<div style="display:flex; justify-content:space-between; gap:10px; padding:4px 0; border-bottom:1px solid #eee;"><span>' + (i + 1) + '. ' + st[1] + '</span><span>' + state +
                    (r && r.ms !== undefined ? ' <span style="color:#888;">' + r.ms + ' 毫秒</span>' : '') + (r && r.why ? ' <span style="color:#888;">' + chatEscape(r.why) + '</span>' : '') + '</span></div>';
            }).join('') + '<div id="net-diag-verdict" style="margin-top:8px; font-weight:bold;">' + (netDiag.done ? chatEscape(netDiagVerdict()) : '还在测…') + '</div>' +
                '<button onclick="netDiagCopy()" style="margin-top:8px; background:#2c5d8f; color:#fff; border:none; font-size:12px; padding:6px 14px;">复制结果</button>';
        }
        function netDiagCopy() {
            let t = netDiagText(), ok = function () { blazeFlash('诊断结果复制好了'); };
            let fallback = function () {
                let ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed; left:-9999px;';
                document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { } ta.remove();
            };
            try { navigator.clipboard.writeText(t).then(ok, fallback); } catch (e) { fallback(); }
        }
        function openNetDiag() {
            let run = { res: {}, done: false };
            netDiag = run;
            showSysModal('联机诊断', '<div id="net-diag" style="text-align:left; font-size:13px; min-width:260px;"></div>', [{ label: '关闭', color: '#666' }]);
            netDiagRender();
            let set = function (k, r) { if (netDiag !== run) return; run.res[k] = r; netDiagRender(); };
            let now = function () { return performance.now(); };
            // 1. 联机组件
            let libOk = typeof Peer === 'function';
            let ent = performance.getEntriesByType('resource').filter(function (e) { return /peerjs/i.test(e.name); })[0];
            set('lib', { ok: libOk, ms: ent ? Math.round(ent.duration) : undefined, why: libOk ? '' : '没加载' });
            // 2. 牵线服务器：临时 Peer 等 open，10 秒超时
            let signal = function () {
                return new Promise(function (resolve) {
                    if (!libOk) { set('signal', { ok: false, why: '组件没加载' }); resolve(); return; }
                    let t0 = now(), p = null, fin = false;
                    let end = function (r) { if (fin) return; fin = true; clearTimeout(to); try { if (p) p.destroy(); } catch (e) { } set('signal', r); resolve(); };
                    let to = setTimeout(function () { end({ ok: false, why: '10 秒没连上' }); }, 10000);
                    try { p = new Peer({ config: PEER_ICE_CONFIG }); } catch (e) { end({ ok: false, why: '建不起来' }); return; }
                    p.on('open', function () { end({ ok: true, ms: Math.round(now() - t0) }); });
                    p.on('error', function (e) { end({ ok: false, ms: Math.round(now() - t0), why: String((e && e.type) || '出错') }); });
                });
            };
            // 3、4. 探路（srflx）和中转（relay）：临时 RTCPeerConnection 收集候选地址，10 秒为限
            let ice = function () {
                return new Promise(function (resolve) {
                    let t0 = now(), got = {}, pc = null, fin = false;
                    let end = function () {
                        if (fin) return; fin = true; clearTimeout(to); try { if (pc) pc.close(); } catch (e) { }
                        set('stun', got.srflx !== undefined ? { ok: true, ms: got.srflx } : { ok: false, why: '没有返回地址' });
                        set('turn', got.relay !== undefined ? { ok: true, ms: got.relay } : { ok: false, why: '没有返回地址' });
                        resolve();
                    };
                    let to = setTimeout(end, 10000);
                    try {
                        pc = new RTCPeerConnection(PEER_ICE_CONFIG);
                        pc.createDataChannel('diag');
                        pc.onicecandidate = function (e) {
                            if (!e.candidate) { end(); return; }
                            let m = / typ (srflx|relay)/.exec(e.candidate.candidate || '');
                            if (m && got[m[1]] === undefined) got[m[1]] = Math.round(now() - t0);
                            if (got.srflx !== undefined && got.relay !== undefined) end();
                        };
                        pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).catch(end);
                    } catch (e) { end(); }
                });
            };
            signal().then(ice).then(function () { if (netDiag !== run) return; run.done = true; netDiagRender(); });
        }

        function netLeaveRoom(quiet) {
            peerWant = false;
            if (peerRetry) { clearTimeout(peerRetry); peerRetry = null; }
            netDropPeer(); peerIsHost = false;
            roomPeers = {}; roomList = []; if (dispDupRebuild([])) hubRelabel(); roomRender(); netShownCount = 0;
            if (!quiet) netSetStatus('未连接', '#999');
        }

        function netJoinFromUI() { netJoinRoom(document.getElementById('net-room').value); }

        let roomList = [];
        let roomPeers = {};
        let blazePeerChar = {};
        let roomDupId = 0;

        const ROOM_BEAT = 1200, ROOM_STALE = 5000;

        // 游玩记录：只记你自己联机时真正同房间遇到过的人（没有后端，
        // 没法知道全网谁在玩），存在本地，"游玩记录"按钮里能看、能提交给开发者。
        const PLAYLOG_SESSION_GAP = 120000;   // 断线超过这么久再见面，算重新"来玩了一次"
        let playLog = {};
        function playLogLoad() {
            try { playLog = JSON.parse(localStorage.getItem('TH_playlog') || '{}') || {}; }
            catch (e) { playLog = {}; }
        }
        function playLogSave() { try { localStorage.setItem('TH_playlog', JSON.stringify(playLog)); } catch (e) { } }
        function playLogSeen(id, stats) {
            if (!id || id === gState.id) return;
            let now = Date.now();
            let e = playLog[id];
            if (!e) { e = playLog[id] = { firstSeen: now, lastSeen: now, timesSeen: 0, stats: null }; }
            if (now - e.lastSeen > PLAYLOG_SESSION_GAP) e.timesSeen++;
            e.lastSeen = now;
            if (stats) e.stats = stats;
            playLogSave();
        }

        function roomMe() { return roomList.find(function (r) { return r.id === gState.id; }); }

        // 游玩记录：自己这份存档的小摘要，随心跳一起广播出去，让房间里的人
        // 顺手记一笔"谁玩到什么程度了"。不是完整存档，就几个数，量很小。
        function playStatsDigest() {
            return {
                mcoin: coinsOf(),
                skins: Object.keys(gState.skins || {}).length,
                eggs: eggCount(),
                nightRank: rankTierName('night'),
                blazeRank: rankTierName('blaze')
            };
        }

        function roomSelfMsg() {

            let left = null;
            if (nightMatch) {
                left = Math.max(0, NIGHT_MATCH_WAIT - (performance.now() - nightMatch.t0) / 1000);
                nightMatch.left = left;
            }
            if (mmActive) mmActive.left = Math.max(0, MM_WAIT - (performance.now() - mmActive.t0) / 1000);
            return {
                type: 'ROOM_HELLO', target: '*', sender: gState.id,
                host: peerIsHost,
                matching: !!nightMatch,
                side: nightMatch ? nightMatch.side : null,
                left: left,
                mm: mmActive ? { mode: mmActive.mode, left: mmActive.left } : null,
                bz: gState.blazeChar || 'bow',
                acc: gState.acc || null,
                face: myFace(),
                title: myTitle(),
                stats: playStatsDigest()
            };
        }

        function roomHello() { if (peerWant) bc.postMessage(roomSelfMsg()); }

        // 撞 ID 了：不帮你自动改名（容易更乱），直接把你踢出房间，
        // 让你自己回去换个 ID 再进来。
        function idConflictKick() {
            netLeaveRoom();
            showSysModal('ID 冲突', '「' + gState.id + '」有人在用了，换一个吧。', [
                { label: '换个 ID', color: '#5cb85c', onClick: function () { nav('screen-id'); } }
            ]);
        }

        function roomOnHello(m) {
            if (!m.sender) return;
            if (m.sender === gState.id) {
                // 房间里有人跟你用同一个 ID——联机的各种同步全靠 ID 认人，
                // 撞了的话谁的消息都对不上号，不能就这么留着，直接把你踢出房间，
                // 让你自己去改个 ID 再进来（不自动帮你改名，改名容易更乱）。
                if (!roomDupId) idConflictKick();
                roomDupId = performance.now();
                return;
            }
            friendSeen(m.sender);
            playLogSeen(m.sender, m.stats);
            roomPeers[m.sender] = {
                host: !!m.host, matching: !!m.matching,
                side: m.side || null,
                left: (typeof m.left === 'number') ? m.left : null,
                mm: m.mm || null,
                acc: m.acc || null,
                face: m.face || 'cat',
                title: m.title || null,
                at: performance.now()
            };
            if (m.bz) blazePeerChar[m.sender] = m.bz;
            roomSync();
        }
        // 配饰联机：跟着房间心跳（roomTick 每 1.2s 一次 roomSelfMsg）走，不用另外开消息通道——
        // 换配饰不是每帧都变的东西，几秒内同步到位就够了。查不到（对方还没发过心跳/不在房间里）
        // 就当没戴，跟本地没联机时的默认表现一致。
        function peerAccOf(id) {
            let p = roomPeers[id];
            return (p && p.acc) || null;
        }

        function roomSync() {
            let now = performance.now();
            Object.keys(roomPeers).forEach(function (id) {
                if (now - roomPeers[id].at > ROOM_STALE) { delete roomPeers[id]; voiceCleanupPeer(id); }
            });
            let ids = Object.keys(roomPeers).sort();
            roomList = ids.length
                ? [{ id: gState.id, host: peerIsHost, self: true }].concat(
                    ids.map(function (id) {
                        return { id: id, host: roomPeers[id].host };
                    }))
                : [];

            matchPool = {};
            if (nightMatch) matchPool[gState.id] = { side: nightMatch.side, left: nightMatch.left };
            ids.forEach(function (id) {
                let q = roomPeers[id];
                if (q.matching && q.side) matchPool[id] = { side: q.side, left: q.left };
            });
            // 超燃/松饼/竞速这几个通用匹配用的池子，跟上面 matchPool 是同一个思路，
            // 只是"边"（追捕/逃生）换成"模式名"——同一份房间心跳，两套匹配各取各的。
            mmRoomPool = {};
            if (mmActive) mmRoomPool[gState.id] = { mode: mmActive.mode, left: mmActive.left };
            ids.forEach(function (id) {
                let q = roomPeers[id];
                if (q.mm && q.mm.mode) mmRoomPool[id] = { mode: q.mm.mode, left: q.mm.left };
            });
            if (dispDupRebuild(roomList.map(function (r) { return r.id; }))) { if (typeof hubRelabel === 'function') hubRelabel(); }
            roomRender(); netCountSync();
            if (nightMatch) nightMatchTick();
            if (mmActive) mmTick();
            voiceMeshSync();
        }

        function roomRender() {
            let el = document.getElementById('room-list');
            if (el) {
                if (roomList.length === 0) {
                    el.innerHTML = '<li style="color:#999;">单机（没进房间）</li>';
                } else {
                    let now = performance.now();
                    el.innerHTML = roomList.map(function (r) {

                        let hb = '';
                        if (!r.self) {
                            let q = roomPeers[r.id];
                            hb = ' <span style="color:#999;">' +
                                (q ? ((now - q.at) / 1000).toFixed(1) + 's 前' : '—') + '</span>';
                        }
                        let add = (!r.self && !friends.some(function (f) { return f.id === r.id; }))
                            ? ' <a href="javascript:void(0)" onclick="friendAdd(\'' + r.id + '\')" style="color:#337ab7; font-size:12px;">加好友</a>'
                            : '';
                        let team = (!r.self && lobbyParty.indexOf(r.id) < 0)
                            ? ' <a href="javascript:void(0)" onclick="teamInvite(\'' + r.id + '\')" style="color:#00acc1; font-size:12px;">邀请组队</a>'
                            : '';
                        // 语音状态：自己看是否已经开麦参与语音，别人看跟你有没有连上通话
                        let mic = r.self
                            ? (voiceOptedIn ? ' <span style="color:#5cb85c; font-size:11px;">[语音]</span>' : '')
                            : (voiceCalls[r.id] ? ' <span style="color:#5cb85c; font-size:11px;">[语音]</span>' : '');
                        return '<li>' + dispName(r.id) + (r.self ? ' （你）' : '') + mic + hb + add + team + '</li>';
                    }).join('');
                    if (roomDupId && performance.now() - roomDupId < 8000) {
                        el.innerHTML += '<li style="color:#d9534f;">该 ID 已被占用</li>';
                    }
                }
            }
        }

        // 大厅里的"组队"：纯社交性质，不直接绑对局分队，双方都要同意才算数。
        // 走 bc 广播，同房间/同浏览器多标签页能收到；不是同一个房间的人收不到邀请。
        let lobbyParty = [];
        const PARTY_CAP = 4;   // 算上自己最多 4 个人
        function teamInvite(id) {
            if (!id || id === gState.id) return;
            if (lobbyParty.indexOf(id) >= 0) { blazeFlash('已经和 ' + dispNameText(id) + ' 组队了'); return; }
            if (lobbyParty.length >= PARTY_CAP - 1) { blazeFlash('队伍最多 ' + PARTY_CAP + ' 人，满了'); return; }
            bc.postMessage({ type: 'TEAM_INVITE', target: id, sender: gState.id });
            blazeFlash('已经向 ' + dispNameText(id) + ' 发出组队邀请，等 TA 同意');
        }
        function teamOnInviteReceived(fromId) {
            if (lobbyParty.length >= PARTY_CAP - 1) {
                bc.postMessage({ type: 'TEAM_INVITE_ACK', target: fromId, sender: gState.id, accept: false });
                showSysModal('组队邀请', dispName(fromId) + ' 邀请你组队，但你的队伍已经满了（最多 ' + PARTY_CAP + ' 人），自动拒绝了。', [{ label: '知道了' }]);
                return;
            }
            showSysModal('组队邀请', dispName(fromId) + ' 邀请你组队', [
                {
                    label: '同意', color: '#5cb85c', onClick: function () {
                        bc.postMessage({ type: 'TEAM_INVITE_ACK', target: fromId, sender: gState.id, accept: true });
                        teamAddMember(fromId);
                        blazeFlash('已经和 ' + dispNameText(fromId) + ' 组队');
                    }
                },
                {
                    label: '拒绝', onClick: function () {
                        bc.postMessage({ type: 'TEAM_INVITE_ACK', target: fromId, sender: gState.id, accept: false });
                    }
                }
            ]);
        }
        function teamOnInviteAck(fromId, accept) {
            if (accept) { teamAddMember(fromId); blazeFlash(dispNameText(fromId) + ' 同意组队了！'); }
            else blazeFlash(dispNameText(fromId) + ' 拒绝了组队邀请');
        }
        function teamAddMember(id) {
            if (lobbyParty.indexOf(id) >= 0) return;
            if (lobbyParty.length >= PARTY_CAP - 1) { blazeFlash('队伍最多 ' + PARTY_CAP + ' 人，满了'); return; }
            lobbyParty.push(id);
            teamRenderUI(); roomRender();
        }
        function teamLeaveMember(id) {
            lobbyParty = lobbyParty.filter(function (x) { return x !== id; });
            teamRenderUI(); roomRender();
        }
        function teamRenderUI() {
            let el = document.getElementById('lobby-team-list');
            if (!el) return;
            el.innerHTML = lobbyParty.length ? lobbyParty.map(function (id) {
                return '<li>' + dispName(id) + ' <a href="javascript:void(0)" onclick="teamLeaveMember(\'' + id + '\')" style="color:#d9534f; font-size:11px;">离队</a></li>';
            }).join('') : '<li style="color:#999;">还没组队</li>';
        }
        // 第一次点：要一次麦克风权限，权限给了才真的接入语音（voiceOptedIn）。
        // 之后再点就是单纯静音/取消静音，不用重新要权限、也不用断线重连——
        // 静音只是把本地音轨关掉，通话还开着，照样听得见别人。
        function lobbyToggleMic() {
            let b = document.getElementById('lobby-mic-btn');
            if (localMicStream) {
                gState.micOn = !gState.micOn;
                localMicStream.getAudioTracks().forEach(function (t) { t.enabled = gState.micOn; });
                if (b) { b.innerText = gState.micOn ? '麦克风：开' : '麦克风：关'; b.style.background = gState.micOn ? '#c8e6c9' : '#eceff1'; }
                return;
            }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showSysModal('提示', '这个设备/浏览器不支持麦克风', [{ label: '知道了' }]);
                return;
            }
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
                localMicStream = stream;
                voiceOptedIn = true;
                gState.micOn = true;
                if (b) { b.innerText = '麦克风：开'; b.style.background = '#c8e6c9'; }
                voiceMeshSync();
            }).catch(function () {
                showSysModal('提示', '没拿到麦克风权限，检查一下浏览器/系统设置', [{ label: '知道了' }]);
            });
        }
        // 松饼大作战、惊魂夜自己已经有"大家一起"的联机流程（邀请全票通过 / 排队匹配），
        // 不用房主批准。剩下这几个模式还是各玩各的本地对局：只有真组了队才要看房主
        // 脸色——大厅默认自动进同一个房间，"房间里有人"不代表在跟你一队，不能只因为
        // 房间里有别人（可能完全不相干）就不让你自己开一局。
        // 联机惊魂夜中途回大厅的人：队友那局还在打，你还是房主/队伍还在，只是得等他们打完才能一起开下一局
        let nightAway = null;
        function nightAwayActive() {
            if (nightAway && performance.now() > nightAway.until) nightAway = null;
            return !!nightAway;
        }
        function lobbyPrimaryStart() {
            let m = gState.gameMode;
            if (nightAwayActive() && lobbyParty.length > 0) {
                let min = Math.max(1, Math.ceil((nightAway.until - performance.now()) / 60000));
                showSysModal('队友还在打惊魂夜', '等他们打完再开，大概还要 ' + min + ' 分钟。', [{ label: '知道了' }]);
                return;
            }
            if (m !== 'night' && m !== 'cake' && lobbyParty.length > 0 && !peerIsHost) {
                lobbySuggestModeToHost(m);
                return;
            }
            if (m === 'hunt') requestStartGame();
            else if (m === 'night') enterNightMatch('survivor');
            else if (m === 'blaze') blazeUnifiedStart();
            else if (m === 'race') raceStartGo();
            else if (m === 'jail') jailStartGo();
            else if (m === 'dodge') dodgeStartGo(false);
            else if (m === 'escape') escapeStartGo();
            else if (m === 'park') parkBegin(PARK_BUILTIN.easy);
            else if (m === 'cake') cakeStartGo();
            else if (m === 'sumo' || m === 'paint') nmStartGo(m);
            else if (m === 'tower') nmStartGo('tower', { kind: 'solo' });
        }

        function lobbySuggestModeToHost(mode) {
            let hostEntry = roomList.filter(function (r) { return r.host; })[0];
            let modeName = (FEEDBACK_MODES.filter(function (p) { return p[0] === mode; })[0] || [mode, mode])[1];
            bc.postMessage({ type: 'MODE_SUGGEST', target: hostEntry ? hostEntry.id : '*', sender: gState.id, mode: mode, modeName: modeName });
            blazeFlash('已经告诉房主你想玩"' + modeName + '"了');
        }
        function lobbyOnModeSuggest(m) {
            if (!peerIsHost || !m.sender || m.sender === gState.id) return;
            if (m.target !== '*' && m.target !== gState.id) return;
            showSysModal('模式推荐', dispName(m.sender) + ' 推荐游戏模式：' + chatEscape(m.modeName || m.mode || ''), [
                { label: '切换到这个模式', color: '#5cb85c', onClick: function () { selectGameMode(m.mode); } },
                { label: '知道了' }
            ]);
        }

        let friends = [];

        function friendLoad() {
            try { friends = JSON.parse(localStorage.getItem('TH_friends') || '[]') || []; }
            catch (e) { friends = []; }
            friendRender();
        }
        function friendSave() {
            try { localStorage.setItem('TH_friends', JSON.stringify(friends)); } catch (e) { }
        }
        function friendAdd(id) {
            let el = document.getElementById('friend-name');
            let name = sanitizeId((id || (el ? el.value : '')).trim());
            if (!name) { showSysModal('提示', '先填对方的 ID', [{ label: '确定' }]); return; }
            if (name === gState.id) { showSysModal('提示', '不用加自己', [{ label: '确定' }]); return; }
            let f = friends.find(function (x) { return x.id === name; });
            if (!f) { friends.push({ id: name, room: '', at: Date.now() }); }
            if (el && !id) el.value = '';
            friendSave(); friendRender();
        }
        function friendRemove(id) {
            friends = friends.filter(function (x) { return x.id !== id; });
            friendSave(); friendRender();
        }
        function friendJoin(id) {
            let f = friends.find(function (x) { return x.id === id; });
            if (!f || !f.room) { showSysModal('提示', '还不知道他在哪个房间，下次一起进过房间就知道了', [{ label: '确定' }]); return; }
            let el = document.getElementById('net-room');
            if (el) el.value = f.room;
            netJoinRoom(f.room);
        }

        function friendSeen(id) {
            if (!id || !peerRoom) return;
            let f = friends.find(function (x) { return x.id === id; });
            if (!f) return;
            if (f.room !== peerRoom) { f.room = peerRoom; f.at = Date.now(); friendSave(); friendRender(); }
        }
        // 羁绊：跟同一个好友同房间打得越久，攒得越多，够档位在全模式（除惊魂夜外）
        // 给点跑速加成——不用另外发明一套复杂系统，直接借用「每日效果」那几个
        // 挂速度乘数的口子就够了。
        const BOND_TIER_NAME = ['', '青铜羁绊', '白银羁绊', '黄金羁绊'];
        const BOND_TIER_COLOR = ['', '#cd7f32', '#9e9e9e', '#e6a817'];
        function bondTier(xp) { xp = xp || 0; return xp >= 40 ? 3 : xp >= 15 ? 2 : xp >= 5 ? 1 : 0; }
        function bondBestTierInRoom() {
            let best = 0;
            friends.forEach(function (f) { if (roomPeers[f.id]) best = Math.max(best, bondTier(f.bondXp)); });
            return best;
        }
        function bondSpeedMul() { return 1 + bondBestTierInRoom() * 0.03; }
        function bondTick() {
            if (!chatIsActive()) return;
            let changed = false;
            friends.forEach(function (f) {
                if (!roomPeers[f.id]) return;
                f.bondXp = (f.bondXp || 0) + 1;
                changed = true;
            });
            if (changed) { friendSave(); friendRender(); }
        }
        setInterval(bondTick, 30000);   // 每 30 秒，同房间还在一起打的好友各 +1 点羁绊

        function friendRender() {
            let el = document.getElementById('friend-list');
            if (!el) return;
            if (!friends.length) { el.innerHTML = '<li style="color:#999;">还没有好友</li>'; return; }
            el.innerHTML = friends.map(function (f) {
                let here = roomPeers[f.id] ? '<span style="color:#5cb85c;">（在这个房间）</span>' : '';
                let tier = bondTier(f.bondXp);
                let bond = tier > 0 ? '<span style="color:' + BOND_TIER_COLOR[tier] + ';">［' + BOND_TIER_NAME[tier] + '］</span> ' : '';
                let join = f.room
                    ? '<a href="javascript:void(0)" onclick="friendJoin(\'' + f.id + '\')" style="color:#337ab7;">进房间 ' + f.room + '</a>　'
                    : '<span style="color:#999;">房间未知　</span>';
                return '<li>' + bond + dispName(f.id) + ' ' + here + '<br>' + join +
                    '<a href="javascript:void(0)" onclick="friendRemove(\'' + f.id + '\')" style="color:#d9534f;">删除</a></li>';
            }).join('');
        }

        function roomTick() {
            if (!peerWant) return;
            bc.postMessage(roomSelfMsg());
            roomSync();
        }
        setInterval(roomTick, ROOM_BEAT);

        let idCheckTimeout = null; let networkTimeout = null; let pendingIdCheck = '';

        const itemPool = {
            purple: [{ n: "彩窗圆盘", v: 10000, w: 3, tex: 'disc', c: 0x9c27b0 }, { n: "镀金怀表", v: 12000, w: 5, tex: 'watch', c: 0x9c27b0 }, { n: "水晶沙漏", v: 15000, w: 8, tex: 'glass', c: 0x9c27b0 }, { n: "猫盾", v: 15000, w: 1, tex: 'cat_shield', c: 0x9c27b0 }, { n: "猫盾", v: 15000, w: 1, tex: 'cat_shield', c: 0x9c27b0 }, { n: "猫盾", v: 15000, w: 1, tex: 'cat_shield', c: 0x9c27b0 }, { n: "小鱼干", v: 10000, w: 1, tex: 'fish_chip', c: 0x9c27b0 }, { n: "小鱼干", v: 10000, w: 1, tex: 'fish_chip', c: 0x9c27b0 }, { n: "小鱼干", v: 10000, w: 1, tex: 'fish_chip', c: 0x9c27b0 }],
            // 黄金猫盾不在这个池子里——它是配方 gcat（猫盾+小鱼干）的合成产物，跟至臻
            // 猫盾/丰饶圣餐/猫盾骑士剑/皇冠一样，只能合成，宝箱/保险柜不会直接开出来。
            // 之前它跟黄金小鱼干一样也在池子里放了 3 份，等于宝箱+合成两条路都能拿，
            // 而猫盾/小鱼干两样原料又是紫色池子里最常见的东西，导致黄金猫盾比黄金
            // 小鱼干好拿得多（反馈：一局合出 5 个黄金猫盾，一个黄金小鱼干都没见到）。
            gold: [{ n: "黄金书", v: 30000, w: 3, tex: 'book', c: 0xffeb3b }, { n: "金苹果", v: 50000, w: 2, tex: 'apple', c: 0xffeb3b }, { n: "黄金圣杯", v: 60000, w: 4, tex: 'cup', c: 0xffeb3b }, { n: "黄金小鱼干", v: 50000, w: 1, tex: 'fish_chip', c: 0xffeb3b }, { n: "黄金小鱼干", v: 50000, w: 1, tex: 'fish_chip', c: 0xffeb3b }, { n: "黄金小鱼干", v: 50000, w: 1, tex: 'fish_chip', c: 0xffeb3b }, { n: "外星信号接收器", v: 30000, w: 2, tex: 'signal', c: 0xffeb3b, type: 'signal', uses: 1, maxUses: 1 }],
            ultra: [{ n: "凤凰金雕", v: 200000, w: 10, tex: 'statue', c: 0xffb300 }, { n: "骑士团圣剑", v: 400000, w: 5, tex: 'sword', c: 0xffb300, type: 'wep', dmg: 100 }, { n: "星光圣诞树", v: 600000, w: 3, tex: 'tree', c: 0xffb300 }, { n: "皇家马车", v: 2026888, w: 1, tex: 'carriage', c: 0xff6b6b, type: 'carriage' }],
            god: [{ n: "帝王翡翠", v: 800000, w: 3, tex: 'jade', c: 0x00e676 }, { n: "王权之心", v: 1000000, w: 4, tex: 'heart', c: 0xff1744 }, { n: "eggy金条", v: 200000, w: 10, tex: 'statue', c: 0xffb300 }, { n: "永恒誓言", v: 2000000, w: 1, tex: 'heart', c: 0xffffff, type: 'amulet' }, { n: "时空沙漏", v: 1000000, w: 4, tex: 'glass', c: 0x00ffff, type: 'time_stop', uses: 3, maxUses: 3 }]
        };

        // H12：保底局简单图的大金概率倍数（buildProceduralMaze 里定，H13 的大金概率常量乘上它）
        let huntPityMul = 1;
        function huntHasHumanMates() { return (gState.team || []).some(function (m) { return m && !m.isAI && m.id !== gState.id; }); }
        function huntPityActive() { return !!(gState.isFirstRound || gState.pityGuaranteed) && !huntHasHumanMates(); }
        function ultraNoCarriage() { return itemPool.ultra.filter(function (u) { return u.type !== 'carriage'; }); }

        // ── 开箱抽奖（H13）──
        // 「大金」= itemPool.ultra + itemPool.god。先按下面的概率定出不出大金，出就从这个箱子原来能开出的
        // 大金里等概率抽（各档内部比例跟以前一样），不出就从原来的其余物品里抽。
        // 每张图大金最多 HUNT_BIG_CAP 个：保险柜、各个箱子、信号接收器生成的都算，合成的不算；到上限改出金色一档。
        // 为了多人时各端一致，所有箱子里是什么、每个队员的信号接收器会生成什么，造图时就用种子定好
        // （huntAssignLoot），开箱时直接拿，不再临时抽。
        const HUNT_BIG_P = { wood: 0.01, silver: 0.04, gold: 0.10 };
        const HUNT_SIGNAL_BIG_P = 0.10;
        const HUNT_BIG_CAP = 4;
        const HUNT_SIGNAL_SLOTS = 10;   // 每个队员这一局最多用几次信号接收器（预先抽好）
        let huntBigLeft = HUNT_BIG_CAP, huntSignalLoot = [];
        function huntIsBig(it) { return !!it && (itemPool.ultra.indexOf(it) >= 0 || itemPool.god.indexOf(it) >= 0); }
        function huntBigPool(boxType) {
            if (boxType === 'safe') return gState.mapDifficulty === 'hard' ? itemPool.god : gState.mapDifficulty === 'med' ? itemPool.ultra : ultraNoCarriage();
            if (boxType === 'wood') return [itemPool.ultra[0]];
            if (boxType === 'silver') return itemPool.ultra.slice(0, 3);
            if (boxType === 'gold') return itemPool.ultra.filter(function (u) { return u.v <= 1000000; });
            return ultraNoCarriage();
        }
        function huntTakeBig(pool, pick) {
            if (huntBigLeft > 0) { huntBigLeft--; return pick(pool); }
            return pick(itemPool.gold);   // 这张图的大金用完了，改出金色一档
        }
        function huntRollChest(boxType, rnd) {
            rnd = rnd || Math.random;
            let pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
            if (boxType === 'safe') return huntTakeBig(huntBigPool('safe'), pick);
            if (rnd() < (HUNT_BIG_P[boxType] || 0) * huntPityMul) return huntTakeBig(huntBigPool(boxType), pick);
            // 宝石：少量、值钱的金色收藏品
            if (rnd() < 0.034) return pick(HUNT_GEMS.map(huntGemItem));
            // 王冠底座：只这里出，保险柜里永远没有
            if (rnd() < 0.02) return crownBaseItem();
            if (boxType === 'wood' || boxType === 'silver') return pick([...itemPool.purple, ...itemPool.gold]);
            if (boxType === 'gold') return pick([...itemPool.gold]);
            return null;
        }
        function huntRollSignal(rnd) {
            let pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
            if (rnd() < HUNT_SIGNAL_BIG_P * huntPityMul) return huntTakeBig(ultraNoCarriage(), pick);
            return rnd() < 0.6 / 0.9 ? pick(itemPool.purple) : pick(itemPool.gold);
        }
        // 造图时把所有箱子的东西和每个队员的信号接收器奖励定好。保险柜先抽（保底局必出的那个一定是大金），
        // 再按生成顺序抽箱子，最后按队员轮流抽信号奖励。boxes 是带 userData.type 的箱子列表。
        function huntAssignLoot(boxes, rnd, teamSize) {
            huntBigLeft = HUNT_BIG_CAP;
            let order = boxes.filter(function (c) { return c.userData.type === 'safe'; }).concat(boxes.filter(function (c) { return c.userData.type !== 'safe'; }));
            order.forEach(function (c) { c.userData.loot = huntRollChest(c.userData.type, rnd); });
            huntSignalLoot = [];
            for (let k = 0; k < teamSize; k++) huntSignalLoot.push([]);
            for (let n = 0; n < HUNT_SIGNAL_SLOTS; n++) for (let k = 0; k < teamSize; k++) huntSignalLoot[k].push(huntRollSignal(rnd));
        }
        // 箱子里的东西：造图时定好的；万一没有（不该发生）就现抽一个不占上限的
        function huntChestLoot(c) {
            if (c.userData.loot !== undefined) return c.userData.loot;
            let keep = huntBigLeft; huntBigLeft = 0; let it = huntRollChest(c.userData.type, Math.random); huntBigLeft = keep; return it;
        }

        // 王冠底座：只从普通箱子里开得出来，保险柜不出。
        // 它本身不值钱，值钱的是它能拼出什么。
        function crownBaseItem() {
            return { n: '王冠底座', v: 30000, w: 3, tex: 'disc', c: 0xb8860b, type: 'base', sock: {} };
        }
        const CROWN_BASE_V = 30000, CROWN_GEM_MUL = 1.5, CROWN_FULL_V = 2000000;

        function crownSockCount(it) {
            let n = 0; HUNT_GEMS.forEach(function (g) { if (it.sock && it.sock[g.id]) n++; });
            return n;
        }
        function crownSockFull(it) { return crownSockCount(it) >= HUNT_GEMS.length; }

        // 把一颗宝石镶到底座上。镶满六颗，底座本身就变成皇冠。
        // 地上合成和仓库里镶嵌走的是同一个函数。
        function crownSocketGem(base, gemId) {
            if (!base || base.type !== 'base') return false;
            let g = HUNT_GEMS.filter(function (q) { return q.id === gemId; })[0];
            if (!g || (base.sock && base.sock[gemId])) return false;
            base.sock = base.sock || {};
            base.sock[gemId] = 1;
            base.v = Math.round(CROWN_BASE_V + HUNT_GEMS.reduce(function (sum, q) {
                return sum + (base.sock[q.id] ? q.v * CROWN_GEM_MUL : 0);
            }, 0));
            if (crownSockFull(base)) {
                base.n = '皇冠'; base.v = CROWN_FULL_V; base.w = 4;
                base.tex = 'cup'; base.c = 0xffd54f; base.type = undefined;
                huntFindRecipe('crown');
            } else {
                base.n = '王冠底座（' + crownSockCount(base) + '/' + HUNT_GEMS.length + '）';
            }
            return true;
        }

        // 六颗稀有宝石：当金色物品掉，各自有一条藏品记录
        const HUNT_GEMS = [
            { id: 'ruby', n: '红榴石', c: 0xe53935, v: 50000 },
            { id: 'sapph', n: '深海蓝晶', c: 0x1e88e5, v: 60000 },
            { id: 'emer', n: '苔藓翠玉', c: 0x43a047, v: 72000 },
            { id: 'amet', n: '黄昏紫晶', c: 0x8e24aa, v: 86000 },
            { id: 'amber', n: '虫琥珀', c: 0xfb8c00, v: 104000 },
            { id: 'moon', n: '月光石', c: 0xb0bec5, v: 130000 }
        ];
        function huntGemItem(g) {
            // gold:true —— 跟黄金书那一批同级的金色物品
            return { n: g.n, v: g.v, w: 1, tex: 'jade', c: g.c, type: 'gem', gem: g.id, gold: true };
        }

        const shopItems = { '医疗包': { n: '医疗包', v: 10000, w: 2, tex: 'med', c: 0xffaaaa, uses: 5, maxUses: 5, type: 'med', isShop: true }, '鱼叉': { n: '鱼叉', v: 25000, w: 5, tex: 'wep', c: 0xaaaaaa, type: 'wep', dmg: 5, isShop: true }, '腰包': { n: '腰包', v: 40000, w: 4, tex: 'pouch', c: 0xd35400, type: 'backpack_ext', isShop: true }, '返魂药水': { n: '返魂药水', v: 10000, w: 1, tex: 'revive', c: 0x5500ff, type: 'revive', isShop: true }, '肾上腺素': { n: '肾上腺素', v: 20000, w: 1, tex: 'stim', c: 0xff5555, uses: 3, type: 'stim', isShop: true },
            '地窖徽章': { n: '地窖徽章', v: 0, w: 1, tex: 'badge', c: 0x8e44ad, uses: 1, maxUses: 1, type: 'badge', isShop: true, repairCost: 45000, price: 900000 } };
        const BADGE_REPAIR_COST = 45000;

        let initArr = new Array(6).fill(null); initArr[0] = { ...shopItems['鱼叉'] }; initArr[1] = { ...shopItems['地窖徽章'] };
        const gState = {
            control: 'laptop', char: 'green', id: '', money: 10000, team: [], aiFill: false, runCash: 0, aiSubmitted: 0, aiChestsTaken: 0, blazeChar: 'bow', mouseSensitivity: 1,
            mcoin: 0, skins: {}, skinColor: null, acc: { head: null, waist: null }, ownedAcc: {}, parkUnlocked: {}, owned: {}, streak: { hunt: 0, night: 0, blaze: 0 }, checkinStreak: 0, checkinLastDay: -1, inv: initArr, garage: new Array(200).fill(null),
            maxInv: 6, hp: 100, maxHp: 100, isDead: false, selectedContainer: 'inv', selectedSlot: 0, totalSubmitted: 0,
            backpackOpen: false, largeMapOpen: false, inSafeZone: true, needsLock: false, pAtkCd: 0, timeStop: 0, preGenSpawns: [],
            mapDifficulty: 'easy', extractTarget: 140000, gameMode: 'hunt',
            hasLeft: false, deathPos: null, spectating: null, spectateIdx: -1, peerState: {},
            signal: { active: false, timer: 0, mesh: null },
            machines: [], chairs: [], doors: [], pallets: [], nightChar: 'cat',
            debuff: { type: 0, timer: 0, cooldown: 0 },
            matchHistory: [], pityGuaranteed: false, isFirstRound: true
        };

        const mapConfigs = {

            easy: { extr: 140000, gold: 2, silver: 4, wood: 3, hasGoldShop: false, hasSafe: false, hasTables: true, mobs: [1, 2] },
            med: { extr: 170000, gold: 3, silver: 5, wood: 3, hasGoldShop: true, hasSafe: false, hasTables: false, mobs: [1, 2, 3, 4] },
            hard: { extr: 200000, gold: 4, silver: 6, wood: 3, hasGoldShop: false, hasSafe: true, hasTables: false, mobs: [1, 2, 5] }
        };

        let currentNavPath = []; const FLOORS = 3;

        const MOB_WAVES_AT = [10 * 3600, 12 * 3600, 14 * 3600];

        // 存档格式版本：改了货币结构（金币/通用币合并成猫盾币）之后老存档字段对不上号，
        // 干脆整个当成没存过档处理，重新按新玩家初始化——反正现在还没人正经玩，不用做兼容迁移。
        const SAVE_VER = 2;
        function saveProgress() {
            if (!gState.id) return;
            const data = { ver: SAVE_VER, money: gState.money, inv: gState.inv, garage: gState.garage, isFirstRound: gState.isFirstRound, pityGuaranteed: gState.pityGuaranteed, matchHistory: gState.matchHistory, nightHistory: gState.nightHistory, nightFriendlyStreak: gState.nightFriendlyStreak, mcoin: gState.mcoin, skins: gState.skins, skinColor: gState.skinColor, acc: gState.acc, ownedAcc: gState.ownedAcc, parkUnlocked: gState.parkUnlocked, owned: gState.owned, streak: gState.streak, checkinStreak: gState.checkinStreak, checkinLastDay: gState.checkinLastDay, shop: gState.shop, rank: gState.rank, recipes: gState.recipes, raceRec: gState.raceRec, escProg: gState.escProg, dailyWin: gState.dailyWin, towerBest: gState.towerBest, escDaily: gState.escDaily, escDraft: gState.escDraft, ach: gState.ach, title: gState.title, titles: gState.titles, parkDraft: gState.parkDraft, parkDraftName: gState.parkDraftName, parkRefunded: gState.parkRefunded, introSeen: gState.introSeen, modeIntroShown: gState.modeIntroShown, huntRunActive: !!gState.huntRunActive, badgeGiven: !!gState.badgeGiven, huntTutorialShown: !!gState.huntTutorialShown, weightWarnShown: !!gState.weightWarnShown, skinPity: gState.skinPity || 0, blazeChar: gState.blazeChar || 'bow' };
            try { localStorage.setItem('TH_save_' + gState.id, JSON.stringify(data)); } catch (e) { }
        }

        function loadProgress(pid) {
            try {
                const saved = localStorage.getItem('TH_save_' + pid);
                if (saved) {
                    const data = JSON.parse(saved);
                    if (data.ver === SAVE_VER) {
                        gState.money = data.money; gState.inv = data.inv; gState.garage = data.garage || new Array(200).fill(null); gState.isFirstRound = data.isFirstRound; gState.pityGuaranteed = data.pityGuaranteed; gState.matchHistory = data.matchHistory || []; gState.nightHistory = data.nightHistory || []; gState.nightFriendlyStreak = data.nightFriendlyStreak || 0; gState.mcoin = data.mcoin || 0; gState.skins = data.skins || {}; gState.skinColor = data.skinColor || null; gState.parkUnlocked = data.parkUnlocked || {}; gState.owned = data.owned || {}; gState.streak = data.streak || { hunt: 0, night: 0, blaze: 0 }; gState.acc = migrateAccData(data.acc); gState.ownedAcc = data.ownedAcc || {}; gState.checkinStreak = data.checkinStreak || 0; gState.checkinLastDay = (data.checkinLastDay === undefined) ? -1 : data.checkinLastDay; gState.recipes = data.recipes || {}; gState.raceRec = data.raceRec || {}; gState.escProg = data.escProg || null;
                        gState.dailyWin = data.dailyWin || {}; gState.towerBest = data.towerBest || 0; gState.escDaily = data.escDaily || null; gState.escDraft = data.escDraft || null; gState.ach = data.ach || null; gState.title = data.title || null; gState.titles = data.titles || {}; gState.parkDraft = data.parkDraft || null; gState.parkDraftName = data.parkDraftName || ''; gState.parkRefunded = !!data.parkRefunded; gState.introSeen = data.introSeen || {}; gState.modeIntroShown = data.modeIntroShown || {}; gState.huntRunActive = !!data.huntRunActive; gState.badgeGiven = !!data.badgeGiven; gState.huntTutorialShown = !!data.huntTutorialShown; gState.weightWarnShown = !!data.weightWarnShown; gState.skinPity = data.skinPity || 0; gState.blazeChar = data.blazeChar || 'bow';
                        gState.shop = data.shop || null; gState.rank = data.rank || null;
                        expandInventory(); grantBadgeIfMissing();
                        if (gState.huntRunActive) huntRunAbandoned();
                        return;
                    }
                    // 版本对不上：老存档，忽略，走下面全新初始化
                }
            } catch (e) { }
            gState.money = 10000; gState.inv = new Array(6).fill(null); gState.inv[0] = { ...shopItems['鱼叉'] }; gState.inv[1] = { ...shopItems['地窖徽章'] }; gState.garage = new Array(200).fill(null); gState.isFirstRound = true; gState.pityGuaranteed = false; gState.matchHistory = []; gState.nightHistory = []; gState.nightFriendlyStreak = 0;
            gState.mcoin = 0; gState.skins = {}; gState.skinColor = null; gState.acc = { head: null, waist: null }; gState.ownedAcc = {}; gState.escProg = null; gState.parkUnlocked = {}; gState.owned = {}; gState.streak = { hunt: 0, night: 0, blaze: 0 }; gState.checkinStreak = 0; gState.checkinLastDay = -1;
            gState.dailyWin = {}; gState.towerBest = 0; gState.escDaily = null; gState.escDraft = null; gState.ach = null; gState.title = null; gState.titles = {}; gState.parkDraft = null; gState.parkDraftName = ''; gState.parkRefunded = false; gState.introSeen = {}; gState.modeIntroShown = {}; gState.huntRunActive = false; gState.badgeGiven = true; gState.huntTutorialShown = false; gState.weightWarnShown = false; gState.skinPity = 0;
            expandInventory();
        }

        // 寻宝队进图时存档里记着"对局进行中"，结算时清掉（H5）。读档时还在，说明上次没结算就关了页面/刷新了：
        // 按撤离失败算，背包清空，这局的东西都不留，弹一次说明。不靠 beforeunload（手机上经常不触发）。
        function huntRunAbandoned() {
            gState.huntRunActive = false;
            gState.matchHistory = gState.matchHistory || [];
            gState.matchHistory.push(false); if (gState.matchHistory.length > 10) gState.matchHistory.shift();
            if (huntConsecutiveFails() >= 5) gState.pityGuaranteed = true;
            gState.inv = new Array(INV_BASE).fill(null); expandInventory();
            saveProgress();
            introPush('上一局没撤出去', '<div style="text-align:left; font-size:14px; line-height:1.75;">上次寻宝队没撤出去就离开了，按撤离失败算：背包里的东西都没了。</div>');
        }

        // 地窖徽章只白送一次（H6）：存档记 badgeGiven。旧存档已经有徽章就直接记为送过，没有的补一个再记。
        // 之后丢了（撤离失败）就得去商店买。
        function grantBadgeIfMissing() {
            if (gState.badgeGiven) return;
            let has = gState.inv.some(function (i) { return i && i.type === 'badge'; }) || gState.garage.some(function (g) { return g && g.type === 'badge'; });
            if (!has) {
                let slot = gState.inv.findIndex(function (i) { return i === null; });
                if (slot !== -1) gState.inv[slot] = { ...shopItems['地窖徽章'] };
                else { let g = gState.garage.findIndex(function (i) { return i === null; }); if (g !== -1) gState.garage[g] = { ...shopItems['地窖徽章'] }; else return; }
            }
            gState.badgeGiven = true; saveProgress();
        }

        // A2：开局消息只有这几种情况才接：
        //   发送者是我当前（或刚结束、结算框还没关）这一局的房主——密室「下一关 / 再玩一次」；
        //   我没在打别的局（正在打的不拆），并且：发送者在我的队伍里 / 我正在排这个模式 / 60 秒内同意过他的松饼邀请。
        let cakeAcceptAt = {};
        function netGameHostOf(mode) {
            if (mode === 'blaze') return blaze ? blaze.host : null;
            if (mode === 'race') return race ? race.host : null;
            if (mode === 'jail') return jail ? jail.hostId : null;
            if (mode === 'dodge') return dodge ? dodge.hostId : null;
            if (mode === 'escape') return escapeRoom ? escapeRoom.hostId : null;
            if (mode === 'cake') return cake ? cake.host : null;
            if (nm && nm.mode === mode) return nm.host;
            return null;
        }
        function netStartAllowed(mode, m) {
            let s = m && m.sender;
            if (!s || s === gState.id) return false;
            let h = netGameHostOf(mode);
            if (h && h === s) return true;
            let k = chatActiveModeKey();
            if ((k && k !== 'hub') || isPlaying) return false;
            if (lobbyParty.indexOf(s) >= 0) return true;
            if (mmActive && (mmActive.mode === mode || (mode === 'blaze' && mmActive.mode === 'blazeffa'))) return true;
            if (mode === 'night' && nightMatch) return true;
            if (mode === 'cake' && cakeAcceptAt[s] && performance.now() - cakeAcceptAt[s] < 60000) return true;
            return false;
        }
        // A1：所有联机消息进来先把身份类字段里的 HTML 特殊字符去掉（跟 sanitizeId 一样的规则）。
        // 只洗 ID，不递归洗所有字符串——ESC_START 之类的消息里带着关卡数据。
        function netScrubIds(m) {
            if (!m || typeof m !== 'object') return m;
            ['sender', 'target', 'to', 'host', 'id'].forEach(function (k) {
                if (m[k] !== undefined && m[k] !== null && typeof m[k] !== 'boolean') m[k] = sanitizeId(m[k]);
            });
            ['plan', 'team'].forEach(function (k) {
                if (!Array.isArray(m[k])) return;
                m[k].forEach(function (q) { if (q && typeof q === 'object' && q.id !== undefined && q.id !== null) q.id = sanitizeId(q.id); });
            });
            if (Array.isArray(m.ids)) m.ids = m.ids.map(sanitizeId);
            if (m.sides && typeof m.sides === 'object') {
                let clean = {};
                Object.keys(m.sides).forEach(function (k) { clean[sanitizeId(k)] = m.sides[k]; });
                m.sides = clean;
            }
            return m;
        }
        bc.onmessage = function (ev) {
            let msg = netScrubIds(ev.data);
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'CHECK_ID') {
                if (gState.id === msg.id) { bc.postMessage({ type: 'ID_CONFLICT', target: '*' }); }
            } else if (msg.type === 'ID_CONFLICT') {
                if (pendingIdCheck) { clearTimeout(idCheckTimeout); pendingIdCheck = ''; showSysModal('错误', '该 ID 已被占用', [{ label: '确定' }]); }
            } else if (msg.type === 'POS_SYNC') {
                if (msg.sender !== gState.id && entities) {
                    let p = entities.find(e => e.userData.type === 'ai' && e.userData.name === msg.sender);
                    if (p) { p.position.x = msg.x; p.position.y = msg.y; p.position.z = msg.z; p.userData.isRealPlayer = true; p.userData.lastSync = performance.now(); if (p.userData.aiTakeover) { p.userData.aiTakeover = false; gState.peerState[msg.sender] = 'active'; } }
                }
            } else if (msg.type === 'CHEST_OPENED') {
                let chest = chests.find(c => Math.floor(c.position.x / TILE) === msg.cx && Math.floor(c.position.z / TILE) === msg.cz && Math.floor(c.position.y / TILE) === msg.cf);
                if (chest && !chest.userData.opened) { chest.userData.opened = true; chest.material.color.setHex(0x1a1a1a); }
            } else if (msg.type === 'PLAYER_DOWN' || msg.type === 'PLAYER_LEFT' || msg.type === 'PLAYER_REVIVED') {
                if (msg.sender !== gState.id) {
                    gState.peerState[msg.sender] = msg.type === 'PLAYER_DOWN' ? 'down' : (msg.type === 'PLAYER_LEFT' ? 'left' : 'active');
                    if (msg.type === 'PLAYER_LEFT' && msg.alive && isPlaying) huntPeerToAi(msg.sender, msg.extracted ? ' 撤离了' : ' 离开了');
                    if (msg.type === 'PLAYER_LEFT' && !isPlaying) huntDropFromTeam(msg.sender);
                    updateDeathWaitStatus();
                }
            } else if (msg.type === 'ROOM_HELLO') {
                roomOnHello(msg);
            } else if (msg.type === 'MATCH_LEAVE') {
                if (msg.sender !== gState.id) { delete roomPeers[msg.sender]; roomSync(); }
            } else if (msg.type === 'START_NIGHT') {

                let mine = msg.sides ? msg.sides[gState.id] : msg.side;

                if (mine && netStartAllowed('night', msg)) {
                    nightCancelMatch(); matchPool = {};
                    netMatchSetup(msg.sides, msg.host);
                    startNightFromNet(msg.seed, msg.variant, mine);
                }
            } else if (msg.type === 'BZ_CHAR') {
                if (msg.sender !== gState.id) blazePeerChar[msg.sender] = msg.key;
            } else if (msg.type === 'BZ_START') {
                if (msg.sender !== gState.id) blazeOnStart(msg);
            } else if (msg.type === 'BZ_ME') {
                blazeOnMe(msg);
            } else if (msg.type === 'BZ_W') {
                blazeOnWorld(msg);
            } else if (msg.type === 'BZ_EV') {
                blazeOnEv(msg);
            } else if (msg.type === 'RACE_START') {
                if (msg.sender !== gState.id) raceOnStart(msg);
            } else if (msg.type === 'RACE_ROUND') {
                raceOnRound(msg);
            } else if (msg.type === 'RACE_ME') {
                raceOnMe(msg);
            } else if (msg.type === 'RACE_FINISH') {
                raceOnFinish(msg);
            } else if (msg.type === 'RACE_RESULT') {
                raceOnResult(msg);
            } else if (msg.type === 'RACE_RESULT_DUO') {
                raceOnResultDuo(msg);
            } else if (msg.type === 'ESC_START') {
                if (msg.sender !== gState.id) escapeOnStart(msg);
            } else if (msg.type === 'ESC_ME') {
                escapeOnMe(msg);
            } else if (msg.type === 'ESC_AI') {
                escapeOnAi(msg);
            } else if (msg.type === 'ESC_EV') {
                escapeOnEv(msg);
            } else if (msg.type === 'JAIL_START') {
                if (msg.sender !== gState.id) jailOnStart(msg);
            } else if (msg.type === 'JAIL_ME') {
                jailOnMe(msg);
            } else if (msg.type === 'JAIL_W') {
                jailOnW(msg);
            } else if (msg.type === 'JAIL_EV') {
                jailOnEv(msg);
            } else if (msg.type === 'DODGE_START') {
                if (msg.sender !== gState.id) dodgeOnStart(msg);
            } else if (msg.type === 'DODGE_ME') {
                dodgeOnMe(msg);
            } else if (msg.type === 'DODGE_W') {
                dodgeOnW(msg);
            } else if (msg.type === 'DODGE_EV') {
                dodgeOnEv(msg);
            } else if (msg.type === 'NCHAR') {
                netOnChar(msg);
            } else if (msg.type === 'NS_ME') {
                netOnSelfState(msg);
            } else if (msg.type === 'NS_W') {
                netOnWorld(msg);
            } else if (msg.type === 'NEV') {
                netOnEvent(msg);
            } else if (msg.type === 'NIGHT_DONE') {
                if (nightAway && msg.sender !== gState.id) { nightAway = null; if (hub) blazeFlash('队友打完了，可以开了'); }
            } else if (msg.type === 'CHAT') {
                if (msg.sender !== gState.id) {

                    let mySide = night ? night.side : null;
                    let sideOk = !msg.side || !mySide || msg.side === mySide;
                    let chanOk = msg.channel === 'friend' ? (msg.target === gState.id)
                        : msg.channel === 'team' ? (lobbyParty.indexOf(msg.sender) >= 0)
                            : true;
                    if (sideOk && chanOk) {
                        let tag = msg.channel === 'friend' ? '[私信] ' : (msg.channel === 'team' ? '[队伍] ' : '');
                        chatPush(msg.sender, tag + (msg.text || ''), false);
                        if (msg.channel !== 'friend') nightApplyChatOrder(msg.text || '');
                    }
                }
            } else if (msg.type === 'TEAM_INVITE') {
                if (msg.target === gState.id) teamOnInviteReceived(msg.sender);
            } else if (msg.type === 'TEAM_INVITE_ACK') {
                if (msg.target === gState.id) teamOnInviteAck(msg.sender, msg.accept);
            } else if (msg.type === 'TEAM_SYNC') {
                // 只有真组队了才接受同步——不然大厅里随便一个不相干的人广播的队伍
                // 会把你自己单机的 gState.team 顶掉。
                // 队伍名单里没有自己的不接（H7：从仓库回了大厅、被房主拿掉的人，不该被拉回这份名单）
                let isLeader = (lobbyParty.length === 0 || peerIsHost);
                if (!isLeader && Array.isArray(msg.team) && msg.team.some(function (m) { return m && m.id === gState.id; })) {
                    gState.team = msg.team;
                    if (msg.map) gState.mapDifficulty = msg.map;
                    updateTeamListUI();
                }
            } else if (msg.type === 'PARK_CREDIT') {
                if (msg.to === gState.id) parkOnCredit(msg);
            } else if (msg.type === 'SPAWN_MOBS') {
                let flag = 'wave' + (msg.wave || 1) + 'Spawned';
                if (!gState[flag]) { gState[flag] = true; spawnMonstersWithData(msg.spawns); }
            } else if (msg.type === 'NM_START') {
                if (msg.sender !== gState.id) nmOnStart(msg);
            } else if (msg.type === 'NM_ME') {
                nmOnMe(msg);
            } else if (msg.type === 'NM_W') {
                nmOnWorld(msg);
            } else if (msg.type === 'NM_EV') {
                nmOnEv(msg);
            } else if (msg.type === 'CK_START') {
                if (msg.sender !== gState.id && msg.plan && msg.plan.some(function (q) { return q.id === gState.id; }) && netStartAllowed('cake', msg)) {
                    mmCancel();   // 见 blazeOnStart 里的同一条注释——防止本机自己的匹配计时几秒后又触发一次
                    if (cake) { if (cake.raf) cancelAnimationFrame(cake.raf); cake = null; }
                    cakeBegin(msg.plan, msg.host, msg.seed);
                }
            } else if (msg.type === 'CK_INVITE') {
                cakeOnInvite(msg);
            } else if (msg.type === 'CK_INVITE_ACK') {
                if (msg.target === gState.id) cakeOnInviteAck(msg);
            } else if (msg.type === 'CK_ME') {
                cakeOnMe(msg);
            } else if (msg.type === 'CK_W') {
                cakeOnWorld(msg);
            } else if (msg.type === 'MODE_SUGGEST') {
                lobbyOnModeSuggest(msg);
            } else if (msg.type === 'VOICE_PEER') {
                if (msg.id && msg.peerId && msg.id !== gState.id) { voicePeerIds[msg.id] = msg.peerId; voiceMeshSync(); }
            } else if (msg.type === 'HUB_ME') {
                hubOnMe(msg);
            } else {
                if (msg.target !== '*' && msg.target !== gState.id) return;
                // 寻宝队开局只拉自己队里的人：之前房间里谁开都会把全房间的人拽进去，别的模式打一半也会被拽走
                if ((msg.type === 'START_GARAGE' || msg.type === 'START_MAP') && !(msg.sender && lobbyParty.indexOf(msg.sender) >= 0)) return;
                if (msg.type === 'START_GARAGE') {
                    huntOptOut = false;
                    nav('screen-garage'); initGarage();
                } else if (msg.type === 'START_MAP') {
                    if (huntOptOut) return;   // 从仓库回了大厅的人，不再被拉进这一局（H7）
                    gState.mapDifficulty = msg.mapDiff; gState.extractTarget = mapConfigs[msg.mapDiff].extr;
                    startGameMap(msg.seed, msg.spawns);
                }
            }
        };

        function broadcastMapDiff() {
            let me = { isLeader: (lobbyParty.length === 0 || peerIsHost) };
            if (me && me.isLeader) {
                let radios = document.querySelector('input[name="map_diff"]:checked');
                if (radios) gState.mapDifficulty = radios.value;
                bc.postMessage({ type: 'TEAM_SYNC', target: '*', team: gState.team, map: gState.mapDifficulty });
            }
        }

        function broadcastTeam() { bc.postMessage({ type: 'TEAM_SYNC', target: '*', team: gState.team, map: gState.mapDifficulty }); updateTeamListUI(); }

        // 寻宝队组队实验：以前"邀请组队"点了也没用——gState.team 从进大厅那一刻就
        // 写死成"你 + 2 个固定名字的 AI"，从来没跟房间里的真人对上过。现在房主（单机时
        // 就是自己）在开局前把真正组了队、又还在房间里的真人塞进队伍，AI 只补空位，
        // 再把这份队伍广播给所有人——大家的 gState.team 统一之后，寻宝队已有的
        // POS_SYNC（按名字找对应的队友模型）才第一次真的对得上号，能看见彼此。
        const HUNT_TEAM_SIZE = 3;
        function huntRebuildTeam() {
            // 大厅现在默认自动进同一个房间，"房间里有人"不再等于"我在跟谁一队"——
            // 没组队的话永远自己管自己的队伍，不用看房主脸色；真组队了才跟房主同步。
            let isLeader = (lobbyParty.length === 0 || peerIsHost);
            if (!isLeader) return;   // 组队了但不是房主，等房主的 TEAM_SYNC，不要自己瞎组
            let mates = lobbyParty.filter(function (id) {
                return roomList.some(function (r) { return r.id === id; });
            });
            let team = [{ id: gState.id, isLeader: true, isReady: true, isAI: false }];
            mates.slice(0, HUNT_TEAM_SIZE - 1).forEach(function (id) {
                team.push({ id: id, isLeader: false, isReady: true, isAI: false });
            });
            if (huntAiOn()) {
                let n = 1;
                while (team.length < HUNT_TEAM_SIZE) { team.push({ id: gState.id + '_AI_' + n, isLeader: false, isReady: true, isAI: true }); n++; }
            }
            gState.team = team;
            broadcastTeam();
        }

        // 快捷发言以前全模式共用一份、内容还是照着惊魂夜写的（"追捕在我这"这种），
        // 拿去玩超燃/竞速之类完全不搭。现在按模式各存一份，设置面板里能切换着改。
        const CHAT_MODES = [
            ['hunt', '寻宝'], ['night', '惊魂夜'], ['blaze', '超燃'], ['race', '竞速'],
            ['jail', '监狱救援'], ['dodge', '躲避球'], ['escape', '密室'], ['park', '猫盾乐园'],
            ['cake', '松饼大作战'], ['hub', '大厅闲逛']
        ];
        const CHAT_DEFAULTS = {
            hunt: ['这里有宝箱', '东西在这', '一起去交', '小心点', '好的'],
            night: ['救我！', '追捕在我这！', '去修机子', '我去救人', '好的'],
            blaze: ['集火这个！', '我没了', '掩护我', '先撤', '好的'],
            race: ['加油！', '让一下', '这有道具', '慢了慢了', '好的'],
            jail: ['来救我！', '守好家里', '东西被抢了', '一起去劫', '好的'],
            dodge: ['传球！', '接住！', '快投！', '救队友', '好的'],
            escape: ['都站好板子', '我按着拉杆', '这边过来', '找到线索了', '好的'],
            park: ['一起来玩！', '这个真好玩', '等等我', '走了', '好的'],
            cake: ['别抓我！', '小心后面', '抢到加成了', '就剩我们了', '好的'],
            hub: ['你好', '一起玩吗', '等我一下', '走了', '好的']
        };
        let chatQuickByMode = {};   // 模式 -> 自定义的 5 条（没改过的模式不进这里，用默认值）
        let chatQuick = CHAT_DEFAULTS.night.slice();   // 当前显示的那一份，chatVisTick 会跟着模式自动换
        let chatMode = 0;

        function chatQuickFor(key) {
            let custom = chatQuickByMode[key];
            if (Array.isArray(custom) && custom.length === 5) return custom;
            return (CHAT_DEFAULTS[key] || CHAT_DEFAULTS.hub).slice();
        }
        function chatLoad() {
            try {
                let v = JSON.parse(localStorage.getItem('TH_chat_v2') || 'null');
                if (v && typeof v === 'object') chatQuickByMode = v;
            } catch (e) { }
            // 老版本存的是一份全局共用的，没有分模式——搬到"惊魂夜"名下（原来的默认词条
            // 本来就是照着这个模式写的），其它模式各自留着自己那套默认，不跟着老设置走。
            // 老 key 迁完立刻删掉、新结果立刻落盘：不然万一之后哪次不管什么原因
            // chatQuickByMode 又变回空的（比如手动把惊魂夜那份"恢复默认"存回去，
            // 存的时候整份都跟默认一样会被清空），这段迁移逻辑会一直在，把老 key
            // 里那份过时的自定义内容重新灌回来，用户手动清掉的默认值又被悄悄改回去。
            if (!Object.keys(chatQuickByMode).length) {
                try {
                    let old = JSON.parse(localStorage.getItem('TH_chat') || 'null');
                    if (Array.isArray(old) && old.length === 5) {
                        chatQuickByMode.night = old.map(function (t, i) { return String(t || CHAT_DEFAULTS.night[i]).slice(0, 20); });
                        chatSave();
                    }
                } catch (e) { }
            }
            try { localStorage.removeItem('TH_chat'); } catch (e) { }
        }
        function chatSave() { try { localStorage.setItem('TH_chat_v2', JSON.stringify(chatQuickByMode)); } catch (e) { } }

        function chatSetMode(m) {
            chatMode = m;
            let quick = document.getElementById('chat-quick');
            let input = document.getElementById('chat-input');
            let toggle = document.getElementById('chat-toggle');
            let chans = document.getElementById('chat-channels');
            if (!quick) return;
            quick.style.display = (m === 1) ? 'flex' : 'none';
            input.style.display = (m === 2) ? 'block' : 'none';
            if (chans) chans.style.display = (m === 0) ? 'none' : 'flex';
            toggle.innerText = m === 0 ? (padOn() ? '发言' : '发言（回车）') : (m === 1 ? (padOn() ? '点这里打字' : '点这里打字（回车）') : '收起');
            if (m === 1) chatRenderQuick();
            if (m === 2) { input.value = ''; input.focus(); }
            if (m !== 0) chatRenderChannels();
        }

        // 聊天频道：公共（房间所有人）/ 队伍（只有 lobbyParty 里的人看得到）/ 好友（私信单独一个人）。
        // 之前只有一个频道，说话全房间都看得到；现在发之前先选一下发给谁。
        let chatChannel = 'public'; let chatDMTarget = '';
        const CHAT_CHANNELS = [['public', '公共'], ['team', '队伍'], ['friend', '好友']];
        function chatRenderChannels() {
            let el = document.getElementById('chat-channels');
            if (!el) return;
            el.innerHTML = CHAT_CHANNELS.map(function (c) {
                let on = chatChannel === c[0];
                let label = c[1] + (c[0] === 'friend' && chatChannel === 'friend' && chatDMTarget ? '：' + dispName(chatDMTarget) : '');
                return '<div onclick="chatSetChannel(\'' + c[0] + '\'); event.stopPropagation();" style="flex:1; text-align:center; cursor:pointer; font-size:11px; padding:4px 2px; border-radius:4px; background:' +
                    (on ? 'rgba(92,184,92,0.9)' : 'rgba(0,0,0,0.55)') + '; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + label + '</div>';
            }).join('');
        }
        function chatSetChannel(c) {
            if (c === 'friend') { chatPickFriendTarget(); return; }
            chatChannel = c; chatRenderChannels();
        }
        function chatPickFriendDone(id) {
            chatChannel = 'friend'; chatDMTarget = id;
            sysModalCloseNormal();
            chatRenderChannels();
        }
        function chatPickFriendTarget() {
            if (!friends.length) { showSysModal('提示', '还没有好友，先在好友列表里加一个再私信', [{ label: '确定' }]); return; }
            let html = '<div style="text-align:left;">' + friends.map(function (f) {
                return '<div onclick="chatPickFriendDone(\'' + f.id + '\')" style="padding:8px; cursor:pointer; border-bottom:1px solid #eee;">' + dispName(f.id) + '</div>';
            }).join('') + '</div>';
            showSysModal('私信给谁', html, [{ label: '取消' }]);
        }

        function chatRenderQuick() {
            let quick = document.getElementById('chat-quick');
            quick.innerHTML = chatQuick.map(function (t, i) {
                return '<div onclick="chatSend(chatQuick[' + i + ']); event.stopPropagation();" ' +
                    'style="background:rgba(0,0,0,0.72); color:#fff; font-size:12px; padding:5px 9px; border-radius:4px; cursor:pointer;">' +
                    '<span style="color:#ffd54f;">' + (i + 1) + '</span>　' + chatEscape(t) + '</div>';
            }).join('');
        }

        function chatToggle(ev) {
            if (ev) ev.stopPropagation();
            chatSetMode(chatMode === 0 ? 1 : (chatMode === 1 ? 2 : 0));
        }

        function chatEscape(t) {
            // 快捷发言设置面板把这个结果直接塞进 value="..." 属性里，光转义 &<> 不够——
            // 存的文字里如果带双引号，会提前把属性值闭合掉，后面的内容变成能执行的
            // 属性（比如 onfocus=...），得把引号也转义掉。
            return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        function chatPush(who, text, mine) {
            let log = document.getElementById('chat-log');
            if (!log) return;
            let row = document.createElement('div');
            row.style.cssText = 'background:rgba(0,0,0,0.62); color:#fff; font-size:12px; padding:4px 8px; border-radius:4px; max-width:100%;';
            row.innerHTML = '<span style="color:' + (mine ? '#7fd1ff' : '#ffd54f') + ';">' + dispName(who) + '</span>：' + chatEscape(text);
            log.appendChild(row);
            while (log.children.length > 6) log.removeChild(log.firstChild);

            setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, 12000);
        }

        // 除惊魂夜外，其它模式的 AI 也要会说话——统一走这一个小工具：
        // 每个 key 独立冷却 14s，同一个人两句话之间至少隔 3.5s，不然人多的模式（比如
        // 躲避球 10v10）一齐开口，聊天栏瞬间被刷屏。cd 状态就记在这个人自己的对象上。
        let aiSayKeyAt = {};
        function aiSay(obj, name, key, lines) {
            if (!obj || !lines || !lines.length) return;
            if (!obj.sayCd) obj.sayCd = {};
            let now = performance.now();
            if (now - (obj.sayCd[key] || 0) < 14000) return;
            if (now - (obj.sayAny || 0) < 3500) return;
            // 每个人各自有冷却，但同一件事大家会同时想说：躲避球一开局 6 个队友同时喊
            // "这颗我来捡"，聊天栏被同一句话刷满。同一类话全队 6 秒内只说一次。
            if (now - (aiSayKeyAt[key] || 0) < 6000) return;
            aiSayKeyAt[key] = now;
            obj.sayCd[key] = now; obj.sayAny = now;
            chatPush(name, lines[Math.floor(Math.random() * lines.length)], false);
        }

        // 聊天框只在真的有一局在进行时才露出来，回大厅/选人界面就该收起。
        // 顺便告诉调用方"在哪个模式"，快捷发言要跟着换成对应模式那一份。
        function chatActiveModeKey() {
            if (typeof blaze !== 'undefined' && blaze && !blaze.over) return 'blaze';
            if (typeof night !== 'undefined' && night && !night.over) return 'night';
            if (typeof race !== 'undefined' && race && !race.over) return 'race';
            if (typeof jail !== 'undefined' && jail && !jail.over) return 'jail';
            if (typeof dodge !== 'undefined' && dodge && !dodge.over) return 'dodge';
            if (typeof escapeRoom !== 'undefined' && escapeRoom && !escapeRoom.over) return 'escape';
            if (typeof park !== 'undefined' && park && !park.over) return 'park';
            if (typeof cake !== 'undefined' && cake && !cake.over) return 'cake';
            if (typeof nm !== 'undefined' && nm && !nm.over) return nm.mode;
            if (typeof isPlaying !== 'undefined' && isPlaying && !gState.isDead) return 'hunt';
            if (typeof hub !== 'undefined' && hub) return 'hub';
            return null;
        }
        function chatIsActive() { return !!chatActiveModeKey(); }
        function chatVisTick() {
            let ov = document.getElementById('chat-overlay');
            if (!ov) return;
            let key = chatActiveModeKey();
            let on = !!key;
            ov.style.display = on ? '' : 'none';
            if (on) chatQuick = chatQuickFor(key);
            if (!on && chatMode !== 0) chatSetMode(0);   // 局结束了，输入框也一起收起来
            // 移动摇杆之前是塞在 ui-layer 里的，只有寻宝队会显示 ui-layer——
            // 大厅/松饼/超燃/竞速/监狱救援/躲避球/密室/乐园这些模式都会把 ui-layer 藏起来，
            // 摇杆跟着一起被藏了，pad 用户在这些模式里根本摇不动人。挪到 ui-layer 外面
            // 之后单独用这个 tick 管显示，跟聊天面板一样跟着"是不是在局内"走。
            let joy = document.getElementById('joystick-left');
            if (joy) joy.style.display = (on && gState.control === 'pad') ? 'flex' : 'none';
            // 大厅广场底下压着一条白色的组队/联机面板，聊天记录和"发言"按钮原来一样贴着屏幕底 14px，
            // 正好盖在组队列表和麦克风上。在大厅就整体抬到面板上面。
            let lb = document.getElementById('lobby-bottom');
            let lift = (key === 'hub' && lb && lb.offsetParent) ? lb.offsetHeight + 8 : 14;
            // U2：摇杆也一样，大厅里抬到底栏上面，别的模式回到左下角
            if (joy) joy.style.bottom = (key === 'hub' && lb && lb.offsetParent ? lift + 8 : 30) + 'px';
            document.getElementById('chat-log').style.bottom = lift + 'px';
            document.getElementById('chat-panel').style.bottom = lift + 'px';
            // 离开某个模式（回大厅或直接进下一个模式）：局里 AI 队友的喊话（"这块我来站着"之类）
            // 留着没意义，清掉。只记"上一个真正待过的模式"——结算弹窗那段 key 是 null，
            // 之前连它一起记，再回到大厅时就以为是从 null 来的，没清，躲避球的喊话一直带进下一局。
            // 从大厅进局不清，大厅里真人说的话还留着。
            if (key && key !== chatLastKey) {
                if (chatLastKey && chatLastKey !== 'hub') document.getElementById('chat-log').innerHTML = '';
                chatLastKey = key;
            }
        }
        let chatLastKey = null;
        setInterval(chatVisTick, 300);

        function chatSend(text) {
            text = String(text || '').trim().slice(0, 40);
            if (!text) return;
            if (chatChannel === 'friend' && !chatDMTarget) { chatPickFriendTarget(); return; }
            let tag = chatChannel === 'friend' ? '[私信] ' : (chatChannel === 'team' ? '[队伍] ' : '');
            chatPush(gState.id || '我', tag + text, true);
            if (chatChannel === 'public') nightApplyChatOrder(text);
            // 彩蛋：只有公共频道打"67"才给钱——私信/队伍频道刷屏没人看得见，没意义也不该给钱。
            if (chatChannel === 'public' && text === '67' && !(gState.eggs && gState.eggs['chat_67'])) {
                unlockEgg('chat_67'); coinsAdd('chat', 67); blazeFlash('彩蛋！「67」 +67 猫盾币');
            }

            bc.postMessage({
                type: 'CHAT', target: chatChannel === 'friend' ? chatDMTarget : '*', sender: gState.id, text: text,
                channel: chatChannel, side: night ? night.side : null
            });
            chatSetMode(0);
        }

        // 鼠标/触屏转视角灵敏度——之前写死 0.005/0.01 这两个系数，快慢只能改代码。
        // 现在乘一个可调倍率，1 就是原来的手感，数值存 gState 里跟着存档走。
        function mouseSens() { return gState.mouseSensitivity || 1; }
        function openSensSetup() { openSettings(); }
        function openSensSetupOld() {
            let v = gState.mouseSensitivity || 1;
            let body = '<div style="text-align:center;">' +
                '<input type="range" id="sens-slider" min="0.3" max="2.5" step="0.05" value="' + v + '" style="width:100%;" ' +
                'oninput="document.getElementById(\'sens-val\').innerText = parseFloat(this.value).toFixed(2)">' +
                '<div style="margin-top:8px; font-size:14px;">当前倍率：<span id="sens-val">' + v.toFixed(2) + '</span> ×</div>' +
                '<div style="font-size:11px; color:#999; margin-top:8px;">调的是转视角的快慢（鼠标和触屏拖动都算），数值越大转得越快，1 是默认手感。</div>' +
                '</div>';
            showSysModal('灵敏度设置', body, [
                {
                    label: '保存', color: '#5cb85c', onClick: function () {
                        let el = document.getElementById('sens-slider');
                        gState.mouseSensitivity = el ? (parseFloat(el.value) || 1) : 1;
                        saveProgress();
                    }
                },
                { label: '取消' }
            ]);
        }
        // 设置面板里可以切模式改——每次切换先把当前这份输入框的内容收进草稿，保存时
        // 才一次性写回 chatQuickByMode；不点保存直接关掉的话，草稿跟以前"恢复默认"
        // 那颗按钮一样，不落地。
        let chatSetupDraft = null, chatSetupKey = 'night';
        function chatSetupCollect() {
            if (!chatSetupDraft || !chatSetupDraft[chatSetupKey]) return;
            for (let i = 0; i < 5; i++) {
                let el = document.getElementById('cs-' + i);
                if (el) chatSetupDraft[chatSetupKey][i] = (el.value || '').trim().slice(0, 20) || CHAT_DEFAULTS[chatSetupKey][i];
            }
        }
        function chatSetupSwitch(key) { chatSetupCollect(); chatSetupKey = key; chatSetupRender(); }
        function chatSetupReset() {
            chatSetupCollect();
            chatSetupDraft[chatSetupKey] = CHAT_DEFAULTS[chatSetupKey].slice();
            chatSetupRender();
        }
        function chatSetupRender() {
            if (!chatSetupDraft[chatSetupKey]) chatSetupDraft[chatSetupKey] = chatQuickFor(chatSetupKey).slice();
            let tabs = '<div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:10px;">' +
                CHAT_MODES.map(function (m) {
                    let on = m[0] === chatSetupKey;
                    return '<div onclick="chatSetupSwitch(\'' + m[0] + '\'); event.stopPropagation();" style="padding:4px 9px; border-radius:4px; cursor:pointer; font-size:12px; ' +
                        (on ? 'background:#5cb85c; color:#fff;' : 'background:#eceff1; color:#555;') + '">' + m[1] + '</div>';
                }).join('') + '</div>';
            let rows = chatSetupDraft[chatSetupKey].map(function (t, i) {
                return '<div style="display:flex; align-items:center; gap:8px; margin:6px 0;">' +
                    '<span style="color:#999; width:16px;">' + (i + 1) + '</span>' +
                    '<input id="cs-' + i + '" maxlength="20" value="' + chatEscape(t) + '" ' +
                    'style="flex:1; font-size:13px; padding:5px 7px; border:1px solid #bbb; border-radius:4px;">' +
                    '</div>';
            }).join('');
            showSysModal('快捷发言设置', tabs + rows, [
                { label: '保存', color: '#5cb85c', onClick: function () {
                    chatSetupCollect();
                    // 只把真的跟默认值不一样的模式写进存档——光切过去看一眼但没改字的
                    // 那些模式，不该被这一份"当时的默认值"焊死，以后要是改了默认词条，
                    // 没动过的人还是能吃到新默认，不会被旧快照卡住。
                    Object.keys(chatSetupDraft).forEach(function (k) {
                        let same = JSON.stringify(chatSetupDraft[k]) === JSON.stringify(CHAT_DEFAULTS[k]);
                        if (same) delete chatQuickByMode[k]; else chatQuickByMode[k] = chatSetupDraft[k];
                    });
                    chatSave();
                    let active = chatActiveModeKey();
                    if (active) chatQuick = chatQuickFor(active);
                } },
                { label: '本页恢复默认', color: '#999', onClick: chatSetupReset },
                { label: '取消' }
            ]);
        }
        function openChatSetup(initialKey) {
            chatLoad();
            chatSetupDraft = {};
            chatSetupKey = initialKey || chatActiveModeKey() || 'night';
            chatSetupRender();
        }

        // requestPointerLock() 在现代浏览器里返回一个 Promise，reject 是异步的——
        // 同步的 try/catch 根本挡不住，之前全仓库 13 处调用都是那个写法，随手就能在
        // 控制台炸出一条 Uncaught (in promise) 报错。统一走这一个函数，reject 了就吞掉。
        function safeLockPointer() {
            try {
                let p = document.body.requestPointerLock();
                if (p && p.catch) p.catch(function () { });
            } catch (e) { }
        }
