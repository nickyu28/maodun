# Code1 交接文档（主游戏）

写于 11-08。接手的人先拉 main，读 `CLAUDE.md` 和 `docs/queue-code1.md`，再看这份。

## 现在的状态
- main：CI 绿，deploy 成功。`GAME_VERSION` = 2026.11.5-36，`NET_PROTO` = 11。
- 我这边没有未推送、没做完的活。工作分支 `claude/adoring-johnson-ocxsay` 和 main 一致（只是为了让会话的推送钩子不报错，每次 main 推完顺手推一下，用 `--force-with-lease`）。
- 排队清单里只剩固定活 3（见下）。

## 分工和红线
- 我（Code1）管主游戏和除下面这些以外的所有东西。
- 不碰：`js/19-industry*.js`、`js/18-lab.js`、`docs/industry*.md`、`docs/lab-spec.md`、`docs/chem.md`、`tests/smoke.js` 里 `IND` 和 `LB` 开头的检查。它们挡路就停下来汇报。
  - 例外只有作者明确说过的那次（任务 19、13、钢），已经做完，不是常规权限。
- 不强推 main，不改 main 历史；推之前 `git pull --rebase origin main`；普通推送。
- 不清玩家数据，不改 `DATA_WIPE_VER`。
- 版本号和 CHANGELOG 我负责；Code2 只加 N、不写公告，公告 id 可以落后于版本号（V3 按这个判）。

## 固定活 3：真玩 Code2 的工业代码
- 触发条件：`git log origin/main -- 'js/19-industry*.js'` 里出现比清单里记录的那个提交更新的提交。有就拉下来重玩，没有就什么都不做、不改文件、不推送、不写汇报。
- **现在就有触发**：最新的工业提交是 `d69808b`（11-07 任务 83，月球 M2 选落点），比清单里记的 `510cf61` 新。我还没重玩。接手后可以先做这个，并把清单里的基准提交号改成 `d69808b`（或之后更新的）。
- 重点和三类汇报（做过的／没覆盖的／行为跟任务文档对不上的）见清单固定活 3。
- 写"做过"之前，先用 `git show --stat 提交号` 或 grep 确认那件东西已经在 main 上。提交说明里写了任务名不等于代码做了，有很多只是改 docs。11-06 我就因为这个写错过一次汇报。
- 夜班规则（清单最上面）：清单没活就只看一眼 main 最近 CI 的 smoke 和 deploy，写一行，结束会话。

## 冒烟和 CI
- 两档：每个提交跑快速档 `SMOKE_ONLY='名1|名2' node tests/smoke.js`（会先跑两项启动检查）；推送前跑一次全量（约 40～50 分钟）。`SMOKE_ONLY` 是正则，`S2` 会同时匹配 `BS2`。
- 本地跑要设 `CHROME_PATH=/opt/pw-browsers/chromium`。全量放后台跑（前台会超时），用 Monitor 等。
- 测试自己等条件（`until`），不靠固定等待和帧率。用了 `?hcdebug=1` 的检查结束后要删 `TH_hcdebug`，否则会带坏后面的 IND 检查。
- CI（`.github/workflows/smoke-deploy.yml`）：推 main 先冒烟再 deploy；**只改 `docs/**` 的提交不跑 CI**。所以代码推完等 CI 绿，再单独推汇报，就不会多跑一轮。新推送会取消排队中的旧 run。
- 作者有时手动部署：推之前先看 Actions 里有没有在跑的任务，不要连续推。
- IND／LB 的偶发失败不是我们的，只写进汇报给 Code2。
- 沙箱里访问不了线上页面（代理 403），线上版本号只能靠 deploy 成功加 main 上的 `GAME_VERSION` 判断，汇报里要说明。

## 最近做过的事（细节在 git log 和清单"做完"）
- 修好偶发冒烟：N1、U1、L2、R1；V3 规则改成"日期一样、N 不超过版本号"（`CLAUDE.md` 同步）；M2 不再受每周模式影响。
- 寻宝队：合成倒计时、腰包快捷栏、猫神护身符、第四张图、化学局（`js/09-hunt.js` 末尾）、Boss 测试版（`docs/boss.md`，含"怎么测"）。
- 修信号接收器找不到路（查过 `huntRouteFind`，没有 bug）、楼梯相关的 MP4、CR1 的等待。
- 11-07：main CI 红在 S2（"AI 也会捡"那步场上没道具读 `.x`），已改成等道具出现，提交 `0eb076b`、`9e2aad4`，CI 和 deploy 成功。

## 容易踩的坑
- 加载器把所有 `js/*.js` 按 `GAME_FILES` 顺序拼成一份只插一个 `<script>`。别改成一个文件一个 script（B6，触屏设备会进不了游戏）。
- `pkill -f` 的匹配词如果出现在自己的命令行里会杀掉自己的 shell；要杀进程就用 `ps | grep` 取 pid。
- 要保存的新字段同时加进 `saveProgress()` 和 `loadProgress()`；商店新外观要接进 AI 的 `aiRandom*` 并接到所有生成 AI 身体的地方（`CLAUDE.md` 有清单）；玩家看得到的文字不能提"保底"。
- 往 `git pull --rebase` 冲突里 `git add -A` 会把冲突标记提交进去。冲突时逐个文件处理，不要一把梭。
