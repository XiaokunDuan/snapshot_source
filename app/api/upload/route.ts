import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export async function POST(req: NextRequest) {
    try {
        // 获取环境变量
        const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
        const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
        const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

        if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
            return NextResponse.json(
                { error: 'R2 credentials not configured' },
                { status: 500 }
            );
        }

        // 初始化 S3Client (使用 R2 endpoint)
        const s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });

        // 解析上传的文件
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // 验证文件类型（只允许图片）
        if (!file.type.startsWith('image/')) {
            return NextResponse.json(
                { error: 'Only image files are allowed' },
                { status: 400 }
            );
        }

        // 生成唯一文件名：timestamp_randomstring.ext
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const extension = file.name.split('.').pop() || 'jpg';
        const uniqueFilename = `${timestamp}_${randomStr}.${extension}`;

        // 将文件转换为 Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 上传到 R2
        const uploadCommand = new PutObjectCommand({
            Bucket: 'word-app-images',
            Key: uniqueFilename,
            Body: buffer,
            ContentType: file.type,
        });

        await s3Client.send(uploadCommand);

        // 返回自定义域名 URL
        const publicUrl = `https://snapshot.yulu34.top/${uniqueFilename}`;

        console.log(`[Upload] Successfully uploaded: ${uniqueFilename}`);

        return NextResponse.json({
            success: true,
            url: publicUrl,
            filename: uniqueFilename,
        });

    } catch (error) {
        console.error('[Upload] Error:', error);
        return NextResponse.json(
            {
                error: 'Upload failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
