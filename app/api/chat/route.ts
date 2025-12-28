import { NextRequest, NextResponse } from 'next/server';

// 定义消息类型
interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// 定义请求体类型
interface ChatRequest {
    messages: Message[];
    model?: string;
}

// Gemini API 响应类型
interface GeminiResponse {
    candidates?: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
        };
    }>;
    error?: {
        message: string;
    };
}

// 全局计数器用于轮询
let requestCounter = 0;

export async function POST(req: NextRequest) {
    try {
        // 解析请求体
        const body: ChatRequest = await req.json();
        const { messages, model = 'gemini-3-flash-preview' } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'Messages array is required and cannot be empty' },
                { status: 400 }
            );
        }

        // 从环境变量获取 API 密钥池
        const apiKeyPool = process.env.GEMINI_API_KEY_POOL;

        if (!apiKeyPool) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY_POOL environment variable is not set' },
                { status: 500 }
            );
        }

        // 将密钥池字符串分割成数组
        const apiKeys = apiKeyPool.split(',').map(key => key.trim()).filter(key => key.length > 0);

        if (apiKeys.length === 0) {
            return NextResponse.json(
                { error: 'No valid API keys found in GEMINI_API_KEY_POOL' },
                { status: 500 }
            );
        }

        // 轮询选择 API 密钥（按顺序依次使用）
        const currentIndex = requestCounter % apiKeys.length;
        const selectedApiKey = apiKeys[currentIndex];

        // 递增计数器
        requestCounter++;

        console.log(`[API] 🔄 轮询使用密钥 ${currentIndex + 1}/${apiKeys.length} (总请求数: ${requestCounter}) | 模型: ${model}`);

        // 转换消息格式为 Gemini API 格式
        // Gemini API 只接受 user 和 model 角色，我们需要合并消息
        const geminiMessages = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        // 构建 Gemini API 请求
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${selectedApiKey}`;

        const geminiRequestBody = {
            contents: geminiMessages,
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192,
            },
            safetySettings: [
                {
                    category: 'HARM_CATEGORY_HARASSMENT',
                    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                },
                {
                    category: 'HARM_CATEGORY_HATE_SPEECH',
                    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                },
                {
                    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                },
                {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                }
            ]
        };

        // 调用 Gemini API
        const response = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(geminiRequestBody),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[API] Gemini API error:', errorData);
            return NextResponse.json(
                {
                    error: 'Failed to get response from Gemini API',
                    details: errorData
                },
                { status: response.status }
            );
        }

        const data: GeminiResponse = await response.json();

        // 检查响应是否包含错误
        if (data.error) {
            console.error('[API] Gemini API returned error:', data.error);
            return NextResponse.json(
                { error: data.error.message },
                { status: 500 }
            );
        }

        // 提取生成的文本
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            return NextResponse.json(
                { error: 'No response generated from Gemini API' },
                { status: 500 }
            );
        }

        // 返回响应
        return NextResponse.json({
            success: true,
            message: {
                role: 'assistant',
                content: generatedText
            },
            model: model,
            apiKeyIndex: currentIndex + 1,
            totalKeys: apiKeys.length,
            totalRequests: requestCounter
        });

    } catch (error) {
        console.error('[API] Error in chat route:', error);
        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
