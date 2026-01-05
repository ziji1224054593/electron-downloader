# SignalR 与 WebSocket 对比及集成指南

## 📊 SignalR vs WebSocket

### SignalR 特点

- ✅ **自动降级**：优先使用 WebSocket，如果不支持则自动降级到 Server-Sent Events 或长轮询
- ✅ **自动重连**：内置自动重连机制
- ✅ **Hub 模式**：基于 Hub 的架构，支持方法调用（类似 RPC）
- ✅ **分组管理**：支持 Groups 和 Users 管理
- ✅ **跨平台**：.NET 生态系统，主要用于 .NET 后端
- ✅ **强类型**：支持强类型 Hub 接口

### WebSocket 特点

- ✅ **原生协议**：浏览器原生支持
- ✅ **轻量级**：协议简单，开销小
- ✅ **实时双向通信**：全双工通信
- ✅ **跨语言**：几乎所有语言都有实现
- ✅ **灵活**：可以自定义消息格式
- ⚠️ **需要手动处理**：重连、心跳等需要自己实现

## 🔄 使用场景对比

| 场景 | SignalR | WebSocket |
|------|---------|-----------|
| .NET 后端 | ✅ 推荐 | ⚠️ 需要额外实现 |
| Node.js 后端 | ⚠️ 需要 SignalR 服务器 | ✅ 推荐 |
| 简单通信 | ⚠️ 可能过于复杂 | ✅ 推荐 |
| 复杂业务逻辑 | ✅ 推荐（Hub 模式） | ⚠️ 需要自己实现 |
| 自动重连需求 | ✅ 内置支持 | ⚠️ 需要自己实现 |
| 跨浏览器兼容 | ✅ 自动降级 | ⚠️ 需要检测支持 |

## 🚀 在 Electron 中使用 SignalR

### 方案一：Electron 作为 SignalR 客户端

如果您的后端是 .NET SignalR 服务器，可以在 Electron 中作为客户端连接。

#### 1. 安装依赖

```bash
npm install @microsoft/signalr
```

#### 2. 在 Electron 主进程中使用 SignalR

```javascript
const { HubConnectionBuilder, LogLevel } = require('@microsoft/signalr')

let signalRConnection = null

async function connectToSignalR() {
  try {
    signalRConnection = new HubConnectionBuilder()
      .withUrl('https://your-signalr-server.com/hub')
      .withAutomaticReconnect() // 自动重连
      .configureLogging(LogLevel.Information)
      .build()

    // 监听服务器方法调用
    signalRConnection.on('ReceiveMessage', (message) => {
      console.log('收到消息:', message)
      // 处理消息
    })

    // 监听任务更新
    signalRConnection.on('TaskUpdate', (taskData) => {
      console.log('任务更新:', taskData)
      updateTaskStatus(taskData)
    })

    // 连接
    await signalRConnection.start()
    console.log('✅ SignalR 连接成功')

    // 发送消息到服务器
    await signalRConnection.invoke('SendMessage', {
      type: 'hello',
      data: '来自 Electron 的消息'
    })

  } catch (error) {
    console.error('❌ SignalR 连接失败:', error)
  }
}

// 断开连接
async function disconnectSignalR() {
  if (signalRConnection) {
    await signalRConnection.stop()
    signalRConnection = null
  }
}
```

#### 3. 在渲染进程中使用 SignalR（通过 IPC）

由于 SignalR 库可能需要在渲染进程中使用，可以通过 IPC 桥接：

```javascript
// 在 preload.js 中暴露 SignalR API
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('signalRAPI', {
  connect: (url) => ipcRenderer.invoke('signalr-connect', url),
  disconnect: () => ipcRenderer.invoke('signalr-disconnect'),
  invoke: (method, ...args) => ipcRenderer.invoke('signalr-invoke', method, ...args),
  on: (method, callback) => {
    ipcRenderer.on(`signalr-${method}`, (event, data) => callback(data))
  }
})
```

### 方案二：同时支持 WebSocket 和 SignalR

可以保持现有的 WebSocket 服务器，同时添加 SignalR 客户端支持：

```javascript
// 在 electron-main.js 中

// 现有的 WebSocket 服务器（保持不变）
function startWebSocketServer() {
  // ... 现有代码
}

// 新增：SignalR 客户端连接
async function connectToSignalRServer(signalRUrl) {
  const { HubConnectionBuilder, LogLevel } = require('@microsoft/signalr')
  
  try {
    const connection = new HubConnectionBuilder()
      .withUrl(signalRUrl)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: retryContext => {
          // 重连策略：1秒、2秒、5秒、10秒，然后每10秒
          if (retryContext.previousRetryCount < 3) {
            return [1000, 2000, 5000, 10000][retryContext.previousRetryCount]
          }
          return 10000
        }
      })
      .configureLogging(LogLevel.Warning)
      .build()

    // 监听任务相关的方法
    connection.on('TaskCreated', (taskData) => {
      console.log('📦 SignalR 收到新任务:', taskData)
      // 处理任务
      const taskId = Date.now().toString()
      processTask(taskId, taskData)
    })

    connection.on('TaskProgress', (progressData) => {
      console.log('📊 SignalR 任务进度:', progressData)
      updateTaskStatus(progressData.taskId, 'processing', progressData.progress)
    })

    connection.on('TaskCompleted', (taskData) => {
      console.log('✅ SignalR 任务完成:', taskData)
      updateTaskStatus(taskData.taskId, 'completed', 100, taskData.fileName, taskData.filePath)
    })

    await connection.start()
    console.log('✅ SignalR 连接成功:', signalRUrl)
    
    return connection
  } catch (error) {
    console.error('❌ SignalR 连接失败:', error)
    throw error
  }
}
```

## 📝 完整集成示例

### 1. 安装 SignalR 客户端库

```bash
npm install @microsoft/signalr
```

### 2. 修改 electron-main.js

在文件顶部添加 SignalR 相关代码：

```javascript
const { HubConnectionBuilder, LogLevel } = require('@microsoft/signalr')

// SignalR 配置
const SIGNALR_CONFIG = {
  enabled: false, // 是否启用 SignalR（可通过环境变量控制）
  url: process.env.SIGNALR_URL || 'https://your-signalr-server.com/hub',
  reconnect: true
}

let signalRConnection = null
```

### 3. 添加 SignalR 连接函数

```javascript
// 连接 SignalR 服务器
async function connectSignalR() {
  if (!SIGNALR_CONFIG.enabled) {
    console.log('[SignalR] SignalR 未启用')
    return
  }

  try {
    signalRConnection = new HubConnectionBuilder()
      .withUrl(SIGNALR_CONFIG.url)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    // 监听连接状态
    signalRConnection.onclose((error) => {
      console.log('[SignalR] 连接已关闭', error)
    })

    signalRConnection.onreconnecting((error) => {
      console.log('[SignalR] 正在重连...', error)
    })

    signalRConnection.onreconnected((connectionId) => {
      console.log('[SignalR] 重连成功:', connectionId)
    })

    // 监听服务器方法
    signalRConnection.on('TaskCreated', handleSignalRTask)
    signalRConnection.on('Message', handleSignalRMessage)

    await signalRConnection.start()
    console.log('✅ SignalR 连接成功')

    // 通知服务器 Electron 应用已连接
    await signalRConnection.invoke('ElectronConnected', {
      platform: process.platform,
      version: app.getVersion()
    })

  } catch (error) {
    console.error('❌ SignalR 连接失败:', error)
  }
}

// 处理 SignalR 任务
function handleSignalRTask(taskData) {
  console.log('📦 SignalR 收到任务:', taskData)
  const taskId = Date.now().toString()
  tasks.set(taskId, {
    id: taskId,
    status: 'pending',
    ...taskData
  })
  processTask(taskId, taskData)
}

// 处理 SignalR 消息
function handleSignalRMessage(message) {
  console.log('📨 SignalR 收到消息:', message)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('electron-message', {
      type: 'signalr-message',
      data: message,
      timestamp: Date.now()
    })
  }
}
```

### 4. 在应用启动时连接 SignalR

```javascript
app.whenReady().then(() => {
  createMenu()
  
  // 启动 WebSocket 服务器（现有功能）
  startWebSocketServer()
  
  // 连接 SignalR 服务器（新增功能）
  if (SIGNALR_CONFIG.enabled) {
    connectSignalR()
  }
  
  createWindow()
})
```

### 5. 在应用关闭时断开 SignalR

```javascript
app.on('before-quit', async () => {
  // 关闭 WebSocket 服务器
  if (wss) {
    // ... 现有代码
  }
  
  // 断开 SignalR 连接
  if (signalRConnection) {
    await signalRConnection.stop()
    console.log('🔌 SignalR 连接已关闭')
  }
})
```

## 🔧 配置选项

### 通过环境变量配置

```bash
# 启用 SignalR
SIGNALR_ENABLED=true

# SignalR 服务器地址
SIGNALR_URL=https://your-signalr-server.com/hub
```

### 在代码中配置

```javascript
const SIGNALR_CONFIG = {
  enabled: process.env.SIGNALR_ENABLED === 'true',
  url: process.env.SIGNALR_URL || 'https://your-signalr-server.com/hub',
  reconnect: true,
  reconnectIntervals: [1000, 2000, 5000, 10000] // 重连间隔（毫秒）
}
```

## 💡 使用建议

1. **如果后端是 .NET**：使用 SignalR，可以充分利用 Hub 模式和自动重连
2. **如果后端是 Node.js**：继续使用 WebSocket，或者使用 `@microsoft/signalr` 的 Node.js 客户端
3. **如果需要同时支持**：可以同时运行 WebSocket 服务器和 SignalR 客户端
4. **如果只需要简单通信**：WebSocket 更轻量级
5. **如果需要复杂业务逻辑**：SignalR 的 Hub 模式更合适

## 📚 相关资源

- [SignalR 官方文档](https://docs.microsoft.com/zh-cn/aspnet/core/signalr/introduction)
- [@microsoft/signalr npm 包](https://www.npmjs.com/package/@microsoft/signalr)
- [WebSocket API 文档](https://developer.mozilla.org/zh-CN/docs/Web/API/WebSocket)

