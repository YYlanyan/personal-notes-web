# Notes：本地 Markdown 笔记工作台

这是 **`YYlanyan/personal-notes-web`** 的可复现项目包：克隆后，按下面步骤安装并启动，就能在个人电脑运行同一套 Markdown 笔记网页。笔记、附件和回收站默认存放在你的用户目录下 `NotesData/`，与程序代码仓库分开。启动器默认关闭公开仓库发布，所有编辑都只保存在本机。

## 运行环境

需要安装 Node.js 20 或更新版本（包含 npm），并安装 Git。程序只监听 `127.0.0.1`，不会开放到公网。

## 安装和启动

```sh
git clone https://github.com/YYlanyan/personal-notes-web.git
cd personal-notes-web
npm --prefix app install
npm run build
npm start
```

终端显示 Notes 已启动后，在浏览器打开 <http://127.0.0.1:4317/>。停止服务可在终端按 `Ctrl+C`。

第一次使用时，程序会在你的用户目录创建 `NotesData/notes/`、`NotesData/assets/` 和回收站目录。应用升级或重新克隆代码不会覆盖这些个人数据。可设置环境变量 `NOTES_DATA_ROOT` 将数据存到其他位置；也可设置 `PORT` 更换本地端口。

本仓库中的 `app/` 是网页端和本地服务端源码；`notes/`、`assets/` 与 `examples/` 只放适合公开的笔记、附件和示例。安装后的私人笔记和附件保存在数据目录中，不随程序代码更新。

## 使用

- 在左侧新建 Markdown 笔记和文件夹；笔记会自动保存。
- 「阅读」「修改」「阅读/修改」可切换查看方式。
- 笔记使用标准 Markdown，可使用标签、任务列表、表格、代码块、图片和笔记双链。
- 左侧「图片上传」可将图片备份到本机并上传到 ImgBed；可设置服务器文件夹，并在下方浏览、搜索服务器图片及复制 Markdown 链接。
- ImgBed 地址、Token 和默认上传目录保存在本机数据目录的 `.local/imgbed.json`（默认 `~/NotesData/.local/imgbed.json`），不属于项目发布清单。公开笔记的本机图片备份也保存在 `NotesData/`，不会随 GitHub 发布。
- 示例文件在 `examples/`，可复制到自己的笔记目录参考。
- 「私人笔记」只保存在本机。此模板默认不会将笔记推送到 GitHub。
- 「公开笔记」也是本机工作区。公开发布需要你另外配置自己的仓库地址；未配置时发布按钮不会连接或上传任何内容。

## 配置公开笔记发布（可选）

如果你希望通过网页将公开笔记推送到自己创建的公开 GitHub 仓库，请配置 SSH 凭据，并将 `NOTES_PUBLIC_REPOSITORY` 设置为仓库 SSH 地址，例如 `git@github.com:你的用户名/你的仓库名.git`，然后重新启动 Notes。仓库必须预先创建且默认分支为 `main`。发布前网页会展示文件清单，只有确认后才推送。

保持默认设置即可离线使用本地笔记；不要把私人笔记目录放进公开仓库。程序仓库与个人数据目录分开，个人笔记不会随程序更新发布。

## 项目结构

- `app/`：网页界面和本地服务端
- `examples/`：Markdown 与图片示例
- `start.mjs`：设置安全的本地数据目录并启动服务
- `docs/ARCHITECTURE.md`：源码职责、运行数据和发布边界
- `app/dist/`：随项目发布的初始前端资源；运行 `npm run build` 可重新生成

本项目以 Markdown 文件作为笔记数据，不需要数据库或云服务。
