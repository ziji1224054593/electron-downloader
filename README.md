# Electron 通信测试应用

这是一个用于测试浏览器与 Electron 应用通信的独立项目。

## 📁 项目结构

```
electron-app/
├── package.json              # 项目配置
├── electron-main.js         # Electron 主进程
├── test-page.html           # 测试页面
└── README.md                # 说明文档
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd D:\admin\electron-app
npm install
```

### 2. 启动应用

```bash
# 启动测试页面模式（推荐）
npm run test

# 或启动开发模式（连接 Vue 项目）
npm run dev

# 或启动普通模式
npm start
```

### 3. 测试通信

1. **启动 Electron 应用**后，会看到测试页面
2. 点击"连接 WebSocket"按钮
3. 测试各种通信功能

## 🧪 测试功能

### 方案一：自定义协议

- ✅ 打开窗口
- ✅ 发送消息
- ✅ 发送通知

### 方案二：WebSocket

- ✅ 连接/断开 WebSocket
- ✅ 发送 Ping（心跳检测）
- ✅ 发送消息
- ✅ 发送通知
- ✅ 获取应用信息

## 📝 使用说明

### 在浏览器中测试

1. 打开浏览器，访问你的 Vue 项目
2. 使用 `src/utils/electron-communicator.ts` 中的 API
3. 确保 Electron 应用已启动（WebSocket 服务器运行中）

### 在 Electron 窗口中测试

1. 运行 `npm run test` 启动测试页面
2. 在测试页面中测试所有功能
3. 查看消息日志了解通信过程

## 🔧 配置

### 修改端口

在 `electron-main.js` 中：

```javascript
const WS_PORT = 8765 // 修改为你想要的端口
```

### 修改协议名称

在 `electron-main.js` 中：

```javascript
const PROTOCOL_NAME = 'myapp' // 修改为你想要的协议名
```

## 📊 测试检查清单

- [ ] Electron 应用可以正常启动
- [ ] WebSocket 服务器成功启动（查看控制台）
- [ ] 测试页面可以连接 WebSocket
- [ ] 可以发送和接收消息
- [ ] 自定义协议可以触发（需要浏览器支持）
- [ ] 消息日志正常显示

## 🐛 故障排查

### WebSocket 连接失败

1. 检查 Electron 应用是否已启动
2. 查看 Electron 控制台是否有错误
3. 检查端口是否被占用
4. 尝试手动访问 `http://127.0.0.1:8765/health`

### 协议不工作

1. 协议需要在应用安装时注册
2. 首次使用可能需要用户确认
3. 某些浏览器可能不支持自定义协议

## 📚 相关文档

- `../soybean-admin/README-ELECTRON.md` - Vue 项目集成文档
- `../soybean-admin/INTEGRATION-GUIDE.md` - 完整集成指南

## 💡 提示

- 测试页面会自动尝试连接 WebSocket
- 如果端口被占用，会自动尝试其他端口
- 所有消息都会显示在日志中
- 可以清空日志重新开始测试

