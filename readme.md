# model-registry

供多个项目共享的模型制品库。当前提供 TinyCLIP 图像编码器，FP32 / ONNX opset17；模型输入为预处理后的图像，输出512维特征。标签词表和阈值属于消费项目的 profile。

```text
onnx/wkcn-tinyclip-vit-40m-32/hf95ec8197-op17-fp32-r1/
  artifact.json
  image_encoder.onnx
  LICENSE.txt
  export.json
profiles/raybend-photo-tags/v1/
  profile.json
  manifest.json
  classes.json
  LICENSE.txt
```

三级目录是稳定定位符，完整 SHA-256 是精确身份。版本目录不可原地覆盖，旧版本保留；opset、权重、精度或配方变化需要新版本。

## 使用

需要 Node.js 22.12+、pnpm，以及提交模型时的 Git LFS。安装后先执行 `git lfs install`；普通 clone 后确认 `git lfs pull` 已下载实际模型，不能把 LFS 指针当 ONNX。

```bash
pnpm model:init
pnpm model:export
pnpm test
```

`model:export` 默认在当前库生成固定 TinyCLIP。缺少导出工具环境时，在系统用户数据目录建立隔离 CPU Python 环境并安装 `requirements-export.txt` 固定版本；不需要 CUDA。可用 `--python /absolute/path/to/python` 指定满足版本要求的既有环境。首次制作从固定上游 revision 下载权重，重复运行复用已验证的成品。

也可以 `pnpm model:export -- --import /absolute/path/to/exported-directory` 导入已经由固定脚本验证的相同编码器。导入必须通过固定编码器摘要；校验失败不覆盖已有版本。附加项目 profile 使用 `--profile-dir <目录> --profile-id <用途> --profile-version <版本>`，该目录需含消费契约 manifest.json 及其非ONNX文件。

Git 库中自动提交本次制品；非 Git 模型库也可使用。仅本次产物发生变化才提交，存在无关改动会拒绝。脚本不自动 push/tag/发布，也不改其它项目的本机配置。消费项目引用 artifact 和 profile 的路径及摘要，自行装配为自己的安装包。

公开下载可由维护者把固定模型发布为本库 Release 附件；本地使用不依赖公共下载地址。源权重固定在 https://huggingface.co/wkcn/TinyCLIP-ViT-40M-32-Text-19M-LAION400M/tree/95ec8197b3f2fe7f747865c61ca556cf0768b2f7 ，上游许可为 MIT。工具代码见 LICENSE，各模型具体许可见模型目录。
