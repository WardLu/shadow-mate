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
| `public/piper/piper_phonemize.wasm` | 与 [piper-tts-web 初始提交](https://github.com/Poket-Jony/piper-tts-web/commit/7cec5cb4861f9322cd094b1b8b41a5b173e314db)中的 Git blob 完全匹配；Git blob SHA `f50a2850458de649e61cff61e006e8e4c69ac892` | **来源已核实；GPL 依赖的商业分发决策仍阻塞** |
| `public/piper/piper_phonemize.data` | 与同一提交中的 Git blob 完全匹配；Git blob SHA `fe1ce53f2ed0ff321c4b27d46a61fd7c75351179` | **来源已核实；GPL 依赖的商业分发决策仍阻塞** |
| `public/piper/en_US-ljspeech-medium.onnx` | [Piper Voices](https://huggingface.co/rhasspy/piper-voices) 的 `en_US-ljspeech-medium`；模型卡标注从头训练，LJ Speech 数据集为 public domain | **替换完成；正式权利链审核仍需完成** |
| `public/piper/en_US-ljspeech-medium.onnx.json` | 模型配置；标记 dataset 为 `ljspeech` | 随模型复核 |

### Lessac 模型替换结果

仓库已移除 `en_US-lessac-medium`，改用 `en_US-ljspeech-medium`。当前模型卡记录在 [`docs/piper-ljspeech-model-card.md`](docs/piper-ljspeech-model-card.md)，并保存了上游提交、下载日期、文件大小和校验值。

模型卡将 LJ Speech 数据集标为 public domain，且说明模型为从头训练；这比 Lessac 的研究/非商业限制更适合作为商业候选，但仍不能替代对模型权利链、声音人格/宣传权和目标市场的正式审核。

### `piper_phonemize` provenance 和许可证复核

当前两个 vendored 文件的确切字节来源已经定位到 `Poket-Jony/piper-tts-web` 的初始提交 `7cec5cb4861f9322cd094b1b8b41a5b173e314db`。该提交的 [`build/build.sh`](https://raw.githubusercontent.com/Poket-Jony/piper-tts-web/7cec5cb4861f9322cd094b1b8b41a5b173e314db/build/build.sh) 仍有重要不可复现点：Emscripten 使用 `latest`，`espeak-ng` 和 `wide-video/piper-phonemize` 使用默认分支，没有固定提交。

| 构建链组件 | 当前证据 | 许可证/再分发关注点 |
| --- | --- | --- |
| `piper-phonemize` | [rhasspy/piper-phonemize LICENSE](https://github.com/rhasspy/piper-phonemize/blob/master/LICENSE.md) 为 MIT；当前构建脚本使用 [wide-video/piper-phonemize](https://github.com/wide-video/piper-phonemize) fork | MIT notice；编译 revision 未固定，需保存可复现源码包 |
| `espeak-ng` | `piper-phonemize` CMake 构建并链接 eSpeak NG；[官方仓库](https://github.com/espeak-ng/espeak-ng)标注 GPL-3.0-or-later，并包含 `COPYING.APACHE`、`COPYING.BSD2`、`COPYING.UCD` 等 notice | **GPL 义务及其对 WASM/产品分发的影响必须由律师确认** |
| Emscripten/LLVM runtime | 构建脚本执行 `emsdk install latest`，未锁定版本 | 需补充对应版本、运行时许可证和构建记录 |
| ONNX Runtime Web | 由 `piper-tts-web.js` 使用；上游 LICENSE 为 MIT | 仍需为 JS/WASM 构建产物固定版本和 notice |

因此，本次复核完成的是“字节来源、构建脚本和主要依赖已被识别”，不是“语音链路已经获得商业许可”。在商业发行前应二选一：把该本地语音包作为单独的 GPL 合规分发单元并完成完整义务评估，或从商业构建中移除它并使用系统/其他已清权的语音方案；也可以在法律确认后采用替换后的 phonemizer 构建链。

### 目标 MeloTTS 路线

当前决策记录在 [`docs/tts-decision.md`](docs/tts-decision.md)。目标方案是系统 TTS 优先，系统语音不可用时请求自托管 MeloTTS API。官方 MeloTTS 代码、中文模型和英语模型目前均标注 MIT，适合作为商业候选；但在接入前仍需锁定版本、扫描完整服务端依赖树、保存模型卡和许可证文本，并确认服务端日志、缓存和动态文本处理边界。

MeloTTS 未完成接入前，不得把上述候选描述为当前已经替换 Piper，也不得删除当前 Piper 的来源和许可证记录。

## 当前文件指纹

以下 SHA-256 用于之后复核 vendored 资源是否发生了未记录替换：

| 文件 | SHA-256 |
| --- | --- |
| `public/piper-tts-web.js` | `c35588fad691ed023215f0194e0fb0e816b9a9766d3d2669dd49d4ea2fffd712` |
| `public/onnx/ort-wasm-simd-threaded.wasm` | `207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea` |
| `public/piper/piper_phonemize.data` | `a9879123581336fc36ae3706ae81c9e67becc388b80b8a4943cef2a78542e6aa` |
| `public/piper/piper_phonemize.wasm` | `2189e43490744c95445e251c38a47063f2ca266bcc30bbb18f692c47ff2bfd23` |
| `public/piper/en_US-ljspeech-medium.onnx` | `6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22` |
| `public/piper/en_US-ljspeech-medium.onnx.json` | `141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860` |

## 商业发行前清单

- [x] 为候选 Piper 模型、`piper_phonemize` WASM 和 `.data` 记录上游 URL、版本/commit、下载日期和校验值。
- [x] 移除 Lessac 模型并替换为 `en_US-ljspeech-medium`。
- [x] 完成 `piper_phonemize` WASM 的字节来源、构建脚本和主要依赖识别。
- [ ] 固定 Emscripten、espeak-ng、phonemizer fork 的可复现构建版本，并完成 GPL 义务与商业分发决策。
- [ ] 完成商业构建从 Piper 到自托管 MeloTTS 的迁移，并从商业产物移除 Piper WASM、phonemizer 和模型。
- [ ] 固定 MeloTTS 代码、模型和完整服务端依赖版本，更新最终 notices。
- [ ] 完成 `en_US-ljspeech-medium` 的正式权利链和目标市场法律审核。
- [ ] 对完整 npm 依赖树运行许可证扫描并审阅例外项。
- [ ] 将最终 notice、模型许可和法律审核记录绑定到具体 release/tag。
