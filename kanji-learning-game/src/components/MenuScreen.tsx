import { useEffect, useState } from 'react';
import { GRADE_GROUPS, type GradeGroupKey } from '../data/kanjiData';
import { initSound } from '../hooks/useSound';

interface MenuScreenProps {
  onStartGame: (gradeGroup: GradeGroupKey) => void;
  getProgress: (gradeGroup: GradeGroupKey) => {
    total: number;
    completed: number;
    stars: number;
    percentage: number;
  };
  isLoading: boolean;
}

interface GradeProgress {
  total: number;
  completed: number;
  stars: number;
  percentage: number;
}

export function MenuScreen({ onStartGame, getProgress, isLoading }: MenuScreenProps) {
  const [progressData, setProgressData] = useState<Record<GradeGroupKey, GradeProgress | null>>({
    'grade1-3': null,
    'grade4': null,
    'grade5': null,
    'grade6': null,
  });

  useEffect(() => {
    const keys = Object.keys(GRADE_GROUPS) as GradeGroupKey[];
    const newData: Record<GradeGroupKey, GradeProgress | null> = {
      'grade1-3': null,
      'grade4': null,
      'grade5': null,
      'grade6': null,
    };
    for (const key of keys) {
      try {
        newData[key] = getProgress(key);
      } catch (e) {
        console.error(e);
      }
    }
    setProgressData(newData);
  }, [getProgress]);

  const gradeKeys = Object.keys(GRADE_GROUPS) as GradeGroupKey[];

  return (
    <div className="menu-screen">
      <h1 className="title">漢字学習ゲーム</h1>
      <p className="subtitle">小学校で習う漢字をマスターしよう！</p>

      <div className="grade-list">
        {gradeKeys.map((key) => {
          const group = GRADE_GROUPS[key];
          const progress = progressData[key];
          const isComplete = progress && progress.completed === progress.total && progress.total > 0;

          return (
            <button
              key={key}
              className={`grade-button ${isComplete ? 'completed' : ''}`}
              onClick={() => {
                initSound();
                onStartGame(key);
              }}
              disabled={isLoading}
            >
              <div className="grade-header">
                <span className="grade-label">{group.label}</span>
                {isComplete && <span className="complete-badge">🏆</span>}
              </div>

              {progress ? (
                <div className="progress-info">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <div className="progress-text">
                    <span>{progress.completed} / {progress.total}</span>
                    <span className="stars">⭐ {progress.stars}</span>
                  </div>
                </div>
              ) : (
                <div className="progress-info">
                  <span className="loading">読み込み中...</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="info-box">
        <h3>📖 遊び方</h3>
        <ul>
          <li>1回20問のランダム出題</li>
          <li>3回正解でその漢字はクリア</li>
          <li>間違えた問題は最後に復習</li>
          <li>全部クリアで🏆コンプリート！</li>
          <li>コンプリート後は⭐を集めよう（最大10個）</li>
        </ul>
      </div>
    </div>
  );
}
