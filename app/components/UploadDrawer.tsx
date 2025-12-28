import { Drawer } from 'vaul';
import { Camera, Image as ImageIcon, X } from 'lucide-react';

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
                <Drawer.Content className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-50 mt-24 flex flex-col rounded-t-[32px] bg-white dark:bg-wise-card-dark outline-none transition-colors duration-300">
                    <Drawer.Title className="sr-only">选择上传方式</Drawer.Title>
                    <div className="p-4 bg-white dark:bg-wise-card-dark rounded-t-[32px] flex-1">
                        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600 mb-8" />

                        <div className="max-w-md mx-auto px-4 pb-8 space-y-4">
                            <button onClick={onCamera} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-lime-100 dark:bg-lime-900/30 flex items-center justify-center">
                                    <Camera className="w-6 h-6 text-wise-lime" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">拍照</h3>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">使用相机拍摄新照片</p>
                                </div>
                            </button>

                            <button onClick={onGallery} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                    <ImageIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">相册</h3>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{isNative ? '从手机相册选择' : '选择图片文件'}</p>
                                </div>
                            </button>
                        </div>

                        <div className="p-4 border-t border-zinc-100 dark:border-white/5 mt-4">
                            <Drawer.Close asChild>
                                <button className="w-full py-3 text-center font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">取消</button>
                            </Drawer.Close>
                        </div>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
