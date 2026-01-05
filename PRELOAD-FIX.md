# Preload.js 打包后加载问题修复指南

## 问题描述

打包后 `window.electronAPI` 未加载，显示 "Electron API 未加载（可能不在 Electron 环境中）"

## 原因分析

1. **路径问题**：打包后 `preload.js` 的路径与开发环境不同
2. **文件未打包**：`preload.js` 没有正确包含在打包文件中
3. **加载时机**：preload 脚本加载时机问题

## 已实施的修复

### 1. 智能路径检测

代码现在会尝试多个可能的路径：
- `__dirname/preload.js` - 开发环境或打包后（asar: false）
- `process.resourcesPath/app/preload.js` - 打包后（asar: true）
- `app.getAppPath()/preload.js` - 使用应用路径
- `__dirname/../preload.js` - 备用路径

### 2. 文件存在性验证

在创建窗口前验证 `preload.js` 是否存在，如果不存在会显示所有尝试的路径。

### 3. 加载验证

在窗口加载后验证 `window.electronAPI` 是否可用。

### 4. 延迟重试机制

如果首次检查失败，会自动重试最多 5 次。

## 排查步骤

### 步骤 1：检查打包配置

确保 `package.json` 的 `files` 包含 `preload.js`：
```json
"files": [
  "electron-main.js",
  "preload.js",
  "test-page.html",
  "package.json",
  "node_modules/**/*"
]
```

### 步骤 2：查看 Electron 控制台

运行打包后的应用，查看控制台输出：
```
📁 Preload 路径: ...
✅ 找到 preload.js: ...
✅ Preload 文件存在: ...
✅ Preload 脚本验证成功，window.electronAPI 可用
```

如果看到：
```
❌ Preload 文件不存在: ...
```

说明路径不对或文件未打包。

### 步骤 3：检查打包后的文件结构

打包后，检查 `release` 目录中的文件结构，确认 `preload.js` 是否存在。

### 步骤 4：手动测试

在 Electron 窗口的开发者工具（Ctrl+Shift+I）中执行：
```javascript
console.log('electronAPI:', window.electronAPI)
```

如果返回 `undefined`，说明 preload 未加载。

## 如果仍然不工作

### 方案 1：使用绝对路径

修改 `electron-main.js`，使用绝对路径：
```javascript
const preloadPath = path.resolve(__dirname, 'preload.js')
```

### 方案 2：检查 asar 配置

如果使用 asar，需要配置 `asarUnpack`：
```json
"asarUnpack": [
  "preload.js"
]
```

### 方案 3：使用 extraResources

在 `package.json` 中添加：
```json
"extraResources": [
  {
    "from": "preload.js",
    "to": "preload.js"
  }
]
```

## 调试命令

在 Electron 主进程控制台查看：
- Preload 路径
- 文件是否存在
- 验证结果

在 Electron 窗口开发者工具查看：
- `window.electronAPI` 是否存在
- 是否有 JavaScript 错误

## 重新打包

修改配置后，需要重新打包：
```bash
cd D:\admin\electron-app
npm run build
```

然后重新安装并运行打包后的应用。

