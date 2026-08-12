# 影伴 TTS 路线决策

更新时间：2026-08-12

## 决策结论

影伴当前处于 Dogfooding 阶段，暂不做声音克隆，也不为未来的个性化声音提前引入复杂模型。

目标路线是：

```text
设备系统 TTS
    ↓ 不可用或失败
影伴自托管 MeloTTS API
    ↓ 生成音频后缓存
浏览器播放
```

这条路线覆盖没有 GMS 或没有英语系统语音的国产 Android，同时避免在浏览器端分发 Piper 的 WASM、phonemizer 和 ONNX 模型。

## 当前状态

本仓库尚未完成迁移。当前生产代码仍然是：

- 优先调用浏览器 `speechSynthesis`；
- 系统英语语音不可用或失败时，下载并运行仓库内的 Piper 资源；
- Piper 资源位于 `public/piper-tts-web.js`、`public/piper/` 和相关 ONNX Runtime 文件。

因此，Piper 的 GPL 依赖和模型权利链仍是当前商业构建的阻塞项，不能因为已经决定迁移就视为已清除。

在 MeloTTS 接入完成前，Piper 仅作为当前 Dogfooding/小规模邀请内测的过渡实现；不得对外宣称已经完成商业许可清权或提供无条件商业再分发承诺。

## 候选筛选

### MeloTTS：当前首选兜底

- [官方代码仓库](https://github.com/myshell-ai/MeloTTS)标注 MIT；
- [官方中文模型](https://huggingface.co/myshell-ai/MeloTTS-Chinese)和[官方英语模型](https://huggingface.co/myshell-ai/MeloTTS-English)标注 MIT；
- 支持中文、英语和中英混读；
- 官方说明 CPU 可以实时推理；
- 模型保留在自托管服务端，不随 PWA 下载给用户。

使用前仍需固定版本，并对完整 Python 依赖树、模型文件和模型卡逐项记录许可证。

### Pocket TTS：后续离线实验

[Pocket TTS](https://github.com/kyutai-labs/pocket-tts)可以在 CPU 运行，也有社区浏览器实现；但官方尚未提供正式浏览器 SDK，模型约 236MB，官方模型标注 CC BY 4.0，且声音素材存在 CC0、CC BY 和 CC BY-NC 的差异。它暂时只作为后续离线 PoC，不进入当前商业构建。

### 暂不采用的浏览器方案

- Kokoro.js：模型和主库许可证较宽松，但当前 phonemizer 包含 eSpeak NG 运行时代码和数据，不能把它当作已经清除 GPL 风险的替代品；
- KittenTTS：体积小，但当前实现仍使用 eSpeak phonemizer，且项目仍标注 Developer Preview；
- OpenVoice、Chatterbox、Qwen3-TTS：保留给未来的声音克隆或高质量服务端场景，不进入基础朗读 MVP。

## 未来声音克隆边界

只有在明确需要克隆家长或孩子声音时，才单独评估 OpenVoice、Chatterbox 或 Qwen3-TTS。该功能必须另行处理录音同意、监护人授权、样本删除、克隆结果标识和滥用限制，不影响当前基础 TTS 路线。

## 迁移完成标准

- [ ] 建立 MeloTTS 服务端接口和健康检查；
- [ ] 生成音频按文本、语言、声音和语速缓存；
- [ ] 国产 Android 真机验证无 GMS 场景；
- [ ] 失败时有明确重试和降级提示；
- [ ] 商业构建不再包含 Piper WASM、Piper 模型或 Piper phonemizer；
- [ ] 固定 MeloTTS 代码、模型和完整依赖版本，并更新第三方 notices；
- [ ] 隐私说明明确动态文本会发送到影伴 TTS 服务，并确认保留、删除、日志和子处理者边界。
