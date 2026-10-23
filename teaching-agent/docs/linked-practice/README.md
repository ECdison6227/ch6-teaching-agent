# 关联练习接入

新增独立的“关联练习”，入口位于侧栏“新增功能”。直接访问 /linked-practice 会进入共享工作区的 /#linked-practice，保留原来各板块的挂载与状态。

本次使用马跃资料的清洗结果，接入610条结构完整记录和22条已定位关联。14条待复核内容、15条暂缓关联没有进入运行目录。没有把“结构完整”标记成专业答案已复核；判断和选择按资料参考答案核对，填空与计算采用明确的自评流程。

## 行为与数据

- 单筋、双筋和题型筛选后直接开始，优先进入有明确关联的示范锚点。
- 作答后可补基础、辨概念、换角度，补基础后提供返回原题的操作。
- 缺少明确知识关系时只标记“同主题练习”，不冒充已证实的前置依赖。
- 选择、输入、解答展开状态和返回原题上下文保存在独立key ch6-linked-practice-v1。
- 自动核对、自评分别统计；重做生成新记录，保留旧错误和题目快照。
- 设置取消保留当前题和草稿；替换未提交草稿前确认。
- 读取失败不覆盖旧数据；保存失败保留内存，提供重试。
- 学习记录可回看和生成Markdown下载。浏览器下载落盘仍由浏览器处理，不以触发下载当作落盘确认。

原题库、自测答卷、错题本、课堂API与数据库逻辑均未修改。仅在AppShell加入新视图并在Sidebar添加独立分组。李坤的模型/权重、计算助教和单筋双筋演示的独立页面不属于本次关联练习接入。

## 直接复用

| 能力 | 现有实现 |
| --- | --- |
| 导航、折叠、移动抽屉 | Sidebar、SidebarProvider、SidebarTrigger |
| 按钮、卡片、输入、弹窗、下拉、加载 | 已有shadcn/Radix组件 |
| 字体、内容宽度、留白、表面、按钮形状 | globals.css既有kimi类与主题变量，未新增CSS |
| 图标和切换动效 | 已有Lucide、Motion与减弱动效设置 |
| 题干、答案、解析和公式 | 现有Markdown与KaTeX渲染组件 |
| 串行保存、读写失败重试 | 现有createPersistentStore和localStorageAdapter，使用独立key |
| Markdown下载 | 现有downloadMarkdown |

没有新增npm依赖，也没有改原有UI基础组件。旧Word中的压缩撇号写法由本功能的formatLinkedText转换成明确的数学定界形式，再交给原公式组件显示；原始数据、数值和答案没有被改写。

## 规范来源与适配

沿用rea-ui-library的Kimi Web规范，ref main，实际来源commit 4f18afe7a0bc28039006dc950d6b3ef8520faaaa，目录 platforms/web/kimi-web，版本为Live snapshot 2026-10-20，release marker c42d8c1。

原CSS、系统字体栈和现有控件直接复用；关联练习的信息组织、补练、自评和保存逻辑均为D类目标应用设计，不视为Kimi原版业务行为。原版移动OS、真实后台取消与全部动效参数等既有研究边界保持不变。

## 代码与资料入口

- src/features/linked-practice：业务页面、题库、关系、推荐、状态和独立保存。
- scripts/import-linked-practice.mjs：从工作区new-features/linked-practice清洗包导入瘦身后的运行数据，不向客户端打包原Word或绝对路径。
- tests/linked-practice.test.mjs：题池隔离、判分、自评、补练返回、草稿、导出与保存失败。
- tests/linked-practice-math.test.mjs：通过原公式组件验证旧Word撇号排版和比较符。

本地实现分支为feat/mayue-linked-practice，基于release/teachdemo-20261022的65d0e8b。没有推送、合并或改变原预览服务。运行预览为http://10.26.62.26:43316/linked-practice。

## 验证边界

完整结果见validation.json。浏览器记录只声明实际完成的流程；窄屏截图不替代真实Android模拟器测试。合并仍须满足仓库规定的Android、macOS、Windows三个检查。
