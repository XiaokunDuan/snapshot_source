'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { useUser } from '@clerk/nextjs';

interface WordBook {
    id: number;
    name: string;
    description: string;
    is_default: boolean;
    word_count: number;
}

export default function WordBooksPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useUser();
    const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
    const [showNewBookModal, setShowNewBookModal] = useState(false);
    const [newBookName, setNewBookName] = useState('');
    const [newBookDesc, setNewBookDesc] = useState('');

    const fetchWordBooks = async () => {
        try {
            const res = await fetch('/api/wordbooks');
            const data = await res.json();
            if (data.wordBooks) {
                setWordBooks(data.wordBooks);
            }
        } catch (error) {
            console.error('Failed to fetch word books:', error);
        }
    };

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            fetchWordBooks();
        }
    }, [isLoaded, isSignedIn]);

    const createWordBook = async () => {
        if (!newBookName.trim()) {
            alert('请输入单词本名称');
            return;
        }

        try {
            const res = await fetch('/api/wordbooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newBookName,
                    description: newBookDesc
                })
            });

            if (res.ok) {
                setShowNewBookModal(false);
                setNewBookName('');
                setNewBookDesc('');
                fetchWordBooks();
            }
        } catch (error) {
            console.error('Failed to create word book:', error);
        }
    };

    const deleteWordBook = async (id: number, isDefault: boolean) => {
        if (isDefault) {
            alert('默认单词本不能删除');
            return;
        }

        if (!confirm('确定要删除这个单词本吗？')) {
            return;
        }

        try {
            const res = await fetch(`/api/wordbooks?id=${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                fetchWordBooks();
            }
        } catch (error) {
            console.error('Failed to delete word book:', error);
        }
    };

    if (!isLoaded || !isSignedIn) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-600">请先登录</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6 text-gray-700" />
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900">单词本</h1>
                        <span className="text-sm text-gray-500">({wordBooks.length})</span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto px-4 py-6">
                {/* Word Books List */}
                <div className="space-y-4">
                    {wordBooks.map((book) => (
                        <div
                            key={book.id}
                            onClick={() => router.push(`/wordbooks/${book.id}`)}
                            className="bg-white rounded-3xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-lime-100 rounded-2xl">
                                        <BookOpen className="w-6 h-6 text-lime-600" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-bold text-gray-900">{book.name}</h3>
                                            {book.is_default && (
                                                <span className="text-xs bg-lime-100 text-lime-700 px-2 py-1 rounded-full">
                                                    默认
                                                </span>
                                            )}
                                        </div>
                                        {book.description && (
                                            <p className="text-sm text-gray-600 mt-1">{book.description}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-gray-900">{book.word_count}</div>
                                        <div className="text-xs text-gray-500">个单词</div>
                                    </div>

                                    {!book.is_default && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteWordBook(book.id, book.is_default);
                                            }}
                                            className="p-2 hover:bg-red-50 rounded-full transition-colors"
                                        >
                                            <Trash2 className="w-5 h-5 text-red-500" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* New Book Button */}
                <button
                    onClick={() => setShowNewBookModal(true)}
                    className="fixed bottom-24 right-8 w-16 h-16 bg-lime-500 hover:bg-lime-600 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all"
                >
                    <Plus className="w-8 h-8" />
                </button>
            </div>

            {/* New Book Modal */}
            {showNewBookModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">新建单词本</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    单词本名称 *
                                </label>
                                <input
                                    type="text"
                                    value={newBookName}
                                    onChange={(e) => setNewBookName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 outline-none transition-all"
                                    placeholder="例如：考研词汇"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    描述（可选）
                                </label>
                                <textarea
                                    value={newBookDesc}
                                    onChange={(e) => setNewBookDesc(e.target.value)}
                                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 outline-none transition-all resize-none"
                                    rows={3}
                                    placeholder="添加一些描述..."
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowNewBookModal(false);
                                    setNewBookName('');
                                    setNewBookDesc('');
                                }}
                                className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-medium transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={createWordBook}
                                className="flex-1 px-6 py-3 bg-lime-500 hover:bg-lime-600 text-white rounded-2xl font-medium transition-colors"
                            >
                                创建
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
