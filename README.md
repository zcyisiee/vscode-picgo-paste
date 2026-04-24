# PicGo Paste - VSCode Extension

在 Markdown 文件中粘贴图片时，**自动**上传到图床并插入图片引用。本插件支持通过 [PicGo CLI](https://github.com/PicGo/PicGo-Core) 上传，也支持直接通过 [S.EE](https://s.ee) API 上传，从而**摆脱对本地工具的依赖**。

## ✨ 功能特性

- 🔄 **自动上传**：直接 `Cmd+V` 粘贴图片即可自动上传（使用 VSCode 官方 Paste API）
- 📷 **手动上传**：也可使用 `Cmd+Alt+V` 手动触发上传
- 🚀 **轻量化选择**：支持直接使用 S.EE API 上传，**无需安装 PicGo CLI** 或其他本地工具，只需一个 Token 即可开始使用
- 🔌 **兼容模式**：依然支持通过 PicGo CLI 调用其丰富的图床插件系统
- 📝 **智能插入**：自动生成正确的 Markdown 图片语法 `![image](url)`
- ⚙️ **灵活配置**：根据需求选择极简 API 模式或全功能 CLI 模式

## 工作流程

```
复制/截图 → Cmd+V 粘贴 → 自动上传到图床 → 插入 ![image](url)
```

## 前置要求

你可以根据自己的需求，在以下两种模式中二选一：

### 模式一：极简 API 模式 (推荐，零依赖)

**适合不希望在本地安装任何额外工具的用户。**

1. 访问 [s.ee](https://s.ee) 申请一个 API Key。
2. 在 VSCode 设置中填入 `picgo-paste.seeApiKey`。
3. （可选）也可设置环境变量 `SEE_API_TOKEN`。
4. **搞定！** 插件将直接通过 Web API 上传。

### 模式二：本地工具模式 (PicGo CLI)

**适合已有 PicGo 配置或需要使用 PicGo 丰富插件生态的用户。**

#### 1. 安装 PicGo CLI

```bash
# 使用 npm 全局安装
npm install picgo -g

# 验证安装
picgo -v
```

#### 2. 配置 PicGo 图床

```bash
# 交互式配置
picgo set uploader
```

或编辑配置文件 `~/.picgo/config.json`（以 GitHub 为例）：

```json
{
  "picBed": {
    "uploader": "github",
    "current": "github",
    "github": {
      "repo": "username/repo-name",
      "branch": "main",
      "token": "your-github-token",
      "path": "images/"
    }
  }
}
```

#### 3. 设置并测试

1. **切换服务商**：在 VSCode 设置中将 `picgo-paste.provider` 修改为 `picgo`。
   > **重要**：默认值为 `s.ee`，如果不修改此项，插件将不会调用本地 PicGo 路径。
2. **配置路径**：将 `picgo-paste.picgoPath` 设为你的 `picgo` 可执行文件路径。
3. **验证上传**：
   ```bash
   picgo upload /path/to/test.png
   ```

## 使用方法

### 方法一：直接粘贴（推荐）

1. 复制一张图片到剪贴板（截图 / 复制图片）
2. 在 VSCode 中打开 Markdown 文件
3. 按 `Cmd+V` 粘贴
4. 扩展自动上传图片，并插入 `![image](上传后的URL)`

### 方法二：快捷键

- **Mac**: `Cmd+Alt+V`
- **Windows/Linux**: `Ctrl+Alt+V`

### 方法三：命令面板

`Cmd+Shift+P` → 输入 "PicGo: Upload Image from Clipboard"

## 配置选项

在 VSCode 设置中搜索 `picgo-paste`：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `picgo-paste.provider` | 上传服务商 (`s.ee` 或 `picgo`) | `s.ee` |
| `picgo-paste.seeApiKey` | S.EE API Key | `""` |
| `picgo-paste.picgoPath` | PicGo CLI 路径 (仅在使用 `picgo` 时有效) | `picgo` |
| `picgo-paste.autoUploadOnPaste` | 粘贴时自动上传 | `true` |

```json
{
  "picgo-paste.provider": "s.ee",
  "picgo-paste.seeApiKey": "your-api-key",
  "picgo-paste.picgoPath": "picgo",
  "picgo-paste.autoUploadOnPaste": true
}
```

## 生成的 Markdown 格式

扩展会生成**标准的 Markdown 图片语法**：

```markdown
![image](https://your-image-host.com/xxx.png)
```

> 注意：正确的语法是 `![alt](url)`，不是 `!()[url]`

## 支持的平台

| 平台 | 剪贴板实现 | 状态 |
|------|-----------|------|
| macOS | osascript | ✅ |
| Windows | PowerShell | ✅ |
| Linux | xclip | ✅ |

### Linux 需要安装 xclip

```bash
# Ubuntu/Debian
sudo apt-get install xclip

# Fedora
sudo dnf install xclip

# Arch
sudo pacman -S xclip
```

## 安装扩展

### 方法一：从源码安装

```bash
# 克隆项目
cd vscode-picgo-paste

# 安装依赖
npm install

# 编译
npm run compile

# 打包
npm install -g @vscode/vsce
vsce package
```

生成 `.vsix` 文件后，在 VSCode 中：
- 打开扩展面板
- 点击 `...` → `从 VSIX 安装`
- 选择 `.vsix` 文件

### 方法二：调试运行

在 VSCode 中打开项目，按 `F5` 启动扩展开发主机。

## 常见问题

### Q: S.EE 上传提示失败？

1. 检查 `picgo-paste.seeApiKey` 是否正确配置。
2. 如果设置了环境变量 `SEE_API_TOKEN`，它会覆盖设置中的 API Key。
3. 确保你的 API Key 有效且未过期。

### Q: 粘贴后没有反应？

1. 确保在 Markdown 文件中（文件扩展名 `.md`）
2. 确保剪贴板中有图片
3. 检查 PicGo 是否配置正确：`picgo upload /path/to/test.png`

### Q: 提示找不到 picgo？

指定完整路径：

```bash
# 查找 picgo 位置
which picgo

# 在 VSCode 设置中配置
"picgo-paste.picgoPath": "/usr/local/bin/picgo"
```

### Q: 上传失败？

检查 PicGo 配置：

```bash
# 查看配置
cat ~/.picgo/config.json

# 测试上传
picgo upload /tmp/test.png
```

## 技术实现

- 使用 VSCode 1.82+ 的 `DocumentPasteEditProvider` API 拦截粘贴操作
- 支持 `image/png`, `image/jpeg`, `image/gif`, `image/webp` 等格式
- 两种上传模式：
  - **S.EE**: 使用 `fetch` API 直接发送 multipart/form-data 请求到 [s.ee](https://s.ee)
  - **PicGo**: 调用 `picgo upload <file>` 命令上传，解析输出获取 URL

## License

MIT
