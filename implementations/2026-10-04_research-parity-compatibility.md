完成时间：2026-10-04T18:10:58+08:00

# 共用转换器的研究接口兼容

通用转换器补回研究工具需要的 parity-input.f32 / parity-expected.f32，仍只发布 artifact 声明的编码器、许可和元数据，研究夹具不进入正式模型目录。CPU 对照报告在摘要准入前写出，准入失败也有报告保留。涉及 scripts/export-tinyclip.py。

RayBend 研究适配器共用转换器并恢复从本项目既有 manifest 读取 MODEL_ID/REVISION 供原参考脚本导入。实际执行适配器→prepare_tinyclip_reference→build_tinyclip_pack，转换器编码器摘要未变；classes.json 与原141513 bytes完全相同，使用已有profile许可（含派生说明）后 manifest 摘要也完全相同。原始上游MIT文本不包含项目说明，直接用它包装会产生不同许可/manifest摘要，未发布或注册该实验结果。

日常模型库单测11项已通过；本次Python改动以真实CPU重导出、参考向量和profile字节对照验证。未修改已发布模型/profile，未推送。
