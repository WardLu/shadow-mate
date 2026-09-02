# Shadow Mate Third-Party Notices

更新时间：2026-09-03

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

构建和测试依赖由锁文件记录。分发者应按实际构建产物重新检查传递依赖及其许可证要求。

## Vendored 浏览器语音资源

这些 app-shell runtime 文件不是 CDN 语音包；`src/piper-resource-registry.js` 仅对它们要求下面的组件级审计记录。文件字节数和 SHA-256 仍以“资源指纹”表以及 registry 中的四个固定条目为准。

| 文件或资源 | 字节数 | 固定上游来源 | 许可证和固定许可证链接 | 再分发时保留的条款 |
| --- | ---: | --- | --- | --- |
| `public/piper-tts-web.js` | 46,656,168 | [piper-tts-web v1.1.2, commit `950f1f5c8278296a6698cc11e8b976594dad6687`](https://github.com/Poket-Jony/piper-tts-web/tree/950f1f5c8278296a6698cc11e8b976594dad6687) | [MIT](https://github.com/Poket-Jony/piper-tts-web/blob/950f1f5c8278296a6698cc11e8b976594dad6687/LICENSE) | MIT 文本允许 use、copy、modify、merge、publish、distribute、sublicense 和 sell；应保留版权和许可声明，软件按无担保条款提供。 |
| `public/onnx/ort-wasm-simd-threaded.wasm` | 11,246,032 | [ONNX Runtime Web v1.20.1, commit `5c1b7ccbff7e5141c1da7a9d963d660e5741c319`](https://github.com/microsoft/onnxruntime/tree/5c1b7ccbff7e5141c1da7a9d963d660e5741c319/js/web) | [MIT](https://github.com/microsoft/onnxruntime/blob/5c1b7ccbff7e5141c1da7a9d963d660e5741c319/LICENSE)；vendored runtime header/source 亦保留此记录 | MIT 文本允许 use、copy、modify、merge、publish、distribute、sublicense 和 sell；应保留版权和许可声明，软件按无担保条款提供。 |
| `public/piper/piper_phonemize.wasm`、`public/piper/piper_phonemize.data` | 629,166；18,077,249 | [piper-tts-web v1.0.0, commit `7cec5cb4861f9322cd094b1b8b41a5b173e314db`](https://github.com/Poket-Jony/piper-tts-web/tree/7cec5cb4861f9322cd094b1b8b41a5b173e314db/dist/piper) | [piper-tts-web MIT](https://github.com/Poket-Jony/piper-tts-web/blob/7cec5cb4861f9322cd094b1b8b41a5b173e314db/LICENSE)；同时保留适用于这些构件的 [piper-phonemize](https://github.com/rhasspy/piper-phonemize) 与 [eSpeak NG COPYING](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING) notices/license texts | 对 piper-tts-web 的 MIT wrapper 适用前述 MIT 条件；在再分发 WASM/data 前，须一并保留所有适用的 piper-phonemize 与 eSpeak NG notices 和许可证文本，并按其上游条款复核。 |

上表是可审计的来源和 notice 记录，不构成对所有编译输入或构件许可适用性的法律意见。涉及新构建、修改或新的公开再分发时，仍需依据相应上游许可证文本进行法律/许可审查。

此外，离线英语语音模型 `en_US-ljspeech-medium` 由 `voice.shadow.wang` CDN 分发，首次下载后由浏览器缓存，不随应用包分发。模型来自采用 MIT 许可证的 [Piper Voices](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium) `en_US/ljspeech/medium`；其 [MODEL_CARD](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD) 将训练数据标注为 public domain。注册表分别记录模型许可、来源和本项目 CDN 分发批准状态，任一项缺失都会阻止 active CDN 包通过静态与 smoke 门禁。

### Piper CDN 资源发布门禁

英语包 `en_US-ljspeech-medium` 的已批准清单版本为 `1`，基础 URL 为 `https://voice.shadow.wang/piper/en_US-ljspeech-medium`：`.onnx` 为 63,531,379 bytes（SHA-256 `6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22`），`.onnx.json` 为 4,972 bytes（SHA-256 `141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860`）。发布前以 `scripts/piper-resource-smoke.mjs` 对清单 URL、响应类型、CORS、字节数与 SHA-256 做只读核验。

中文候选包 `zh_CN-chaowen-medium` 仍为 `gated`：尚未记录可公开分发的最终文件、来源与模型/训练数据许可证、分发授权或真实小米浏览器证据。因此它不在公开 CDN 或应用下载清单中；不得把候选状态解释为中文离线语音已获准发布。

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
