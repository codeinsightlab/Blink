Blink for macOS

当前 Blink macOS 版本为测试版本，尚未完成 Apple Developer ID 签名和 notarization。

正常安装：
1. 将 Blink 拖入 Applications 文件夹。
2. 从 Applications 打开 Blink。

如果 macOS 提示“无法验证开发者”“Blink 已损坏”或应用无法打开，可以暂时在 Terminal 执行：

xattr -dr com.apple.quarantine /Applications/Blink.app

然后重新打开 Blink。

这是当前测试版本的临时启动方式，不是长期正式安装方案。未来完成 Developer ID 签名和 Apple notarization 后，将不再需要执行该命令。

请仅从 Blink 官方网站或 Blink 官方 Release 下载应用。
