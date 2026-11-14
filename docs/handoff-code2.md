# Code2 交接文档（11-14 更新）

接手的人先读：CLAUDE.md、docs/queue-code2.md（排队和最近一次汇报）、docs/code2-tasks.md（每个任务的原话要求）、docs/industry.md（每个系统的说明）。跟作者沟通用中文。

## 我是谁、管什么
Code2 负责猫盾工业（硬核模式）+ 实验室：`js/19-industry*.js`、`js/18-lab.js`、`docs/industry*.md`、`docs/lab-spec.md`、`docs/chem.md`、`tests/smoke.js` 里 `IND`／`LB` 开头的检查。主游戏和别的东西归 Code1，不要改。

## 推送规矩（作者 11-06 定的，最新）
1. 每个提交只跑快速档：`SMOKE_ONLY='检查名1|检查名2' node tests/smoke.js`（总会先跑电脑、触屏两项启动检查）。`SMOKE_ONLY` 是前缀匹配，`IND11` 会连 `IND111…` 一起跑。
2. 一批做完、推送前跑一次全量（不设 `SMOKE_ONLY`），约 50 分钟。跑的时候别改 `js/`、`index.html`。
3. 全量过了：`git pull --rebase origin main`（冲突时保留带"猫盾工业"注释的行），再普通 `git push`。不强推，不改写历史。
4. 推之前看 `gh run list --branch main`：main 最近一次运行 smoke 和 deploy 都成功才推（deploy 不能是跳过）；还在跑就等；红的先不推，等 Code1 修。
5. 推完盯这次运行到 smoke 和 deploy 都成功；红了先修，不堆新活。
6. 推完在 `docs/queue-code2.md` 的"最近一次汇报"写：提交号、全量冒烟结果、CI 和 deploy 状态、线上版本号、没做的东西。
7. 版本号：玩家能玩到的改动把 `index.html` 的 `GAME_VERSION` 的 N 加一（现在 `2026.11.5-75`）；不写 CHANGELOG；不动 `DATA_WIPE_VER`；联机消息格式没动，`NET_PROTO` 不动。

## 本机环境
- 跑冒烟要先 `export CHROME_PATH=/opt/pw-browsers/chromium`，不然报"Chrome 没起来"。起不来时 `pkill -f chromium` 再跑。
- 命令别接 `| grep` 在长跑上：会被挪到后台、输出为空。要重定向到文件（`> /tmp/x.log 2>&1`）再读。
- 测试字符串在模板字面量里，eval 的代码里**不能写 `//` 注释**（会吞掉后面的 `})()`）。
- 新测试必须做变异检查：故意改坏功能，确认测试会红，再改回来。

## 代码约定（踩过的坑）
- 配方表 `IND_CRAFT`／`IND_RECIPES` 只能往最后加（炉子里存的是下标）。`IND_RECIPES` 匹配是"第一条原料够的"，要优先的配方加 `pri: true`。
- 物品用不上体检（IND0）的，要写 `later: '说明'`。
- 新文件加进 `index.html` 的 `GAME_FILES`，按顺序拼成一份脚本；现在最后几个是 `…cast2, repair, asu, moon, moonpick`。
- 存档整个 `ind.base` 都存；新字段要在某个 `xxFixBase` 里清理（`pwFixBase` 里挂），老存档没有这个字段不能报错。
- 玩家看得到的文字不许出现"保底""必出"；文案短、口语。
- 不要往 `industry` 分支提交；`IND` 开头的检查和 industry 命名的文件你说了算，别人别动。

## ?hcdebug=1 调试开关（全部代码）
工业整个功能默认藏起来（`IND_ENABLED = false`），网址带 `?hcdebug=1` 才看得到，记在本机 localStorage，`?hcdebug=0` 清掉。代码在 `js/19-industry.js` 开头和结尾，没有别处：

```js
const IND_ENABLED = false;
const IND_DBG_KEY = 'TH_hcdebug';
function indDebugRead() {
    let q = null;
    try { let m = /[?&]hcdebug=([01])(&|$)/.exec(location.search); if (m) q = m[1]; } catch (e) { }
    if (q === '1') { try { localStorage.setItem(IND_DBG_KEY, '1'); } catch (e) { } return true; }
    if (q === '0') { try { localStorage.removeItem(IND_DBG_KEY); } catch (e) { } return false; }
    try { return localStorage.getItem(IND_DBG_KEY) === '1'; } catch (e) { return false; }
}
let IND_DBG_CACHE = null;
function indDebugOn() { if (IND_DBG_CACHE === null) IND_DBG_CACHE = indDebugRead(); return IND_DBG_CACHE; }
function indVisible() { return IND_ENABLED || indDebugOn(); }

// 文件结尾的调试函数，冒烟测试靠它们：
function indAdvance(secs, step) {   // 快进 secs 秒，每步 0.05 秒调 indTick
    if (!indDebugOn() || !ind || ind.loading) return;
    step = step || 0.05;
    for (let t = 0; t < secs - 1e-9 && ind && !ind.over; t += step) indTick(step);
}
function indTeleport(x, z) { if (!indDebugOn() || !ind || ind.loading) return; ind.p.x = x; ind.p.z = z; ind.p.y = indGround(x, z); }
function indLookAt(x, z) { if (!indDebugOn() || !ind) return; camera.rotation.set(-0.3, Math.atan2(-(x - ind.p.x), -(z - ind.p.z)), 0, 'YXZ'); camera.updateMatrixWorld(); }
```
- 大厅里的猫盾工业隐藏按钮用 `indVisible()` 判断显不显示。
- 冒烟里 `openTab(chrome, url, { query: 'hcdebug=1' })` 就是开这个开关。测试里还常用：`indEnter()`、`indSetRule('hard')`、`indGoTrip(种子)`、`indGoBase(null)`、`indMoonEnter()`、`indMoonPick()`，都是普通函数，控制台能直接调。

## 现在的状态（线上 2026.11.5-75，11-14）
从 11-08 起推了 80 多个任务，全在 main，CI 绿（偶尔 S2、N1、IND1 和"Chrome 没起来"是老毛病，重跑失败的那份）。详细每条在 docs/queue-code2.md "最近一次汇报"和 docs/industry.md 各节。最近做完的：

| 任务 | 内容 | 检查 |
|---|---|---|
| 143 | 走路耗体力，恢复略高，精神影响恢复 | IND161 |
| 144 | 倍速 ×1/2/4/8/16，Z 键，只在基地，危险自动回 ×1，`js/19-industry-speed.js` | IND159 |
| 145、146 | 读档不丢东西，背包 36 格，原料一格 200 | IND157、IND158 |
| 147 | 退出重进站原地 `base.me` | IND164 |
| 148 | 熔池不收锡锌铅铜，倒出来 | IND165 |
| 149 | 活塞风箱，野猪必掉皮 | IND166 |
| 150 | 风箱炉子右键优先鼓风，拉风箱不耗体力 | IND167 |
| 151 | 蒸汽发电机自带炉膛 | IND168 |
| 152 | 电源串联，J 键，`js/19-industry-series.js` | IND160 |
| 153 | 烧制提速：配方时间减半，升温加快 | IND169 |
| 154、155 | 铁钢 1100°C，铁工具锻造要锤子，熔池写原因 | IND162、IND163 |
| 157 | 物品小图标，`js/19-industry-icon.js`，中文字 | IND172 |
| 158 | 配方查询完整链，石锤，`js/19-industry-book.js` | IND173 |
| 132、134 | 出生点跟地形走，散落物撒遍全图，火山随机分布加烟柱 | IND170、IND171 |
| 124 | 通关用时估算，只报告，docs/pacing.md | 无 |

## 新踩的坑
- 老检查测的是别的东西、却依赖配方时间或升温速度的，进来先用 `${OLD_TIMES}` 把时间换回老数（tests/smoke.js 顶部），新数字只在 IND169 测。
- CI 机器没有中文字体：图标检查别比像素，比 `IC_META`。
- 出生点不再是 (0, -4)，是 `ind.map.spawn`。测试里要站在出生点用它，别写死坐标。
- 配方表只能往最后加：新配方都放在 `js/19-industry-series.js` 末尾（它是最后一个文件，后面是 icon、book）。
- 提交顺序：一个任务一个提交，推之前 `git pull --rebase origin main`，smoke.js 和 index.html 常冲突，保留两边。
- 新文件加进 `GAME_FILES`，现在最后几个是 `…moonpick, speed, series, icon, book`。

## Code1 的接口（11-14，用法在 docs/settings.md）
- 设置和按键：`settingsRegister({group, id, label, type, def})`、`keyRegister(mode, action, defKey, label, fn, opts)`，同一模式键冲突设置页会拒绝。
- 教程：`tutRegister('industry'|'lab', 播放函数)`，进入时问 `tutShouldPlay(模式名)`，播了调 `tutMark(模式名)`。
- 别改 `#ind-btn-book` 的 id 和它那个盒子的 `right:8px; top:8px` 内联样式，index.html 的 CSS 靠它让玩家选这排按钮放哪个角。
- 开发者面板 `?dev=1` 换成反引号键，T 留给元素表。
- 冒烟 IND172 在 CI 上红过，已修（11-14 推了，比颜色加字，不比像素）。

## 没做、留给下一个人（按协调者的顺序）
133 草和木制品当燃料、135 炉子面板分燃料和炉料（含补充 2 石油倒漏斗）、139 烧制成品进储料槽、137 皮革鞣制、142 体检第二批、140 关面板自动锁回鼠标、118+121 删不存在的怪和风箱不耗体力（121 的拉风箱部分已在 150 做了）、120 胶水加锤子修复加熔了重铸（锤子物品已有：`hammer`、`hammer_stone`）、131 说明改准改短、122+123+126 耐久条、背包满提示、快捷键、97 矿洞去传送门、158 后续、159 往后看 docs/code2-tasks.md。
- **协调者 11-14 新加的**（原话都在 docs/code2-tasks.md 末尾，最新顺序看 docs/queue-code2.md 最前面）：
  - 158 补充：石锤冷锻的青铜工具最大耐久只有铸造的 40%，单独 key，名字写"冷锻青铜镐"；158、159 的完整链改成只显示下一步，玩家只能点见过的东西，没见过写"？"。
  - 159：通用物品详情 `indItemInfo(key)`，到处能点开；能互相替换的原料合成一行斜杠写。
  - 132 补充：出生点允许落在火山坡上，岩浆离出生点至少 10 米（不是 30），加冒烟：火山强制放在 (0,0) 附近时出生点离岩浆 ≥ 10 米。
  - 161 第二节：工业、实验室第一次进入的简单教程，等 Code1 的 P4 做完再做。第一节作废，离心机保持 4 轮。
  - 163：`IND_ENABLED` 改 true，按钮旁标"测试版"，别默认硬核，教程之前不推。164：大窑一炉 10 份加出料槽 20，电解槽 2 倍配方作废。165：只报告，写 docs/lab-ready.md。166：实验室粒子和原子拼合台。167：炉子上限删掉。
  - 火箭 R2 到 R5 放行，一期一推，用量调小，钛和液氢可选，装配界面显示最大载荷 `rocketPayload(config)`。120 补充 2：铁钢工具补耐久要在点着的炉子旁。
- 没做的小项：153 大窑一批份数放大（槽容量要一起改）；157 图标只接了快捷栏、背包、箱子，炉子面板、配方、元素表、准星条没接；132 火山坡上出生和岩浆 30 米矛盾，作者定。

## 夜间自动跑
每天北京时间凌晨 2 点前后各起一个会话照着清单做。没活的夜里只看 CI、在"最近一次汇报"写一行、结束，不跑全量、不重读大文档、不自己找活。
