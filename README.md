# Electron 数据下载与文档生成应用

这是一个基于 Electron 的桌面应用，用于从 API 获取数据并自动生成 Word 文档。支持通过 WebSocket 和自定义协议与浏览器进行通信，实现浏览器与桌面应用的深度集成。

## ✨ 主要功能

- 🔌 **WebSocket 通信**：与浏览器建立实时通信连接
- 📡 **自定义协议**：支持通过 URL 协议触发应用功能
- 📥 **数据下载任务**：从 API 接口获取数据并处理
- 📄 **Word 文档生成**：自动将数据按天分组并生成 Word 文档
- 📊 **任务队列管理**：实时显示任务状态和进度
- 🔒 **安全限制**：文件创建数量限制和大小限制
- 🛡️ **安全防护**：API URL 验证、路径遍历防护、消息大小限制

## 📁 项目结构

```
electron-downloader/
├── package.json              # 项目配置和依赖
├── electron-main.js         # Electron 主进程（核心逻辑）
├── preload.js               # 预加载脚本（IPC 通信桥接）
├── test-page.html          # 测试页面（任务管理界面）
├── BUILD-GUIDE.md          # 构建指南
├── DEBUG-CHECKLIST.md      # 调试检查清单
├── README.md               # 说明文档
└── release/                # 构建输出目录
    └── win-unpacked/       # Windows 未打包版本
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd D:\admin\electron-downloader
npm install
```

### 2. 启动应用

```bash
# 启动测试页面模式（推荐，用于测试和调试）
npm run test

# 启动开发模式（连接 Vue 项目，端口 5173）
npm run dev

# 启动普通模式（加载测试页面）
npm start
```

### 3. 使用应用

1. **启动 Electron 应用**后，会自动打开任务管理界面
2. WebSocket 服务器会自动启动（默认端口 8765）
3. 应用会自动尝试连接 WebSocket 服务器
4. 通过浏览器或测试页面发送任务请求

## 🧪 核心功能

### 1. WebSocket 通信（主要方式）

- ✅ **自动连接**：应用启动时自动连接 WebSocket 服务器
- ✅ **心跳检测**：支持 Ping/Pong 保持连接活跃
- ✅ **任务处理**：接收浏览器发送的数据下载任务
- ✅ **实时更新**：任务状态和进度实时推送到客户端
- ✅ **健康检查**：提供 HTTP 健康检查接口 (`/health`)

### 2. 自定义协议（备用方式）

- ✅ **协议注册**：注册 `myapp://` 自定义协议
- ✅ **打开窗口**：通过协议 URL 打开应用窗口
- ✅ **发送消息**：通过协议 URL 传递消息
- ✅ **发送通知**：通过协议 URL 触发系统通知

### 3. 数据下载与处理

- ✅ **API 数据获取**：支持 POST/GET 请求从 API 获取数据
- ✅ **分页处理**：自动分页获取所有数据（每页 100 条）
- ✅ **按天分组**：自动识别日期字段并按天分组数据
- ✅ **Word 文档生成**：为每天的数据生成独立的 Word 文档
- ✅ **进度跟踪**：实时显示任务处理进度（0-100%）

### 4. 任务管理

- ✅ **任务队列**：支持多个任务同时处理
- ✅ **状态管理**：任务状态（等待中/处理中/已完成/失败）
- ✅ **文件位置**：任务完成后可快速打开文件所在目录
- ✅ **错误处理**：任务失败时显示详细错误信息

## 📝 使用说明

### 在浏览器中发送任务

1. 确保 Electron 应用已启动（WebSocket 服务器运行中）
2. 在浏览器中使用 WebSocket 连接到 `ws://127.0.0.1:8765/ws`
3. 发送任务请求：

```javascript
// 发送任务请求
ws.send(JSON.stringify({
  type: 'start-task',
  data: {
    api_url: 'https://api.example.com/data',
    request_type: 'post',
    data: {
      // 请求参数
      startDate: '2024-01-01',
      endDate: '2024-01-31'
    },
    headers: {
      'Authorization': 'Bearer token',
      'Content-Type': 'application/json'
    }
  }
}))
```

4. 监听任务更新：

```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.type === 'task-update') {
    console.log('任务进度:', message.data.progress)
    console.log('任务状态:', message.data.status)
  }
  if (message.type === 'task-completed') {
    console.log('任务完成，文件路径:', message.data.filePath)
  }
}
```

### 在 Electron 窗口中查看任务

1. 运行 `npm run test` 启动测试页面
2. 测试页面会自动连接 WebSocket 并显示所有任务
3. 可以查看任务状态、进度和文件位置
4. 任务完成后可以点击"查看"按钮打开文件所在目录

### 任务数据格式

任务数据应包含以下字段：

- `api_url` (必需): API 接口地址
- `request_type` (可选): 请求类型，默认为 'post'
- `data` (可选): 请求参数
- `headers` (可选): 请求头（如认证信息）
- `user` (可选): 用户信息
- `token` (可选): 认证令牌

## 🔧 配置

### 修改 WebSocket 端口

在 `electron-main.js` 中：

```javascript
const WS_PORT = 8765 // 修改为你想要的端口
```

如果端口被占用，应用会自动尝试下一个端口（8766, 8767...）。

### 修改协议名称

在 `electron-main.js` 中：

```javascript
const PROTOCOL_NAME = 'myapp' // 修改为你想要的协议名
```

### 文件创建限制

在 `electron-main.js` 中可以修改文件创建限制：

```javascript
// 每天最多创建的文件数量
const MAX_FILES_PER_DAY = 120

// 每个文件的最大大小（字节）
const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB
```

### WebSocket 连接限制

在 `electron-main.js` 中可以修改连接限制：

```javascript
// 最大连接数
const MAX_CONNECTIONS = 10

// 消息最大大小
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024 // 10MB
```

### 数据存储位置

生成的文件默认存储在用户数据目录下的 `dataZip` 文件夹：

- **Windows**: `C:\Users\用户名\AppData\Roaming\ElectronApp\dataZip`
- **macOS**: `~/Library/Application Support/ElectronApp/dataZip`
- **Linux**: `~/.config/ElectronApp/dataZip`

## 📦 构建应用

### 构建 Windows 版本

```bash
npm run build:win
```

构建产物会输出到 `release/` 目录，包括：
- `ElectronApp Setup 1.0.0.exe` - 安装程序
- `win-unpacked/` - 未打包版本（用于测试）

### 构建其他平台

由于 `electron-builder` 的限制，跨平台构建需要使用 CI/CD：

- **macOS**: 需要在 macOS 系统上运行 `npm run build:mac`
- **Linux**: 需要在 Linux 系统上运行 `npm run build:linux`

详细说明请参考 [BUILD-GUIDE.md](./BUILD-GUIDE.md)

## 📊 测试检查清单

- [ ] Electron 应用可以正常启动
- [ ] WebSocket 服务器成功启动（查看控制台输出）
- [ ] 测试页面可以自动连接 WebSocket
- [ ] 可以发送任务请求
- [ ] 任务状态和进度实时更新
- [ ] Word 文档可以正常生成
- [ ] 文件位置可以正常打开
- [ ] 自定义协议可以触发（需要浏览器支持）

详细调试步骤请参考 [DEBUG-CHECKLIST.md](./DEBUG-CHECKLIST.md)

## 🐛 故障排查

### WebSocket 连接失败

1. **检查应用是否启动**：查看 Electron 控制台是否有启动日志
2. **检查端口占用**：应用会自动尝试其他端口（8766, 8767...）
3. **检查防火墙**：确保防火墙允许本地连接
4. **手动测试**：在浏览器中访问 `http://127.0.0.1:8765/health`

### 任务处理失败

1. **检查 API URL**：确保 API 地址正确且可访问
2. **检查网络连接**：确保可以访问 API 服务器
3. **查看错误信息**：任务失败时会显示详细错误信息
4. **检查文件限制**：确保未超过每日文件创建限制（120个）

### 文件生成失败

1. **检查文件数量限制**：每天最多创建 120 个文件
2. **检查文件大小限制**：每个文件最大 200MB
3. **检查磁盘空间**：确保有足够的磁盘空间
4. **查看日志**：检查 Electron 控制台的错误信息

### 协议不工作

1. **协议注册**：协议需要在应用安装时注册
2. **用户确认**：首次使用可能需要用户确认
3. **浏览器支持**：某些浏览器可能不支持自定义协议
4. **协议格式**：确保协议 URL 格式正确（`myapp://action?param=value`）

### Preload 脚本未加载

1. **检查文件路径**：确保 `preload.js` 在正确的位置
2. **检查打包配置**：确保 `package.json` 的 `files` 包含 `preload.js`
3. **查看控制台**：检查 Electron 控制台的路径日志
4. **重新打包**：如果修改了配置，需要重新打包

## 🔒 安全特性

### API URL 验证

- 只允许 `http://` 和 `https://` 协议
- 禁止 `file://`、`ftp://`、`data:`、`javascript:` 等危险协议
- 防止 SSRF（服务器端请求伪造）攻击

### 文件路径验证

- 防止路径遍历攻击（`../`）
- 限制文件只能保存在指定目录内
- 验证文件路径的合法性

### 消息大小限制

- WebSocket 消息最大 10MB
- 防止 DoS（拒绝服务）攻击
- 连接数限制（最多 10 个并发连接）

### 文件创建限制

- 每天最多创建 120 个文件
- 每个文件最大 200MB
- 防止资源耗尽

## 📚 相关文档

- [BUILD-GUIDE.md](./BUILD-GUIDE.md) - 构建指南（跨平台构建说明）
- [DEBUG-CHECKLIST.md](./DEBUG-CHECKLIST.md) - 调试检查清单（打包后调试步骤）

## 💡 使用提示

### 开发环境

- 测试页面会自动尝试连接 WebSocket（延迟 1 秒）
- 如果端口被占用，会自动尝试其他端口（8766, 8767...）
- 开发模式下会自动打开开发者工具

### 生产环境

- 应用启动后会自动创建数据目录
- 任务完成后可以点击"查看"按钮打开文件位置
- 所有任务状态都会实时更新

### 性能优化

- 数据获取采用分页方式，每页 100 条
- 每 10 页添加 100ms 延迟，避免服务器压力过大
- 任务处理采用异步方式，不阻塞主进程

### 数据格式

应用会自动识别以下日期字段：
- `date`, `createTime`, `create_time`
- `createdAt`, `created_at`, `time`
- `timestamp`, `dateTime`, `datetime`

如果数据中没有日期字段，会使用当前日期作为分组依据。

## 🛠️ 技术栈

- **Electron** ^39.2.7 - 桌面应用框架
- **ws** ^8.14.2 - WebSocket 服务器
- **docx** ^9.5.1 - Word 文档生成
- **axios** ^1.13.2 - HTTP 请求
- **archiver** ^7.0.1 - 文件压缩（预留）
- **electron-builder** ^26.0.12 - 应用打包

## 📄 许可证

MIT

