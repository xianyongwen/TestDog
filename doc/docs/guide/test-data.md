# 测试数据与登录态

自动化测试最常撞上的两堵墙：**登录**和**脏数据**。TestDog 用「登录配置」解决前者，用「环境变量 + 系统变量」解决后者。

<video class="doc-video" src="/videos/test-data.mp4" autoplay muted loop controls playsinline></video>
<p class="doc-video-caption">项目行操作：环境变量管理 → 登录配置管理（含新增登录配置表单）</p>

## 登录配置（登录态录制）

把「登录」从每条用例里剥离出来：录一次登录态，生成与回放复用。

![登录配置管理](/images/login-configs.png)
<p class="doc-img-caption">登录配置管理：配置列表 + 新增登录配置表单（在项目行操作 🔒 打开）</p>

### 录制登录态

1. 项目列表行操作点 🔒 **登录配置**，打开管理弹窗。
2. 在「新增登录配置」区填**起始地址**（登录页 URL），配置名称可留空（自动命名）。
3. 点「**开始录制**」，弹出浏览器，手动完成登录。
4. 点「**停止并保存**」，保存登录后的浏览器状态（**Cookie + localStorage**）。

::: warning 注意
录制中**直接关闭浏览器 = 取消录制，不保存**；如需中止请点「取消录制」，完成登录后点「停止并保存」。
:::

### 使用登录态

- **回放**：用例详情「登录配置」下拉选择，浏览器以已登录状态启动，跳过登录步骤。
- **AI 生成**：同样选择登录配置，以已登录状态生成（能直接生成登录后才能到达的页面流程）。
- **项目默认**：用例列表右上角可设置项目级默认登录配置。
- 管理弹窗中可**重命名**、**设为默认**、**重新录制**（会话过期后更新）、**删除**。

::: warning 登录态有效期
登录态的有效时间取决于被测系统（会话/Cookie 策略各异），**建议每次开始测试前重新录制**，避免用失效登录态跑出一批假失败。
:::

## 环境变量

项目级键值对，脚本中用 <code v-pre>{{变量名}}</code> 引用，运行时替换为对应值。

![环境变量管理](/images/env-vars.png)
<p class="doc-img-caption">环境变量管理（在项目行操作 🔑 打开）</p>

- **定义**：项目行操作点 🔑 **环境变量**，「添加变量」维护键值对。变量名仅允许字母/中文/数字/下划线，且不以数字开头。
- **引用**：步骤的输入值、URL、断言期望值等位置写 <code v-pre>{{域名}}</code>、<code v-pre>{{测试账号}}</code>（支持中文变量名）。
- **替换范围**：`instruction`、`url`、`value`、`locator.value`、`locator.name`、`assertion.expected`、`assertion.jsonPath`。
- **未定义**的变量保留 <code v-pre>{{name}}</code> 字面量并在运行日志告警。

典型用法：把环境相关值（域名、账号、密码）做成变量 —— 同一条脚本换个环境变量值就能跑测试/预发两套环境。

## 系统变量

运行期内置的随机数据源，写法与环境变量统一（<code v-pre>{{...}}</code>），**无需定义**，直接可用：

| 变量 | 生成内容 | 示例 |
| --- | --- | --- |
| <code v-pre>{{systemTime}}</code> | 当前时间戳（13 位毫秒） | <code v-pre>test_{{systemTime}}</code> → 唯一账号 |
| <code v-pre>{{randomNumber}}</code> | 随机数字串，默认 6 位 | <code v-pre>SN-{{randomNumber:8}}</code> |
| <code v-pre>{{randomChinese}}</code> | 随机常用汉字，默认 2 个 | <code v-pre>user_{{randomChinese}}</code> |
| <code v-pre>{{randomPhone}}</code> | 随机大陆手机号（11 位） | 直接填手机号字段 |
| <code v-pre>{{randomEmail}}</code> | 随机邮箱 | 直接填邮箱字段 |
| <code v-pre>{{randomIdCard}}</code> | 随机 18 位身份证号（GB 11643 校验位） | 直接填证件号字段 |

- **`:N` 参数**：<code v-pre>{{randomChinese:4}}</code> 指定生成 4 个汉字、<code v-pre>{{randomNumber:8}}</code> 指定 8 位数字。
- **同一次运行内同键值一致**：`fill` 写入的随机手机号与后续断言引用的是同一个值，不会中途变化。
- **同名冲突时环境变量优先**（项目显式定义覆盖内置随机值）。

主要用途：**构造唯一测试数据**，避免重跑撞上「手机号已注册」等残留数据问题。
