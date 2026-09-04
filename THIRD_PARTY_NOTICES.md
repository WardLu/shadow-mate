# Shadow Mate Third-Party Notices

更新时间：2026-09-04

本文件列出当前仓库直接分发的第三方代码、模型和资源来源。第三方组件仍归各自权利人所有，并按各自许可证使用；使用者应在分发或修改前阅读对应的许可证全文。

## Shadow Mate 自有代码

根目录代码采用 MIT License，详见 [`LICENSE`](./LICENSE)。MIT 只许可 Shadow Mate 代码本身，不自动许可第三方内容、模型、数据集、商标或 Logo。

## 运行时 npm 依赖

版本以 `package.json` 和 `package-lock.json` 为准：

| 包 | 当前版本 | 许可证 | 上游 |
| --- | --- | --- | --- |
| `@noble/hashes` | `1.8.0` | MIT | [paulmillr/noble-hashes](https://github.com/paulmillr/noble-hashes) |
| `@supabase/supabase-js` | `2.111.0` | MIT | [supabase-js](https://github.com/supabase/supabase-js) |
| `@vercel/analytics` | `2.0.1` | MIT | [vercel/analytics](https://github.com/vercel/analytics) |
| `lucide` | `1.28.0` | ISC | [lucide](https://github.com/lucide-icons/lucide) |
| `pinyin-pro` | `3.29.3` | MIT | [zh-lx/pinyin-pro](https://github.com/zh-lx/pinyin-pro) |

构建和测试依赖由锁文件记录。分发者应按实际构建产物重新检查传递依赖及其许可证要求。

## Vendored 浏览器语音资源

这些 app-shell runtime 文件不是 CDN 语音包；`src/piper-resource-registry.js` 仅对其四组件精确 allowlist 要求审计记录。文件字节数和 SHA-256 仍以“资源指纹”表以及 registry 中的四个固定条目为准。

| 组件及关联文件 | 固定上游来源 | 许可证、固定链接与仓库副本 | 组件级再分发记录 |
| --- | --- | --- | --- |
| `piper-tts-web` — `public/piper-tts-web.js` | package.json version `1.1.2` at [commit `950f1f5c8278296a6698cc11e8b976594dad6687`](https://github.com/Poket-Jony/piper-tts-web/tree/950f1f5c8278296a6698cc11e8b976594dad6687)，该 version 是此 commit 的 package version，不称为公开 `v1.1.2` tag。 | [MIT](https://github.com/Poket-Jony/piper-tts-web/blob/950f1f5c8278296a6698cc11e8b976594dad6687/LICENSE)；[`third_party/licenses/piper-tts-web-MIT.txt`](./third_party/licenses/piper-tts-web-MIT.txt) | MIT 文本允许 use、copy、modify、merge、publish、distribute、sublicense 和 sell；复制或实质部分须保留版权和许可声明，软件按无担保条款提供。 |
| `ONNX Runtime Web` — `public/onnx/ort-wasm-simd-threaded.wasm` | version `1.20.1` at [commit `5c1b7ccbff7e5141c1da7a9d963d660e5741c319`](https://github.com/microsoft/onnxruntime/tree/5c1b7ccbff7e5141c1da7a9d963d660e5741c319/js/web)。vendored runtime header/source 也保留此组件记录。 | [MIT](https://github.com/microsoft/onnxruntime/blob/5c1b7ccbff7e5141c1da7a9d963d660e5741c319/LICENSE)；[`third_party/licenses/onnxruntime-MIT.txt`](./third_party/licenses/onnxruntime-MIT.txt) | MIT 文本允许 use、copy、modify、merge、publish、distribute、sublicense 和 sell；复制或实质部分须保留版权和许可声明，软件按无担保条款提供。 |
| `piper-phonemize` — `public/piper/piper_phonemize.wasm`、`public/piper/piper_phonemize.data` | version `1.2.0` at [commit `cfff8e52ebaea37c7e953ae2d06b174acb827ac4`](https://github.com/rhasspy/piper-phonemize/tree/cfff8e52ebaea37c7e953ae2d06b174acb827ac4)。当前 WASM/data 是由 [piper-tts-web package version `1.0.0`, commit `7cec5cb4861f9322cd094b1b8b41a5b173e314db`](https://github.com/Poket-Jony/piper-tts-web/tree/7cec5cb4861f9322cd094b1b8b41a5b173e314db/dist/piper) 提供的构件。 | [MIT](https://github.com/rhasspy/piper-phonemize/blob/cfff8e52ebaea37c7e953ae2d06b174acb827ac4/LICENSE.md)；[`third_party/licenses/piper-phonemize-MIT.txt`](./third_party/licenses/piper-phonemize-MIT.txt) | MIT 文本允许 use、copy、modify、merge、publish、distribute、sublicense 和 sell；复制或实质部分须保留版权和许可声明，软件按无担保条款提供。 |
| `eSpeak NG` — piper-phonemize CMake 依赖 | piper-phonemize build metadata 固定 version `1.52.0.1` at [commit `0f65aa301e0d6bae5e172cc74197d32a6182200f`](https://github.com/espeak-ng/espeak-ng/tree/0f65aa301e0d6bae5e172cc74197d32a6182200f)。 | [GPL-3.0-or-later COPYING](https://github.com/espeak-ng/espeak-ng/blob/0f65aa301e0d6bae5e172cc74197d32a6182200f/COPYING)、[Apache-2.0](https://github.com/espeak-ng/espeak-ng/blob/0f65aa301e0d6bae5e172cc74197d32a6182200f/COPYING.APACHE)、[BSD-2-Clause](https://github.com/espeak-ng/espeak-ng/blob/0f65aa301e0d6bae5e172cc74197d32a6182200f/COPYING.BSD2)、[Unicode](https://github.com/espeak-ng/espeak-ng/blob/0f65aa301e0d6bae5e172cc74197d32a6182200f/COPYING.UCD)；仓库保留 [`COPYING`](./third_party/licenses/espeak-ng-COPYING.txt)、[`COPYING.APACHE`](./third_party/licenses/espeak-ng-COPYING.APACHE.txt)、[`COPYING.BSD2`](./third_party/licenses/espeak-ng-COPYING.BSD2.txt)、[`COPYING.UCD`](./third_party/licenses/espeak-ng-COPYING.UCD.txt)。 | 随构件保留四份文本，并按所纳入材料对应的文本处理：GPL-3.0-or-later 受覆盖 object code 的 conveyance 需提供 Corresponding Source 并保留 GPL notices；Apache-2.0 保留 license/required notices；BSD-2-Clause 保留版权、条件和 disclaimer；Unicode 保留 copyright、permission notice 和 disclaimer。 |
| `sherpa-onnx WebAssembly TTS` — `public/sherpa-onnx/*` | version `1.13.2` at signed tag/commit [`13d0ae6c539d2809d32f5eaa3ef1db0c459d0b24`](https://github.com/k2-fsa/sherpa-onnx/tree/13d0ae6c539d2809d32f5eaa3ef1db0c459d0b24/wasm/tts)。JS 运行时来自同版本发布资产 `sherpa-onnx-wasm-simd-1.13.2-matcha-icefall-zh-en.tar.bz2`；worker 仅做 Shadow Mate 消息协议适配。 | [Apache-2.0](https://github.com/k2-fsa/sherpa-onnx/blob/13d0ae6c539d2809d32f5eaa3ef1db0c459d0b24/LICENSE)；[`third_party/licenses/sherpa-onnx-Apache-2.0.txt`](./third_party/licenses/sherpa-onnx-Apache-2.0.txt) | 分发时保留许可证、版权/归属及适用 NOTICE；修改文件保留显著修改说明；软件按无担保条款提供。 |

该 allowlist 的 `approved` 是本项目对来源记录和所列上游文本已齐备的内部审计状态，不是对构件全部版权归属、许可适用范围或某一再分发方案合规性的法律结论。涉及新构建、修改或新的公开再分发时，仍须对实际纳入的材料和相应上游文本进行许可/法律审查。

旧离线英语 `en_US-ljspeech-medium` 与中文 `zh_CN-chaowen-medium` 仍保留来源记录用于识别和安全清理历史浏览器缓存，但从本版本起不再是 active 下载包。英语 Piper 模型来自采用 MIT 许可证的 [Piper Voices](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium)，模型卡将训练数据标注为 public domain；中文 Chaowen 模型卡记录训练数据为 CC0。

### Piper CDN 资源发布门禁

### 统一中英双语 Matcha CDN 资源

active 包 `matcha-icefall-zh-en-1.13.2` 来自 sherpa-onnx `v1.13.2` 的固定发布资产。模型原始来源为 ModelScope `dengcunqin/matcha_tts_zh_en_20251010`，其模型 API 在本次审查时标记 `Apache License 2.0`；sherpa-onnx 源码与浏览器运行时同为 Apache-2.0。模型支持中文与英文、单说话人、16 kHz。

迁移原因不是运输错误：旧 Chaowen 模型即使在原生推理中也会错误朗读部分孤立汉字；Kokoro 出现静音或错误前置音；MeloTTS 未通过孤立汉字试听。`matcha-icefall-zh-en` 已于 2026-09-04 对中文单字“花、雨、风、牛”、对应英文单词及中英文长句完成试听，发音和完整性获确认；音色偏机械是当前明确接受、留待后续优化的限制。

CDN 基础 URL 为 `https://voice.shadow.wang/sherpa-onnx/1.13.2/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts`：`.data` 为 149,228,019 bytes（SHA-256 `3a00cfc82ddf39a2e798e63fad038e2c56f10aa4b7b952a0c98db758d119c14c`），`.wasm` 为 12,883,754 bytes（SHA-256 `9554feafc2bf4452c3e1f5d5d4b29b690e6e7db1eb3835478a793e864111f640`），清单合计 162,111,773 bytes。发布前运行 `node scripts/piper-resource-smoke.mjs --base-url <上述基础 URL> --package matcha-icefall-zh-en-1.13.2`，逐文件核对响应类型、CORS、字节数和 SHA-256；任一项不匹配都不得写入完成标记。

浏览器缓存受浏览器配置文件和 Origin 隔离。同一浏览器与同一 Shadow Mate 域名下只需下载一次；Chrome、夸克、小米浏览器或不同域名之间不能共享该缓存。

## 字帖字体资源

| 文件或资源 | 来源和许可证 |
| --- | --- |
| `public/brand_assets/shadow-mate-writing-hand.ttf` | 项目负责人提供的“瑞美加张清平硬笔楷书”字体文件；许可证或公开分发授权信息未随仓库提供，公开发布前需补充确认并保留相应授权说明 |

## 资源指纹

| 文件 | SHA-256 |
| --- | --- |
| `public/piper-tts-web.js` | `c35588fad691ed023215f0194e0fb0e816b9a9766d3d2669dd49d4ea2fffd712` |
| `public/onnx/ort-wasm-simd-threaded.wasm` | `207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea` |
| `public/piper/piper_phonemize.data` | `a9879123581336fc36ae3706ae81c9e67becc388b80b8a4943cef2a78542e6aa` |
| `public/piper/piper_phonemize.wasm` | `2189e43490744c95445e251c38a47063f2ca266bcc30bbb18f692c47ff2bfd23` |
| `public/sherpa-onnx/sherpa-onnx-wasm-main-tts.js` | `2f7d50fe6991982a4bcc8dd938d63de6edbb3f2b971e383e8986331ca5fcb311` |
| `public/sherpa-onnx/sherpa-onnx-tts.js` | `d0febb99e78c8322eb7dbda12e90a1b473de8a7d65f016a146576fbdadbf266a` |
| `public/sherpa-onnx/sherpa-onnx-tts.worker.js` | `c9c5bac9cb38e3d658ab0d3d68d6adbf09d9c724d2451372af33633d25814a14` |
| `public/brand_assets/shadow-mate-writing-hand.ttf` | `38e6473bcbe4e3d2dba2218eb7235b4b5f7f3f080d75528f8e4d1fc8bc1c4a10` |
