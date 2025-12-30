import { useState, useCallback, useEffect } from 'react';
import { getKanjiByGrade, GRADE_GROUPS, type GradeGroupKey } from '../data/kanjiData';
import { kanjiReadings, getKanjiReading } from '../data/kanjiReadings';
import {
  initStorage,
  updateKanjiProgress,
  getAllKanjiWithProgress,
  getGradeGroupProgress,
  type KanjiProgress,
} from '../db/storage';

export type QuestionType = 'reading' | 'writing';

export interface Question {
  kanji: string;
  type: QuestionType;
  question: string;
  correctAnswer: string;
  choices: string[];
}

export interface GameState {
  phase: 'menu' | 'playing' | 'review' | 'result';
  gradeGroup: GradeGroupKey | null;
  questions: Question[];
  currentIndex: number;
  answers: { question: Question; userAnswer: string; isCorrect: boolean }[];
  wrongAnswers: { question: Question; userAnswer: string }[];
  isReviewMode: boolean;
  totalCorrect: number;
  isCompleted: boolean;
  totalStars: number;
}

const QUESTIONS_PER_SESSION = 20;

// 全ての漢字から読みの選択肢を収集
function collectAllReadings(): { onyomi: string[]; kunyomi: string[] } {
  const onyomi = new Set<string>();
  const kunyomi = new Set<string>();

  Object.values(kanjiReadings).forEach(reading => {
    reading.onyomi.forEach(r => onyomi.add(r));
    reading.kunyomi.forEach(r => kunyomi.add(r));
  });

  return {
    onyomi: Array.from(onyomi),
    kunyomi: Array.from(kunyomi),
  };
}

// 問題を生成
function generateQuestion(kanji: string, allReadings: { onyomi: string[]; kunyomi: string[] }): Question | null {
  const reading = getKanjiReading(kanji);

  // 読みがない場合はスキップ
  if (reading.onyomi.length === 0 && reading.kunyomi.length === 0) {
    return null;
  }

  // ランダムに読み問題か書き問題かを選択（今回は読み問題のみ）
  const type: QuestionType = 'reading';

  // 音読みか訓読みかをランダムに選択
  const useOnyomi = reading.onyomi.length > 0 && (reading.kunyomi.length === 0 || Math.random() < 0.5);
  const correctReading = useOnyomi
    ? reading.onyomi[Math.floor(Math.random() * reading.onyomi.length)]
    : reading.kunyomi[Math.floor(Math.random() * reading.kunyomi.length)];

  // 選択肢を生成（同じ種類の読みから）
  const sourceReadings = useOnyomi ? allReadings.onyomi : allReadings.kunyomi;
  const choices = generateChoices(correctReading, sourceReadings, 4);

  return {
    kanji,
    type,
    question: useOnyomi ? `「${kanji}」の音読みは？` : `「${kanji}」の訓読みは？`,
    correctAnswer: correctReading,
    choices,
  };
}

// 選択肢を生成
function generateChoices(correct: string, pool: string[], count: number): string[] {
  const choices = [correct];
  const available = pool.filter(r => r !== correct);

  while (choices.length < count && available.length > 0) {
    const idx = Math.floor(Math.random() * available.length);
    choices.push(available.splice(idx, 1)[0]);
  }

  // シャッフル
  return choices.sort(() => Math.random() - 0.5);
}

// シャッフル
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function useGameState() {
  const [state, setState] = useState<GameState>({
    phase: 'menu',
    gradeGroup: null,
    questions: [],
    currentIndex: 0,
    answers: [],
    wrongAnswers: [],
    isReviewMode: false,
    totalCorrect: 0,
    isCompleted: false,
    totalStars: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isDbReady, setIsDbReady] = useState(false);
  const [progressMap, setProgressMap] = useState<Map<string, KanjiProgress>>(new Map());

  // 初期化
  useEffect(() => {
    const init = async () => {
      try {
        await initStorage();
        setIsDbReady(true);
      } catch (error) {
        console.error('Failed to initialize storage:', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // ゲーム開始
  const startGame = useCallback(async (gradeGroup: GradeGroupKey) => {
    if (!isDbReady) return;

    setIsLoading(true);

    try {
      // 学年の漢字を取得
      const grades = GRADE_GROUPS[gradeGroup].grades;
      const allKanji = getKanjiByGrade(grades);

      // 進捗を取得（非同期）
      const progress = await getAllKanjiWithProgress(gradeGroup);
      setProgressMap(progress);

      // 未完了の漢字をフィルタリング（3回正解していない漢字）
      const incompleteKanji = allKanji.filter(kanji => {
        const p = progress.get(kanji);
        return !p || !p.completed;
      });

      // 完了済みの漢字
      const completedKanji = allKanji.filter(kanji => {
        const p = progress.get(kanji);
        return p && p.completed;
      });

      let selectedKanji: string[];
      let isCompleted = false;

      if (incompleteKanji.length === 0) {
        // 全て完了済み → ランダム出題モード
        isCompleted = true;
        selectedKanji = shuffle(allKanji).slice(0, QUESTIONS_PER_SESSION);
      } else if (incompleteKanji.length < QUESTIONS_PER_SESSION) {
        // 未完了が20問未満 → 未完了を全て + 完了済みから補充
        selectedKanji = [
          ...incompleteKanji,
          ...shuffle(completedKanji).slice(0, QUESTIONS_PER_SESSION - incompleteKanji.length)
        ];
      } else {
        // 未完了から20問をランダム選択
        selectedKanji = shuffle(incompleteKanji).slice(0, QUESTIONS_PER_SESSION);
      }

      // 問題を生成
      const allReadings = collectAllReadings();
      const questions: Question[] = [];

      for (const kanji of selectedKanji) {
        const q = generateQuestion(kanji, allReadings);
        if (q) questions.push(q);
      }

      // 問題をシャッフル
      const shuffledQuestions = shuffle(questions);

      setState({
        phase: 'playing',
        gradeGroup,
        questions: shuffledQuestions,
        currentIndex: 0,
        answers: [],
        wrongAnswers: [],
        isReviewMode: false,
        totalCorrect: 0,
        isCompleted,
        totalStars: 0,
      });
    } catch (error) {
      console.error('Failed to start game:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isDbReady]);

  // 回答
  const submitAnswer = useCallback(async (answer: string) => {
    const currentQuestion = state.questions[state.currentIndex];
    const isCorrect = answer === currentQuestion.correctAnswer;

    // 進捗を更新（非同期、await不要 - Fire and forget）
    if (state.gradeGroup) {
      updateKanjiProgress(currentQuestion.kanji, state.gradeGroup, isCorrect).catch(err => {
        console.error('Failed to update progress:', err);
      });
    }

    const newAnswers = [...state.answers, { question: currentQuestion, userAnswer: answer, isCorrect }];
    const newWrongAnswers = isCorrect
      ? state.wrongAnswers
      : [...state.wrongAnswers, { question: currentQuestion, userAnswer: answer }];

    // 次の問題へ
    if (state.currentIndex + 1 < state.questions.length) {
      setState(prev => ({
        ...prev,
        currentIndex: prev.currentIndex + 1,
        answers: newAnswers,
        wrongAnswers: newWrongAnswers,
        totalCorrect: prev.totalCorrect + (isCorrect ? 1 : 0),
      }));
    } else {
      // 問題終了
      if (newWrongAnswers.length > 0 && !state.isReviewMode) {
        // 復習モードへ
        setState(prev => ({
          ...prev,
          phase: 'review',
          answers: newAnswers,
          wrongAnswers: newWrongAnswers,
          totalCorrect: prev.totalCorrect + (isCorrect ? 1 : 0),
        }));
      } else {
        // 結果画面へ
        setState(prev => ({
          ...prev,
          phase: 'result',
          answers: newAnswers,
          wrongAnswers: newWrongAnswers,
          totalCorrect: prev.totalCorrect + (isCorrect ? 1 : 0),
        }));
      }
    }
  }, [state]);

  // 復習開始
  const startReview = useCallback(() => {
    const reviewQuestions = state.wrongAnswers.map(w => w.question);

    setState(prev => ({
      ...prev,
      phase: 'playing',
      questions: shuffle(reviewQuestions),
      currentIndex: 0,
      isReviewMode: true,
      wrongAnswers: [],
      answers: [],
      totalCorrect: 0,
    }));
  }, [state.wrongAnswers]);

  // メニューに戻る
  const goToMenu = useCallback(() => {
    setState({
      phase: 'menu',
      gradeGroup: null,
      questions: [],
      currentIndex: 0,
      answers: [],
      wrongAnswers: [],
      isReviewMode: false,
      totalCorrect: 0,
      isCompleted: false,
      totalStars: 0,
    });
  }, []);

  // 進捗取得（非同期）
  const getProgress = useCallback(async (gradeGroup: GradeGroupKey) => {
    const grades = GRADE_GROUPS[gradeGroup].grades;
    const allKanji = getKanjiByGrade(grades);
    const progress = await getGradeGroupProgress(gradeGroup);

    return {
      total: allKanji.length,
      completed: progress.completedKanji,
      stars: progress.totalStars,
      percentage: Math.round((progress.completedKanji / allKanji.length) * 100),
    };
  }, []);

  return {
    state,
    isLoading,
    isDbReady,
    progressMap,
    startGame,
    submitAnswer,
    startReview,
    goToMenu,
    getProgress,
  };
}
