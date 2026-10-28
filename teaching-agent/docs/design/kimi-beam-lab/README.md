# 智能配筋 · Kimi Web 迁移

用户要求按GitHub中的Kimi Web规范统一配筋实验室，并作为Teach Demo独立板块。采用现有Next.js、shadcn/Radix、Lucide与Motion，未新增npm依赖。

## 来源与映射

设计仓库：https://github.com/ECdison6227/rea-ui-library ，ref `main`，本次取得commit `c74175fddb9c0c82265d907b50454528a40f5c3b`。入口为`platforms/web/kimi-web/design-package.json`；该profile与此前已接入的Kimi资料一致，保留2026-10-20采集身份及研究边界。已阅读规范、tokens、组件/布局、交互、动效和适配指南，没有重新研究或改写原版证据。

| 规则/组件 | 本轮落点 | 方式 |
|---|---|---|
| 暖白侧栏、白画布、240px导航与36px行 | Sidebar、AppShell | 直接复用原站壳，新增“智能配筋”，保留后退与移动抽屉 |
| 系统字体栈、黑灰文字、细描边、灰色选中、局部蓝勾 | BeamLabView、既有主题变量 | 去除独立模块的蓝色主视觉、独立字体和阴影，沿用全站主题及暗色 |
| 统一内容列、22px标题、20px内容卡、12px字段 | kimi-page、既有Card/Input/Select | 复用864px外列；桌面表单按语义两列，窄屏一列 |
| PillCategoryTab、低频说明展开 | Button、details | 四任务圆角切换；单筋几何选项和截面示意按需展开 |
| 主要动作深色、次操作描边/ghost | 开始计算、示例、AI、JSON | 复用Button，loading/disabled/error/retry/cancel均有真实行为 |
| 150ms状态变化、300ms侧栏、减少动态 | AppShell、AiDrawer、reduced-motion | 使用既有Motion；结果出现后滚到结果并返回阅读焦点 |
| 会话正文、公式、输入与停止生成 | AiDrawer、useChat、Markdown | 复用全站Agnes通道、原输入框与数学渲染 |

几何图为原业务概念图，仅换用主题颜色；不冒充Kimi资产或实际钢筋排布。四类任务的输入、分类A/B语义、预测值、公式参考、适用性提示、双筋复核及JSON精度保留。

## 导航与数据路径（D目标选择）

- 从“资料下载”移除独立iframe，新增侧栏“智能配筋”，直达`/teachdemo/beam-lab`或`#beam-lab`。原`/rc-beam/`页面书签由Nginx跳至新板块，原数值API及资源继续兼容，不删除用户记录。
- 页面组件迁入原站，复用当前主题、组件与AI，不覆盖原课件、题库、笔记或课堂数据。
- 四任务各自保留当前输入；离开模块再返回保留表单与结果。修改输入清除旧结果，避免旧值冒充当前值；离开或取消会取消当前请求。
- `/api/beam/*`为服务端白名单代理。现有部署使用`BEAM_SERVICE_URL=http://127.0.0.1:3110/rc-beam/api/beam`和`BEAM_SERVICE_API_STYLE=web`复用已加载七权重的服务；也兼容原Python `/v1/*`。浏览器不知道内部服务地址。
- 结果讲解使用显式`mode: beam-lab`与本次实际完整结果，避免全站课程“先发PPT”的节奏干扰结果解读；普通引导对话保持原教学策略。

## 业务来源与验证

业务组件、数值契约和验证样例来自用户指定的“智能配筋实验室_网站嵌入交接包_20261027”。原件保留在工作区资料目录，ZIP SHA256 `d4b2702c4668b0e9b61d7c934b72282b88cfa381bece8ae40242b0da36d6557f`，199项原件完整性检查通过。模型权重、公式、等级设计值、特征顺序与逆变换未修改。

单元检查覆盖固定目的地址、两种服务协议、输入与结果校验、取消、规则门控和专用AI上下文。三平台浏览器检查使用原包合同fixture，验证独立入口、四任务、结果/表单保留、AI上下文、错误重试和取消；fixture检查不冒充真实权重推理。真实模型另通过19组合同在实际服务核验。

本地通过后提交PR，合入必须等待Android真实Chrome、macOS WebKit与Windows Chromium必需检查全部成功。最终线上核验及截图另附发布记录。

## 回退

保留原`/rc-beam/`服务、七个权重和容器配置。本轮发布失败可把Teach Demo的current切回发布前目录并恢复本轮新增的两个服务端变量，重启teachdemo。既有课堂数据库与Agnes凭证不随应用包替换。
