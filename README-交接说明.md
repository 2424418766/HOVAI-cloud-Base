# HOVAI Photography — CloudBase 部署说明

本仓库包含 HOVAI Photography 作品集网站的**前端页面**、**后端 API（CloudBase 云函数）**、**内置作品数据**与**种子图片**。

网站不是纯静态页面：作品数据可保存、图片/视频可上传，这些都由云函数 + 云存储 + 云数据库提供。仅上传静态页面会丢失后台保存和媒体上传能力。

## 架构

- `src/index.html` `src/style.css` `src/app.js`：前端页面，构建后作为静态资源发布。
- `src/seed.json` `src/fashion-import.json` `src/video-defaults.json`：内置作品数据（小体积 JSON）。
- `src/seed-assets.json` `src/fashion-assets.json`：内置种子图（base64），构建时解码为静态文件。
- `src/worker.js`：后端逻辑（登录、作品读写、媒体上传/读取），构建后即云函数入口。
- `cloudfunctions/portfolio/lib/`：CloudBase SDK 适配层（`cloud` `auth` `store` `http`）。
- `scripts/build.mjs`：构建脚本，产出 `dist/public/` 与 `dist/cloudfunctions/portfolio/`。
- `scripts/test-cloudbase.mjs`：离线测试（内存版 CloudBase 桩），校验全部接口行为。

## 构建

需要 Node.js 20 或更新版本。在本目录运行：

```bash
npm install
npm run build
npm test
```

构建产物：

```text
dist/public/                     静态网站（index.html / style.css / app.js / seed/*.jpg）
dist/cloudfunctions/portfolio/   云函数 portfolio（index.js + lib + data.js + package.json）
```

## 部署到 CloudBase 静态网站托管

在 CloudBase 控制台 → 静态网站托管 → 新建应用（从 Git 仓库导入）填写：

| 配置项 | 值 |
| --- | --- |
| 项目框架 | 其他 / Other（不是前端框架） |
| Node.js 版本 | 20 |
| 安装命令 | `npm install` |
| 构建命令 | `npm run build` |
| 构建产物目录 | `dist/public` |
| 部署路径 | `/` |

自定义部署命令（若控制台需要）示例：

```bash
tcb hosting deploy ./dist/public / -e <你的环境ID>
```

仓库不包含 History Router，页面为 hash 路由（`#overview` `#work` `#about`），因此**不需要**配置 SPA 的 4xx → `index.html` 兜底。

## 部署云函数 portfolio（保留后台与上传功能所需）

1. 在 CloudBase 控制台创建云函数 `portfolio`：
   - 运行环境：Node.js 18.15 或更高
   - 上传目录：`dist/cloudfunctions/portfolio/`
   - 入口：`index.main`
   - 在线安装依赖（`package.json` 含 `wx-server-sdk`）
2. 为函数配置环境变量：
   ```text
   ADMIN_PASSWORD=你的后台管理密码
   CLOUD_ENV=你的云环境ID
   ```
3. 在「云函数 → portfolio → HTTP 访问服务」中配置路径映射：
   ```text
   /api/*    -> portfolio
   /media/*  -> portfolio
   ```
4. 在云数据库创建集合 `portfolio`（存作品数据）与 `portfolio_media`（存媒体元信息），
   权限建议「仅管理端可读写」。

未部署云函数时，前台可以打开，但会提示“作品暂时无法加载”，后台登录也会失败。

## 数据与媒体迁移

源码里的 `seed.json` 是**初始内容**，不是线上后台当前数据的完整备份。原平台后台新增/修改的作品、以及上传到原对象存储的媒体文件（`/media/<UUID>.(jpg|mp4|webm)`）不会随源码迁移。

要保证新站与切换前一致，需由有权限的维护者：

1. 从原线上环境导出最新的 `portfolio.json`。
2. 逐个导出其中引用的媒体文件与视频封面。
3. 把这些媒体导入 CloudBase 云存储，并在云数据库中写入对应的媒体元信息记录。
4. 在新环境验证首页、四个分类、更多案例、视频播放、手机封面、后台编辑保存、图片上传后，再切换正式域名。

## 安全说明

压缩包不包含云账号密码、访问密钥或网站所有者登录凭据。请不要把云服务密钥写入前端源码或发在公开群聊中；请由域名/云服务账号持有人在服务商控制台添加部署密钥和环境变量。