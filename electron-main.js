/**
 * Electron 主进程文件
 * 用于与浏览器（Vue 项目）进行通信
 */

// 设置控制台输出编码为 UTF-8（解决 Windows 终端中文乱码问题）
if (process.platform === 'win32') {
  try {
    // 尝试设置控制台代码页为 UTF-8
    const { execSync } = require('child_process')
    execSync('chcp 65001', { stdio: 'ignore' })
  } catch (error) {
    // 如果设置失败，忽略错误
  }
}

const { app, protocol, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const { createServer } = require('http')
const { WebSocketServer } = require('ws')
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx')

// ==================== 配置 ====================

const WS_PORT = 8765 // WebSocket 服务器端口
const PROTOCOL_NAME = 'myapp' // 自定义协议名称

// 文件系统限制配置
const MAX_FILES_PER_DAY = 120 // 每天最多创建120个文件
const MAX_FILE_SIZE = 200 * 1024 * 1024 // 每个文件最大200MB (200 * 1024 * 1024 字节)

// 获取数据压缩包目录（需要在 app ready 后调用）
function getDataZipDir() {
  return path.join(app.getPath('userData'), 'dataZip')
}

// 获取文件计数器存储路径
function getFileCounterPath() {
  return path.join(app.getPath('userData'), 'file-counter.json')
}

// 确保数据目录存在
function ensureDataZipDir() {
  const dataZipDir = getDataZipDir()
  if (!fs.existsSync(dataZipDir)) {
    fs.mkdirSync(dataZipDir, { recursive: true })
    console.log('✅ 创建数据目录:', dataZipDir)
  }
  return dataZipDir
}

// ==================== 文件创建限制管理 ====================

// 获取今天的日期字符串（YYYY-MM-DD）
function getTodayDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 加载文件计数器
function loadFileCounter() {
  const counterPath = getFileCounterPath()
  try {
    if (fs.existsSync(counterPath)) {
      const data = fs.readFileSync(counterPath, 'utf8')
      const counter = JSON.parse(data)
      // 检查日期，如果不是今天，重置计数器
      const today = getTodayDateString()
      if (counter.date !== today) {
        return { date: today, count: 0 }
      }
      return counter
    }
  } catch (error) {
    console.error('[FileCounter] 加载计数器失败:', error)
  }
  return { date: getTodayDateString(), count: 0 }
}

// 保存文件计数器
function saveFileCounter(counter) {
  const counterPath = getFileCounterPath()
  try {
    fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2), 'utf8')
  } catch (error) {
    console.error('[FileCounter] 保存计数器失败:', error)
  }
}

// 检查是否可以创建新文件（检查每日文件数量限制）
function canCreateFile() {
  const counter = loadFileCounter()
  const today = getTodayDateString()
  
  // 如果不是今天，重置计数器
  if (counter.date !== today) {
    counter.date = today
    counter.count = 0
    saveFileCounter(counter)
  }
  
  if (counter.count >= MAX_FILES_PER_DAY) {
    console.warn(`[FileLimit] 已达到每日文件创建限制: ${counter.count}/${MAX_FILES_PER_DAY}`)
    return false
  }
  
  return true
}

// 增加文件计数器
function incrementFileCounter() {
  const counter = loadFileCounter()
  const today = getTodayDateString()
  
  // 如果不是今天，重置计数器
  if (counter.date !== today) {
    counter.date = today
    counter.count = 0
  }
  
  counter.count++
  saveFileCounter(counter)
  console.log(`[FileCounter] 今日已创建文件数: ${counter.count}/${MAX_FILES_PER_DAY}`)
  return counter.count
}

// 检查文件大小是否超过限制
function checkFileSize(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer type')
  }
  
  const sizeInBytes = buffer.length
  const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2)
  
  if (sizeInBytes > MAX_FILE_SIZE) {
    throw new Error(`文件大小 ${sizeInMB}MB 超过限制 ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
  }
  
  return { sizeInBytes, sizeInMB }
}

// ==================== 任务管理 ====================

const tasks = new Map() // 存储任务信息
const taskIntervals = new Map() // 存储任务轮询定时器

// 验证 API URL 安全性（防止 SSRF 攻击）
function validateApiUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('API URL is required and must be a string')
  }
  
  try {
    const urlObj = new URL(url)
    
    // 只允许 http 和 https 协议
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed')
    }
    
    // 禁止 file://, ftp:// 等协议
    if (['file:', 'ftp:', 'data:', 'javascript:'].includes(urlObj.protocol)) {
      throw new Error('Dangerous protocols are not allowed')
    }
    
    // 可选：限制内网地址（根据实际需求调整）
    const hostname = urlObj.hostname
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)
    
    // 如果业务需要访问内网，可以注释掉这部分
    // if (isLocalhost || isPrivateIP) {
    //   throw new Error('Internal network addresses are not allowed for security reasons')
    // }
    
    return true
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Invalid URL format')
    }
    throw error
  }
}

// 处理任务
async function processTask(taskId, taskData) {
  try {
    console.log('[Task] Starting task:', taskId)
    
    // 更新任务状态为处理中
    updateTaskStatus(taskId, 'processing', 0)
    
    const { api_url, request_type, data, headers, user, token } = taskData
    
    // 验证 API URL
    if (!api_url) {
      throw new Error('API URL is required')
    }
    validateApiUrl(api_url)
    
    // 轮询获取数据
    const allData = []
    let page = 1
    let hasMore = true
    const pageSize = 100 // 每页数据量
    
    while (hasMore) {
      try {
        const requestData = {
          ...data,
          page: page,
          pageSize: pageSize
        }
        
        const response = await axios({
          method: request_type || 'post',
          url: api_url,
          data: requestData,
          headers: headers || {}
        })
        
        const responseData = response.data
        
        // 根据实际接口返回格式调整
        if (Array.isArray(responseData)) {
          allData.push(...responseData)
          hasMore = responseData.length === pageSize
        } else if (responseData.data && Array.isArray(responseData.data)) {
          allData.push(...responseData.data)
          hasMore = responseData.data.length === pageSize && (responseData.hasMore !== false)
        } else if (responseData.list && Array.isArray(responseData.list)) {
          allData.push(...responseData.list)
          hasMore = responseData.list.length === pageSize && (responseData.hasMore !== false)
        } else {
          // 如果返回的不是数组，直接添加
          allData.push(responseData)
          hasMore = false
        }
        
        // 更新进度
        const progress = Math.min(90, Math.floor((page * 100) / 50)) // 假设最多50页
        updateTaskStatus(taskId, 'processing', progress)
        
        page++
        
        // 如果数据量很大，可以添加延迟
        if (page % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error) {
        console.error('❌ 获取数据失败:', error.message)
        if (page === 1) {
          throw error // 第一页失败则整个任务失败
        }
        hasMore = false // 后续页面失败则停止
      }
    }
    
    console.log(`✅ 获取数据完成，共 ${allData.length} 条`)
    
    if (allData.length === 0) {
      throw new Error('未获取到任何数据')
    }
    
    // 分析数据，按天分组
    updateTaskStatus(taskId, 'processing', 80)
    const dataByDay = groupDataByDay(allData)
    console.log(`✅ 数据已按天分组，共 ${Object.keys(dataByDay).length} 天`)
    
    // 按天生成 Word 文档
    updateTaskStatus(taskId, 'processing', 85)
    const DATA_ZIP_DIR = ensureDataZipDir()
    const taskDir = path.join(DATA_ZIP_DIR, `task_${taskId}`)
    
    // 创建任务目录
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true })
    }
    
    const docFiles = []
    const days = Object.keys(dataByDay).sort()
    
    for (let i = 0; i < days.length; i++) {
      const day = days[i]
      const dayData = dataByDay[day]
      
      // 生成 Word 文档
      const docFileName = `${day}.docx`
      const docFilePath = path.join(taskDir, docFileName)
      
      await createWordDocument(dayData, docFilePath, day)
      docFiles.push(docFilePath)
      
      // 更新进度
      const progress = 85 + Math.floor((i + 1) / days.length * 15)
      updateTaskStatus(taskId, 'processing', progress)
      
      console.log(`✅ 已生成文档: ${docFileName} (${dayData.length} 条数据)`)
    }
    
    // 更新任务状态为完成
    updateTaskStatus(taskId, 'completed', 100, `共 ${days.length} 个文档`, taskDir)
    
    console.log('✅ 任务完成:', taskId, taskDir)
    
  } catch (error) {
    console.error('❌ 任务处理失败:', error)
    updateTaskStatus(taskId, 'error', 0, null, null, error.message)
  }
}

// 按天分组数据
function groupDataByDay(dataArray) {
  const grouped = {}
  
  dataArray.forEach(item => {
    // 尝试从多个可能的日期字段中获取日期
    let dateStr = null
    
    // 常见的日期字段名
    const dateFields = ['date', 'createTime', 'create_time', 'createdAt', 'created_at', 'time', 'timestamp', 'dateTime', 'datetime']
    
    for (const field of dateFields) {
      if (item[field]) {
        dateStr = item[field]
        break
      }
    }
    
    // 如果没有找到日期字段，使用当前日期
    if (!dateStr) {
      dateStr = new Date().toISOString()
    }
    
    // 解析日期
    let date
    if (typeof dateStr === 'string') {
      // 处理各种日期格式
      date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        // 如果解析失败，尝试其他格式
        const timestamp = parseInt(dateStr)
        if (!isNaN(timestamp)) {
          date = new Date(timestamp)
        } else {
          date = new Date() // 如果都失败，使用当前日期
        }
      }
    } else if (typeof dateStr === 'number') {
      date = new Date(dateStr)
    } else {
      date = new Date()
    }
    
    // 格式化为 YYYY-MM-DD
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dayKey = `${year}-${month}-${day}`
    
    if (!grouped[dayKey]) {
      grouped[dayKey] = []
    }
    
    grouped[dayKey].push(item)
  })
  
  return grouped
}

// 创建 Word 文档
async function createWordDocument(dataArray, filePath, day) {
  try {
    // 检查每日文件创建数量限制
    if (!canCreateFile()) {
      throw new Error(`已达到每日文件创建限制（${MAX_FILES_PER_DAY}个文件），请明天再试`)
    }
    
    // 获取数据的所有字段（使用第一条数据的字段作为表头）
    const headers = dataArray.length > 0 ? Object.keys(dataArray[0]) : []
    
    // 创建表格行
    const tableRows = []
    
    // 表头行
    const headerRow = new TableRow({
      children: headers.map(header => 
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: header, bold: true })],
            alignment: AlignmentType.CENTER
          })],
          width: { size: 20, type: WidthType.PERCENTAGE }
        })
      )
    })
    tableRows.push(headerRow)
    
    // 数据行
    dataArray.forEach(item => {
      const dataRow = new TableRow({
        children: headers.map(header => {
          const value = item[header]
          const text = value === null || value === undefined ? '' : String(value)
          
          return new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: text })],
              alignment: AlignmentType.LEFT
            })],
            width: { size: 20, type: WidthType.PERCENTAGE }
          })
        })
      })
      tableRows.push(dataRow)
    })
    
    // 创建文档
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: `数据统计 - ${day}`, bold: true, size: 32 })],
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [new TextRun({ text: `共 ${dataArray.length} 条数据`, size: 24 })],
            spacing: { after: 400 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows
          })
        ]
      }]
    })
    
    // 生成文档 buffer
    const buffer = await Packer.toBuffer(doc)
    
    // 检查文件大小限制
    const sizeInfo = checkFileSize(buffer)
    console.log(`[FileSize] 文件大小: ${sizeInfo.sizeInMB}MB`)
    
    // 保存文档
    fs.writeFileSync(filePath, buffer)
    
    // 增加文件计数器
    const currentCount = incrementFileCounter()
    
    console.log(`✅ Word 文档已创建: ${filePath} (${sizeInfo.sizeInMB}MB, 今日第${currentCount}个文件)`)
  } catch (error) {
    console.error('❌ 创建 Word 文档失败:', error)
    throw error
  }
}

// 更新任务状态
function updateTaskStatus(taskId, status, progress, fileName, filePath, error) {
  const task = tasks.get(taskId) || {}
  task.status = status
  task.progress = progress
  if (fileName) task.fileName = fileName
  if (filePath) task.filePath = filePath
  if (error) task.error = error
  
  tasks.set(taskId, task)
  
  // 通知所有 WebSocket 客户端
  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'task-update',
          data: task
        }))
      }
    })
  }
  
  // 如果任务完成，发送完成通知
  if (status === 'completed') {
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'task-completed',
            data: task
          }))
        }
      })
    }
  }
}

// 验证文件路径安全性（防止路径遍历攻击）
function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false
  }
  
  // 规范化路径
  const normalizedPath = path.normalize(filePath)
  
  // 检查是否包含路径遍历字符
  if (normalizedPath.includes('..')) {
    return false
  }
  
  // 验证路径是否在允许的目录内
  const allowedDir = getDataZipDir()
  const resolvedPath = path.resolve(normalizedPath)
  const resolvedAllowedDir = path.resolve(allowedDir)
  
  // 确保路径在允许的目录内
  if (!resolvedPath.startsWith(resolvedAllowedDir)) {
    return false
  }
  
  return true
}

// 打开文件位置
function openFileLocation(filePath) {
  try {
    // 验证路径安全性
    if (!validateFilePath(filePath)) {
      console.error('[Security] Invalid file path, path traversal attempt blocked:', filePath)
      return
    }
    
    // 如果是目录，直接打开目录
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      shell.openPath(filePath)
      console.log('[File] Opened directory:', filePath)
    } else {
      // 如果是文件，打开文件所在目录并选中文件
      const fileDir = path.dirname(filePath)
      shell.showItemInFolder(filePath)
      console.log('[File] Opened file location:', filePath)
    }
  } catch (error) {
    console.error('[File] Failed to open file location:', error)
  }
}

// ==================== 方案一：自定义协议 ====================

// 注册自定义协议
app.setAsDefaultProtocolClient(PROTOCOL_NAME)

// 处理协议链接（Windows/Linux）
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

// 处理协议链接（macOS）
app.on('ready', () => {
  // macOS 特殊处理
  if (process.platform === 'darwin') {
    app.on('open-url', (event, url) => {
      event.preventDefault()
      handleProtocolUrl(url)
    })
  }
  
  // Windows/Linux 处理命令行参数
  if (process.platform === 'win32' || process.platform === 'linux') {
    const url = process.argv.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`))
    if (url) {
      handleProtocolUrl(url)
    }
  }
  
  // 确保数据目录存在
  ensureDataZipDir()
  
  // 启动 WebSocket 服务器（方案二）
  startWebSocketServer()
  
  // 创建窗口
  createWindow()
})

// 处理协议 URL
function handleProtocolUrl(url) {
  console.log('📨 收到协议请求:', url)
  
  try {
    const urlObj = new URL(url)
    const action = urlObj.hostname || urlObj.pathname.replace('/', '')
    const params = Object.fromEntries(urlObj.searchParams)
    
    console.log('动作:', action)
    console.log('参数:', params)
    
    // 根据不同的 action 执行不同的操作
    switch (action) {
      case 'open':
        // 打开窗口或执行操作
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
        break
      case 'message':
        // 发送消息到渲染进程
        if (mainWindow) {
          mainWindow.webContents.send('electron-message', {
            type: params.type || 'info',
            data: params.data || params,
            timestamp: Date.now()
          })
        }
        break
      case 'notification':
        // 显示系统通知
        if (mainWindow) {
          mainWindow.webContents.send('electron-notification', {
            title: params.title || '通知',
            body: params.body || params.message || '',
            data: params,
            timestamp: Date.now()
          })
        }
        break
      default:
        console.log('未知动作:', action)
    }
  } catch (error) {
    console.error('❌ 解析协议 URL 失败:', error)
  }
}

// ==================== 方案二：WebSocket 服务器 ====================

let wss = null
let wsPort = WS_PORT

function startWebSocketServer() {
  // 创建 HTTP 服务器（用于处理 CORS 预检请求和健康检查）
  const server = createServer((req, res) => {
    // 处理 CORS
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      })
      res.end()
      return
    }
    
    // 健康检查接口
    if (req.url === '/health') {
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(JSON.stringify({ 
        status: 'ok', 
        port: wsPort,
        protocol: PROTOCOL_NAME,
        timestamp: Date.now()
      }))
      return
    }
    
    res.writeHead(404)
    res.end('Not Found')
  })
  
  // 创建 WebSocket 服务器
  wss = new WebSocketServer({ 
    server,
    path: '/ws'
  })
  
  // 尝试启动服务器（如果端口被占用，尝试其他端口）
  server.listen(wsPort, '127.0.0.1', () => {
    console.log(`[WebSocket] Server started: ws://127.0.0.1:${wsPort}/ws`)
    console.log(`[WebSocket] Health check: http://127.0.0.1:${wsPort}/health`)
    console.log(`[App] Packaged: ${app.isPackaged}`)
    console.log(`[App] Version: ${app.getVersion()}`)
    
    // 如果窗口已创建，发送服务器启动通知
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('electron-message', {
        type: 'server-started',
        message: 'WebSocket 服务器已启动',
        port: wsPort,
        timestamp: Date.now()
      })
    }
  })
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // 端口被占用，尝试下一个端口
      wsPort++
      console.log(`[WebSocket] Port ${wsPort - 1} is in use, trying port ${wsPort}`)
      setTimeout(() => {
        server.listen(wsPort, '127.0.0.1')
      }, 1000)
    } else {
      console.error('[WebSocket] Server error:', err)
    }
  })
  
  // 设置最大连接数限制（防止资源耗尽）
  const MAX_CONNECTIONS = 10
  
  // 处理 WebSocket 连接
  wss.on('connection', (ws, req) => {
    // 检查连接数限制
    if (wss.clients.size > MAX_CONNECTIONS) {
      console.warn(`[WebSocket] Connection limit exceeded (${MAX_CONNECTIONS}), rejecting new connection`)
      ws.close(1008, 'Connection limit exceeded')
      return
    }
    
    const clientIp = req.socket.remoteAddress
    const connectionId = `${clientIp}_${Date.now()}`
    
    console.log(`[WebSocket] New connection: ${clientIp} (ID: ${connectionId})`)
    console.log(`[WebSocket] Current connections: ${wss.clients.size}/${MAX_CONNECTIONS}`)
    
    // 设置连接超时（5分钟无活动自动断开）
    const heartbeatInterval = setInterval(() => {
      if (ws.isAlive === false) {
        console.log(`[WebSocket] Connection timeout, closing: ${clientIp}`)
        ws.terminate()
        clearInterval(heartbeatInterval)
        return
      }
      ws.isAlive = false
      ws.ping()
    }, 30000) // 30秒检查一次
    
    ws.isAlive = true
    
    // 处理 ping 响应
    ws.on('pong', () => {
      ws.isAlive = true
    })
    
    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      message: '已连接到 Electron 应用',
      port: wsPort,
      connectionId: connectionId,
      timestamp: Date.now()
    }))
    
    // 处理消息
    ws.on('message', (data) => {
      try {
        // 限制消息大小（防止DoS攻击）
        const MAX_MESSAGE_SIZE = 10 * 1024 * 1024 // 10MB
        if (data.length > MAX_MESSAGE_SIZE) {
          console.error('[Security] Message too large:', data.length)
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Message size exceeds limit'
          }))
          return
        }
        
        const message = JSON.parse(data.toString())
        console.log('[WebSocket] Received message:', message)
        
        // 验证消息类型
        if (!message || typeof message !== 'object') {
          throw new Error('Invalid message format')
        }
        
        // 根据消息类型处理
        handleWebSocketMessage(ws, message)
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error)
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
          error: error.message
        }))
      }
    })
    
    // 处理断开连接
    ws.on('close', (code, reason) => {
      clearInterval(heartbeatInterval)
      console.log(`[WebSocket] Connection closed: ${clientIp} (code: ${code}, reason: ${reason})`)
      console.log(`[WebSocket] Current connections: ${wss.clients.size}/${MAX_CONNECTIONS}`)
    })
    
    // 处理错误
    ws.on('error', (error) => {
      clearInterval(heartbeatInterval)
        console.error('[WebSocket] Error:', error)
        console.log(`[WebSocket] Current connections: ${wss.clients.size}/${MAX_CONNECTIONS}`)
    })
  })
}

// 处理 WebSocket 消息
function handleWebSocketMessage(ws, message) {
  const { type, data, action, taskId, filePath } = message
  
  switch (type || action) {
    case 'ping':
      // 心跳检测
      ws.send(JSON.stringify({ 
        type: 'pong', 
        timestamp: Date.now() 
      }))
      break
      
    case 'start-task':
      // 开始新任务
      console.log('📦 收到新任务:', data)
      const newTaskId = Date.now().toString()
      tasks.set(newTaskId, {
        id: newTaskId,
        status: 'pending',
        apiUrl: data.api_url || '',
        progress: 0,
        createdAt: new Date().toLocaleString(),
        ...data
      })
      
      // 异步处理任务
      processTask(newTaskId, data).catch(error => {
        console.error('❌ 任务处理异常:', error)
      })
      
      ws.send(JSON.stringify({
        type: 'task-started',
        taskId: newTaskId,
        message: '任务已开始处理'
      }))
      break
      
    case 'open-file-location':
      // 打开文件位置
      if (filePath && typeof filePath === 'string') {
        // 验证路径安全性
        if (validateFilePath(filePath)) {
          openFileLocation(filePath)
          ws.send(JSON.stringify({
            type: 'success',
            message: 'File location opened'
          }))
        } else {
          console.error('[Security] Invalid file path:', filePath)
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid file path'
          }))
        }
      }
      break
      
    case 'open':
      // 打开窗口或执行操作
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
      ws.send(JSON.stringify({ 
        type: 'success', 
        message: '窗口已打开',
        timestamp: Date.now()
      }))
      break
      
    case 'message':
      // 发送消息到渲染进程（保留用于调试）
      console.log('📨 收到浏览器消息:', message)
      console.log('📨 消息数据:', data)
      
      // 提取用户实际发送的数据
      // 浏览器发送的结构: { type: 'message', data: { message: 'xxx', data: { ... } } }
      // 所以这里的 data 是: { message: 'xxx', data: { timestamp, user } }
      // 我们只需要提取 data.data，这才是用户实际发送的数据
      let userData = {}
      let messageText = ''
      
      if (data) {
        // 如果 data 有 data 字段，说明是 sendElectronMessage 发送的格式
        // { message: 'xxx', data: { timestamp, user } }
        if (data.data && typeof data.data === 'object') {
          messageText = data.message || '收到消息'
          // 只提取用户实际发送的数据，不包含其他字段
          userData = { ...data.data }  // 复制对象，避免引用
        } else {
          // 直接发送的数据（没有嵌套 data）
          userData = { ...data }
          // 如果 userData 中有 message 字段，提取出来作为消息文本
          if (userData.message) {
            messageText = userData.message
            delete userData.message  // 从数据中移除 message 字段
          }
        }
      } else {
        // 如果没有 data，使用整个 message（但排除 type 字段）
        userData = { ...message }
        delete userData.type
      }
      
      // 清理 userData，移除不应该显示的字段
      delete userData.originalMessage
      delete userData.type
      
      // 构建要显示的消息对象（只包含用户实际发送的数据）
      const displayMessage = {
        type: 'from-browser',
        message: messageText || '收到来自浏览器的消息',
        data: userData,  // 只包含用户实际发送的数据
        timestamp: Date.now(),
        receivedAt: new Date().toLocaleString()
      }
      
      console.log('📤 发送消息到渲染进程（仅用户数据）:', JSON.stringify(displayMessage, null, 2))
      console.log('📤 用户数据:', JSON.stringify(userData, null, 2))
      console.log('📦 主窗口状态:', mainWindow ? (mainWindow.isDestroyed() ? '已销毁' : '正常') : '不存在')
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('electron-message', displayMessage)
          console.log('✅ 消息已成功发送到渲染进程')
        } catch (error) {
          console.error('❌ 发送消息到渲染进程失败:', error)
        }
      } else {
        console.warn('⚠️  主窗口不存在或已销毁，无法发送消息到渲染进程')
      }
      
      // 返回响应消息给浏览器
      const responseMessage = {
        type: 'message-response',
        success: true,
        message: '消息已收到并处理',
        originalData: userData,  // 返回用户实际发送的数据
        timestamp: Date.now()
      }
      console.log('📤 发送响应给浏览器:', responseMessage)
      ws.send(JSON.stringify(responseMessage))
      break
      
    case 'notification':
      // 显示系统通知
      if (mainWindow) {
        mainWindow.webContents.send('electron-notification', {
          title: data?.title || '通知',
          body: data?.body || data?.message || '',
          data: data,
          timestamp: Date.now()
        })
      }
      ws.send(JSON.stringify({ 
        type: 'success', 
        message: '通知已发送',
        timestamp: Date.now()
      }))
      break
      
    case 'get-info':
      // 获取应用信息
      ws.send(JSON.stringify({
        type: 'info',
        data: {
          version: app.getVersion(),
          platform: process.platform,
          port: wsPort,
          protocol: PROTOCOL_NAME,
          timestamp: Date.now()
        }
      }))
      break
      
    default:
      // 默认处理：发送到渲染进程
      console.log('📨 收到未知类型消息:', message)
      if (mainWindow) {
        mainWindow.webContents.send('electron-message', {
          ...message,
          timestamp: Date.now()
        })
      }
      // 返回响应消息给浏览器
      const defaultResponse = {
        type: 'default-response',
        success: true,
        message: '消息已转发到渲染进程',
        received: message,
        timestamp: Date.now()
      }
      console.log('📤 发送默认响应给浏览器:', defaultResponse)
      ws.send(JSON.stringify(defaultResponse))
  }
}

// ==================== Electron 窗口管理 ====================

let mainWindow = null

function createWindow() {
  // 获取 preload 脚本路径（开发环境和生产环境路径不同）
  const isDev = process.argv.includes('--dev') || !app.isPackaged
  
  // 尝试多个可能的路径（因为打包后的路径可能不同）
  let preloadPath = null
  const appPath = app.getAppPath()
  const fs = require('fs')
  
  // 构建可能的路径列表
  const possiblePaths = []
  
  // 如果是打包环境，优先使用 __dirname（与 electron-main.js 同目录）
  if (app.isPackaged) {
    // 打包后，由于 asar: false，文件在 resources/app/ 目录
    // __dirname 应该指向 resources/app/，preload.js 应该和 electron-main.js 在同一目录
    possiblePaths.push(
      path.join(__dirname, 'preload.js'),  // 最可能：与 electron-main.js 同目录
      path.join(appPath, 'preload.js'),  // app.getAppPath() 返回的路径
      path.join(path.dirname(process.execPath), 'resources', 'app', 'preload.js'),  // 可执行文件目录/resources/app/
      path.join(process.resourcesPath, 'app', 'preload.js'),  // resourcesPath/app/（如果 resourcesPath 存在）
      path.join(process.resourcesPath, 'preload.js')  // resourcesPath 根目录（extraResources 可能放这里）
    )
  } else {
    // 开发环境
    possiblePaths.push(
      path.join(__dirname, 'preload.js'),  // 开发环境
      path.join(appPath, 'preload.js')  // 备用
    )
  }
  
  // 检查文件是否存在
  for (const possiblePath of possiblePaths) {
    try {
      if (fs.existsSync(possiblePath)) {
        preloadPath = possiblePath
        console.log('✅ 找到 preload.js:', preloadPath)
        break
      }
    } catch (error) {
      // 忽略错误，继续尝试下一个路径
    }
  }
  
  // 如果都没找到，使用默认路径
  if (!preloadPath) {
    preloadPath = app.isPackaged 
      ? path.join(appPath, 'preload.js')
      : path.join(__dirname, 'preload.js')
    console.warn('⚠️  未找到 preload.js，使用默认路径:', preloadPath)
    console.warn('📁 已尝试的路径:')
    possiblePaths.forEach(p => {
      console.warn('  -', p, fs.existsSync(p) ? '✅' : '❌')
    })
  }
  
  // 使用 path.resolve 确保路径正确
  preloadPath = path.resolve(preloadPath)
  
  console.log('📁 Preload 路径:', preloadPath)
  console.log('📁 __dirname:', __dirname)
  console.log('📁 process.resourcesPath:', process.resourcesPath)
  console.log('📁 app.getAppPath():', appPath)
  console.log('📁 process.execPath:', process.execPath)
  console.log('📦 是否打包:', app.isPackaged)
  
  // 验证 preload 文件是否存在
  if (!fs.existsSync(preloadPath)) {
    console.error('❌ Preload 文件不存在:', preloadPath)
    console.error('📁 尝试查找 preload.js 在以下位置:')
    possiblePaths.forEach(p => {
      const resolvedPath = path.resolve(p)
      const exists = fs.existsSync(resolvedPath)
      console.error('  -', resolvedPath, exists ? '✅' : '❌')
    })
    
    // 如果文件不存在，尝试使用 __dirname（最可能的位置）
    const fallbackPath = path.resolve(__dirname, 'preload.js')
    if (fs.existsSync(fallbackPath)) {
      preloadPath = fallbackPath
      console.log('✅ 使用备用路径:', preloadPath)
    } else {
      console.error('❌ 所有路径都失败，preload.js 可能未正确打包')
      console.error('💡 请检查 package.json 的 files 配置是否包含 preload.js')
    }
  } else {
    console.log('✅ Preload 文件存在:', preloadPath)
  }
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true, // 隐藏菜单栏
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath, // 根据环境使用不同的路径
      // 确保 preload 脚本能够加载
      enableRemoteModule: false,
      sandbox: false
    }
  })
  
  // 验证 preload 是否加载成功
  mainWindow.webContents.on('dom-ready', () => {
    // 在 DOM 准备就绪时检查 preload
    setTimeout(() => {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          if (window.electronAPI) {
            console.log('✅ window.electronAPI 已加载');
            return true;
          } else {
            console.error('❌ window.electronAPI 未加载');
            return false;
          }
        })();
      `).then((result) => {
        if (result) {
          console.log('✅ Preload 脚本验证成功，window.electronAPI 可用')
        } else {
          console.error('❌ Preload 脚本验证失败，window.electronAPI 不存在')
          console.error('📁 Preload 路径:', preloadPath)
          console.error('📁 请检查 preload.js 是否正确打包')
          console.error('📁 当前应用路径:', app.getAppPath())
          console.error('📁 __dirname:', __dirname)
        }
      }).catch((error) => {
        console.error('❌ Preload 验证出错:', error)
      })
    }, 1000) // 延迟 1 秒确保 preload 已执行
  })
  
  // 加载测试页面
  const isTest = process.argv.includes('--test')
  
  if (isTest) {
    // 加载测试页面
    mainWindow.loadFile('test-page.html')
  } else if (isDev) {
    // 开发环境：加载 Vue 项目
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // 生产环境：可以加载本地文件或远程 URL
    mainWindow.loadFile('test-page.html')
  }
  
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  
  // 监听来自渲染进程的消息
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ 窗口加载完成')
    // 发送初始化消息，确认 IPC 通信正常
    try {
      mainWindow.webContents.send('electron-message', {
        type: 'window-ready',
        message: '窗口已准备就绪，可以接收消息',
        timestamp: Date.now()
      })
      console.log('✅ 已发送窗口就绪消息')
    } catch (error) {
      console.error('❌ 发送窗口就绪消息失败:', error)
    }
  })
  
  // 监听窗口加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('❌ 窗口加载失败:', {
      errorCode,
      errorDescription,
      url: validatedURL
    })
  })
  
  // 监听渲染进程崩溃
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('❌ 渲染进程崩溃:', details)
  })
  
  // 监听控制台消息（用于调试）
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) { // 只显示 warning 和 error
      console.log(`[渲染进程 ${level === 2 ? 'WARNING' : 'ERROR'}]:`, message)
    }
  })
}

// ==================== IPC 通信处理 ====================

// 监听来自渲染进程的消息
ipcMain.on('renderer-message', (event, message) => {
  console.log('[IPC] Received message from renderer:', message)
  
  // 验证消息格式
  if (!message || typeof message !== 'object') {
    console.error('[Security] Invalid IPC message format')
    return
  }
  
  // 处理来自浏览器的任务数据
  if (message.type === 'task-data' && message.data) {
    const taskData = message.data
    
    // 验证任务数据
    if (!taskData || typeof taskData !== 'object') {
      console.error('[Security] Invalid task data format')
      event.reply('electron-message', {
        type: 'error',
        message: 'Invalid task data format'
      })
      return
    }
    
    // 验证必需的字段
    if (!taskData.api_url || typeof taskData.api_url !== 'string') {
      console.error('[Security] API URL is required')
      event.reply('electron-message', {
        type: 'error',
        message: 'API URL is required'
      })
      return
    }
    
    // 验证 API URL
    try {
      validateApiUrl(taskData.api_url)
    } catch (error) {
      console.error('[Security] Invalid API URL:', error.message)
      event.reply('electron-message', {
        type: 'error',
        message: 'Invalid API URL: ' + error.message
      })
      return
    }
    
    console.log('[Task] Received task data from browser:', taskData)
    
    // 创建新任务
    const newTaskId = Date.now().toString()
    tasks.set(newTaskId, {
      id: newTaskId,
      status: 'pending',
      apiUrl: taskData.api_url || '',
      progress: 0,
      createdAt: new Date().toLocaleString(),
      ...taskData
    })
    
    // 异步处理任务
    processTask(newTaskId, taskData).catch(error => {
      console.error('[Task] Task processing error:', error)
    })
    
    event.reply('electron-message', {
      type: 'task-started',
      taskId: newTaskId,
      message: 'Task started'
    })
  } else if (message && message.type) {
    // 根据消息类型处理
    switch (message.type) {
      case 'ping':
        event.reply('electron-message', {
          type: 'pong',
          timestamp: Date.now()
        })
        break
      default:
        // 默认处理：回显消息
        event.reply('electron-message', {
          ...message,
          receivedAt: new Date().toLocaleString(),
          timestamp: Date.now()
        })
    }
  }
})

// ==================== 应用菜单 ====================

function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', { action: 'new' })
            }
          }
        },
        {
          label: '打开',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', { action: 'open' })
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: '切换开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-action', { action: 'about' })
            }
          }
        }
      ]
    }
  ]

  // macOS 特殊处理
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: '关于 ' + app.getName(), role: 'about' },
        { type: 'separator' },
        { label: '服务', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: '隐藏 ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
        { label: '隐藏其他', accelerator: 'Command+Shift+H', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', accelerator: 'Command+Q', click: () => app.quit() }
      ]
    })

    // 窗口菜单
    template[4].submenu = [
      { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' },
      { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
      { label: '缩放', role: 'zoom' },
      { type: 'separator' },
      { label: '前置全部窗口', role: 'front' }
    ]
  }

  // 不设置应用菜单，隐藏菜单栏
  // const menu = Menu.buildFromTemplate(template)
  // Menu.setApplicationMenu(menu)
  Menu.setApplicationMenu(null) // 完全隐藏菜单栏
}

// ==================== 应用生命周期 ====================

app.whenReady().then(() => {
  // 创建应用菜单
  createMenu()
  // createWindow 在 ready 事件中调用
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  // macOS 上，即使所有窗口关闭，应用通常也保持运行
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // 关闭所有 WebSocket 连接
  if (wss) {
    console.log(`📊 关闭前连接数: ${wss.clients.size}`)
    
    // 关闭所有客户端连接
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.close(1001, '服务器关闭')
      }
    })
    
    // 关闭 WebSocket 服务器
    wss.close(() => {
      console.log('🔌 WebSocket 服务器已关闭')
    })
  }
})

// ==================== 导出（如果需要） ====================

module.exports = {
  getWebSocketPort: () => wsPort,
  getMainWindow: () => mainWindow
}

