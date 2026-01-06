# 构建指南

## 问题说明

`electron-builder` 默认情况下只能在对应的操作系统上构建对应平台的版本：

- **Windows** 上只能构建 Windows 版本
- **macOS** 上只能构建 macOS 版本  
- **Linux** 上只能构建 Linux 版本

在 Windows 上运行 `npm run build:mac` 会出现以下错误：
```
⨯ Build for macOS is supported only on macOS
```

## 解决方案

### 方案一：使用 CI/CD 平台（推荐）✅

#### 1.1 使用 GitHub Actions

已创建 `.github/workflows/build.yml` 文件，可以自动在 GitHub 上构建所有平台版本。

**详细操作步骤：**

**方法一：通过标签自动触发构建**

1. 将代码推送到 GitHub 仓库
2. 创建并推送一个标签（例如 `v1.0.0`）：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. 推送标签后，GitHub Actions 会自动开始构建

**方法二：手动触发工作流**

1. 打开 GitHub 仓库页面（例如：`https://github.com/your-username/your-repo`）
2. 点击仓库顶部导航栏的 **"Actions"** 标签页（位于 "Code"、"Issues"、"Pull requests" 旁边）
   - ⚠️ **重要提示**：
     - 如果点击后看到下拉菜单（包含 "General"、"Runners" 等选项），说明你点击的是 **"Settings"**（设置）下的 Actions 配置
     - 正确的做法是：直接点击顶部导航栏的 **"Actions"** 文字链接（不是 Settings 中的 Actions）
     - 正确的 Actions 页面会显示工作流列表和运行历史，而不是设置选项
3. 进入 Actions 页面后，在左侧工作流列表中找到 **"构建 Electron 应用"** 工作流，点击它
4. 点击右侧的 **"Run workflow"** 按钮（绿色按钮，位于工作流运行历史列表上方）
5. 在下拉菜单中选择要构建的分支（通常是 `main` 或 `master`）
6. 点击 **"Run workflow"** 按钮确认

**查看构建结果和下载产物：**

1. 在 "Actions" 页面，点击刚才运行的工作流实例
2. 等待构建完成（可以看到三个并行任务：Windows、macOS、Linux）
3. 构建完成后，点击任意一个任务（如 "build (macos-latest)"）
4. 在任务详情页面底部，找到 **"Artifacts"** 部分
5. 点击对应的构建产物名称（如 "macOS-构建产物"）即可下载
6. 每个平台的构建产物都可以单独下载

#### 1.2 使用 Gitee（码云）✅

已创建 `.gitee-ci.yml` 配置文件，可以自动在 Gitee 上构建所有平台版本。

**详细操作步骤：**

**方法一：通过推送代码自动触发构建**

1. 将代码推送到 Gitee 仓库：
   ```bash
   git add .
   git commit -m "更新代码"
   git push origin main
   ```
2. 推送后，流水线会自动触发构建

**方法二：手动触发流水线**

1. 打开 Gitee 仓库页面（例如：`https://gitee.com/your-username/your-repo`）
2. 点击仓库顶部导航栏的 **"流水线"** 标签页（位于 "代码"、"Issues"、"Pull Requests" 旁边）
   - 如果没有看到 "流水线" 标签，可能需要先启用 Gitee Go 服务
3. 在流水线列表中找到 **"Electron应用构建流水线"**（或 `electron-build-pipeline`）
4. 点击该流水线右侧的 **"运行"** 按钮（或 **"▶️"** 图标）
5. 在弹出的对话框中：
   - 选择要构建的分支（通常是 `main` 或 `master`）
   - 点击 **"确定"** 或 **"运行"** 按钮

**查看构建结果和下载产物：**

1. 在 "流水线" 页面，点击正在运行或已完成的流水线实例
2. 在流水线详情页面，可以看到三个并行任务：
   - "构建 Windows 版本"
   - "构建 macOS 版本"
   - "构建 Linux 版本"
3. 点击任意一个任务查看详细日志
4. 构建完成后，在任务详情页面找到 **"构建产物"** 或 **"Artifacts"** 部分
5. 点击对应的文件即可下载（如 `.exe`、`.dmg`、`.AppImage` 等）

**注意事项：**

- ⚠️ **Gitee Go 需要企业版或专业版才能使用**
- 如果使用免费版，Gitee 可能不支持流水线功能
- 免费版用户可以考虑：
  - 升级到企业版/专业版
  - 使用第三方 CI/CD 服务（如 Jenkins、阿里云 CodePipeline、腾讯云 CODING）
  - 使用 GitHub Actions（免费）
- 具体配置可能因 Gitee 版本而异，请参考 [Gitee 官方文档](https://gitee.com/help)

### 方案二：在对应操作系统上构建

- **构建 macOS 版本**：需要在 macOS 系统上运行 `npm run build:mac`
- **构建 Linux 版本**：需要在 Linux 系统上运行 `npm run build:linux`
- **构建 Windows 版本**：在 Windows 系统上运行 `npm run build:win` ✅

### 方案三：使用 Docker（高级）

可以使用 Docker 容器来模拟不同操作系统，但配置较复杂，不推荐。

## 当前系统构建

在 **Windows** 系统上，您可以：

```bash
# 构建 Windows 版本
npm run build:win
```

构建产物会输出到 `release/` 目录。

## 注意事项

- macOS 构建需要代码签名（可选，但推荐用于分发）
- Linux 构建可能需要额外的依赖包
- 跨平台构建建议使用 CI/CD 工具（如 GitHub Actions、Gitee Go）
- Gitee 免费版可能不支持 Gitee Go，需要使用企业版或第三方 CI/CD 服务

