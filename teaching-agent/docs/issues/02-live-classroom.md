# 功能：实时课堂——教师开课、学生扫码加入与同步答题

## 目标与使用流程

教师进入「实时课堂」，创建课堂后展示二维码和课堂码；学生用手机扫码，输入姓名即可加入。教师从现有题库发题，学生作答，教师实时看到加入与提交情况，收题后查看统计、公布答案，再发下一题或结束课堂。

关联任务：https://github.com/ECdison6227/ch6-teaching-agent/issues/1。本 issue 由线程 B 负责，包含教师端、学生端、服务端、持久化、部署适配和最终导航接入，是一个完整功能。

评估基于当前 `main` 的 `ad34fcf`。建议使用独立分支 / 工作树 `feat/live-classroom`，不要与线程 A 在同一工作目录并发切分支、提交或改依赖；A 先合入，B 更新基线后完成统一接入。

交互参考雨课堂的开课、入课、课堂互动与教学数据反馈流程，首版实现上述闭环。[雨课堂官方帮助中心](https://www.yuketang.cn/help)

## 已核实的项目基础与方案选择

- 当前是 Next.js 15 App Router 单应用，已有 HTTP / SSE 对话，但没有教师身份、多人课堂、课堂数据库或课堂事件通道。
- 生产为单实例 Node.js 24 + Nginx + systemd，域名路径为 `https://edsionc.top/teachdemo`，端口 3327，服务配置内存上限为 512 MB。
- 代理已关闭缓冲，读取超时 150 秒；现有 AI 接口有每 IP 3 个连接的限制，课堂不能直接照搬该限制，学校同一出口 IP 会有多个学生。
- 首版方案：继续使用 Next.js Route Handlers，HTTP 提交命令 / 答案，SSE 推送课堂状态，SQLite 保存课堂、参与者与作答。保留状态快照拉取作为恢复和降级手段。
- SQLite 优先使用部署用 Node.js 24 的内置 `node:sqlite`，本地 Node.js 24 已验证可用；实施时需同时通过目标服务版本与 Next.js 生产构建验证。数据库代码只运行在 Node.js runtime，使用短事务。
- SQLite 为跨发布的事实来源。禁止只把课堂和答案存进进程内 Map；也不要假定不同 Next.js route bundle 共享同一个内存事件总线。

技术依据：[Next.js 15 Route Handlers / Streaming](https://nextjs.org/docs/15/app/api-reference/file-conventions/route)、[Node.js SQLite](https://nodejs.org/api/sqlite.html)。SSE + SQLite 是针对当前部署方式的设计选择，首版不引入独立 WebSocket 服务、Redis 或完整教务平台。

## 首版产品规则

### 1. 教师开课与权限

- 教师首次进入时通过服务端配置的 `CLASSROOM_TEACHER_ACCESS_CODE` 验证，之后使用服务端生成的教师会话。配置缺失时显示配置提示并拒绝创建课堂；密钥不能放在 `NEXT_PUBLIC_*`、浏览器代码或二维码中。
- 教师创建课堂时填写课堂标题；创建后立即展示可扫描二维码、6 位随机课堂码、可复制的入课链接和已加入人数。课堂码不可预测、有效课堂内唯一，冲突时重试。
- 教师会话与课堂所有权关联；只有该课堂教师能开始上课、发题、收题、查看名单 / 全部作答、公布答案和结束课堂。知道课堂码的学生不能获得教师权限。
- 教师刷新页面后可从本人课堂列表恢复进行中的课堂，不要求完整账号注册系统。
- 二维码只编码学生入课地址，例如 `https://edsionc.top/teachdemo/join/123456`。真实二维码在本应用内生成，不调用外部二维码图片服务，也不能用占位图代替。

### 2. 学生扫码加入

- 独立手机页面 `/join/[code]`。姓名必填，学号选填；没有账号也可以进入。没有可扫码设备时，支持 `/join` 输入课堂码。
- 用随机参与者 ID 与本设备的服务端会话识别学生，不能用姓名或学号直接充当鉴权凭据。相同姓名不自动合并；刷新、短暂断网再进入同一课堂不重复计人数。
- 待上课时显示课堂标题与等待状态；老师发题后自动进入作答；中途加入时取得当前状态，题目仍开放则可作答，已收题则等待。
- 无效码、已结束课堂、会话过期、连接断开都要有清晰反馈和恢复入口。
- 学生只能取得自己的作答和老师已经公布的内容；不能读取全班名单、他人答案或教师凭证。

### 3. 发题、作答、收题和公布

- 教师从现有题库选择题目，可按题型筛选。使用关联 issue 的共用 catalog 获取难度与可用性；难度筛选可在该契约合入后接入。
- 首版支持现有的选择、判断、填空；仅发布已复核、有答案且结构有效的题。无标准答案和未复核题不可发布。
- 一次开放一道题，老师明确收题后再推进下一题；同一题可再次发布，每次产生新的 `roundId`，不能覆盖上一轮记录。
- 学生开放期间可以修改答案，以最后一次成功提交为准。显示「提交中 / 已提交 / 提交失败可重试」，超时或断网不能假装提交成功。
- 收题由服务端状态决定：收题事务提交后拒绝新答案和修改；学生端按钮、计时器和请求参数都不是最终依据。首版支持教师手动收题，自动倒计时可后续扩展。
- 教师实时看到独立参与者的已答 / 未答数量、选择或判断选项分布；填空显示提交数和教师可见的作答列表。
- 教师可在收题后公布标准答案和解析。学生在公布前只能看到题干、选项、自己的答案及提交状态；HTTP、SSE、重连快照、SSR 初始数据均不能提前包含答案、解析、个人正误或能推断正确选项的字段。
- 使用现有 `grade()` 在服务端判定，保留答对 / 答错 / 待核对三种结果。填空长描述不能可靠匹配时显示待核对，不强判错误；教师界面单独列出未答和待核对数量。
- 结束课堂时原子关闭开放题、冻结作答并停止入课；教师仍能查看已结束课堂的只读结果，学生看到课堂结束状态。

### 4. 状态、刷新与实时性

建议状态机：

```text
课堂：waiting → active → ended
题目轮次：open → closed → revealed

waiting / active 允许加入；ended 拒绝新加入和提交。
active 才能发题；同一课堂最多一个 open 轮次。
closed 才允许公布；重复命令幂等或返回明确的状态冲突。
```

- 接口应先落库成功，再广播变更。客户端以服务端课堂版本号 / 事件游标和快照为准，不能用本地时间或收到消息的先后顺序覆盖新状态。
- SSE 新连接先取权限制约后的最新快照；支持重连与 `Last-Event-ID` / 游标，历史事件不足时重新给快照即可，不要求保存无限事件。
- 约 15–30 秒心跳，检测断开，释放 reader / timer / 订阅，避免空闲 150 秒被代理断开或页面切换后泄漏连接。
- 进程重启后从 SQLite 恢复课堂、轮次及答案；内存订阅可重建。断网、后台挂起再恢复时先拉最新快照，再继续接收事件。
- 可用 3–5 秒状态拉取作为 SSE 失败时的降级；教师和学生均显示连接状态。服务端重启后的课堂状态必须与数据库一致。

## 数据模型与接口建议

### 数据最小集合

| 表 / 模型 | 关键字段与约束 |
| --- | --- |
| TeacherSession | 随机会话、过期时间、ownerId；服务端验证，不暴露访问码 |
| Classroom | id、ownerId、code、title、status、version、createdAt、endedAt |
| Participant | id、classroomId、name、可选 studentNo、会话摘要、joinedAt、lastSeenAt |
| QuestionRound | id、classroomId、sequence、questionId、完整题目快照、status、openedAt、closedAt、revealedAt；同课堂最多一个开放轮次 |
| Submission | roundId、participantId、answer、grade、submittedAt、revision；`(roundId, participantId)` 唯一 |
| ClassroomEvent（如采用事件游标） | 单调 ID、classroomId、事件类型、关联实体 / 版本；按教师与学生视图过滤，不直接广播敏感实体 |

参与者加入、答案写入与轮次状态检查放进事务。重复点击 / 网络重试使用幂等键或等价机制，提交人数不能因重复请求增加；收题与提交并发时，以数据库事务先后决定是否接受。

### 接口边界

以下是建议命名，可调整，但教师接口与学生接口的授权边界必须保留；所有路径通过现有 `appPath()` 处理子路径。

| 方法与路径 | 用途 / 权限 |
| --- | --- |
| `POST /api/classrooms/teacher-session` | 验证教师访问码并建立会话；限速 |
| `GET /api/classrooms` | 该教师拥有的课堂列表 |
| `POST /api/classrooms` | 教师创建课堂，返回入课链接与课堂码 |
| `GET /api/classrooms/[id]` | 教师完整快照；仅课堂所有者 |
| `POST /api/classrooms/[id]/start` | 教师开始课堂 |
| `POST /api/classrooms/[id]/rounds` | 教师发布题目，服务端按 questionId 取题并建立快照 |
| `POST /api/classrooms/[id]/rounds/[roundId]/close` | 教师收题 |
| `POST /api/classrooms/[id]/rounds/[roundId]/reveal` | 教师公布答案 |
| `POST /api/classrooms/[id]/end` | 教师结束课堂 |
| `GET /api/classrooms/[id]/events` | 仅所有者的教师 SSE 视图 |
| `POST /api/classroom-participation/join` | 学生按 code 加入并建立参与者会话 |
| `GET /api/classroom-participation/[classroomId]` | 当前学生快照，不含未公布答案及他人信息 |
| `GET /api/classroom-participation/[classroomId]/events` | 当前学生 SSE 视图 |
| `POST /api/classroom-participation/[classroomId]/rounds/[roundId]/answer` | 当前学生提交，服务端检查所属课堂、开放状态与选项合法性 |

公共 DTO 使用字段白名单，例如未公布时只提供 `{ id, type, prompt, options, difficulty }`；不要把完整 `Question` 展开后只删除一个 `answer` 字段，`analysis` 等字段同样可能泄题。学生页面禁止导入完整题库模块。

沿用 Zod 和项目的请求校验 / 大小限制；教师 / 学生会话用 HttpOnly Cookie，生产启用 Secure 并限制 Path / SameSite；修改请求检查来源，不能让未授权请求、跨课堂参与者或伪造 role 改状态。错误分别返回清晰的参数、权限、状态冲突、过期和限速结果。

## 文件所有权与两个线程的衔接

路径均相对于 `teaching-agent/`。

| 文件范围 | 负责人 / 处理方式 |
| --- | --- |
| `src/lib/classroom/*` | B：类型、状态机、SQLite、鉴权、DTO、事件 / 快照逻辑 |
| `src/app/api/classrooms/*`、`src/app/api/classroom-participation/*` | B：教师与学生 API |
| `src/components/ClassroomView.tsx`、相关业务 hooks | B：教师课堂业务视图，组合已有组件 |
| `src/app/classroom/page.tsx`、`src/app/join/page.tsx`、`src/app/join/[code]/page.tsx` | B：独立调试入口和学生手机入口 |
| `tests/classroom.test.mjs`、`docs/testing/classroom.md` | B：接口 / 状态测试及多端联调记录 |
| `src/lib/question-catalog.ts`、`src/content/question-meta.json` | A 所有；B 只读复用。A 先交付共用契约，B 前期可用现有 Question / grade 开发课堂基础 |
| `AppShell.tsx`、`Sidebar.tsx` | B 独占修改，最终同时接入「题库自测」「实时课堂」；A 的视图合入后再接入其组件 |
| `package.json`、`package-lock.json`、`next.config.mjs`（必要时） | B 统一维护；新增依赖与版本决策记录在 issue / PR 中，不引入重复 UI 库 |
| 部署配置、`.env.example`、`.gitignore`、共用验证说明 | B 统一维护；不提交密钥和真实学生数据 |

两个线程都先用独立页面验收功能。A 不修改共用导航；B 可以先完成课堂页面和服务端，最后合入 A，再把两个业务视图接入现有 `AppShell` 的页内切换，保留现有聊天和自学页面的挂载 / 状态。新增 `SelfTestView` / `ClassroomView` 是业务组合，不重造 Button、Dialog 等基础控件。

隐藏的课堂业务视图不得持续创建重复连接；按激活状态启动订阅，并在退出视图或卸载时释放连接，重新进入时从服务端恢复。

二维码编码可使用合适的专用库，优先服务端生成；由 B 统一维护依赖。遵守 `AGENTS.md` 中现有 UI 库与依赖规则，当前规划任务不执行安装。

## 部署要求

- 数据库放在可配置的持久目录，建议 `/srv/teachdemo/shared/classroom/classroom.sqlite`，通过 `CLASSROOM_DB_PATH` 指定；发布切换与回滚不覆盖数据库。开发使用 git 忽略的独立数据目录。
- 配置 `CLASSROOM_PUBLIC_ORIGIN=https://edsionc.top` 与现有 `NEXT_PUBLIC_BASE_PATH=/teachdemo`，组合生成完整学生地址；origin 配置不含子路径，避免漏前缀或重复前缀。开发环境可使用手机可访问的局域网 origin，不能生成学生手机无法访问的 localhost 地址。
- SQLite 启用合适的 WAL / busy timeout、外键和 schema migration；验证 systemd 用户对数据库目录及 WAL / SHM 文件有写权限，补充迁移、备份与恢复说明。
- 教师权限配置与会话密钥写在服务器环境配置，`.env.example` 只给空值与用途说明。
- SSE 与课堂请求设置独立的限速 / 并发规则，兼容同校园 NAT；不继承 AI 接口的每 IP 3 连接限制。保持禁用缓冲与心跳，明确单实例部署范围。
- 合并两个线程后由 B 一次性接入全量新测试；原 `npm test` 目前只运行 `tests/regression.test.mjs`，不能让新增文件遗漏，可更新为显式覆盖全部 `*.test.mjs` 的命令。
- 构建和运行分别验证默认根路径及 `/teachdemo` 子路径，二维码、API、SSE、返回入口、图片资源均可访问。当前任务只交付实现与部署说明，实际生产发布另按发布任务执行。

## 建议交付顺序

1. 先定义状态机、教师 / 学生 DTO、SQLite 表与最小服务端验证；复用现有题库与判题函数。
2. 跑通「创建课堂 → 手机加入 → 发一题 → 提交 → 收题 → 公布」单轮闭环。
3. 加入 SSE、统计、下一题、结束课堂，以及断线 / 刷新 / 重启恢复。
4. 补齐权限、幂等、并发收题、多课堂隔离与子路径部署验证。
5. 合入 A 的 catalog 与业务页面，由 B 统一接上两处导航、依赖和全量测试命令，完成跨功能回归。

## 验收标准

- [ ] 教师创建课堂后显示真实可扫二维码、课堂码与入课链接；至少两台真实手机能加入并作答。
- [ ] 扫码与手输课堂码均可用；根路径及 `/teachdemo` 部署都不会漏前缀或重复前缀。
- [ ] 无教师凭证、非所有者、学生会话均不能操作教师接口或读取全班数据；教师密钥不出现在前端产物和二维码中。
- [ ] 选择、判断、填空均能发布与作答；同题重复发布使用不同 roundId；一次最多一个开放轮次。
- [ ] 统计按独立参与者计算；重复加入、重复提交和网络重试不会增加人数或答题人数，最后成功修改的答案可恢复。
- [ ] 收题后拒绝新增 / 修改答案；收题与提交并发行为有事务测试；重复收题、公布、结束不会产生错误状态。
- [ ] 公布前学生 HTTP、SSE、SSR 与恢复快照均不含标准答案、解析、个人正误；公布后正确显示答案与解析。
- [ ] 未答和待核对单独显示；沿用 grade 三态判题，不把不可可靠判断的填空自动算错。
- [ ] 刷新 / 断线恢复不丢本人答案；服务重启后仍能恢复课堂和记录；旧消息不能倒退当前题目状态。
- [ ] 课堂结束后禁止加入和提交；教师仍可查看只读结果。
- [ ] 多课堂、不同学生及教师视图隔离正确；学生只能读取自己的作答。
- [ ] 单实例模拟 100 名学生连入并各提交一次，记录运行环境、延迟和内存；正常局域网 / 测试环境下状态更新目标 p95 ≤ 2 秒、无丢提交，未达标则记录瓶颈并修正。真实手机需补充微信扫码内置浏览器与普通浏览器冒烟验收。
- [ ] SSE 有心跳、重连、快照恢复及资源清理；同校园出口不会触发 AI 接口的 3 连接限制。
- [ ] 通过 `npm run typecheck`、包含两个新增测试文件的 `npm test`、`npm run test:math`、`npm run build`；数据库测试使用临时文件，不能操作真实课堂数据。
- [ ] 最终侧栏同时可进入自测与实时课堂；原引导对话、自学天地、资料下载和笔记仍可用，页内切换不重置原聊天状态。
- [ ] 配置样例、数据库目录 / 权限 / 迁移 / 备份说明及手工验收记录齐全。

## 首版范围边界

首版以一个真实课堂可稳定完成答题为目标。音视频直播、PPT 实时翻页同步、弹幕、点名签到、班级教务管理、学校 SSO、正式实名核验、学生成绩排名、AI 主观题批阅、云端错题同步及跨实例部署放到后续任务。学生课堂答案自动加入自测错题本也暂不作为两个线程的依赖。
