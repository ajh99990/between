# 本机管理员 V1 · 实际浏览器截图

全部为系统 Chrome 155 的实际 PNG，使用新建临时目录中的虚构数据；不是设计稿或生成图。主执行者实际查看了本轮核心页面、异常和最终修复图像，父任务另作独立像素复核。

共 29 张精选图，原文件名、原 PNG 字节保持不变；尺寸、SHA256、来源目录与构建 CSS 见 [manifest.json](manifest.json)。

- `browser-2026-10-13T03-30-29-179Z`：完整 64 项流程通过，四断点 1440/1024/768/375；CSS 为 `ad72559f`。
- `targeted-2026-10-13T03-37-30-574Z`：最后仅 CSS 危险文字/焦点调整后的 20 张局部补图；CSS 为 `d1d700bb`。补图不冒充重跑 64 项流程。
- 所有界面 JS 均为 `umi.6a4217c8.js`。完整自查闭环见 [SELF-CHECK](../../../design-system/between-orbit/SELF-CHECK.md)。

## 最终外观与操作补图

- [roles-final-first-screen-1440.png](./roles-final-first-screen-1440.png)
- [books-final-first-screen-1440.png](./books-final-first-screen-1440.png)
- [roles-danger-default-375.png](./roles-danger-default-375.png)
- [books-final-first-screen-375.png](./books-final-first-screen-375.png)
- [models-final-plan-panel-1440.png](./models-final-plan-panel-1440.png)
- [models-final-plan-panel-375.png](./models-final-plan-panel-375.png)
- [users-populated-table-1440.png](./users-populated-table-1440.png)
- [users-populated-table-375.png](./users-populated-table-375.png)
- [sessions-populated-table-1440.png](./sessions-populated-table-1440.png)
- [sessions-populated-table-actions-375.png](./sessions-populated-table-actions-375.png)
- [editor-final-select-focus-1440.png](./editor-final-select-focus-1440.png)
- [editor-final-select-focus-375.png](./editor-final-select-focus-375.png)
- [books-danger-primary-hover-375.png](./books-danger-primary-hover-375.png)

## 全流程中的阅读、运维与异常证据

- [16-models-1440.png](./16-models-1440.png)
- [22-resources-1440.png](./22-resources-1440.png)
- [23-resources-diagnostics-1440.png](./23-resources-diagnostics-1440.png)
- [24-resources-audit-1440.png](./24-resources-audit-1440.png)
- [26-reader-content-1024.png](./26-reader-content-1024.png)
- [39-reader-content-768.png](./39-reader-content-768.png)
- [51-reader-375.png](./51-reader-375.png)
- [52-reader-content-375.png](./52-reader-content-375.png)
- [62-resources-diagnostics-375.png](./62-resources-diagnostics-375.png)
- [65-mock-running-task-375.png](./65-mock-running-task-375.png)
- [11-version-conflict.png](./11-version-conflict.png)
- [75-model-save-error-retains-draft.png](./75-model-save-error-retains-draft.png)
- [79-loading.png](./79-loading.png)
- [80-network-failure.png](./80-network-failure.png)
- [81-expired-admin-session.png](./81-expired-admin-session.png)
- [82-books-empty.png](./82-books-empty.png)

任务运行卡与模型 400、503、401 使用明确的浏览器响应模拟；不代表真实模型生成或真实授权验证。用户/会话表格来自临时服务生成的虚构身份与会话。
