# Kimi Web 应用结果 · ch6-teaching-agent

已应用到本工作树，分支 `style/kimi-web-main`。核心业务、课件、题库、品牌、模型接口与技术栈保留。

- [前后/来源对照](comparison.html)
- [规则、功能和数据路径映射](mapping.json)
- [来源 commit、资产与目标 SHA](source-lock.json)
- [验证汇总](validation.json) · [逐项浏览器结果与实际字体](after/verification.json)
- 本地生产预览：http://127.0.0.1:43410

## 来源与直接复用

仓库 https://github.com/ECdison6227/rea-ui-library ，请求 ref `main`，实际固定 commit `4f18afe7a0bc28039006dc950d6b3ef8520faaaa`。版本为 `Live snapshot 2026-10-20; page release marker c42d8c1`。设计入口是 `platforms/web/kimi-web/design-package.json`。

原样接入系统字体栈、主题 tokens、5 个原始 SVG；精选原组件 CSS 保留原声明。目标输入文字实际为 16px/24px，CDP 标题字形样本为 Microsoft YaHei UI。没有把未加载的 MiSans、Geist 或 KaTeX 当作 UI 字体。

来源参考是零依赖 HTML/JS，目标为 Next/React，继续使用原有 shadcn/Radix、Lucide、Motion、react-markdown 和 KaTeX，通过样式与薄包装连接业务。Textarea 来自 [shadcn 官方源码](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/textarea.tsx)，只适配导入路径和 Tailwind 3 工具类；未增加 npm 依赖。

来源项目插画带 Kimi 品牌/水印，课程品牌继续使用已有东南大学校徽，并接入原 folder.svg。包内没有适用的业务图表库，课件和配筋率示意继续使用原工程能力。

HSL 语义键采用对应的中性灰以兼容 shadcn 的透明度修饰；来源 RGBA tokens 仍原样保留，供正文和表面使用。课程标题与教师数据表按本业务的文字长度和密度适配。导航沿用现有 shadcn 的 768px 移动断点，课程概览在 839px 以下折为单列；这属于 D 平台适配。

## 规则落点

| 来源角色 | 目标 | 接入方式 |
| --- | --- | --- |
| cmp-navigation / layout-home | Sidebar.tsx + ui/sidebar.tsx + AppShell.tsx | existing shadcn Sidebar; 240px ground, 36px rows, offcanvas, 6px/12px canvas, 300ms |
| cmp-composer / cmp-submit / cmp-context | Composer.tsx + ChatView.tsx | existing Button/Select plus official shadcn Textarea; 768×114 / radius24 / 16:24; original arrow/document SVG |
| auth-cmp-instructions / cmp-modal | notes.tsx NoteEditor + ui/dialog.tsx | existing Radix/shadcn Dialog; 560px/16px/24px, explicit cancel, validation, Escape and focus return |
| auth-layout-catalog / cmp-category-tab / cmp-gallery | MaterialsView.tsx | 800px search/category/two-column resource directory; 16px cards, 36px pills; original download SVG |
| auth-cmp-rich-document | Markdown.tsx + globals.css | existing react-markdown/KaTeX retained, 16:26 body, 22:36 H1, 20:32 H2, 14:22 tables; original code-header CSS and copy SVG |
| auth-layout-project / knowledge-card declaration | AppShell.tsx course overview | original knowledge-card rule with D 20px padding; course identity/content replaces Kimi project business |
| motion/catalog.json | existing motion + shadcn state animations + globals.css | 300ms sidebar, 150ms controls/menu with source curves, 320ms/45ms shortcut staggering; reduced-motion |

## 交互与数据路径

- **首页独立居中介绍 → 始终可达的课程工作区，保留进入学习并增加课件/资料快捷入口**：减少重复跳转，课程资料和对话同一导航；保留原 AppView 数据与挂载状态。
- **建议问题点击后立即调用模型 → 先填入输入草稿，再由用户发送**：允许核对题意、编辑和撤销；仅确认发送才走 useChat.send。
- **单行紧凑输入，刷新后草稿清空 → 两层多行输入与按主对话/AI侧栏隔离的本标签页草稿**：sessionStorage key ch6:chat-draft:<appPath>:{main|assistant}；不保存图片或对话到新服务器。
- **笔记自制遮罩和关闭/保存 → 复用现有 Dialog/Input/Textarea；取消、标题校验、Escape、焦点返回**：只在保存时调用原 useNotes.update，取消不写入；存储失败仍沿用原重试路径。
- **资料按长列表展示，失败只显示文字 → 搜索、类别、双列目录、明确重试与取消下载**：资源、查询参数、文件名保持；取消中止客户端 fetch，不声称服务器已停止 PDF 生成。
- **正文普通代码框 → 带复制操作的代码标题栏，保留公式和课程黄色重点**：复用原始代码标题栏 CSS 与 copy.svg；沿用现有剪贴板降级行为。

所有业务/交互适配均为 D。停止通过原有 AbortController 取消客户端请求；额外在分发流事件前检查 signal，拒绝停止后的晚到内容。服务器是否完全停止推理仍未知。下载取消也是客户端行为，不声称取消服务器正在生成的文件。

## 实际验证

- 生产构建、内置类型检查、22 项现有回归、数学渲染均通过。
- 25 项浏览器检查通过，记录在 after/verification.json。包括主工作区、输入/草稿、真实课件、笔记保存取消/刷新、加载/停止/错误重试、资料目录与下载、窄屏、深色、大字号、减少动画。分支存在的自测/课堂另有检查。
- 模型和下载故障用浏览器拦截的确定性 HTTP 响应验证真实页面/状态机，不调用真实模型。测试 PDF 不代表真实课程 PDF 全面验收。真实 Next 健康端点、课件图片和原始 SVG 实际加载。
- 1440×1000/DPR1 下输入实测 x=453 / y=447 / w=768 / h=114 / radius=24px；来源为 x445.5/y420/w768/h114。目标保留课程标题/提示及自己的滚动容器，位置差异为 D，未宣称逐像素克隆。
- 浏览器没有未捕获运行错误或 hydration 错误。中文文字实际回退字体以本机 CDP 样本为准。

## 已保留边界

来源 ready 只覆盖 2026-10-20 代表 UI。原版真实网络故障、后端取消语义、真实移动 UA/软键盘、完整读屏、全部账号/后台分支和逐帧动效测量仍未测。本次没有重新研究原 App，也没有用目标运行改写来源证据。

本轮目标检查是 Windows Chrome；390px 是桌面浏览器视口测试，组合输入使用合成 composing 事件。没有将其称为 Android/iOS 真实设备验收。Android/macOS/Windows 远端 PR 必需检查未触发或跳过，本轮不合入 main、不推送。

## 复跑与回退

在 teaching-agent 中运行：

```powershell
npm run typecheck
npm test
npm run test:math
$env:NEXT_DIST_DIR='.next-kimi'
npm run build
$env:DESIGN_BASE_URL='http://127.0.0.1:43410'
node scripts/verify-kimi-web.mjs
```

生产预览使用同一个 NEXT_DIST_DIR：

```powershell
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 43410
```

`.next-kimi` 是隔离验证目录，已忽略；默认开发/CI 仍使用原 `.next`。验证脚本以全新浏览器上下文运行，不读取日常浏览器的笔记或课堂凭据。脚本需要项目 package.json 已声明的 Playwright；本机主工作树缺少该开发包时，复用相邻 CI 工作树中已经安装的包，未增加依赖。

固定来源和目标基线见 source-lock.json。变更保存在专用样式分支；原基线分支未合并或修改。回退可在保留当前分支后切回原分支，或针对本次样式提交创建反向提交。回退代码不清空 IndexedDB、sessionStorage、题库、自测记录或课堂数据。
