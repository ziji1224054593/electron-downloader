# 🚀 快速启动指南

## 第一步：安装依赖

```bash
cd D:\admin\electron-app
npm install
```

## 第二步：启动应用

### 方式一：测试页面模式（推荐首次使用）

```bash
npm run test
```

这会打开一个测试页面，可以直接测试所有通信功能。

### 方式二：开发模式（连接 Vue 项目）

```bash
npm run dev
```

这会连接到 `http://localhost:5173`（Vue 开发服务器）。

## 第三步：测试通信

### 在 Electron 测试页面中测试

1. 应用启动后会自动打开测试页面
2. 点击"连接 WebSocket"按钮
3. 测试各种功能：
   - 发送消息
   - 发送通知
   - 获取应用信息
   - 自定义协议测试

### 在浏览器（Vue 项目）中测试

1. 确保 Electron 应用已启动
2. 在 Vue 项目中使用 `electron-communicator.ts`
3. 调用通信 API

## 📋 检查清单

启动后，检查以下内容：

- [ ] Electron 窗口正常打开
- [ ] 控制台显示 "✅ WebSocket 服务器已启动"
- [ ] 测试页面可以连接 WebSocket
- [ ] 可以发送和接收消息

## 🎯 下一步

查看 `README.md` 了解详细功能和使用方法。

