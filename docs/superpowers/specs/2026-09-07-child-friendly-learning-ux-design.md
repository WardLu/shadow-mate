# Child-Friendly Learning UX, Reading & Positive Feedback Design
儿童友好交互、朗读伴读与正向反馈设计方案

- **状态**：方案拟定（待评审）
- **日期**：2026-09-07
- **分支**：`feat/growth-loop-redemption-lifecycle`
- **参考项目**：`宝贝学习乐园-源码包` (`index.html`, `README.md`)

---

## 一、 背景与设计目标

### 1.1 背景与现状痛点
Shadow Mate 最初以家庭习惯打卡为切入点，视觉和交互偏向成人/家长视角的任务管理看板（深绿冷色系、小字体排版、高信息密度表格）。近期多位真实家庭用户反馈：
1. **视觉偏严肃、AI 化**：界面像工作台，缺乏对 3~7 岁幼童的吸引力与温暖感。
2. **不识字幼童难以独立学习**：幼童尚未建立汉字阅读能力，在口算和数感模块中面对纯文本题目无所适从，高度依赖家长在旁逐字念题。
3. **古诗缺乏跟读与点读**：当前语文古诗模块仅显示纯文本和跳转 Bilibili 的外链，在站内无法听音、无法点读。
4. **缺乏即时正反馈**：答对题目或完成打卡时，仅有一行静态微小文字提示，缺少让孩子感到兴奋、受鼓励的视觉与声音仪式感。

### 1.2 借鉴参考与设计愿景
参考《宝贝学习乐园》优秀实践，确立以**“低门槛无障碍听读”**、**“强即时正反馈”**、**“糖果色温暖童趣”**为三大支柱的儿童交互升级：
- **听得懂**：题目与关键内容一键朗读，幼童无需识字即可自主完成学习。
- **学得爽**：居中大字表扬（`praise()`）与星光礼花（`flyStars()`），提供充沛成就感。
- **点得准**：加大按键触控面积（48~56px），大圆角与弹性反馈，适配幼童小手。
- **守边界**：坚持 Shadow Mate 的 Local-first 离线可用、家长 Auth 隔离与极简轻量原则，不引入沉重第三方动画库。

---

## 二、 范围划分：本次 MVP vs. 长期 Roadmap

为保障系统稳定、快速交付并验证效果，严格划定本次 MVP 与长期 Roadmap 的边界：

| 模块 | 本次 MVP（快速落地） | 长期 Roadmap（后续迭代） |
| :--- | :--- | :--- |
| **古诗诵读** | 1. 逐行点击单独朗读 + 逐行高亮动效<br>2. 一键朗读整首诗（诗名+全文按序播报）<br>3. 诵读完毕触发庆祝音效与表扬动效 | 1. 古诗汉字上方拼音精确标注（Ruby Pinyin 对齐与多音字校对）<br>2. 扩充 30+ 首人教版/部编版精选幼儿古诗库 |
| **数学题目伴读** | 1. 口算打卡增加「读题目」小喇叭按钮（如“五加三等于几？”）<br>2. 彻底剔除生硬的浏览器原生 `window.prompt()` 弹窗，改为内联儿童数字键盘/选项 | 1. 幼童实物数数互动小游戏（随机生成物品点数）<br>2. 10 关闯关冒险模式（多题型综合随机挑战） |
| **动态正反馈** | 1. 弹出式大字夸奖（`praise()` "太棒了！"、"答对啦！"）<br>2. 星星四散绽放礼花（`flyStars()` 8~12 颗星散开淡出）<br>3. 答错温和轻晃（`shake` 动效 + `try_again` 柔和音效） | 1. 成就勋章墙体系（10 枚图形勋章解锁条件与展示）<br>2. 连续连对奖励机制（Streak 计数与连击光晕） |
| **UI 视觉与触控** | 1. 糖果色（粉/蓝/黄/绿/紫）微调与圆润大卡片（--radius: 22px）<br>2. 按钮最小高度增至 48~56px，增大低龄儿童触控面积<br>3. 按压回弹微动效（`:active { transform: scale(0.95); }`） | 1. 深度儿童主题切换（“经典护眼” vs “童趣糖果” 双模式切换）<br>2. 影伴品牌原创吉祥物形象与不同成就状态插画 |
| **互动游戏题型** | *（本次不增加新题型，专注改造现有模块）* | 1. 英语字母大小写配对游戏（连线/点击配对）<br>2. 儿童逻辑思维 4 题型（找规律、找不同、比多少、排大小） |

---

## 三、 详细交互与技术方案（MVP）

### 3.1 古诗逐行点读与整首诵读
- **DOM 结构重构**：
  将 `renderChinese()` 中的古诗容器改为按行划分的交互元素：
  ```html
  <div class="poem-box">
    <h3 class="poem-title">《静夜思》</h3>
    <div class="poem-meta">李白 · 唐</div>
    <div class="poem-lines">
      <div class="poem-line" data-line-index="0">床前明月光，</div>
      <div class="poem-line" data-line-index="1">疑是地上霜。</div>
      <div class="poem-line" data-line-index="2">举头望明月，</div>
      <div class="poem-line" data-line-index="3">低头思故乡。</div>
    </div>
    <div class="poem-actions">
      <button class="checkin poem-read-all" type="button">${icon("volume")} 朗读整首</button>
    </div>
  </div>
  ```
- **单行朗读**：
  - 点击某一行，移除其他行的高亮，为当前行添加 `.hi`（背景微高亮、阴影浮起、字体微上浮）。
  - 调用站内现有 `speak(cleanText, button, "zh-CN")`，语速设定为放慢的儿童语速（`0.7`）。
- **整首诵读**：
  - 点击「朗读整首」，按顺序依次播报标题与每行诗句，正在播放的诗句自动同步联动高亮。
  - 朗读完毕播放 `points_earned` 音效，并调用 `praise("念得真好！")`。

### 3.2 口算与数感“读题目”与儿童化输入
- **口算题目语音化**：
  - 口算卡片展示题目：`<div class="quiz-q" id="qq">${q}</div>`。
  - 在题目右侧配置专用语音按钮：`<button class="btn-speech-prompt" type="button" aria-label="读题目">${icon("volume")} 读题目</button>`。
  - 生成友好读音文本：例如 `5 + 3 =` 转化为 `五 加 三 等于几？`，调用 `speak(promptText, btn, "zh-CN")`。
- **数感模块干掉原生 `window.prompt`**：
  - 现状：点击缺失数字格调用了阻塞式的 `window.prompt("这个格子应该是数字几？")`，对幼童极不友好。
  - 改造：点击缺失格子时，在下方平滑展开儿童数字选择键盘（候选包含正确答案及前后邻近数字的大按钮），孩子直接点击数字按钮进行作答。
  - 答对：触发绿色高亮 + `points_earned` 音效 + `praise("答对啦！")`。
  - 答错：触发格子轻晃 `shake` + `try_again` 柔和音效。

### 3.3 即时正反馈动效套件（CSS-Only + 原生 DOM）
- **大字夸奖（`praise(text)`）**：
  - 机制：在 `document.body` 注入浮动元素 `.big-praise`，1.1 秒后自动清理。
  - 动画：
    ```css
    .big-praise {
      position: fixed;
      left: 50%;
      top: 42%;
      transform: translate(-50%, -50%);
      z-index: 999;
      pointer-events: none;
      font-size: 40px;
      font-weight: 800;
      color: #FF6FA5;
      text-shadow: 0 4px 0 #fff, 0 8px 20px rgba(255, 111, 165, 0.4);
      animation: praiseAnim 1.1s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
      white-space: nowrap;
    }
    @keyframes praiseAnim {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
      30% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
      70% { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
      100% { opacity: 0; transform: translate(-50%, -100%) scale(0.9); }
    }
    ```
  - 词库随机抽取：`["太棒了！", "好厉害！", "答对啦！", "真聪明！", "你真棒！", "完全正确！"]`。
- **星星绽放礼花（`flyStars(n = 8)`）**：
  - 机制：在全屏容器注入 N 个带内联 SVG 黄金小星星的 `fxstar` 元素，计算角度与半径展开，1.1 秒后移除。
- **答错柔和轻摇（`shake`）**：
  ```css
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
  .card-shake { animation: shake 0.4s ease; }
  ```
- **无障碍降级**：
  遵循 `@media (prefers-reduced-motion: reduce)`，系统开启减弱动态效果时自动取消飞散动画，平滑淡出。

### 3.4 童趣糖果色与触控升级（CSS 调优）
- **糖果色变量系统**：
  在 `src/app.css` 中注入与扩展温润的糖果色阶：
  - `--candy-pink: #FF6FA5`, `--candy-pink-soft: #FFE6F0`
  - `--candy-blue: #3FB4F0`, `--candy-blue-soft: #E1F4FE`
  - `--candy-yellow: #FFC53C`, `--candy-yellow-soft: #FFF4D9`
  - `--candy-green: #4FC777`, `--candy-green-soft: #E2F8E9`
  - `--candy-purple: #A265E8`, `--candy-purple-soft: #F2E7FF`
- **背景光晕**：
  为移动端主容器引入柔和的双色/三色径向渐变，营造温暖乐园氛围，弱化刻板工具感。
- **触控人体工学**：
  - 主要交互按钮触控高度提升至 `48px ~ 54px`。
  - 卡片圆角统一调整为 `20px ~ 22px`。
  - 增加按压微动效 `:active { transform: scale(0.96); }`，提供直观的物理按压确认感。

---

## 四、 边界与架构约束核对

1. **Local-first 纯前端离线边界**：
   - 朗读逻辑继续沿用 Shadow Mate 现有的 `src/tencent-tts-player.js` + `window.speechSynthesis` 双轨制，断网时自动降级为系统语音，不依赖任何第三方未经验证的公开端点。
   - 所有交互动效为零依赖纯 CSS/DOM 实现，不引入外部 CDN 或重型 JS 动画库（打包体积增加控制在 5KB 内）。
2. **多用户与多身份边界**：
   - 动效与朗读为设备本地呈现，不产生冗余网络开销或跨端广播。
   - 保留家长端功能（设置、同步、积分明细）的严谨排版，仅在孩子高频接触的学习与打卡页面呈现童趣活力。
3. **安全与隐私约束**：
   - 题目伴读纯在前端将题目表达式转为汉语自然语言字串，不向任何第三方服务上报儿童作答或录音数据。

---

## 五、 测试与验证规划

1. **单元测试 (`tests/unit/`)**：
   - 验证口算题目到朗读文案的转换逻辑（如加减法中文读音生成）。
   - 验证古诗整首朗读队列生成与清洗标点逻辑。
2. **端到端 E2E 自动化测试 (`tests/e2e/`)**：
   - 古诗逐行点读：点击第一行高亮并触发语音；点击整首朗诵顺序触发。
   - 口算读题目：点击小喇叭按钮触发对应题目的朗读调用。
   - 正反馈动效：验证答对或打卡时触发 `.big-praise` 浮层与音效调用。
   - 数感交互：验证替代 `prompt` 后的内联键盘选项点击与正误反馈流程。
3. **设备兼容与视口测试**：
   - 验证移动端（375px/390px/412px）大按钮布局不折行、无视口溢出。
   - 验证系统音量与音效开关开启/关闭状态下各动效正常展示。

---

## 六、 评审要点建议

- [ ] 是否认可将古诗逐行点读、题目伴读、即时夸奖动效与糖果色作为本次 MVP？
- [ ] 是否认可将拼音标注、勋章墙与独立益智小游戏完整归入 Roadmap？
- [ ] 是否对大字夸奖（`praise`）的具体文案和展现方式有补充偏好？
