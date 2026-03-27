import { NextRequest, NextResponse } from 'next/server';
import { getEnrichedWordData } from '@/lib/mcp/tools';
import { fetchWithKeyRotation } from '@/lib/gemini';

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

        // 构建 Gemini API 请求
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
        let mimeType = 'image/jpeg';
        if (imageUrl.startsWith('data:')) {
            mimeType = getMimeTypeFromDataUrl(imageUrl);
            // 提取 base64 数据（去掉 "data:image/...;base64," 前缀）
            imageData = imageUrl.split(',')[1];
        } else {
            // 从 URL 获取图片
            const fetchedImage = await fetchImageAsBase64(imageUrl);
            imageData = fetchedImage.data;
            mimeType = fetchedImage.mimeType;
        }

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
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

        // 调用 Gemini API via utility (handles key rotation)
        const { data } = await fetchWithKeyRotation(endpoint, {
            method: 'POST',
            body: requestBody,
        });

        // 提取生成的文本
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!generatedText) {
            console.error('[Analyze] No text generated:', data);
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

        // 使用 MCP 获取富化数据
        const enrichedData = await getEnrichedWordData(result.word);

        return NextResponse.json({
            success: true,
            ...result,
            mcp: enrichedData
        });

    } catch (error) {
        console.error('[Analyze] Error:', error);
        return NextResponse.json(
            {
                error: 'Analysis failed',
                details: error instanceof Error ? error.message : JSON.stringify(error),
            },
            { status: 500 }
        );
    }
}

// 辅助函数：将图片 URL 转换为 Base64
async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    const response = await fetch(imageUrl);
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
        data: buffer.toString('base64'),
        mimeType,
    };
}

function getMimeTypeFromDataUrl(dataUrl: string) {
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    return match?.[1] || 'image/jpeg';
}
