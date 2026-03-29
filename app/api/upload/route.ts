import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { requireDbUser } from '@/lib/users';
import { enforceRateLimit } from '@/lib/rate-limit';
import { trackServerEvent } from '@/lib/analytics';

export async function POST(req: NextRequest) {
    try {
        const user = await requireDbUser();
        const rateLimit = await enforceRateLimit({
            identifier: `user:${user.id}`,
            route: '/api/upload',
            limit: 20,
            windowSeconds: 600,
        });

        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        // 获取环境变量
        const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
        const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
        const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
        const bucketName = process.env.R2_BUCKET_NAME || 'word-app-images';

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

        const cdnBase = process.env.CDN_PUBLIC_BASE_URL;
        if (!cdnBase) {
            return NextResponse.json(
                { error: 'CDN_PUBLIC_BASE_URL is not configured' },
                { status: 500 }
            );
        }

        // 将文件转换为 Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const detectedMimeType = detectImageMimeType(buffer);

        if (!detectedMimeType) {
            return NextResponse.json(
                { error: 'Only supported image files are allowed' },
                { status: 400 }
            );
        }

        const extension = getExtensionFromMimeType(detectedMimeType);
        const uniqueFilename = `${Date.now()}_${randomUUID()}.${extension}`;

        // 上传到 R2
        const uploadCommand = new PutObjectCommand({
            Bucket: bucketName,
            Key: uniqueFilename,
            Body: buffer,
            ContentType: detectedMimeType,
        });

        await s3Client.send(uploadCommand);

        // 返回自定义域名 URL
        const publicUrl = `${cdnBase}/${uniqueFilename}`;

        console.log(`[Upload] Successfully uploaded: ${uniqueFilename}`);
        await trackServerEvent('upload_succeeded', {
            filename: uniqueFilename,
            mimeType: detectedMimeType,
        });

        return NextResponse.json({
            success: true,
            url: publicUrl,
            filename: uniqueFilename,
        });

    } catch (error) {
        console.error('[Upload] Error:', error);
        Sentry.captureException(error);
        return NextResponse.json(
            {
                error: 'Upload failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

function detectImageMimeType(buffer: Buffer) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'image/png';
    }

    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }

    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
    }

    if (buffer.length >= 6) {
        const signature = buffer.subarray(0, 6).toString('ascii');
        if (signature === 'GIF87a' || signature === 'GIF89a') {
            return 'image/gif';
        }
    }

    if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
        const brand = buffer.subarray(8, 12).toString('ascii');
        if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') {
            return 'image/heic';
        }
        if (brand === 'mif1' || brand === 'msf1') {
            return 'image/heif';
        }
    }

    return null;
}

function getExtensionFromMimeType(mimeType: string) {
    switch (mimeType) {
        case 'image/png':
            return 'png';
        case 'image/jpeg':
            return 'jpg';
        case 'image/webp':
            return 'webp';
        case 'image/gif':
            return 'gif';
        case 'image/heic':
            return 'heic';
        case 'image/heif':
            return 'heif';
        default:
            return 'img';
    }
}
