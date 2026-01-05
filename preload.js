/**
 * Preload 脚本
 * 在渲染进程加载之前运行，用于安全地暴露 Electron API
 */

const { contextBridge, ipcRenderer } = require('electron')

// 通过 contextBridge 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 监听来自主进程的消息
  onMessage: (callback) => {
    ipcRenderer.on('electron-message', (event, data) => {
      callback(data)
    })
  },

  // 监听通知
  onNotification: (callback) => {
    ipcRenderer.on('electron-notification', (event, data) => {
      callback(data)
    })
  },

  // 发送消息到主进程
  sendMessage: (message) => {
    ipcRenderer.send('renderer-message', message)
  },

  // 移除所有监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

console.log('✅ Preload 脚本已加载')
