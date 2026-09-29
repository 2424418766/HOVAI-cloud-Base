# HOVAI CloudBase v68 迁移包

此包依据当前已发布的 HOVAI v68 网站数据与媒体生成，包含 44 个项目及其 361 个媒体文件。作品照片保留原像素尺寸并转为 WebP，视频转为适合网页播放的 H.264；站点使用只读静态数据。

## 解压三个分卷

1. 下载 `hovai-cloudbase-v68-01.zip`、`hovai-cloudbase-v68-02.zip`、`hovai-cloudbase-v68-03.zip`。
2. 新建一个空文件夹，将三个压缩包依次解压到同一个文件夹中。三个包都包含 `hovai-cloudbase-v68/` 目录，选择合并同名目录即可。
3. 进入 `hovai-cloudbase-v68/`，确认其中有 `index.html`、`app.js`、`portfolio.json`、`style.css`、`media/` 和 `seed/`。
4. 将整个 `hovai-cloudbase-v68/` 文件夹上传到 CloudBase 静态网站托管。

## CloudBase 部署设置

- 项目框架：其他
- 安装命令：留空
- 构建命令：留空
- 构建产物目录：`./`
- 部署路径：`/hovai`

`index.html` 是站点入口。请保留目录结构与相对路径。该版本为静态展示版，不包含旧站的在线编辑器或写入接口。
