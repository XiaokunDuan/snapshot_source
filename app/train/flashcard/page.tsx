'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { normalizeLanguageCode, type LanguageCode } from '@/lib/language-content';
import { type HistoryApiItem, normalizeHistoryItem } from '@/lib/history-records';

interface WordCard {
    id: string;
    language: LanguageCode;
    word: string;
    phonetic: string;
    meaning: string;
    sentence: string;
    sentence_cn: string;
}

const PRIMARY_LANGUAGE_KEY = 'snapshot_primary_language';
const HISTORY_CACHE_KEY = 'vocabulary_history';

export default function FlashcardTraining() {
    const router = useRouter();
    const [cards, setCards] = useState<WordCard[]>([]);
    const [currentCard, setCurrentCard] = useState<WordCard | null>(null);
    const [cardIndex, setCardIndex] = useState(0);
    const [knownCount, setKnownCount] = useState(0);
    const [unknownCount, setUnknownCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const totalCards = cards.length;

    useEffect(() => {
        if (cards.length === 0) {
            setCurrentCard(null);
            return;
        }

        setCurrentCard(cards[cardIndex] ?? null);
    }, [cardIndex, cards]);

    useEffect(() => {
        const loadCards = async () => {
            try {
                setIsLoading(true);
                setErrorMessage(null);

                const storedLanguage = typeof window !== 'undefined'
                    ? normalizeLanguageCode(window.localStorage.getItem(PRIMARY_LANGUAGE_KEY) ?? window.navigator.language)
                    : 'en';

                const response = await fetch('/api/history');
                const rawText = await response.text();
                const payload = rawText ? JSON.parse(rawText) : [];

                if (!response.ok) {
                    throw new Error(
                        (payload as { error?: string; details?: string }).details
                        || (payload as { error?: string }).error
                        || 'Failed to load flashcards'
                    );
                }

                const historyItems = Array.isArray(payload) ? payload as HistoryApiItem[] : [];
                const normalizedHistory = historyItems.map(normalizeHistoryItem);
                const cachedHistory = typeof window !== 'undefined'
                    ? JSON.parse(window.localStorage.getItem(HISTORY_CACHE_KEY) || '[]')
                    : [];
                const fallbackHistory = Array.isArray(cachedHistory) ? cachedHistory : [];
                const sourceHistory = normalizedHistory.length > 0 ? normalizedHistory : fallbackHistory;

                const nextCards = sourceHistory
                    .map((item) => {
                        const variant = item.variants?.[storedLanguage];
                        const word = variant?.term || '';
                        const meaning = variant?.meaning || '';

                        if (!word || !meaning) {
                            return null;
                        }

                        return {
                            id: String(item.id ?? `${storedLanguage}-${word}`),
                            language: storedLanguage,
                            word,
                            phonetic: variant.phonetic || '',
                            meaning,
                            sentence: variant.example || '',
                            sentence_cn: variant.exampleTranslation || '',
                        } satisfies WordCard;
                    })
                    .filter((item): item is WordCard => Boolean(item));

                setCards(nextCards);
                setCardIndex(0);
                setKnownCount(0);
                setUnknownCount(0);
            } catch (error) {
                console.error('Load flashcards error:', error);
                setErrorMessage(error instanceof Error ? error.message : 'Failed to load flashcards');
                setCards([]);
            } finally {
                setIsLoading(false);
            }
        };

        void loadCards();
    }, []);

    const handleKnown = () => {
        const nextKnownCount = knownCount + 1;
        setKnownCount(nextKnownCount);
        nextCard(nextKnownCount, unknownCount);
    };

    const handleUnknown = () => {
        const nextUnknownCount = unknownCount + 1;
        setUnknownCount(nextUnknownCount);
        nextCard(knownCount, nextUnknownCount);
    };

    const nextCard = (finalKnownCount: number, finalUnknownCount: number) => {
        if (cardIndex < cards.length - 1) {
            setCardIndex(prev => prev + 1);
        } else {
            alert(`训练完成！\n记得: ${finalKnownCount}\n不记得: ${finalUnknownCount}`);
            router.push('/');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Loading flashcards...</span>
                </div>
            </div>
        );
    }

    if (errorMessage) {
        return (
            <div className="min-h-screen bg-gray-50 px-4 py-12">
                <div className="max-w-xl mx-auto rounded-3xl bg-white p-8 shadow-sm text-center">
                    <h1 className="text-3xl font-semibold text-gray-900">Unable to load flashcards</h1>
                    <p className="mt-4 text-sm leading-7 text-gray-600">{errorMessage}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="mt-8 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white"
                    >
                        Back to home
                    </button>
                </div>
            </div>
        );
    }

    if (cards.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 px-4 py-12">
                <div className="max-w-xl mx-auto rounded-3xl bg-white p-8 shadow-sm text-center">
                    <h1 className="text-3xl font-semibold text-gray-900">No flashcards yet</h1>
                    <p className="mt-4 text-sm leading-7 text-gray-600">
                        Your flashcards come from the selected language library. Add a few analyzed cards to that library first, then come back to train.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="mt-8 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white"
                    >
                        Go to library
                    </button>
                </div>
            </div>
        );
    }

    if (!currentCard) {
        return <div>Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                    <button
                        onClick={() => router.push('/')}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6 text-gray-700" />
                    </button>
                    <div className="text-center">
                        <div className="text-sm text-gray-600">
                            待过 {cardIndex + 1} / {totalCards}
                        </div>
                    </div>
                    <div className="w-10" /> {/* Spacer for alignment */}
                </div>
            </div>

            {/* Main Card */}
            <div className="max-w-2xl mx-auto px-4 py-12">
                <div className="bg-white rounded-3xl shadow-lg p-12 text-center space-y-8">
                    {/* Word */}
                    <div>
                        <h1 className="text-6xl font-bold text-gray-900 mb-4">
                            {currentCard.word}
                        </h1>
                        <div className="flex items-center justify-center gap-2">
                            <p className="text-2xl text-gray-600 font-mono">
                                {currentCard.phonetic}
                            </p>
                            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <Volume2 className="w-5 h-5 text-lime-600" />
                            </button>
                        </div>
                    </div>

                    {/* Meaning - Hidden initially, can be revealed */}
                    <div className="border-t border-gray-200 pt-6">
                        <p className="text-xl text-gray-700 font-medium mb-4">
                            {currentCard.meaning}
                        </p>
                        <div className="text-left bg-gray-50 rounded-2xl p-4">
                            <p className="text-gray-900 italic mb-2">
                                &quot;{currentCard.sentence}&quot;
                            </p>
                            <p className="text-gray-600 text-sm">
                                {currentCard.sentence_cn}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Action Buttons - Baicizhan Style */}
                <div className="grid grid-cols-2 gap-4 mt-8">
                    <button
                        onClick={handleUnknown}
                        className="py-6 px-8 bg-white hover:bg-gray-50 text-gray-700 font-bold text-xl rounded-3xl shadow-md hover:shadow-lg transition-all"
                    >
                        不记得
                    </button>
                    <button
                        onClick={handleKnown}
                        className="py-6 px-8 bg-lime-500 hover:bg-lime-600 text-white font-bold text-xl rounded-3xl shadow-md hover:shadow-lg transition-all"
                    >
                        记得
                    </button>
                </div>

                {/* Progress Stats */}
                <div className="mt-6 flex justify-center gap-8 text-sm text-gray-600">
                    <span>记得: {knownCount}</span>
                    <span>不记得: {unknownCount}</span>
                </div>
            </div>
        </div>
    );
}
