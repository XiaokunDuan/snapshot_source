import { NextRequest, NextResponse } from 'next/server';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface ChatRequest {
    messages: Message[];
    model?: string;
}

interface OpenAICompatibleResponse {
    choices?: Array<{
        message?: {
            content?: string;
            reasoning_content?: string;
        };
    }>;
    error?: {
        message: string;
    };
}

export async function POST(req: NextRequest) {
    try {
        const body: ChatRequest = await req.json();
        const {
            messages,
            model = process.env.TEXT_MODEL || 'MiniMax-M2.5-highspeed'
        } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'Messages array is required and cannot be empty' },
                { status: 400 }
            );
        }

        const textApiBaseUrl = process.env.TEXT_API_BASE_URL;
        const textApiKey = process.env.TEXT_API_KEY;

        if (!textApiBaseUrl || !textApiKey) {
            return NextResponse.json(
                { error: 'TEXT_API_BASE_URL or TEXT_API_KEY is not configured' },
                { status: 500 }
            );
        }

        const response = await fetch(`${textApiBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${textApiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: messages.map((message) => ({
                    role: message.role,
                    content: message.content,
                })),
                temperature: 0.7,
                max_tokens: 1024,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[API] Text API error:', errorData);
            return NextResponse.json(
                {
                    error: 'Failed to get response from text API',
                    details: errorData
                },
                { status: response.status }
            );
        }

        const data: OpenAICompatibleResponse = await response.json();

        if (data.error) {
            console.error('[API] Text API returned error:', data.error);
            return NextResponse.json(
                { error: data.error.message },
                { status: 500 }
            );
        }

        const generatedText = data.choices?.[0]?.message?.content;

        if (!generatedText) {
            return NextResponse.json(
                { error: 'No response generated from text API' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: {
                role: 'assistant',
                content: generatedText
            },
            model,
            provider: 'minimax-compatible'
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
