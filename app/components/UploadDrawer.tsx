import { Drawer } from 'vaul';
import { Camera, Image as ImageIcon } from 'lucide-react';

interface UploadDrawerProps {
    children: React.ReactNode;
    onCamera: () => void;
    onGallery: () => void;
    isNative: boolean;
}

export function UploadDrawer({ children, onCamera, onGallery, isNative }: UploadDrawerProps) {
    return (
        <Drawer.Root>
            <Drawer.Trigger asChild>
                {children}
            </Drawer.Trigger>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" />
                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 mx-auto mt-24 flex max-w-md flex-col rounded-t-[36px] border border-[var(--editorial-border)] bg-[var(--editorial-paper)] outline-none shadow-[0_-24px_80px_rgba(0,0,0,0.18)]">
                    <Drawer.Title className="sr-only">选择上传方式</Drawer.Title>
                    <div className="flex-1 rounded-t-[36px] bg-[var(--editorial-paper)] p-5">
                        <div className="mb-8 h-1.5 w-12 flex-shrink-0 rounded-full bg-[rgba(39,36,31,0.18)] mx-auto" />

                        <div className="mx-auto max-w-md px-1 pb-6">
                            <div className="mb-6">
                                <p className="editorial-kicker">Capture entry</p>
                                <h3 className="editorial-serif mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--editorial-ink)]">
                                    选择图像入口
                                </h3>
                                <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                                    用拍照或相册把一个新词带进学习桌面。后续流程会自动压缩、识别并归档。
                                </p>
                            </div>

                            <div className="space-y-4">
                                <button
                                    onClick={onCamera}
                                    className="w-full rounded-[28px] border border-[var(--editorial-border)] bg-[var(--editorial-panel)] p-5 text-left transition-all hover:-translate-y-0.5"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.14)]">
                                            <Camera className="h-6 w-6 text-[var(--editorial-accent)]" />
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--editorial-muted)]">Instant capture</p>
                                            <h4 className="editorial-serif mt-1 text-2xl font-semibold text-[var(--editorial-ink)]">拍照</h4>
                                            <p className="mt-1 text-sm text-[var(--editorial-muted)]">使用相机记录当前场景里的单词。</p>
                                        </div>
                                    </div>
                                </button>

                                <button
                                    onClick={onGallery}
                                    className="w-full rounded-[28px] border border-[var(--editorial-border)] bg-[var(--editorial-panel)] p-5 text-left transition-all hover:-translate-y-0.5"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.08)]">
                                            <ImageIcon className="h-6 w-6 text-[var(--editorial-accent)]" />
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.2em] text-[var(--editorial-muted)]">Archive source</p>
                                            <h4 className="editorial-serif mt-1 text-2xl font-semibold text-[var(--editorial-ink)]">相册</h4>
                                            <p className="mt-1 text-sm text-[var(--editorial-muted)]">{isNative ? '从手机相册选择一张图继续识别。' : '选择图片文件，常见格式都支持。'}</p>
                                        </div>
                                    </div>
                                </button>
                            </div>

                            <div className="mt-5 rounded-[24px] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.78)] px-4 py-3">
                                <p className="text-xs leading-6 text-[var(--editorial-muted)]">
                                    网页端会优先处理当前浏览器可读取的图片类型，并在分析前自动压缩。
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 border-t border-[var(--editorial-border)] pt-4">
                            <Drawer.Close asChild>
                                <button className="w-full py-3 text-center font-medium text-[var(--editorial-muted)] transition-colors hover:text-[var(--editorial-ink)]">取消</button>
                            </Drawer.Close>
                        </div>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
