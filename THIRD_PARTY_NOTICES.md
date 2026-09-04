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

该 allowlist 的 `approved` 是本项目对来源记录和所列上游文本已齐备的内部审计状态，不是对构件全部版权归属、许可适用范围或某一再分发方案合规性的法律结论。涉及新构建、修改或新的公开再分发时，仍须对实际纳入的材料和相应上游文本进行许可/法律审查。

此外，离线英语语音模型 `en_US-ljspeech-medium` 由 `voice.shadow.wang` CDN 分发，首次下载后由浏览器缓存，不随应用包分发。模型来自采用 MIT 许可证的 [Piper Voices](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium) `en_US/ljspeech/medium`；其 [MODEL_CARD](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD) 将训练数据标注为 public domain。注册表分别记录模型许可、来源和本项目 CDN 分发批准状态，任一项缺失都会阻止 active CDN 包通过静态与 smoke 门禁。

### Piper CDN 资源发布门禁

英语包 `en_US-ljspeech-medium` 的已批准清单版本为 `1`，基础 URL 为 `https://voice.shadow.wang/piper/en_US-ljspeech-medium`：`.onnx` 为 63,531,379 bytes（SHA-256 `6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22`），`.onnx.json` 为 4,972 bytes（SHA-256 `141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860`）。发布前以 `scripts/piper-resource-smoke.mjs` 对清单 URL、响应类型、CORS、字节数与 SHA-256 做只读核验。

中文离线语音包 `zh_CN-chaowen-medium` 使用 Piper Voices 的 Chaowen medium 文件，经 `voice.shadow.wang` CDN 分发，清单版本为 `1`：`.onnx` 为 63,221,984 bytes（SHA-256 `820d64ac16048fbcf38dd0823d37fab5f5e0c2bd71b01ca5a50f553fac19e746`），`.onnx.json` 为 2,927 bytes（SHA-256 `a6bb2caafa0645642f13cbf7e2f6fbbb16fded66e51109fc26d622f6472fa16f`）。模型卡将训练数据集标为 CC0，并记录该模型从 Xiao Ya voice 微调；本项目保留模型卡、来源、文件指纹和 CDN 分发记录，不能将数据集许可扩大解释为其他未记录材料的许可。

中文包基础 URL 为 `https://voice.shadow.wang/piper/zh_CN-chaowen-medium`。发布前和资源变更后使用 `scripts/piper-resource-smoke.mjs` 对最终 CDN URL 的响应类型、CORS、字节数与 SHA-256 做只读核验；任一项不匹配都必须保持下载未完成状态。

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
| `public/brand_assets/shadow-mate-writing-hand.ttf` | `38e6473bcbe4e3d2dba2218eb7235b4b5f7f3f080d75528f8e4d1fc8bc1c4a10` |
