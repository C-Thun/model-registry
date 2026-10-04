完成时间：2026-10-04T17:35:29+08:00

# 环境预检与本机消费验证

补强不能读取 Git 时的明确失败、未提交初始 Git 库的受限初始化提交、HEAD 与 index 并发变动拒绝、暂存目录链接边界；readme 写明 Python 3.12/venv、Git LFS 和空间要求。涉及 scripts/registry.mjs、scripts/cli.mjs、tests/registry.test.mjs、readme.md。

pnpm test 11/11 通过，无跳过；含真实 Git LFS、初始化不制造重复提交、提交失败后仅重试同包、外来文件不被纳入。

RayBend 指定库入口导入本轮实际重导出编码器，制作独立 profile 并自动提交 a11b522。默认路径入口在 /tmp 的隔离 XDG_DATA_HOME 下从固定上游权重缓存通过同一 CPU 转换器实际导出，随后校验并登记；完成后 RayBend 已恢复引用本 Git 库。应用 AI 输入准备和实际官方 ORT ZIP 两 DLL 校验通过。

未重下已有上游权重缓存，未试验全新系统 Python 环境的首次依赖下载安装；脚本固定版本且预检。未推送、tag、上传或制作软件安装器。
