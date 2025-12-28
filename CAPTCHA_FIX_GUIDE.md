# 解决 Clerk CAPTCHA 问题

## 问题描述
注册页面显示："The CAPTCHA failed to load" 错误。这是 Clerk 默认的 bot 防护机制导致的。

---

## ✅ 推荐解决方案（5分钟）

### 步骤 1: 进入 Clerk Dashboard

1. 访问：https://dashboard.clerk.com/
2. 选择您的应用（应该是为 Snapshot 创建的应用）

### 步骤 2: 禁用 Bot Protection

1. 在左侧菜单中找到 **User & Authentication** 或 **Configure**
2. 点击 **Attack Protection** 或 **Security**
3. 找到 **Bot sign-up protection** 设置
4. 将其从 **On** 改为：
   - **Off**（完全禁用，适合开发环境）
   - 或 **Invisible**（后台验证，用户无感）
5. 点击 **Save** 保存

### 步骤 3: 刷新页面

1. 返回浏览器中的注册页面
2. 按 `Cmd + Shift + R`（Mac）或 `Ctrl + Shift + R`（Windows）强制刷新
3. 重新尝试注册

---

## 🚀 替代方案：使用邮件魔法链接

如果您不想修改 Clerk 设置，可以使用无密码登录：

### 使用电子邮件注册（无需 CAPTCHA）

1. 在注册页面，**只填写 Email address**
2. 点击继续
3. Clerk 会自动发送一封验证邮件到您的邮箱
4. 打开邮件，点击"Verify email address"链接
5. 自动完成注册并登录，无需密码

**优点**：
- 不触发 CAPTCHA
- 更安全（无需记住密码）
- 更快（直接通过邮件验证）

---

## 🔧 开发环境配置建议

### Clerk Dashboard 开发环境设置

建议在开发环境中：

1. **禁用 Bot Protection** - 避免 CAPTCHA 干扰
2. **启用 Email Magic Links** - 提供更好的体验
3. **启用 Social Login（可选）** - Google/GitHub 快速登录
4. **禁用 Email Verification（可选）** - 开发时跳过邮件验证

这些设置只影响开发环境，生产环境可以单独配置。

---

## 🐛 其他可能的原因

如果上述方法都不行，检查：

### 1. 浏览器扩展
- 暂时禁用广告拦截器（uBlock Origin, AdBlock Plus等）
- 禁用隐私保护扩展（Privacy Badger等）
- 尝试无痕/隐私模式

### 2. 网络问题
- 检查是否可以访问 https://challenges.cloudflare.com
- 尝试切换网络（WiFi → 移动热点）
- 检查防火墙/VPN 设置

### 3. Clerk 服务状态
- 访问 https://status.clerk.com/ 检查服务状态
- 如果 Clerk 服务中断，等待恢复

---

## ✨ 完成后测试

注册成功后，您应该能看到：

1. **自动登录** - 跳转到主页（`/`）
2. **用户头像** - 右上角显示您的头像（绿色圆环）
3. **挑战卡片** - 显示"连续打卡 0 天"
4. **日历视图** - 当月日历（今日标记）

**接下来可以**：
- 拍照识别单词（触发打卡）
- 查看单词本（`/wordbooks`）
- 查看通知（`/notifications`）
- 测试训练模式（`/train/flashcard`）

---

## 💡 小提示

- **首次注册**会自动创建：
  - 用户记录（users 表）
  - 默认单词本"我的收藏"
  - 30天打卡挑战
  
- **打卡逻辑**：
  - 每次学习单词自动打卡
  - 昨天打卡 → 连续天数+1
  - 跳过一天 → 重置为1

- **数据持久化**：
  - 所有数据存储在 Neon 数据库
  - 图片存储在 Cloudflare R2
  - 退出登录后数据不会丢失

---

## 📞 如果问题仍然存在

1. 截图完整错误信息
2. 检查浏览器控制台（F12）的错误日志
3. 尝试使用不同的浏览器（Chrome、Firefox、Safari）
4. 联系 Clerk Support：support@clerk.com

推荐：**先尝试邮件魔法链接方式**，这是最快的解决方案！
