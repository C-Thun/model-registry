完成时间：2026-10-04T17:18:47+08:00

# 通用模型库初始化

建立 AGENTS.md、readme.md、AGPL 工具许可、Git LFS 规则和三级不可变定位协议。TinyCLIP 图像编码器与项目标签 profile 分离；模型保持上游 MIT 许可。

实现 scripts/registry.mjs（身份、流式摘要、锁、原子发布、Git 边界）、scripts/cli.mjs（环境预检、隔离 CPU 环境、复用/导出/导入）和唯一 scripts/export-tinyclip.py。配方固定 checkpoint、工具版本、FP32/opset17 和输入预处理；版本内容不能被覆盖。无关改动、祖先 Git 仓、detached HEAD、merge/rebase、并发锁、HEAD/index 变化均阻断自动提交。提交仅本次明确路径，无自动推送或发布。

验证：pnpm test 8/8 通过，含临时真实 Git LFS；独立 CPU 重导出使用既有固定隔离环境与上游权重缓存，158885258 bytes、SHA a8576f0f9916d6e92237996d41c256e1e3150db5cf6db48758bb63c87537bb24，PyTorch/ORT 最大绝对误差 8.29995e-6（门槛 1e-4），输出 1×512 有限向量。日志 /tmp/model-registry-export-smoke.log，配方版本 hf95ec8197-op17-fp32-r1。

未执行推送、tag 或公共制品发布；尚待消费项目实际入库记录。首次工具创建与后续模型发布分开提交，以便制作前确认工作区清洁。
