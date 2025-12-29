import { GRADE_GROUPS, type GradeGroupKey } from '../data/kanjiData';
import type { Question } from '../hooks/useGameState';

interface ResultScreenProps {
  gradeGroup: GradeGroupKey;
  totalCorrect: number;
  totalQuestions: number;
  answers: { question: Question; userAnswer: string; isCorrect: boolean }[];
  isCompleted: boolean;
  onGoToMenu: () => void;
  onPlayAgain: () => void;
}

export function ResultScreen({
  gradeGroup,
  totalCorrect,
  totalQuestions,
  answers,
  isCompleted,
  onGoToMenu,
  onPlayAgain,
}: ResultScreenProps) {
  const percentage = Math.round((totalCorrect / totalQuestions) * 100);
  const grade = GRADE_GROUPS[gradeGroup];

  const getGrade = () => {
    if (percentage === 100) return { emoji: '🏆', text: '完璧！', class: 'perfect' };
    if (percentage >= 90) return { emoji: '🥇', text: 'すばらしい！', class: 'excellent' };
    if (percentage >= 80) return { emoji: '🥈', text: 'よくできました！', class: 'great' };
    if (percentage >= 70) return { emoji: '🥉', text: 'がんばりました！', class: 'good' };
    if (percentage >= 60) return { emoji: '👍', text: 'もう少し！', class: 'ok' };
    return { emoji: '💪', text: 'もっと練習しよう！', class: 'needs-work' };
  };

  const result = getGrade();

  return (
    <div className="result-screen">
      <h2 className="result-title">結果発表</h2>

      <div className={`result-grade ${result.class}`}>
        <span className="result-emoji">{result.emoji}</span>
        <span className="result-text">{result.text}</span>
      </div>

      <div className="result-stats">
        <div className="stat-item">
          <span className="stat-label">{grade.label}</span>
        </div>
        <div className="stat-item large">
          <span className="stat-value">{totalCorrect}</span>
          <span className="stat-separator">/</span>
          <span className="stat-total">{totalQuestions}</span>
        </div>
        <div className="stat-item">
          <span className="stat-percentage">{percentage}%</span>
        </div>
      </div>

      {isCompleted && (
        <div className="completed-badge">
          🏆 コンプリート達成！<br />
          <small>スターを集めてさらに上を目指そう！</small>
        </div>
      )}

      {/* 回答一覧 */}
      <div className="answer-list">
        <h3>回答一覧</h3>
        <div className="answer-grid">
          {answers.map((answer, index) => (
            <div
              key={index}
              className={`answer-item ${answer.isCorrect ? 'correct' : 'incorrect'}`}
            >
              <span className="answer-kanji">{answer.question.kanji}</span>
              <span className="answer-status">
                {answer.isCorrect ? '⭕' : '❌'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="result-buttons">
        <button className="primary-button" onClick={onPlayAgain}>
          もう一度
        </button>
        <button className="secondary-button" onClick={onGoToMenu}>
          メニューに戻る
        </button>
      </div>
    </div>
  );
}
