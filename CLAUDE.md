# 猫盾の游戏 · 项目约定

单文件网页游戏：所有代码都在 `index.html`（Three.js r128）。跟作者沟通用中文。

## 必须遵守

- **商店里的外观 AI 也要戴（按概率）**：表情、配饰、皮肤颜色、宠物，以及以后商店新加的任何外观。
  用 `aiRandomFace()` / `aiRandomAcc()` / `aiSkinColor()` / `aiRandomPet()` / `aiRandomTitle()`（称号）；新加外观时要接进这些函数，
  并且接到所有生成 AI 身体的地方（各模式的 `raceMakeBody` / `cakeMakeBody` / `blazeMakeBody` /
  `nightMakeBody` 调用处、新模式的 `nmBegin`、寻宝队队友、大厅路人）。真人玩家戴自己的（`myFace()` / `gState.acc` / `myTitle()`），
  联机里别人戴对方同步过来的（`peerFaceOf()` / `peerAccOf()` / `peerTitleOf()`）。分队伍颜色的模式不改身体颜色。
- **不告诉玩家有保底**：任何玩家看得到的文字（提示、商店说明、更新公告）都不能提"保底"或"必出"。
- **文案要短、口语**，别写得像 AI：提示一两句话，更新公告每条一句，规则用短行。
- **所有模式都是第三人称**。寻宝队/惊魂夜的逻辑把 `camera.position` 当玩家位置，第三人称只在渲染时做
  （`tpRender`），不要改成移动逻辑镜头。
- 每次改动玩家能感觉到的东西，在 `CHANGELOG` 最新一条里加一句。
- 存档是白名单：往 `gState` 加要存的新字段，记得同时加进 `saveProgress()` / `loadProgress()`，不然刷新就没了。
- 每次发版改版本号：`index.html` 里的 `GAME_VERSION`（格式 `年.月.日-N`，同一天再发就把 N 加一），大厅左上角会显示。拆文件（B5）后脚本地址也带这个版本号。
- 联机消息的格式或含义变了，`NET_PROTO` 就加一（房间 id 带它，新旧版本不会进同一个房间）。
