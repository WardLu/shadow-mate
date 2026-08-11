# Shadow Mate Third-Party Notices

更新时间：2026-08-12

本文件是当前仓库的来源和许可证盘点，不是商业许可清零证明，也不是法律意见。正式商业发行前，应由项目主体或律师逐项确认可分发范围，并保留对应的上游版本、提交、许可证文本和许可条款。

## Shadow Mate 自有代码

根目录代码继续使用 MIT License，详见 [`LICENSE`](./LICENSE)。MIT 许可 Shadow Mate 代码本身，不自动许可第三方内容、模型、数据集、商标或 Logo。

## 运行时 npm 依赖

版本以 `package.json` 和 `package-lock.json` 为准；下表记录当前直接运行时依赖：

| 包 | 当前版本 | 许可证 | 上游 |
| --- | --- | --- | --- |
| `@supabase/supabase-js` | `2.111.0` | MIT | [supabase-js](https://github.com/supabase/supabase-js) |
| `@vercel/analytics` | `2.0.1` | MIT | [vercel/analytics](https://github.com/vercel/analytics) |
| `lucide` | `1.28.0` | ISC | [lucide](https://github.com/lucide-icons/lucide) |

构建和测试依赖不进入运行时产品，但仍由锁文件记录，包括 Vite、Vitest、Playwright 和 jsdom。每次商业发行前都必须重新扫描完整依赖树，包括传递依赖，并保留 MIT、ISC、Apache-2.0、BSD、MPL 等许可证要求的版权和 notice。

## Vendored 浏览器语音资源

| 文件或资源 | 当前证据 | 商业状态 |
| --- | --- | --- |
| `public/piper-tts-web.js` | 文件头标注 ONNX Runtime Web v1.20.1 和 MIT；项目代码引用 [piper-tts-web](https://github.com/Poket-Jony/piper-tts-web) | 需要补齐确切上游版本/commit 和完整来源记录 |
| `public/onnx/ort-wasm-simd-threaded.wasm` | 对应 [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)；上游 [LICENSE](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) 为 MIT | 当前可按 MIT notice 跟踪，发行前仍需核对构建来源 |
| `public/piper/piper_phonemize.wasm` | 本地 vendored WASM，当前仓库没有构建 commit、依赖清单或许可证文本 | **REVIEW REQUIRED** |
| `public/piper/piper_phonemize.data` | 与 phonemizer WASM 配套的运行时数据 | **REVIEW REQUIRED** |
| `public/piper/en_US-lessac-medium.onnx` | [Piper Voices](https://huggingface.co/rhasspy/piper-voices) 的 `en_US-lessac-medium` 模型 | **COMMERCIAL BLOCKER** |
| `public/piper/en_US-lessac-medium.onnx.json` | 模型配置；标记 dataset 为 `lessac` | 与模型一起复核 |

### Lessac 模型的阻塞原因

上游 [Piper Voices 模型页](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium) 显示仓库许可证为 MIT，但该模型的 [`MODEL_CARD`](https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_US/lessac/medium/MODEL_CARD) 明确链接到 [Lessac Blizzard 2013 数据集许可证](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html)。数据集页面说明该数据仅限非商业/研究用途，且研究许可明确排除商业化的语音合成产品或服务。因此不能仅凭模型仓库页面的 MIT 标签就宣布当前模型可用于 Shadow Mate 的商业服务。

在获得权利人明确的商业许可、或替换成来源和训练数据均允许商业分发的语音模型之前，商业发行不得继续使用该模型。当前用户可以继续使用已有的免费开源版本，但这不是商业清 clearance。

### `piper_phonemize` 的阻塞原因

当前仓库没有记录 `piper_phonemize.wasm` 与 `.data` 的确切构建来源、commit、编译参数、嵌入依赖和对应源代码。商业化前必须完成 provenance review，尤其要核对 espeak-ng 等构建依赖的许可证和再分发义务；在完成前不要声称整个语音链路已经商业许可清零。

## 当前文件指纹

以下 SHA-256 用于之后复核 vendored 资源是否发生了未记录替换：

| 文件 | SHA-256 |
| --- | --- |
| `public/piper-tts-web.js` | `c35588fad691ed023215f0194e0fb0e816b9a9766d3d2669dd49d4ea2fffd712` |
| `public/onnx/ort-wasm-simd-threaded.wasm` | `207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea` |
| `public/piper/piper_phonemize.data` | `a9879123581336fc36ae3706ae81c9e67becc388b80b8a4943cef2a78542e6aa` |
| `public/piper/piper_phonemize.wasm` | `2189e43490744c95445e251c38a47063f2ca266bcc30bbb18f692c47ff2bfd23` |
| `public/piper/en_US-lessac-medium.onnx` | `5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f` |
| `public/piper/en_US-lessac-medium.onnx.json` | `efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0` |

## 商业发行前清单

- [ ] 为每个 vendored 文件记录上游 URL、版本/commit、下载日期和许可证全文。
- [ ] 替换 Lessac 模型，或取得权利人明确的商业许可并保存证据。
- [ ] 完成 `piper_phonemize` WASM 构建链和 espeak-ng 依赖的许可证复核。
- [ ] 对完整 npm 依赖树运行许可证扫描并审阅例外项。
- [ ] 将最终 notice、模型许可和法律审核记录绑定到具体 release/tag。
