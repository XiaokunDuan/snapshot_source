'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface WordCard {
    word: string;
    phonetic: string;
    meaning: string;
    sentence: string;
    sentence_cn: string;
}

export default function FlashcardTraining() {
    const router = useRouter();
    const [currentCard, setCurrentCard] = useState<WordCard | null>(null);
    const [cardIndex, setCardIndex] = useState(0);
    const [totalCards] = useState(10);
    const [knownCount, setKnownCount] = useState(0);
    const [unknownCount, setUnknownCount] = useState(0);

    // Sample words - in production, fetch from API
    const sampleWords: WordCard[] = [
        { word: 'swear', phonetic: '/swer/', meaning: '发誓；咒骂', sentence: 'I swear I will never lie to you.', sentence_cn: '我发誓我永远不会对你撒谎。' },
        { word: 'achieve', phonetic: '/əˈtʃiːv/', meaning: '实现；达到', sentence: 'She achieved her goal of becoming a doctor.', sentence_cn: '她实现了成为医生的目标。' },
        { word: 'inspire', phonetic: '/ɪnˈspaɪər/', meaning: '鼓舞；激发', sentence: 'Her story inspired me to work harder.', sentence_cn: '她的故事激励我更加努力工作。' },
    ];

    useEffect(() => {
        setCurrentCard(sampleWords[cardIndex]);
    }, [cardIndex]);

    const handleKnown = () => {
    setKnown Count(prev => prev + 1);
        nextCard();
    };

    const handleUnknown = () => {
        setUnknownCount(prev => prev + 1);
        nextCard();
    };

    const nextCard = () => {
        if (cardIndex < sampleWords.length - 1) {
            setCardIndex(prev => prev + 1);
        } else {
            // Training completed
            alert(`训练完成！\n记得: ${knownCount + 1}\n不记得: ${unknownCount + (cardIndex + 1 - knownCount - 1)}`);
            router.push('/');
        }
    };

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
                                "{currentCard.sentence}"
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
