# Notes：本地 Markdown 笔记工作台

Notes 是一个在本机运行的 Markdown 笔记工作台。它提供笔记编辑、文件夹管理、搜索、标签、回收站和图片上传功能。应用默认只监听 `127.0.0.1`，不会开放到公网。

本仓库是可独立安装的应用项目。应用源码位于 `app/`，安装和启动步骤见下文。笔记、附件、ImgBed 配置等用户数据与应用代码分开保存，更新或重新克隆应用不会覆盖这些数据。

## 运行环境

需要安装 Node.js 20 或更新版本（包含 npm）以及 Git。

## 安装和启动

```sh
git clone https://github.com/YYlanyan/personal-notes-web.git
cd personal-notes-web
npm --prefix app install
npm run build
npm start
```

终端显示 Notes 已启动后，在浏览器打开 <http://127.0.0.1:4317/>。停止服务可在终端按 `Ctrl+C`。

首次启动时，程序会在用户目录下创建 `NotesData/`，并在其中保存笔记、附件和回收站。可设置 `NOTES_DATA_ROOT` 将数据存到其他位置，也可设置 `PORT` 更换本地端口。

## 使用

- 在左侧新建 Markdown 笔记和文件夹；笔记会自动保存。
- 使用「阅读」「修改」「阅读/修改」切换笔记查看方式。
- 笔记使用标准 Markdown，支持标签、任务列表、表格、代码块、图片和笔记双链。
- 「图片上传」可将图片备份到本机并上传到 ImgBed；可设置服务器文件夹，并浏览、搜索服务器图片及复制 Markdown 图片链接。
- ImgBed 地址、Token 和默认上传目录保存在数据目录的 `.local/imgbed.json`（默认 `~/NotesData/.local/imgbed.json`），不会进入项目仓库。公开笔记的本机图片备份也保存在数据目录中，不会随 GitHub 发布。
- `examples/` 中提供可复制参考的示例文件。
- 「私人笔记」保存在本机。此项目默认不会将私人笔记推送到 GitHub。
- 「公开笔记」也是本机工作区。发布前需要配置目标仓库；未配置时，发布功能不会连接或上传内容。

## 与 Notes 主工作区配合使用

在整合后的 Notes 工作区中，私人 Markdown 笔记和附件分别放在工作区根目录的 `notes/` 与 `assets/`；应用和公开工作区位于 `public-notes/`。私人仓库只同步 `notes/`、`assets/` 和 `.gitignore`，应用架构及已公开笔记由本项目管理。公开发布只包含经审核的公开项目文件，不包含私人笔记、私人附件或本机 `.local/` 数据。

如果你是单独克隆本项目，程序会使用上文所述的 `NotesData/` 作为本机数据目录。可通过 `NOTES_DATA_ROOT` 指定其他位置。

## 配置公开笔记发布（可选）

公开笔记发布默认关闭。需要发布时，配置目标 Git 仓库及分支，并在应用中检查待发布文件清单、确认后再发布。请只将适合公开的笔记和附件放入公开工作区；ImgBed Token、私人笔记、私人附件和 `.local/` 数据不得放入公开项目。

## 项目结构

- `app/`：网页界面和本地服务端源码
- `examples/`：公开示例笔记
- `start.mjs`：服务启动入口
- `docs/ARCHITECTURE.md`：应用架构和维护说明
- `app/dist/`：构建生成的前端资源

本项目以 Markdown 文件保存笔记，不需要数据库或云服务。
