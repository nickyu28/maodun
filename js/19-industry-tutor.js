// 猫盾工业和实验室的简单新手教程（任务 161 第二节）：第一次进入时几张短卡片，只教操作，不教配方不教通关，最后一句只放目标。
// 有"跳过"，Esc 关。看过记在 gState.tutSeen['industry'] / ['lab']（Code1 的 P4 接口，js/09-hunt.js），设置页和暂停菜单能重播。
        const TUT_IND = ['W A S D 走路，鼠标转视角。Shift 跑，空格跳。点一下画面锁住鼠标，Esc 松开。', '左键挖、拿、点开东西，右键放、用、吃喝。数字键换手上拿的东西。', 'E 或 B 开背包。右上角的配方按钮，搜一样东西能看它怎么做。', '走到出发的门外就是远征，走到绿圈里站 3 秒撤离回家。在外面死了，身上的东西会丢。P 暂停。', '去外太空。'];
        const TUT_LAB = ['W A S D 走路，鼠标转视角。点一下画面锁住鼠标，Esc 松开。', '左键捡东西、用东西，右键拆包、接水。数字键换手上拿的东西。', '走到设备前左键点开面板，在面板里放材料、点按钮。Q 放下手上的东西。'];
        function tutCards(id, pages, done) {
            if (document.getElementById('tut-cards')) return;
            let i = 0, host = typeof ind !== 'undefined' && ind && !ind.loading ? ind : typeof lab !== 'undefined' && lab ? lab : null;
            if (document.pointerLockElement) document.exitPointerLock();
            if (host) host.tutOpen = true;
            let d = document.createElement('div'); d.id = 'tut-cards';
            d.style.cssText = 'position:fixed;inset:0;z-index:140;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:"Microsoft YaHei",sans-serif;';
            document.body.appendChild(d);
            let close = function () {
                window.removeEventListener('keydown', onKey, true);
                if (d.parentNode) d.parentNode.removeChild(d);
                if (host) { host.tutOpen = false; host.last = performance.now(); }
                tutMark(id); if (done) done();
            };
            let onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
            window.addEventListener('keydown', onKey, true);
            let draw = function () {
                let last = i === pages.length - 1;
                d.innerHTML = '<div style="background:#fff;border-radius:14px;padding:24px 34px;max-width:min(520px,86vw);text-align:center;"><div style="font-size:' + (last ? 30 : 20) + 'px;font-weight:bold;color:#222;line-height:1.6;">' + pages[i] + '</div>' +
                    '<div style="margin-top:18px;"><button id="tut-next" style="padding:10px 26px;font-size:18px;border:0;border-radius:10px;background:#2e7d32;color:#fff;cursor:pointer;">' + (last ? '开始' : '下一张') + '</button>' + (last ? '' : '<button id="tut-skip" style="margin-left:10px;padding:10px 20px;font-size:16px;border:0;border-radius:10px;background:#9e9e9e;color:#fff;cursor:pointer;">跳过</button>') + '</div>' +
                    '<div style="margin-top:8px;font-size:12px;color:#999;">' + (i + 1) + ' / ' + pages.length + '　Esc 关</div></div>';
                document.getElementById('tut-next').onclick = function () { if (last) close(); else { i++; draw(); } };
                let sk = document.getElementById('tut-skip'); if (sk) sk.onclick = close;
            };
            draw();
        }
        function indTutPlay(done) { tutCards('industry', TUT_IND, done); }
        function labTutPlay(done) { tutCards('lab', TUT_LAB, done); }
        // 进工业：老存档（已经有玩法选择或出过门）不再教，直接记成看过；新号先教，教完再选玩法
        function indTutMaybe(base) {
            if (base.rule || base.trips > 0) { tutMark('industry'); return false; }
            if (!tutShouldPlay('industry')) return false;
            indTutPlay(function () { if (ind && ind.base && !ind.base.rule) indAskRule(); });
            return true;
        }
        tutRegister('industry', function () { indTutPlay(); });
        tutRegister('lab', function () { labTutPlay(); });
