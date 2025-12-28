# Chat API 使用说明

## 环境变量配置

1. 复制 `env.example` 文件为 `.env.local`：
```bash
cp env.example .env.local
```

2. 在 `.env.local` 中配置你的 API 密钥池（已经预填充了 28 个密钥）

## API 端点

**POST** `/api/chat`

### 请求格式

```json
{
  "messages": [
    {
      "role": "user",
      "content": "你好，请介绍一下自己"
    }
  ],
  "model": "gemini-3-flash-preview"  // 可选，默认为 gemini-3-flash-preview
}
```

### 支持的模型

- `gemini-3-flash-preview` (默认)
- `gemini-2.5-flash-tts`
- 其他 Gemini 模型

### 响应格式

成功响应：
```json
{
  "success": true,
  "message": {
    "role": "assistant",
    "content": "你好！我是 Google 的大型语言模型 Gemini..."
  },
  "model": "gemini-3-flash-preview",
  "apiKeyIndex": 15,
  "totalKeys": 28,
  "totalRequests": 42
}
```

错误响应：
```json
{
  "error": "错误信息",
  "details": "详细错误信息"
}
```

## 🔑 密钥轮询机制

- 系统采用**真正的轮询**（Round-Robin）机制
- 按顺序依次使用 28 个密钥：密钥1 → 密钥2 → ... → 密钥28 → 密钥1 → ...
- 每次请求递增计数器，确保负载均匀分布
- 响应中会返回：
  - `apiKeyIndex`: 当前使用的密钥索引（1-28）
  - `totalKeys`: 密钥池总数（28）
  - `totalRequests`: 服务启动后的总请求数

### 轮询示例
```
请求 1 → 使用密钥 1
请求 2 → 使用密钥 2
请求 3 → 使用密钥 3
...
请求 28 → 使用密钥 28
请求 29 → 使用密钥 1  (循环回到开始)
请求 30 → 使用密钥 2
```

## 前端调用示例

```typescript
async function chat(messages: Array<{role: string, content: string}>) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      model: 'gemini-3-flash-preview'
    }),
  });

  const data = await response.json();
  
  if (data.success) {
    console.log('AI 回复:', data.message.content);
    console.log('使用的密钥:', `${data.apiKeyIndex}/${data.totalKeys}`);
  } else {
    console.error('错误:', data.error);
  }
  
  return data;
}

// 使用示例
chat([
  { role: 'user', content: '你好' }
]);
```

## 注意事项

⚠️ **安全警告**：
- 永远不要将 `.env.local` 文件提交到 Git 仓库
- API 密钥应该保密，不要在客户端代码中暴露
- 建议定期轮换 API 密钥

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000/api/chat 测试 API
