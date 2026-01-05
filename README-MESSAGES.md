# Electron 客户端消息显示说明

## 功能说明

当浏览器通过 WebSocket 发送消息到 Electron 应用时，消息会在 Electron 窗口的测试页面中显示。

## 显示位置

在 Electron 测试页面中，有一个专门的区域：
- **标题**：🌐 从浏览器收到的消息
- **位置**：在"消息日志"区域上方

## 消息格式

显示的消息包含：
1. **消息文本**：从浏览器发送的消息内容
2. **数据内容**：完整的 JSON 数据（格式化显示）
3. **时间戳**：消息接收时间

## 测试步骤

1. **启动 Electron 应用**：
   ```bash
   cd D:\admin\electron-app
   npm run test
   ```

2. **在浏览器中访问测试页面**：
   ```
   http://localhost:5173/ruimai-app/electron-test
   ```

3. **点击"发送消息"按钮**

4. **在 Electron 窗口中查看**：
   - 打开 Electron 窗口
   - 查看"从浏览器收到的消息"区域
   - 应该能看到浏览器发送的消息和数据

## 消息示例

当浏览器发送：
```javascript
{
  type: 'message',
  data: {
    message: 'Hello from Browser!',
    data: {
      timestamp: 1234567890,
      user: 'Browser User'
    }
  }
}
```

Electron 窗口会显示：
```
📨 收到来自浏览器的消息
数据内容：
{
  "message": "Hello from Browser!",
  "timestamp": 1234567890,
  "user": "Browser User"
}
```

## 注意事项

1. 确保 Electron 应用已启动
2. 确保 WebSocket 服务器正在运行
3. 消息会实时显示，无需刷新页面
4. 最多保留 50 条消息，超出会自动删除最旧的

