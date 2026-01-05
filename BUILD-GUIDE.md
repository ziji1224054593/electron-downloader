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

**使用方法：**

1. 将代码推送到 GitHub 仓库
2. 创建并推送一个标签（例如 `v1.0.0`）：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. 或者手动触发工作流：
   - 在 GitHub 仓库页面，点击 "Actions" 标签
   - 选择 "构建 Electron 应用" 工作流
   - 点击 "Run workflow"

构建完成后，可以在 "Actions" 页面下载各平台的构建产物。

#### 1.2 使用 Gitee（码云）✅

已创建以下配置文件：
- `.gitee/workflows/build.yml` - Gitee Go 工作流配置
- `.gitee-ci.yml` - Gitee CI/CD 配置文件

**使用方法：**

1. 将代码推送到 Gitee 仓库
2. 在 Gitee 仓库页面：
   - 进入 "流水线" 或 "CI/CD" 页面
   - 选择 "构建 Electron 应用" 工作流
   - 点击 "运行流水线" 或手动触发

**注意：**
- Gitee Go 需要企业版或专业版才能使用
- 如果使用免费版，可以考虑使用第三方 CI/CD 服务（如 Jenkins、阿里云 CodePipeline）
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

