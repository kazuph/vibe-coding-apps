import { useState, useEffect } from 'react';
import type { Question } from '../hooks/useGameState';
import { playCorrectSound, playIncorrectSound } from '../hooks/useSound';

interface QuizScreenProps {
  question: Question;
  currentIndex: number;
  totalQuestions: number;
  isReviewMode: boolean;
  totalCorrect: number;
  onAnswer: (answer: string) => void;
  progressMap: Map<string, { correctCount: number; starCount: number; completed: boolean; attemptCount?: number }>;
}

export function QuizScreen({
  question,
  currentIndex,
  totalQuestions,
  isReviewMode,
  totalCorrect,
  onAnswer,
  progressMap,
}: QuizScreenProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // 問題が変わったらリセット
  useEffect(() => {
    setSelectedAnswer(null);
    setShowResult(false);
    setIsCorrect(false);
  }, [question]);

  const handleSelect = (answer: string) => {
    if (showResult) return;

    setSelectedAnswer(answer);
    const correct = answer === question.correctAnswer;
    setIsCorrect(correct);
    setShowResult(true);

    // 効果音を鳴らす
    if (correct) {
      playCorrectSound();
    } else {
      playIncorrectSound();
    }

    // 正解時は速く次へ、不正解時はしっかり確認できる時間を確保
    setTimeout(() => {
      onAnswer(answer);
    }, correct ? 350 : 2000);
  };

  const progress = progressMap.get(question.kanji);
  const correctCount = progress?.correctCount || 0;
  const starCount = progress?.starCount || 0;
  const attemptCount = progress?.attemptCount || 0;

  return (
    <div className="quiz-screen">
      {/* ヘッダー */}
      <div className="quiz-header">
        <div className="quiz-progress">
          {isReviewMode && <span className="review-badge">復習</span>}
          <span className="question-count">
            {currentIndex + 1} / {totalQuestions}
          </span>
        </div>
        <div className="score">
          正解: {totalCorrect}
        </div>
      </div>

      {/* 進捗インジケーター */}
      <div className="progress-indicator">
        <div
          className="progress-bar-mini"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* 漢字表示 */}
      <div className="kanji-display">
        <div className="kanji-character">{question.kanji}</div>
        <div className="kanji-info">
          <span className="correct-streak">
            {Array(3).fill(0).map((_, i) => (
              <span key={i} className={i < correctCount ? 'filled' : 'empty'}>
                {i < correctCount ? '●' : '○'}
              </span>
            ))}
          </span>
          <span className="attempt-count">
            {attemptCount + 1}回目
          </span>
          {starCount > 0 && (
            <span className="star-count">
              {'⭐'.repeat(Math.min(starCount, 10))}
            </span>
          )}
        </div>
      </div>

      {/* 問題文 */}
      <div className="question-text">{question.question}</div>

      {/* 選択肢 */}
      <div className="choices">
        {question.choices.map((choice, index) => {
          let buttonClass = 'choice-button';
          if (showResult) {
            if (choice === question.correctAnswer) {
              buttonClass += ' correct';
            } else if (choice === selectedAnswer) {
              buttonClass += ' incorrect';
            }
          } else if (choice === selectedAnswer) {
            buttonClass += ' selected';
          }

          return (
            <button
              key={index}
              className={buttonClass}
              onClick={() => handleSelect(choice)}
              disabled={showResult}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {/* 結果表示 */}
      {showResult && (
        <div className={`result-overlay ${isCorrect ? 'correct' : 'incorrect'}`}>
          <div className="result-icon">
            {isCorrect ? '⭕' : '❌'}
          </div>
          {!isCorrect && (
            <div className="correct-answer">
              正解: {question.correctAnswer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
