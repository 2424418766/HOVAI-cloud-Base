# HOVAI

静态作品网站，前台为纯静态资源（`public/` 直接部署），不依赖任何前端框架或打包器。可选的内容管理后台由 CloudBase 云函数 `api` 提供。

## 目录

- `public/`：网站前台、后台页面和作品图片（部署根目录）
- `cloudfunctions/api/`：CloudBase 云函数（内容保存、登录、媒体分块上传与读取）
- `cloudfunctions/api/lib/`：认证、HTTP 响应与 CloudBase SDK 初始化
- `scripts/`：构建校验与本机静态预览
- `package.json`：Node 版本与脚本

## 部署到 CloudBase 静态网站托管

### 1. 推送到 GitHub

仓库根目录应直接看到：

```text
package.json
public/
cloudfunctions/
scripts/
README.md
```

### 2. CloudBase 静态网站托管 → 新建应用 → 从 Git 仓库导入

填写：

```text
安装命令：npm install
构建命令：npm run build
构建产物目录：public
部署路径：/
```

Node 版本选择 20（或更高）。

### 3. SPA 错误页面（本项目实际不需要）

前台使用 hash 路由（`#/work`、`#/about`），直接访问或刷新任何页面都返回首页 `index.html`，不会产生 404。因此**不需要**在「静态网站托管 → 设置 → 错误页面」里配置 `index.html` 兜底。

### 4. 内容管理后台（可选）

前台内容来自运行时文件 `public/data/site.json`，无需任何环境变量即可正常显示。

如果需要在线编辑并保存内容，需要部署云函数 `api`：

1. 在 CloudBase 控制台创建云函数 `api`，运行环境 Node.js 18+，上传 `cloudfunctions/api/` 目录。
2. 为云函数 `api` 配置环境变量：
   ```text
   ADMIN_PASSWORD=你的后台密码
   SESSION_SECRET=至少 24 位、建议 32 位以上的随机字符串
   CLOUD_ENV=你的云环境 ID
   ```
3. 在「云函数 → api → HTTP 访问服务」中配置路径映射，使函数接收 `/api/*` 与 `/media/*` 请求。
4. 部署完成后，后台地址：`https://你的域名/admin.html`。

未部署云函数时，`/admin.html` 无法登录，但网站前台一切正常。

## 本地预览

```bash
npm install
npm run build
npm run serve   # http://localhost:5173，服务 public/ 目录
```

## 图片

作品图片为 WebP 文件，直接放在 `public/assets/`。上传后台会把图片压缩为适合网页的 WebP，避免直接上传超大原图。静态图片不经过任何二次处理，保持原始画质。