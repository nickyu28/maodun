# Code1 交接文档（主游戏）

写于 11-15，交接员 11-15 更新（协调者代写，Code1 的细节以它自己的汇报为准）。接手的人先拉 main，读 `CLAUDE.md`、`docs/queue-code1.md`、`docs/design-rules.md`，再看这份。跟作者说中文，短句，不用"读错了告诉我"这类话。

## 分工和红线
- Code1 管主游戏（大厅、寻宝队、惊魂夜、竞速、密室、推推乐、爬塔、商店、成就、设置、教程）和 CI、`tests/`、`.github/` 等"其他所有东西"。
- **不碰**：`js/19-industry*.js`、`js/18-lab.js`、`docs/industry*.md`、`docs/lab-spec.md`、`docs/chem.md`、`tests/smoke.js` 里 `IND` 和 `LB` 开头的检查（Code2 的）。挡路了就停下来汇报。
- 不强推 main，不改 main 历史，推之前 `git pull --rebase origin main`，普通推送。不清玩家数据，不改 `DATA_WIPE_VER`。
- 版本号和 CHANGELOG 归 Code1：每次发版只写一条公告，最多 5 句，口语，不用括号，不提"保底"。Code2 只加 N 不写公告。

## 作者 11-12 到 11-15 定的新规矩（全部在 `docs/design-rules.md`）
1. **文案规矩**：玩家看得到的文字不用括号（）()【】[]，短句，口语（冒烟 TX1 查）。
2. **交互规矩**：所有弹出的东西 Esc 能关，一次关一层；关掉后自动把鼠标锁回来（Chrome 不把 Esc 算用户操作，被拒绝时等下一次按键或点击补锁，补锁那一下点击只锁不当动作）。
3. 设计四条（符合现实、符合发展史、大部分在主线、物品多用途）主要管猫盾工业，Code1 做新东西也要过一遍。
4. 特批：来回进出远征刷新地形是特批，不是 bug。

## 现在的状态（11-15）
- `GAME_VERSION` 2026.11.5-91。11-15 早上连推多个提交，CI 互相取消，P6 第二批那次运行还没出结果，没核实线上。线上以 main 上最近一次 CI 的 smoke 和 deploy 都成功为准；沙箱里访问不了线上页面（代理 403）。
- **CI 现在 6 份并行，约 10 分钟**（Code1 做的任务 CI1）：`SMOKE_SHARD=i/N`，权重在 `tests/smoke-weights.json`；手动发布勾 force 时**不跑冒烟直接部署**，强制发布单独排队、新的取消旧的。冒烟偶发红：S2、N1、"Chrome 没起来"，重跑失败的那份。
- **已做完推了**：P1 去括号（约 220 处，冒烟 TX1）；P2 所有弹层 Esc 能关加自动锁回鼠标（ES1、ES2）；P3 设置页（声音、操作、显示、游戏四组，`js/02b-settings.js`，`settingsRegister`、`keyRegister`、`SETTINGS` 存 `TH_settings`，说明 `docs/settings.md`；各模式写死的键登记进去）；P4 教程改成第一次进入每个模式时播（`gState.tutSeen`，`tutRegister`、`tutShouldPlay`、`tutMark`，设置里"重播"）；P5 报告（`docs/ready-check.md`）；开发者面板（`?dev=1`）换成反引号键，设置里放了一个音效选项。
- **P6 做到哪**：第一批（6401ebb）画质视野流畅度加左上角帧率、第二批（19ed6d0）红图标、10 秒低于 8 帧降画质、再 20 秒低于 5 帧存档退出，都已推，冒烟 GFX1、GFX2。**还没做**：更正 1 下拉方框，更正 2 里单人局暂停、猫盾工业暂时退出、联机托管重连。现在代码里选项还是一行一个打对勾，联机局只提示不退。下面是原任务说明：（`docs/queue-code1.md` 最前面，两处"更正"一定要读）：设置里加画质（低中高超高）、视野（正常稍远远超远）、流畅度（正常流畅高，帧率目标 30、60、120）三项；**pic1 是下拉**（方框左边写当前选项，右边向下箭头，点开纵向列出，点哪个选哪个）；左上角显示帧率；低帧率冒红色信号加感叹号；太卡自动降画质，再太卡自动退出：**有危险的联机局退到输入 id 界面（id 已填），人机托管，队友弹"托管"提示（`NET_PROTO` 加一），id 上方小提示，托管 3 分钟时限；单人局直接暂停；猫盾工业和实验室暂时退出走 `indExit` 存档**；三项都太高时按设备性能提示。分三批：第一批画质视野流畅度加帧率显示，第二批红图标、降档、单人暂停、工业退出，第三批联机托管重连。给 Code2 的接口 `graphicsQuality()`、`graphicsView()`、`graphicsFps()`、`graphicsViewMul()`、`graphicsFpsTarget()` 写进 `docs/settings.md`。
- **Boss 测试版**（`?bossdebug=1`）：作者还没测过，**别开放、别动 `bossDebugOn`**；P5 报告说开放前要做：真人联机实测、房主掉线时 Boss 血量交接（没找到处理）、加一句头目说明。
- 没做：触屏按钮拖动摆放（只有大小和透明度，等作者要）。
- 固定活 3（等 Code2 推新的工业代码才触发，真玩重玩）：测试员现在在做这件事，Code1 不用再玩了，除非作者点名。

## 本机环境和坑
- 跑冒烟要 `export CHROME_PATH=/opt/pw-browsers/chromium`；全量放后台跑；测试自己等条件，不靠固定等待。用了 `?hcdebug=1` 的检查结束后删 `TH_hcdebug`。
- 加载器把所有 `js/*.js` 按 `GAME_FILES` 顺序拼成一份只插一个 `<script>`，别改成一个文件一个 script（B6）。
- 要存的新字段同时加进 `saveProgress()` 和 `loadProgress()`；商店新外观接进 AI 的 `aiRandom*`；联机消息变了 `NET_PROTO` 加一。
- `git pull --rebase` 冲突时别 `git add -A`，逐个文件处理。`pkill -f` 的词别出现在自己的命令里。
- 新测试必须做变异检查（故意改坏，确认测试会红）。

## 夜班和会话
- 夜班**只开 Code2**，Code1 的夜班 11-15 作者说关了（`trig_01RMATYdMMSuijPUJ4Wh3YT6`，已 disabled）；想开要问作者（Pro 订阅用量紧）。
- 本会话：`session_01ESXCnoXz3zGbLJv75iC61N`（"code1猫盾"），模型 Sonnet 5.5，作者用 medium 档。**做完一批会停下来，要协调者发消息才继续**，所以做完把"下一步是什么"写在 `queue-code1.md` 汇报里。
