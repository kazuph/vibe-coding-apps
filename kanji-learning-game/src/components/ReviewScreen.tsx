import type { Question } from '../hooks/useGameState';

interface ReviewScreenProps {
  wrongAnswers: { question: Question; userAnswer: string }[];
  onStartReview: () => void;
  onSkipReview: () => void;
}

export function ReviewScreen({ wrongAnswers, onStartReview, onSkipReview }: ReviewScreenProps) {
  return (
    <div className="review-screen">
      <h2 className="review-title">復習タイム！</h2>

      <p className="review-description">
        {wrongAnswers.length}問 間違えました。<br />
        もう一度チャレンジしましょう！
      </p>

      <div className="wrong-list">
        {wrongAnswers.map((item, index) => (
          <div key={index} className="wrong-item">
            <span className="wrong-kanji">{item.question.kanji}</span>
            <div className="wrong-details">
              <div className="your-answer">
                あなたの答え: <span className="incorrect">{item.userAnswer}</span>
              </div>
              <div className="correct-answer">
                正解: <span className="correct">{item.question.correctAnswer}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="review-buttons">
        <button className="primary-button" onClick={onStartReview}>
          復習する
        </button>
        <button className="secondary-button" onClick={onSkipReview}>
          結果を見る
        </button>
      </div>
    </div>
  );
}
