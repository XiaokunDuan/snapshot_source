import { NextRequest, NextResponse } from 'next/server';

interface AnalyzeRequest {
    imageUrl: string;
}

interface WordResult {
    word: string;
    phonetic: string;
    meaning: string;
    sentence: string;
    sentence_cn: string;
}

// 全局计数器用于轮询
let requestCounter = 0;

export async function POST(req: NextRequest) {
    try {
        const body: AnalyzeRequest = await req.json();
        const { imageUrl } = body;

        if (!imageUrl) {
            return NextResponse.json(
                { error: 'imageUrl is required' },
                { status: 400 }
            );
        }

        // 从环境变量获取 API 密钥池
        const apiKeyPool = process.env.GEMINI_API_KEY_POOL;

        if (!apiKeyPool) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY_POOL not configured' },
                { status: 500 }
            );
        }

        // 分割并处理 API 密钥池
        const apiKeys = apiKeyPool.split(',').map(key => key.trim()).filter(key => key.length > 0);

        if (apiKeys.length === 0) {
            return NextResponse.json(
                { error: 'No valid API keys found' },
                { status: 500 }
            );
        }

        // 轮询选择 API 密钥（按顺序依次使用）
        const currentIndex = requestCounter % apiKeys.length;
        const selectedApiKey = apiKeys[currentIndex];

        // 递增计数器
        requestCounter++;

        console.log(`[Analyze] 🔄 轮询使用密钥 ${currentIndex + 1}/${apiKeys.length} (总请求数: ${requestCounter})`);

        // 构建 Gemini API 请求
        const model = 'gemini-3-flash-preview';
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${selectedApiKey}`;

        // 系统提示词
        const systemPrompt = `你是一个专业的英语老师。用户会发给你一张图片。请识别图片中的核心物体，返回一个对应的英文单词、音标、中文释义，以及一个简短的英文例句（带中文翻译）。

你必须返回以下 JSON 格式，不要包含任何其他文字：
{
  "word": "英文单词",
  "phonetic": "/音标/",
  "meaning": "中文释义",
  "sentence": "英文例句",
  "sentence_cn": "例句的中文翻译"
}`;

        // 处理 base64 或 URL
        let imageData: string;
        if (imageUrl.startsWith('data:')) {
            // 提取 base64 数据（去掉 "data:image/...;base64," 前缀）
            imageData = imageUrl.split(',')[1];
        } else {
            // 从 URL 获取图片
            imageData = await fetchImageAsBase64(imageUrl);
        }

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: imageData,
                            },
                        },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.4,
                topK: 32,
                topP: 1,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
            },
        };

        // 调用 Gemini API
        const response = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Analyze] Gemini API error:', errorData);
            return NextResponse.json(
                { error: 'Gemini API request failed', details: errorData },
                { status: response.status }
            );
        }

        const data = await response.json();

        // 提取生成的文本
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            return NextResponse.json(
                { error: 'No response from Gemini' },
                { status: 500 }
            );
        }

        // 解析 JSON 响应
        let result: WordResult;
        try {
            result = JSON.parse(generatedText);
        } catch (parseError) {
            console.error('[Analyze] Failed to parse JSON:', generatedText);
            return NextResponse.json(
                { error: 'Invalid JSON response from AI', raw: generatedText },
                { status: 500 }
            );
        }

        console.log(`[Analyze] Successfully analyzed: ${result.word}`);

        return NextResponse.json({
            success: true,
            ...result,
        });

    } catch (error) {
        console.error('[Analyze] Error:', error);
        return NextResponse.json(
            {
                error: 'Analysis failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// 辅助函数：将图片 URL 转换为 Base64
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
}
