import { useGameState } from './hooks/useGameState';
import { MenuScreen } from './components/MenuScreen';
import { QuizScreen } from './components/QuizScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { ResultScreen } from './components/ResultScreen';
import './App.css';

function App() {
  const {
    state,
    isLoading,
    isDbReady,
    progressMap,
    startGame,
    submitAnswer,
    startReview,
    goToMenu,
    getProgress,
  } = useGameState();

  if (isLoading && state.phase === 'menu') {
    return (
      <div className="app loading">
        <div className="loading-spinner"></div>
        <p>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {state.phase === 'menu' && (
        <MenuScreen
          onStartGame={startGame}
          getProgress={getProgress}
          isLoading={isLoading}
          isDbReady={isDbReady}
        />
      )}

      {state.phase === 'playing' && state.questions.length > 0 && (
        <QuizScreen
          question={state.questions[state.currentIndex]}
          currentIndex={state.currentIndex}
          totalQuestions={state.questions.length}
          isReviewMode={state.isReviewMode}
          totalCorrect={state.totalCorrect}
          onAnswer={submitAnswer}
          progressMap={progressMap}
        />
      )}

      {state.phase === 'review' && (
        <ReviewScreen
          wrongAnswers={state.wrongAnswers}
          onStartReview={startReview}
          onSkipReview={goToMenu}
        />
      )}

      {state.phase === 'result' && state.gradeGroup && (
        <ResultScreen
          gradeGroup={state.gradeGroup}
          totalCorrect={state.totalCorrect}
          totalQuestions={state.questions.length}
          answers={state.answers}
          isCompleted={state.isCompleted}
          onGoToMenu={goToMenu}
          onPlayAgain={() => startGame(state.gradeGroup!)}
        />
      )}
    </div>
  );
}

export default App;
