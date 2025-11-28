# PicGo Paste - VSCode Extension

在 Markdown 文件中粘贴图片时，**自动**调用 PicGo 上传到图床，并插入正确的 Markdown 图片引用。

## ✨ 功能特性

- 🔄 **自动上传**：直接 `Cmd+V` 粘贴图片即可自动上传（使用 VSCode 官方 Paste API）
- 📷 **手动上传**：也可使用 `Cmd+Alt+V` 手动触发上传
- 📝 **智能插入**：自动生成正确的 Markdown 图片语法 `![image](url)`
- ⚙️ **可配置**：支持自定义 PicGo 路径，可开关自动上传

## 工作流程

```
复制/截图 → Cmd+V 粘贴 → 自动调用 picgo upload → 插入 ![image](url)
```

## 前置要求

### 1. 安装 PicGo CLI

```bash
# 使用 npm 全局安装
npm install picgo -g

# 验证安装
picgo -v
```

### 2. 配置 PicGo 图床

```bash
# 交互式配置
picgo set uploader
```

或编辑配置文件 `~/.picgo/config.json`：

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

### 3. 测试 PicGo 是否正常工作

```bash
# 上传测试图片
picgo upload /path/to/test.png
```

## 使用方法

### 方法一：直接粘贴（推荐）

1. 复制一张图片到剪贴板（截图 / 复制图片）
2. 在 VSCode 中打开 Markdown 文件
3. 按 `Cmd+V` 粘贴
4. 扩展自动调用 PicGo 上传，并插入 `![image](上传后的URL)`

### 方法二：快捷键

- **Mac**: `Cmd+Alt+V`
- **Windows/Linux**: `Ctrl+Alt+V`

### 方法三：命令面板

`Cmd+Shift+P` → 输入 "PicGo: Upload Image from Clipboard"

## 配置选项

在 VSCode 设置中搜索 `picgo-paste`：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `picgo-paste.picgoPath` | PicGo CLI 路径 | `picgo` |
| `picgo-paste.autoUploadOnPaste` | 粘贴时自动上传 | `true` |

```json
{
  "picgo-paste.picgoPath": "/usr/local/bin/picgo",
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

生成 `vscode-picgo-paste-0.0.1.vsix` 后，在 VSCode 中：
- 打开扩展面板
- 点击 `...` → `从 VSIX 安装`
- 选择 `.vsix` 文件

### 方法二：调试运行

在 VSCode 中打开项目，按 `F5` 启动扩展开发主机。

## 常见问题

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
- 调用 `picgo upload <file>` 命令上传，解析输出获取 URL

## License

MIT
