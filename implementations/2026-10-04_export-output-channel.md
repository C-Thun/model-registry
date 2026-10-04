完成时间：2026-10-04T17:42:45+08:00

# 制作日志与机器输出分离

CLI 首次安装隔离依赖时把 venv/pip/导出日志送 stderr，stdout 只输出最终 JSON；避免消费项目首次制作时无法解析源登记结果。PyPI 和 CPU PyTorch 使用明确的官方索引。涉及 scripts/cli.mjs。

pnpm test 11/11 通过。独立 CPU 导出与指定既有 Python 的完整 CLI 已验证；未在本轮额外重装全部大型依赖，首次 pip 安装仍需新环境现场确认。该限制已记录，应用打包无 Python 依赖。
