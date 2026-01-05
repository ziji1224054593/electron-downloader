# 打包后问题快速修复指南

## 🚨 问题：浏览器发送消息后，Electron 客户端没反应

### 立即检查项

#### 1. 打开 Electron 应用的控制台

查看是否有以下日志：
- ✅ `WebSocket 服务器已启动`
- ✅ `窗口加载完成`
- ✅ `Electron API 已加载`（在窗口的开发者工具中）

#### 2. 检查 WebSocket 服务器

在浏览器控制台执行：
```javascript
fetch('http://127.0.0.1:8765/health')
  .then(r => r.json())
  .then(console.log)
```

如果返回 `{ status: 'ok' }`，说明服务器正常。

#### 3. 检查 IPC 通信

在 Electron 窗口按 `Ctrl+Shift+I` 打开开发者工具，查看控制台：
- 应该看到：`✅ Electron API 已加载`
- 如果没有，说明 preload.js 没有正确加载

### 常见原因及修复

#### 原因 1：preload.js 路径错误（最常见）

**检查方法**：
查看 Electron 控制台，应该看到：
```
📁 Preload 路径: ...
📦 是否打包: true
```

**修复**：
1. 确保 `package.json` 的 `files` 包含 `preload.js`
2. 检查打包后的目录，确认 `preload.js` 存在
3. 如果路径不对，修改 `electron-main.js` 中的路径逻辑

#### 原因 2：WebSocket 服务器未启动

**检查方法**：
查看 Electron 控制台，应该看到：
```
✅ WebSocket 服务器已启动: ws://127.0.0.1:8765/ws
```

**修复**：
1. 检查端口是否被占用
2. 检查防火墙设置
3. 查看控制台是否有错误信息

#### 原因 3：窗口未正确加载

**检查方法**：
查看 Electron 控制台，应该看到：
```
✅ 窗口加载完成
✅ 已发送窗口就绪消息
```

**修复**：
1. 打开窗口的开发者工具（Ctrl+Shift+I）
2. 查看是否有 JavaScript 错误
3. 检查 test-page.html 是否正确加载

### 调试步骤

1. **打开 Electron 应用**
2. **查看主进程控制台**（启动时的命令行窗口）
3. **打开窗口的开发者工具**（Ctrl+Shift+I）
4. **在浏览器中发送消息**
5. **观察两边的控制台输出**

### 预期日志输出

**Electron 主进程控制台应该显示：**
```
📨 收到浏览器消息: {...}
📨 消息数据: {...}
📤 发送消息到渲染进程（仅用户数据）: {...}
📦 主窗口状态: 正常
✅ 消息已成功发送到渲染进程
```

**Electron 窗口开发者工具应该显示：**
```
📨 收到主进程消息: {...}
```

**如果缺少任何日志，说明问题出在对应环节**

### 快速测试

在浏览器控制台测试 WebSocket 连接：
```javascript
const ws = new WebSocket('ws://127.0.0.1:8765/ws')
ws.onopen = () => {
  console.log('✅ 连接成功')
  ws.send(JSON.stringify({ type: 'message', data: { message: 'test', data: { test: 123 } } }))
}
ws.onmessage = (e) => console.log('📨 收到:', e.data)
ws.onerror = (e) => console.error('❌ 错误:', e)
```

如果这个测试能收到响应，说明 WebSocket 正常，问题可能在 IPC 通信。

