import React, {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
} from 'react';
import * as THREE from 'three';
import {
  BORDER_LINE_COLOR,
  BORDER_LINE_COLOR_CORRECT,
  BORDER_LINE_COLOR_PARTIAL,
  BORDER_LINE_COLOR_WRONG,
  QUESTION_TYPES,
} from './constants';
import './QuizMenu.css';

const QuizMenu = forwardRef(({ countryMeta, stateRef }, ref) => {
  // Quiz Configuration
  const [quizType, setQuizType] = useState('flag');
  const [quizLength, setQuizLength] = useState(10);
  const [ignoreIslands, setIgnoreIslands] = useState(false);

  // Quiz State
  const [isOpen, setIsOpen] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizQuestion, setQuizQuestion] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Scoring & Progress
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [correctFirstTry, setCorrectFirstTry] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [questionHistory, setQuestionHistory] = useState([]);

  // Timer & Feedback
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState(''); // 'correct', 'incorrect', 'timeout'
  const [showFeedback, setShowFeedback] = useState(false);

  // Refs
  const timerRef = useRef(null);
  const quizRef = useRef(null);
  const questionStartTimeRef = useRef(null);

  // Calculate metrics
  const accuracy =
    totalAttempts === 0
      ? 0
      : Math.round((correctFirstTry / totalAttempts) * 100);
  // const averageTime =
  //   questionHistory.length === 0
  //     ? 0
  //     : Math.round(
  //         questionHistory.reduce((sum, q) => sum + q.timeSpent, 0) /
  //           questionHistory.length
  //       );

  // Generate question based on type
  function generateProblemSet() {
    let countryNames = Object.keys(countryMeta);

    // Remove islands if wanted
    if (ignoreIslands) {
      countryNames = countryNames.filter((name) => !countryMeta[name].island);
    }

    // shuffle the array
    const shuffled = [...countryNames].sort(() => Math.random() - 0.5);

    // determine length
    const length =
      quizLength === 'all'
        ? shuffled.length
        : Math.min(quizLength, shuffled.length);

    // const country = shuffled[length - 1]; // Get the last country in the selected slice
    // const index = length - 1;
    return shuffled.slice(0, length).map((country, index) => {
      const type =
        quizType === 'mixed'
          ? ['flag', 'capital', 'name'][Math.floor(Math.random() * 3)]
          : quizType;

      return {
        id: Date.now() + index,
        country,
        type,
        flag: countryMeta[country].flag,
        capital: countryMeta[country].capital,
        firstTry: true,
        timeSpent: 0,
        attempts: 0,
        startTime: Date.now(),
      };
    });
  }

  // Start new question
  function startNewQuestion() {
    if (!quizRef.problemSet) return;

    if (quizRef.problemIndex >= quizRef.problemSet.length) {
      endQuiz();
      return;
    }

    const nextQ = quizRef.problemSet[quizRef.problemIndex];
    setQuizQuestion(nextQ);
    quizRef.current = nextQ;
    questionStartTimeRef.current = Date.now();

    // TODO: This is all funky. We should just increment the visual number by 1. (So it shows "Question 1/5" instead of "0/5")
    // We are having issues because this is incremented differently in different places.
    quizRef.problemIndex++;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);
  }

  // Handle timeout
  function handleTimeout() {
    if (!quizRef.current) return;

    clearInterval(timerRef.current);
    const question = quizRef.current;
    question.timeSpent = Math.floor(
      (Date.now() - questionStartTimeRef.current) / 1000
    );
    question.attempts = 0;

    setFeedbackType('timeout');
    setFeedback(`⏰ Time's up! The answer was ${question.country}`);
    setShowFeedback(true);

    // Flash the correct country red
    highlightCountry(question.country, BORDER_LINE_COLOR_WRONG);
    findLocation();

    // Add to history
    setQuestionHistory((prev) => [...prev, { ...question, result: 'timeout' }]);

    // Reset streak
    setStreak(0);

    // setTimeout(() => {
    // setShowFeedback(false);
    quizRef.questionNumber++;
    startNewQuestion();
    // }, 2000);
    setTimeout(() => {
      setShowFeedback(false);
    }, 5000);
  }

  // Handle globe click
  function handleGlobeClick(clickedCountry) {
    if (!quizRef.current) {
      highlightCountry(clickedCountry, BORDER_LINE_COLOR_CORRECT);
      return;
    }

    const question = quizRef.current;
    const correctCountry = question.country;
    question.attempts++;

    if (clickedCountry === correctCountry) {
      // Correct answer
      clearInterval(timerRef.current);
      question.timeSpent = Math.floor(
        (Date.now() - questionStartTimeRef.current) / 1000
      );

      const points = calculatePoints(question);
      setScore((prev) => prev + points);
      setCorrectFirstTry((prev) => prev + (question.firstTry ? 1 : 0));
      setStreak((prev) => {
        const newStreak = prev + 1;
        setMaxStreak((prevMax) => Math.max(prevMax, newStreak));
        return newStreak;
      });

      // TODO: If 0 points, show why (e.g. used hint)
      setFeedbackType('correct');
      setFeedback(
        `✅ ${clickedCountry} is correct! +${points} points${
          question.firstTry ? ' (First try!)' : ''
        }`
      );
      setShowFeedback(true);

      highlightCountry(correctCountry, BORDER_LINE_COLOR_CORRECT);

      // Add to history
      setQuestionHistory((prev) => [
        ...prev,
        { ...question, result: 'correct', points },
      ]);

      quizRef.questionNumber++;
      startNewQuestion();
      setTimeout(() => {
        setShowFeedback(false);
      }, 2000);
    } else {
      // Wrong answer
      question.firstTry = false;
      setStreak(0);

      setFeedbackType('incorrect');
      setFeedback(`❌ ${clickedCountry} is wrong! Try again...`);
      setShowFeedback(true);

      highlightCountry(clickedCountry, BORDER_LINE_COLOR_WRONG);

      // setTimeout(() => {
      //   setShowFeedback(false);
      // }, 1000);
    }

    setTotalAttempts((prev) => prev + 1); // TODO: Is this even used anymore? question.attemps
  }

  // Calculate points based on performance
  function calculatePoints(question) {
    // If used a hint, no points
    if (question.usedHint) return 0;

    let points = 10; // Base points

    // Bonus for first try
    if (question.firstTry) points += 5;

    // Bonus for speed (if under 10 seconds)
    if (question.timeSpent < 10) points += 3;

    // Streak bonus
    if (streak > 0) points += Math.min(streak, 5);

    return points;
  }

  function findLocation() {
    console.log('Showing location');
    if (!quizRef.current) return;

    // Find the country in the features data to get its coordinates
    const features = stateRef.current.features;
    if (!features) return;

    let countryName = quizRef.current.country;

    // Identical flags
    if (countryName === 'United States Minor Outlying Islands') {
      countryName = 'United States of America';
    }

    const countryFeature = features.find(
      (item) => item.feature.name === countryName
    );
    if (!countryFeature || !countryFeature.feature.geometry) return;

    quizRef.current.usedHint = true;

    const geom = countryFeature.feature.geometry;

    // Calculate center of country for camera positioning
    let centerLon = 0,
      centerLat = 0,
      pointCount = 0;

    if (geom.type === 'Polygon') {
      const coords = geom.coordinates[0]; // Use outer ring
      coords.forEach(([lon, lat]) => {
        centerLon += lon;
        centerLat += lat;
        pointCount++;
      });
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((poly) => {
        poly[0].forEach(([lon, lat]) => {
          centerLon += lon;
          centerLat += lat;
          pointCount++;
        });
      });
    }

    if (pointCount > 0) {
      centerLon /= pointCount;
      centerLat /= pointCount;

      // Call parent function to move camera
      if (stateRef.current.moveCameraToCountry) {
        stateRef.current.moveCameraToCountry(centerLat, centerLon);
      }

      // TODO Flash the correct country red
      // highlightCountry(countryName, BORDER_LINE_COLOR_WRONG);
    }
  }

  // Utility functions
  function clearAllCountryColors() {
    const hg = stateRef.current.highlightGroup;
    if (!hg) return;

    // dispose meshes/materials to avoid leaks
    for (let i = hg.children.length - 1; i >= 0; i--) {
      const child = hg.children[i];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      hg.remove(child);
    }
    // optional: track map if you add per-country caches
    stateRef.current.highlightMeshes = {};
  }

  function highlightCountry(name, color = BORDER_LINE_COLOR_CORRECT) {
    const entry = stateRef.current.countryLines?.[name];
    const geom = stateRef.current.bordersGeometry;
    const hg = stateRef.current.highlightGroup;
    if (!entry || !geom || !hg) return;

    const { start, count } = entry; // count = number of vertices in segments
    const pos = geom.getAttribute('position');

    // copy just this country’s segment vertices into a new geometry
    const arr = new Float32Array(count * 3);
    let j = 0;
    for (let i = start; i < start + count; i++) {
      arr[j++] = pos.getX(i);
      arr[j++] = pos.getY(i);
      arr[j++] = pos.getZ(i);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));

    // draw on top of the base borders
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: false,
      opacity: 1.0,
      depthTest: true, // ignore depth so it always shows
      depthWrite: false, // don’t affect depth buffer
    });

    const mesh = new THREE.LineSegments(g, mat);
    mesh.renderOrder = 1000; // above base + group
    hg.add(mesh);

    // (optional) keep track if you want to un-highlight a single country later
    if (!stateRef.current.highlightMeshes)
      stateRef.current.highlightMeshes = {};
    stateRef.current.highlightMeshes[name] = mesh;
  }
  function unhighlightCountry(name) {
    const hg = stateRef.current.highlightGroup;
    const mesh = stateRef.current.highlightMeshes?.[name];
    if (!hg || !mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    hg.remove(mesh);
    delete stateRef.current.highlightMeshes[name];
  }

  // Quiz control functions
  function startQuiz() {
    setQuizMode(true);
    setScore(0);
    setTotalAttempts(0);
    setCorrectFirstTry(0);
    setStreak(0);
    setTimeElapsed(0);
    setMaxStreak(0);
    quizRef.questionNumber = 1;
    setQuestionHistory([]);
    setShowSummary(false);
    clearAllCountryColors();

    const problems = generateProblemSet();
    quizRef.problemSet = problems; // store entire quiz
    quizRef.problemIndex = 0;

    startNewQuestion();
  }

  function nextQuestion() {
    setTotalAttempts((prev) => prev + 1); // TODO: Is question.attempts still used/needed??

    // clearAllCountryColors(); // TODO: Just unlight the incorrect ones
    setShowFeedback(false);
    quizRef.questionNumber++;
    startNewQuestion();
  }

  function endQuiz() {
    setQuizMode(false);
    setQuizQuestion(null);

    setFeedbackType('');
    setFeedback(``);
    setShowFeedback(false);

    clearAllCountryColors();
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setShowSummary(true);
    quizRef.current = null;
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    handleGlobeClick,
    quizMode,
  }));

  // Tutorial modal
  // TODO: Move to separate component
  if (showTutorial) {
    return (
      <div className="tutorial-overlay">
        <div className="tutorial-modal">
          <h2>How to Play</h2>

          <div className="tutorial-section">
            <h3>🎯 Objective</h3>
            <p>
              Click on the correct country on the globe based on the question
              shown.
            </p>
          </div>

          <div className="tutorial-section">
            <h3>📝 Question Types</h3>
            <ul>
              <li>
                <strong>Flag Recognition:</strong> Identify the country by its
                flag
              </li>
              <li>
                <strong>Capital Cities:</strong> Find the country by its capital
                city
              </li>
              <li>
                <strong>Country Names:</strong> Locate the country by its name
              </li>
              <li>
                <strong>Mixed Challenge:</strong> Random mix of all types
              </li>
            </ul>
          </div>

          <div className="tutorial-section">
            <h3>🏆 Scoring</h3>
            <ul>
              <li>
                <strong>Base Points:</strong> 10 points per correct answer
              </li>
              <li>
                <strong>First Try Bonus:</strong> +5 points for getting it right
                first time
              </li>
              <li>
                <strong>Speed Bonus:</strong> +3 points for answering under 10
                seconds
              </li>
              <li>
                <strong>Streak Bonus:</strong> +1 point per consecutive correct
                answer
              </li>
              <li>
                <strong>Find Location:</strong> Moves camera to the correct
                location. In doing so, you will not get any points for that
                question
              </li>
            </ul>
          </div>

          <div className="tutorial-section"></div>

          <button
            onClick={() => setShowTutorial(false)}
            className="tutorial-button"
          >
            Got it!
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="quiz-container "
        style={!isOpen ? { paddingBottom: '0px' } : {}}
      >
        {!quizMode ? (
          // Quiz Setup Screen
          <div>
            <div
              className="quiz-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h2>World Quiz</h2>
              <button
                onClick={() => setShowTutorial(true)}
                className="help-button"
                title="How to play"
              >
                ❓
              </button>
              <span
                onClick={() => setIsOpen(!isOpen)}
                style={{
                  cursor: 'pointer',
                }}
              >
                {isOpen ? '▲' : '▼'}
              </span>
            </div>

            {isOpen && (
              <>
                <div className="form-group">
                  <label>Question Type:</label>
                  <select
                    value={quizType}
                    onChange={(e) => setQuizType(e.target.value)}
                    className="form-select"
                  >
                    {QUESTION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Number of Questions:</label>
                  <select
                    value={quizLength}
                    onChange={(e) =>
                      setQuizLength(
                        e.target.value === 'all'
                          ? 'all'
                          : Number(e.target.value)
                      )
                    }
                    className="form-select"
                  >
                    <option value={5}>5 Questions</option>
                    <option value={10}>10 Questions</option>
                    <option value={20}>20 Questions</option>
                    <option value={50}>50 Questions</option>
                    <option value="all">All Countries</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={ignoreIslands}
                      onChange={(e) => setIgnoreIslands(e.target.checked)}
                    />
                    Ignore Small Islands
                  </label>
                </div>

                <button onClick={startQuiz} className="start-button">
                  🚀 Start Quiz
                </button>
              </>
            )}
          </div>
        ) : (
          // Quiz Game Screen
          <div>
            {/* Header */}
            <div className="quiz-game-header">
              <div>
                <div className="question-counter">
                  Question {quizRef.questionNumber} /{' '}
                  {quizRef.problemSet.length}
                </div>
                <div className="score-display">Score: {score} pts</div>
              </div>
              <div className="timer-section">
                <div className="timer timer-normal">
                  {Math.floor(timeElapsed / 60)}:
                  {(timeElapsed % 60).toString().padStart(2, '0')}
                </div>
                <div className="streak-display">Streak: {streak}</div>
              </div>
            </div>

            {/* Question Display */}
            <div className="question-display">
              {quizQuestion ? (
                <div>
                  {/* <div className="question-type">
                    {quizQuestion.type === 'flag'
                      ? '🏁 Flag Recognition'
                      : quizQuestion.type === 'capital'
                      ? '🏛️ Capital City'
                      : '🌍 Country Name'}
                  </div> */}

                  {quizQuestion.type === 'flag' ? (
                    <div className="question-content">
                      <img
                        src={quizQuestion.flag}
                        alt="flag"
                        className="flag-image"
                      />
                    </div>
                  ) : quizQuestion.type === 'capital' ? (
                    <div className="question-content">
                      <div className="question-text">
                        {quizQuestion.capital}
                      </div>
                    </div>
                  ) : (
                    <div className="question-content">
                      <div className="question-text">
                        {quizQuestion.country}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="loading-text">Loading question...</div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
              <button onClick={findLocation} className="find-location-button">
                📍 Find Location
              </button>

              <button onClick={nextQuestion} className="next-button">
                ➡️ Next Question
              </button>

              <button onClick={endQuiz} className="end-button">
                🏁 End
              </button>
            </div>

            {/* Feedback */}
            {showFeedback && (
              <div className={`feedback ${feedbackType}`}>{feedback}</div>
            )}

            {/* Stats */}
            <div className="stats-grid">
              <div>
                Accuracy: <strong>{accuracy}%</strong>
              </div>
              <div>
                Max Streak: <strong>{maxStreak}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quiz Summary Modal */}
      {showSummary && (
        <div className="summary-overlay">
          <div className="summary-modal">
            <div className="summary-emoji">
              {score >= 80
                ? '🏆'
                : score >= 60
                ? '🥈'
                : score >= 40
                ? '🥉'
                : '📊'}
            </div>

            <h2>Quiz Complete!</h2>

            <div className="summary-score">
              <div className="score-number">{score} points</div>
              <div className="score-details">
                {correctFirstTry} / {quizRef.problemSet.length} correct (
                {accuracy}% accuracy)
              </div>
            </div>

            <div className="summary-stats">
              <div className="stat-item">
                <div className="stat-label">Max Streak</div>
                <div className="stat-value">{maxStreak}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Time</div>
                <div className="stat-value">
                  {Math.floor(timeElapsed / 60)}:
                  {(timeElapsed % 60).toString().padStart(2, '0')}
                </div>
              </div>
            </div>

            <div className="summary-actions">
              <button
                onClick={() => {
                  setShowSummary(false);
                  startQuiz();
                }}
                className="try-again-button"
              >
                🔄 Try Again
              </button>
              <button
                onClick={() => setShowSummary(false)}
                className="close-button"
              >
                ✖️ Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default QuizMenu;
