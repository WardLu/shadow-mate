# Shadow Mate 统一 Piper 资源包方案

**状态：方案修订版，待最终审阅，尚未进入实现**
**日期：2026-09-02**

## 1. 背景与问题

Shadow Mate 当前只把英语 Piper 模型作为本地语音兜底。下载逻辑、缓存判断、弹窗文案和引擎调用都围绕英语变量组织；中文仍依赖浏览器 `speechSynthesis`。这导致四个问题：

1. 小米自带浏览器即使系统具备中文语音，也可能无法向网页暴露可用的普通话能力。
2. 英语模型的下载状态只检查 `.onnx`，没有把 `.onnx.json` 和下载完成状态作为一个整体判断。
3. Cache Storage 按浏览器用户配置和网页 Origin 隔离。换浏览器，或在 `preview-sm.shadow.wang` 与 `sm.shadow.wang` 之间切换，都会产生另一份缓存；当前界面没有告诉用户已下载哪些资源、占用了多少空间，也没有删除入口。
4. 现有 Service Worker 激活和版本守卫会广泛删除 Cache Storage；若不先隔离应用壳与语音包缓存，应用升级会导致用户重新下载已完成的模型。

本方案把 Piper 视为统一的“资源包”能力。英语、中文以及未来的其他语言只通过配置声明差异，下载、缓存、完整性、错误、进度和管理使用同一套机制。

## 2. 目标

- 中文普通话在系统 TTS 不可用时，可以下载并使用通过兼容性与许可证门禁的浏览器本地 Piper。
- 英语和中文模型共享一套下载、缓存、超时、取消、完整性和错误处理机制。
- 在缓存未被用户删除或浏览器驱逐的前提下，同一浏览器、同一 Origin、同一模型版本只下载一次；完整缓存不会重复下载。
- 下载中断或部分缓存不会被误判为已完成；第一阶段只承诺复用已经完整写入的文件，不把“可继续下载”误写成字节级断点续传。
- 用户可以看到每个 Piper 资源包的状态、大小和删除操作。
- 新增语言或替换 voice 时只增加资源配置，不复制下载器和播放逻辑。
- 保持 local-first：合成在浏览器完成，不上传用户输入文本或录音。

## 3. 非目标与边界

- 不尝试让网页跨浏览器或跨 Origin 共享 Cache Storage；这是浏览器安全边界。产品上通过统一使用 `preview-sm.shadow.wang` 或正式域名减少重复下载。
- 不把 60MB 级模型直接提交到 Git 仓库或打进每次应用构建产物。
- 不接入远程 TTS 服务作为本方案的一部分。
- 不修改 Supabase schema、RLS、Auth 或学习状态协议。
- 不把系统 TTS 是否联网描述成 Shadow Mate 自己的语音上传行为。
- 不在本仓库直接执行共享生产数据库迁移、CDN 上传或生产部署。
- 第一阶段不承诺单个 ONNX 文件的字节级断点续传；文件级完整缓存与后续可插拔的 Range 续传分开验收。产品文案只承诺“完整下载后不会重复下载”，不承诺中断后从断点继续。
- 不能把跨浏览器、跨浏览器配置文件或跨 Origin 的重复下载视为缓存故障；这些环境必须在 UI 中分别说明。
- 已运行旧版本的客户端可能在首次升级到本方案版本前，由旧版版本守卫清空缓存；旧英语缓存迁移因此只能尽力而为，不能承诺所有用户免于首次重新下载。

## 4. 推荐模型与资源边界

### 4.1 中文模型

首选候选为 `zh_CN-chaowen-medium`，但必须先通过模型兼容性和许可证门禁：

- 语言：简体中文 `zh_CN`。
- 使用拼音音素，预期适配现有浏览器 Piper 运行时；是否真正兼容必须以 Phase 0 的实际浏览器合成结果为准。
- ONNX 模型约 63.2MB，连同 JSON 元数据约 63.4MB。
- 模型卡标注训练数据集为 CC0；这只是数据集信息，不等同于模型权重及其完整来源链已经获准公开分发。

模型来源和许可证记录：

- [Piper Voices 中文 chaowen medium](https://huggingface.co/rhasspy/piper-voices/tree/main/zh/zh_CN/chaowen/medium)
- [chaowen 模型卡与 CC0 数据集说明](https://huggingface.co/rhasspy/piper-voices/commit/10eb5c756ae21b759c8344d54aef86f9399ae92d)

`xiao_ya` 依赖 Python Piper 1.4+ 的 `g2pW`，且数据集为非商业使用；`huayan` 的模型卡将数据集许可证标为 Unknown，因此不作为本次默认模型。`chaowen` 模型卡还记录了从 Xiao Ya voice 微调的信息，因此在来源链没有得到明确确认前，不将“CC0 数据集”写成商业分发结论。

进入实现前必须完成一次小型预检：使用与计划发布完全相同的候选模型文件、现有 `piper-tts-web` 和 `piper_phonemize` 运行时，在浏览器中合成 `火`、`雨`、`山`、`木` 及一句短句，确认拼音/声调、音频播放、冷启动、移动端内存和合成耗时。预检必须同时覆盖桌面 Chrome 和小米自带浏览器；仅凭 `phoneme_type: "pinyin"` 或桌面 headless 浏览器通过不算兼容性证据。候选文件可来自本地或受控 staging，不能为了预检提前公开未获许可的模型。

模型通过兼容性和分发许可门禁后，再上传到最终 CDN，并使用最终 CDN URL 在 Preview Origin 重跑传输、hash、浏览器合成和离线重开检查。预检产物必须包含：候选及最终 CDN URL、模型文件 SHA-256、浏览器/设备/版本、每个样例的合成结果、失败日志、首次合成耗时、内存观察、离线重开结果，以及模型卡、数据集许可、权利人/来源确认和最终权重许可记录。任一模型兼容性、设备可用性、最终 CDN 传输或分发许可项未通过，暂停中文模型接入，不绕过门禁换成未经审核的模型。

“模型卡中数据集为 CC0”不能直接推出“模型权重可商业分发”。模型权重许可、训练数据许可、微调来源和公开 CDN 分发权必须分别记录；在这些记录齐全并明确允许公开分发前，不上传公开 CDN，也不进入 Preview 验收。

### 4.2 远程资源

继续由 `voice.shadow.wang` 提供公开静态资源：

```text
/piper/en_US-ljspeech-medium.onnx
/piper/en_US-ljspeech-medium.onnx.json
/piper/zh_CN-chaowen-medium.onnx
/piper/zh_CN-chaowen-medium.onnx.json
```

每个文件都必须支持 HTTPS、`HEAD`、`GET`，并返回正确的 `Content-Type`、`Content-Length` 和 CORS 响应。模型不进入 Git 仓库。

上传完成后建立一份资源发布清单，记录最终 CDN URL、实际字节数、SHA-256、上传时间、来源版本、模型权重许可、训练数据许可、微调来源和分发许可状态。清单是注册表的唯一事实来源；注册表只能引用清单中已经核验过的值。清单缺少任一许可字段或状态不是 `approved` 时，构建/发布检查必须失败。

### 4.3 运行时资源

`piper-tts-web.js`、ONNX Runtime WASM、`piper_phonemize` WASM/data 当前随应用静态发布，属于 Piper 运行时资源，不属于每个语言 voice 包。统一资源层需要把它们作为“应用内置资源”记录和校验，但本期不改为运行时重复下载。

它们仍进入同一资源注册表，使用 `source: "bundled"` 和 `cachePolicy: "app-shell"` 标记；语言模型使用 `source: "cdn"` 和 `cachePolicy: "user-download"`。这样资源状态模型统一，但不会把应用内置文件误显示成用户需要下载的语音包。

下载内存和引擎加载内存分开验收：流式下载不能制造完整 ONNX 的 JS 临时副本，但 Piper/ONNX Runtime 在合成时可能仍需要加载模型本体。移动端预检必须分别记录下载峰值、引擎初始化峰值和首次合成耗时，不能用“下载没有 Blob”替代引擎内存安全结论。

Cache Storage 的所有者也必须隔离：应用壳使用 `shadow-mate-app-v{n}`；Piper 资源包使用 `shadow-mate-piper-{packageId}-{version}`；旧应用壳仅按精确规则 `shadow-mate-v{n}` 清理。Service Worker 激活和版本守卫只能删除旧应用壳缓存，绝不能使用“删除全部 Cache”的实现。`shadow-mate-voice` 与 `shadow-mate-piper-*` 必须被保留，除非用户在语音包管理界面主动删除。

## 5. 统一资源包数据模型

在 `src/piper-tts.js` 中建立不可变的 Piper 资源注册表，下载器只接收资源包对象，不关心语言。以下代码只展示字段结构，hash、bytes 和 URL 的实际值必须来自最终 CDN 文件清单：

```js
{
  id: "en_US-ljspeech-medium",
  locale: "en-US",
  label: "英语",
  kind: "voice",
  version: "1",
  baseUrl: "https://voice.shadow.wang/piper/en_US-ljspeech-medium",
  source: "cdn",
  cachePolicy: "user-download",
  totalBytes: 63536351,
  files: [
    {
      key: "model",
      suffix: ".onnx",
      contentType: "application/octet-stream",
      bytes: 63531379,
      sha256: "<actual-sha256>"
    },
    {
      key: "metadata",
      suffix: ".onnx.json",
      contentType: "application/json",
      bytes: 4972,
      sha256: "<actual-sha256>"
    }
  ]
}
```

中文只需换成 `zh_CN-chaowen-medium` 及其文件元数据。实际实现中 `sha256` 必须使用上传到 CDN 的最终文件 hash，不能使用模型仓库的 LFS pointer hash 代替真实文件 hash。

资源包必须具备稳定的 `id + version`。版本变化必须生成新的缓存命名空间，不得只依赖原始 URL 判断版本。URL、bytes 或 SHA-256 变化而 `version` 未变化时视为注册表错误，必须 fail closed，而不是静默覆盖现有缓存。删除旧包和保留策略由资源管理器完成。

资源注册表同时记录：

- `source: "cdn"`、`cachePolicy: "user-download"`：用户下载的语言模型。
- `source: "bundled"`、`cachePolicy: "app-shell"`：应用内置的 Piper 运行时文件。

这样所有 Piper 资源使用同一套资源描述和状态模型，但只有 CDN voice 包出现在用户下载/删除界面。

## 6. 统一下载与缓存机制

### 6.1 API 边界

把当前英语专用函数重构为通用接口。这里的“资源包”既包括 CDN voice 包，也包括可校验的 bundled 运行时资源；但 bundled 资源不进入用户下载流程：

```text
getPiperResourcePackage(packageId)
isPiperResourceCached(packageId)
downloadPiperResource(packageId, onProgress, signal)
deletePiperResource(packageId)
speakLocally(text, packageId)
getPiperResourceStatus(packageId)
getPiperCapabilities()
```

业务层只传 `packageId`，不再直接拼接英语 URL 或依赖英语专用缓存名。

实现时明确区分 `PiperResourcePackage` 的两个来源：`source: "cdn"` 的包支持下载、删除、进度和空间管理；`source: "bundled"` 的包只由构建检查和 Service Worker 应用壳校验。两者共享 manifest、版本和状态字段，但不能把 bundled 运行时显示为需要用户下载的语言包。

下载前必须执行能力探测：Cache Storage 可读写、`ReadableStream`、`TransformStream`、`AbortController`、WebAssembly 和用户手势下的音频播放能力。任一下载或播放必需能力缺失时，资源状态为 `unsupported`，不发起模型下载、不循环弹窗；界面说明“当前浏览器不支持本机离线语音，仍可使用系统发音（如可用）”。`navigator.storage.estimate()` 仅影响空间显示，不作为下载能力门槛。

### 6.2 缓存判定

使用独立于 Service Worker 的、按包和版本隔离的 Cache Storage 命名空间，命名规则固定为：

```text
shadow-mate-piper-{packageId}-{version}
shadow-mate-piper-zh_CN-chaowen-medium-v1
shadow-mate-piper-en_US-ljspeech-medium-v1
```

每个包写入：

- 全部声明文件的完整 Response。
- 一个固定的 `package:<id>@<version>` 完成标记，记录规范化后的文件 URL、实际大小、SHA-256、完成时间和 manifest 版本。

只有“全部文件存在、完成标记存在且 `id + version`、URL、bytes、SHA-256 和文件列表完全一致”才返回已缓存。任何元数据不一致都必须删除对应不可信 Response 和完成标记后重新下载，不能只依赖 Cache Storage 中存在同名 URL。

英语旧缓存 `shadow-mate-voice` 首次升级时执行一次安全迁移：检查 `.onnx` 与 `.onnx.json` 是否都存在，读取实际大小并按新注册表的 hash 规则校验；通过后复制到新缓存并生成完成标记，否则保留可复用的完整文件并只下载缺失/不匹配文件。迁移过程不能删除学习数据或 Service Worker 应用壳缓存。

资源管理器必须定义旧版本保留策略：默认只保留当前版本，完成新版本迁移并确认可用后删除 superseded 版本；正在下载或当前使用中的版本不得删除。浏览器驱逐缓存后，状态回落为“未下载”，不能把上次记录的大小当成仍可播放的证据。不同浏览器、浏览器配置文件和 Origin 的缓存状态独立展示。

Service Worker 激活和版本守卫的缓存清理都必须通过同一个 `isAppShellCacheName(name)` 规则，只清理 `shadow-mate-app-v{n}` 与已知旧应用壳 `shadow-mate-v{n}`，并显式排除 `shadow-mate-voice` 和 `shadow-mate-piper-*`。该规则需要独立单元测试；任何 `caches.keys().map(caches.delete)` 形式的全量清理都不允许保留。

### 6.3 下载过程

1. 根据资源注册表计算缺失文件，不重复下载已经完整缓存的文件。
2. 对每个文件执行带超时的 `HEAD`，读取大小并校验响应状态。
3. 以 `GET` 流式读取，显示包级总进度；保留已有完整文件。
4. GET 响应等待和流读取分别受超时控制，支持用户取消。
5. 使用经审计的增量 SHA-256 实现和单向 `TransformStream`：每个 chunk 经过校验器后直接交给 `Cache.put`，不使用 `chunks` 数组、完整 `Blob` 或 `Response.arrayBuffer()` 保存整个 ONNX 文件。不能把非增量的 `crypto.subtle.digest()` 当成流式 hash 实现。
6. `Cache.put` 成功、流读取完成、实际 bytes/hash 校验通过后才标记文件完成；所有文件完成后才写入包完成标记。任何失败都要取消流、删除失败文件 Response 和包完成标记，避免半包残留被下次误用。
7. 任一步失败都不写完成标记，下一次可继续缺失文件下载，并显示明确的超时、网络、CORS、校验或空间错误。

本期“继续下载”按文件粒度复用已经完整写入的文件；如果单个 ONNX 文件中途断开，仍可能从该文件头开始重下。字节级续传作为后续阶段，使用 CDN 的 HTTP Range 和临时分片存储实现，并在独立门禁通过前不宣传为已支持。

下载器需要对同一页面内的重复点击 single-flight；同一 Origin 多标签页优先使用 Web Locks，缺失时使用短租约回退，避免两个标签页同时下载同一个包。Web Locks 或 `localStorage` 不可用时必须 fail safe：允许单标签页下载，但不能因锁失败删除他人缓存，也不能把锁失败当成下载完成。跨标签页协调不是资源完整性门禁，需单独测试并允许降级。

增量 hash 实现必须作为直接生产依赖锁定版本，不能从 lockfile 中的间接依赖导入。新增依赖前完成许可证审阅，并同步更新 `THIRD_PARTY_NOTICES.md`；若无法满足这些条件，则不宣称支持 SHA-256 完整性校验，也不进入模型发布。

### 6.4 存储空间

资源状态通过 `navigator.storage.estimate()` 获取站点总 `usage` 与 `quota`；每个包的大小来自已核验的资源清单和完成标记。两者分开显示，不能把站点总占用冒充成单个语言包的精确占用。浏览器不支持估算时显示“浏览器未提供空间统计”，不能伪造精确值。

## 7. 发音流程

### 7.1 中文

1. 点击后立即进入 `播放中…`，建立本次播放的 single-flight token，避免等待系统语音初始化时没有反馈。
2. 进入 `system-speaking`，尝试系统普通话 `speechSynthesis`；voice 列表为空时等待 `voiceschanged`，但受固定超时限制。
3. 系统 API 不可用、普通话 voice 不存在、`onstart` 超时、播放失败或无响应时，先调用 `speechSynthesis.cancel()`，再进入 Piper 路径，禁止两路同时播放。
4. 检查中文 Piper 包缓存；已缓存则进入 `piper-speaking`，未缓存则打开通用资源包对话框。
5. 对话框的大小、版本和“一次性下载/当前浏览器当前域名有效”均来自资源注册表；用户确认后下载，用户取消不自动重复弹窗。
6. 下载成功后调用本地 Piper；下载、引擎加载或合成失败显示具体错误，取消或失败不改变学习状态；过期的播放 token 完成时不得覆盖当前按钮状态。

### 7.2 英语

保留“系统英语优先，Piper 兜底”的产品行为，但改用统一资源包 API。已缓存时不弹下载确认；未缓存时只对英语包显示下载确认。错误、重试、取消和进度由通用下载器处理，不能因为切换浏览器或 Origin 而把已有其他环境的缓存误认为当前已下载。

### 7.3 引擎调用

`loadEngine()` 只负责加载一次浏览器 Piper 运行时。`speakLocally(text, packageId)` 从资源注册表取得对应 voice base URL，并让同一个 `PiperWebEngine` 生成目标语言音频。引擎加载失败与模型下载失败必须分开提示。

Piper 引擎的单例只在成功且 idle 时复用。`generate()`、音素转换、模型读取、ONNX 推理或音频创建任一步抛错，都必须视为该引擎实例不可复用：调用可用的 `destroy()`，释放已创建的 object URL，清空模块内 `enginePromise`，并让下一次用户主动点击创建全新实例。不得让失败后的 vendored `PiperWebEngine` 停留在 busy 状态而无限等待，也不得自动无限重试。

## 8. 资源管理界面

在现有发音设置指引中增加“离线语音包”区块，不新增独立账号或云端状态：

每个包显示当前浏览器、当前 Origin 下的状态；不能显示成跨浏览器共享的全局下载状态。每个包显示：

- 语言和 voice 名称。
- 状态：未下载、下载中、已完成、部分缓存、校验失败、不支持。
- 预计大小与实际缓存大小（能获取时）。
- 资源版本，以及旧版本是否正在清理。
- 下载/继续下载/删除按钮。

页面顶部显示当前 Origin、当前浏览器存储范围和站点总占用/配额（浏览器支持时），并提示不同浏览器、配置文件或域名不会共享缓存。删除只删除对应 Piper 包，不删除学习数据、登录状态或 Service Worker 应用壳。

## 9. 错误处理与用户文案

错误类型至少区分：

- `timeout`：请求或读取超时。
- `network`：网络不可达、CORS 或代理失败。
- `http`：CDN 返回非 2xx。
- `integrity`：大小或 SHA-256 不匹配。
- `storage`：Cache Storage 写入失败或空间不足。
- `unsupported`：当前浏览器缺少本机离线语音所需能力。
- `engine`：Piper 运行时加载失败。
- `synthesis`：模型合成或音频播放失败。

文案必须说明“哪个语言包、下一步做什么”，不再统一显示模糊的“下载失败”。语言包大小、版本和下载状态只能来自资源注册表及完成标记；不得在弹窗、设置指引或错误提示中另写固定的 `90MB`、`115MB` 等数值。用户取消不显示错误，不记录为学习失败。首次升级导致旧版本缓存不可迁移时，应说明需要重新下载一次，不能提示为模型损坏。

## 10. 测试设计

### 单元测试

- 注册表校验：id、locale、文件列表、版本和 hash 元数据完整。
- 两个文件和完成标记齐全才算缓存；缺任一项都不算。
- 旧英语缓存完整迁移；部分旧缓存不会误判完成。
- 资源版本变化使用新缓存命名空间，不复用旧版本 Response。
- 只下载缺失文件；重复调用不会重复 GET。
- HEAD、GET 响应超时、流读取超时、取消和 CORS/HTTP 错误。
- hash/大小校验失败不会写完成标记。
- 流式缓存不会要求测试实现把完整 ONNX 复制成多个内存副本。
- 包级进度、删除和空间统计降级路径。
- 增量 SHA-256 的 `TransformStream` 在流读取、校验失败、`Cache.put` 失败和取消时都能清理 Response 与完成标记。
- `isAppShellCacheName()` 只识别应用壳缓存；Service Worker 激活和版本守卫清理旧应用壳时保留 `shadow-mate-voice`、`shadow-mate-piper-*` 与学习数据。
- Cache Storage、流、WASM 或音频能力缺失时，状态为 `unsupported`，不开始下载、不重复弹窗。
- 第一次 Piper `generate()` 失败后销毁引擎；第二次用户点击创建新引擎并能成功合成，不会永久卡在 busy。

### E2E 测试

- 英语和中文首次下载分别显示正确包名、大小和进度。
- 两种语言下载完成后刷新、切换模块、重复点击均不重复请求。
- 中文系统语音缺失时进入 Piper；Chrome 系统语音可用时不强制下载。
- 系统语音已触发但 `onstart` 超时/播放失败时，会先取消系统语音再只调用一次 Piper，不产生双重播放。
- 小米兼容场景：空 voice 列表、延迟 voice 列表、无 Web Speech API 均走预期路径。
- 下载中断后继续，不把部分缓存当作完成。
- 删除一个包不影响另一个包和学习状态。
- 同一 Origin 双标签页不重复并发下载（支持 Web Locks 的环境与回退环境各测一次）。
- Service Worker 升级后 Piper 包缓存仍保留；应用壳升级不触发模型重下载。
- 版本守卫触发页面更新后，当前版本的 Piper 包仍可离线播放；该验收从新版本客户端开始，旧客户端首次升级的尽力迁移另行记录。
- 真实 CDN 资源 Smoke Test：两个语言包的 `HEAD`、`GET`、大小、CORS、hash 和至少一次浏览器合成；结果必须关联资源发布清单和许可状态。
- Preview 浏览器 Smoke 仅在 `PIPER_PREVIEW_SMOKE=1` 且目标为 `https://preview-sm.shadow.wang` 时运行，记录 Service Worker script URL、包状态、一次下载、离线重开及后续无模型 GET；它是 Preview 证据，不是本地测试或小米验收。

### 真实设备验收

- 小米自带浏览器：系统 TTS 不可用时下载并播放中文 Piper；刷新后不重复下载。
- 小米 Chrome：系统中文发音优先，点击立即显示处理中；删除中文包后可重新下载。
- Preview 使用 `https://preview-sm.shadow.wang`，正式域名单独验收，不用跨域名缓存推断。

## 11. CDN 与公开资源门禁

中文模型进入公开 CDN 或 Preview 前需要记录：

- 两个文件的实际字节数和 SHA-256。
- 来源、模型卡、数据集许可证和分发说明。
- 模型权重许可、训练数据许可、微调来源和公开分发授权；缺失或未批准时阻止上传。
- `HEAD`/`GET` 的 2xx 响应。
- `.onnx`、`.onnx.json` 的 `Content-Type`。
- `Access-Control-Allow-Origin`、`GET, HEAD, OPTIONS` 和必要的暴露头。

模型上传和 CDN 配置由有权限的维护者完成；本仓库只提交资源注册表、许可证记录和测试，不提交模型二进制或秘密凭据。

`node scripts/piper-resource-smoke.mjs --base-url https://voice.shadow.wang/piper --package <package-id>` 是只读 CDN 门禁：逐文件发出 `HEAD` 与 `GET`，核对 2xx、`Content-Length`、注册表声明的 `Content-Type`、CORS 响应头、实际字节数和 SHA-256。中文包缺少 `releaseApproved` 或 `licenseStatus: "approved"` 时必须在网络请求前失败；命令不会上传模型或改变 CDN 配置。

## 12. 实施阶段

### Phase 0：模型、许可与资源预检

不改业务代码。先完成 `chaowen` 的实际浏览器合成、移动端内存观察、来源/许可证确认，再由维护者上传最终文件并记录 CORS、字节数、SHA-256 和资源发布清单。模型兼容性、设备证据或任何许可字段失败时，不进入中文接入，也不公开 CDN/Preview。

### Phase 1：通用资源核心与英语迁移

先修复 Service Worker 与版本守卫的缓存所有权，再抽取统一注册表、版本化缓存、完成标记、旧英语缓存迁移、增量流式下载、能力探测、超时/取消/错误和状态查询；保持英语产品行为不变。引入直接、经审计的增量 hash 依赖与第三方声明，并加入失败引擎的销毁/重建。先证明英语不会因为重构或应用升级而重复下载，并明确第一阶段只提供文件级复用，不提供字节级断点续传。

### Phase 2：中文 Piper 接入

将已通过 Phase 0 的中文包接入系统 TTS 兜底，完成中文/英语共用播放和下载流程，并在小米自带浏览器与 Chrome 上验收。

### Phase 3：资源管理与可选续传

加入语音包管理 UI、空间统计、删除、旧版本清理和跨标签页 single-flight。只有在补充 Range 响应契约、临时分片存储、断点校验、并发恢复和清理策略后，才加入 HTTP Range 字节级续传；它不是 Phase 1/2 的隐含承诺。若产品验收改为“中断后不得重下已传输字节”，必须把该功能前移并重新评审。

## 13. 发布与回滚边界

- 本功能属于 `code_only` 加公开第三方模型资源准备，涉及生产 CDN/正式发布时沿用 `production-impact`。
- 不新增数据库迁移，因此不添加 `db-migration`。
- Preview 阶段只部署到 `preview` 分支和 `preview-sm.shadow.wang`；真实小米验收通过后，才进入 `main`、版本 tag 和 Production 流程。
- 如果中文模型校验失败或体验不合格，可以关闭中文 Piper 配置并保留系统 TTS；不能回滚或删除用户已有学习数据。

## 14. 验收结论标准

方案实现完成必须同时满足：

1. 英语与中文共用同一下载/缓存/状态管理代码；bundled 运行时与 CDN 模型共享资源描述，但不混用下载 UI。
2. 同一浏览器与 Origin 下，完整资源包只下载一次；跨浏览器、配置文件或 Origin 的重复下载被明确解释并可管理；中断文件从头重下的限制在文案中明确。
3. 包 id/version、`.onnx`、`.json`、完成标记和完整性检查能阻止旧包或半包误用。
4. 大文件下载采用增量 hash + 单向流式缓存，不因 JS 临时副本造成不必要的移动端内存峰值；流失败和校验失败能清理半包。
5. Phase 0 的中文模型能在实际浏览器中合成目标字和短句，且许可证/来源门禁有记录。
6. 中文在小米浏览器可通过 Piper 离线发音；Chrome 中文按钮立即显示处理中。
7. 删除、重新下载、离线重开、Service Worker 升级和版本守卫更新均不删除当前 Piper 包或破坏学习状态；旧客户端首次升级的缓存迁移限制被记录并如实提示。
8. 本地定向测试、完整验证、Preview 部署、CDN 资源检查、资源许可清单和真实设备验收分开记录；缺少任一记录不能宣称完成。
