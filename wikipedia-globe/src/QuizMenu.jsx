import React, {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
} from 'react';
import {
  BORDER_LINE_COLOR,
  BORDER_LINE_COLOR_CORRECT,
  BORDER_LINE_COLOR_PARTIAL,
  BORDER_LINE_COLOR_WRONG,
} from './constants';

const QuizMenu = forwardRef(({ countryMeta, stateRef }, ref) => {
  const [quizType, setQuizType] = useState('flag'); // user-selected quiz type
  const [quizQuestion, setQuizQuestion] = useState(null);
  const [feedback, setFeedback] = useState('');

  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0); // seconds
  const timerRef = useRef(null);

  const quizRef = useRef(null);
  const [quizMode, setQuizMode] = useState(false);
  const quizModeRef = useRef(false);
  useEffect(() => {
    quizModeRef.current = quizMode;
  }, [quizMode]); // TODO: Unnecessary

  const [correctCount, setCorrectCount] = useState(0); // first-try correct per question
  const [totalCount, setTotalCount] = useState(0); // total attempts
  const [showSummary, setShowSummary] = useState(false);
  const accuracy =
    totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);

  // ---------- Generate Quiz Question ----------
  function nextQuestion() {
    const countryNames = Object.keys(countryMeta);
    const country =
      countryNames[Math.floor(Math.random() * countryNames.length)];

    // const types = ['flag', 'capital', 'name'];
    // const type = types[Math.floor(Math.random() * types.length)];

    // if (feedback.includes('')) {
    setTotalCount((t) => t + 1);
    // }

    const type = quizType;

    const question = {
      country,
      type,
      flag: countryMeta[country].flag,
      capital: countryMeta[country].capital,
      firstTryFlag: true,
    };

    setQuizQuestion(question);
    quizRef.current = question; // update ref
    setFeedback('');
  }

  // ---------- Check Quiz Answer ----------
  function handleGlobeClick(clickedCountry) {
    console.log('Clicked country:', clickedCountry);
    if (!quizRef.current) return;
    const correctCountry = quizRef.current.country;

    // setTotalCount((t) => t + 1);
    if (clickedCountry === correctCountry) {
      setCorrectCount((c) => c + 1);
      const wasFirstTry = quizRef.current.firstTryFlag;
      if (wasFirstTry) {
        // setFeedback('✅ Correct!');
        highlightCountry(correctCountry, BORDER_LINE_COLOR_CORRECT);
      } else {
        // setFeedback(`✅ Correct (not first try).`);
        highlightCountry(correctCountry, BORDER_LINE_COLOR_PARTIAL);
      }
      nextQuestion();
    } else {
      quizRef.current.firstTryFlag = false;

      // Highlight the correct country in red
      highlightCountry(correctCountry, BORDER_LINE_COLOR_WRONG);

      if (quizRef.current.type === 'name') {
        setFeedback(`❌ Wrong!`);
      } else {
        setFeedback(`❌ Wrong! Correct country: ${correctCountry}`);
      }
    }
  }

  // TODO: Probably a lot better way to do this than looping through all countries
  function clearAllCountryColors() {
    for (const name in stateRef.current.countryLines) {
      const lines = stateRef.current.countryLines[name];
      if (!lines) continue;

      lines.forEach((line) => {
        // line.material = line.material.clone(); // clone to avoid affecting others
        line.material.color.setHex(BORDER_LINE_COLOR);
      });
    }
  }
  function highlightCountry(name, color = BORDER_LINE_COLOR_CORRECT) {
    const lines = stateRef.current.countryLines[name];
    if (!lines) return;

    lines.forEach((line) => {
      line.material = line.material.clone(); // clone to avoid affecting others
      line.material.color.setHex(color);
    });
  }

  // Timer effect
  useEffect(() => {
    if (quizMode) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [quizMode]);

  function startQuiz() {
    setCorrectCount(0);
    setTotalCount(0);
    setElapsed(0);
    setQuizMode(true);
    nextQuestion();
  }
  function endQuiz() {
    setQuizMode(false);
    setQuizQuestion(null);
    setFeedback('');
    clearAllCountryColors();
    setShowSummary(true);
  }

  function showLocation() {
    console.log('Showing location');
    if (!quizRef.current) return;
    const countryName = quizRef.current.country;

    // Find the country in the features data to get its coordinates
    const features = stateRef.current.features;
    if (!features) return;

    const countryFeature = features.find(
      (item) => item.feature.name === countryName
    );
    if (!countryFeature || !countryFeature.feature.geometry) return;

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
    }
  }

  useImperativeHandle(ref, () => ({
    handleGlobeClick, // now parent can call this
  }));

  return (
    <>
      {/* Quiz UI */}
      {/* Quiz Controls */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          padding: '10px',
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          borderRadius: '12px',
          minWidth: 240,
        }}
      >
        {!quizMode ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Quiz</div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, opacity: 0.9, marginRight: 6 }}>
                Type:
              </label>
              <select
                value={quizType}
                onChange={(e) => setQuizType(e.target.value)}
              >
                <option value="flag">Flag</option>
                <option value="capital">Capital</option>
                <option value="name">Name</option>
              </select>
            </div>
            <button
              onClick={startQuiz}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Start Quiz
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <div style={{ fontWeight: 700 }}>Quiz Running</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                {Math.floor(elapsed / 60)}:
                {(elapsed % 60).toString().padStart(2, '0')}
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, opacity: 0.9, marginRight: 6 }}>
                Type:
              </label>
              <select
                value={quizType}
                onChange={(e) => setQuizType(e.target.value)}
              >
                <option value="flag">Flag</option>
                <option value="capital">Capital</option>
                <option value="name">Name</option>
              </select>
            </div>

            <div
              style={{
                marginTop: 8,
                background: 'rgba(255,255,255,0.08)',
                padding: 8,
                borderRadius: 8,
              }}
            >
              {quizQuestion ? (
                quizQuestion.type === 'flag' ? (
                  <img
                    src={quizQuestion.flag}
                    alt="flag"
                    style={{ width: 120 }}
                  />
                ) : quizQuestion.type === 'capital' ? (
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {quizQuestion.capital}
                  </div>
                ) : (
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {quizQuestion.country}
                  </div>
                )
              ) : (
                'Click Next Question'
              )}
            </div>

            <div
              style={{
                marginTop: 8,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={nextQuestion}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Next Question
              </button>
              <button
                onClick={showLocation}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                }}
              >
                Show Location
              </button>
              <button
                onClick={endQuiz}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                End Quiz
              </button>
            </div>

            {feedback && (
              <div
                style={{
                  marginTop: 8,
                  fontWeight: 700,
                  color: feedback.includes('✅') ? 'lightgreen' : '#fca5a5',
                }}
              >
                {feedback}
              </div>
            )}

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.95 }}>
              <div>
                Score: <b>{correctCount}</b> / <b>{totalCount}</b>
              </div>
              <div>
                Accuracy: <b>{accuracy}%</b>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quiz Summary Modal */}
      {showSummary && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '30px',
              borderRadius: '16px',
              maxWidth: '400px',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h2 style={{ margin: '0 0 20px 0', color: '#1e293b' }}>
              Quiz Complete!
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: '#3b82f6',
                  marginBottom: '8px',
                }}
              >
                {correctCount} / {totalCount}
              </div>
              <div style={{ fontSize: '16px', color: '#64748b' }}>
                Accuracy: {accuracy}%
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  fontSize: '14px',
                  color: '#64748b',
                  marginBottom: '8px',
                }}
              >
                Time: {Math.floor(elapsed / 60)}:
                {(elapsed % 60).toString().padStart(2, '0')}
              </div>
            </div>

            <div
              style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}
            >
              <button
                onClick={() => {
                  setShowSummary(false);
                  startQuiz();
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => setShowSummary(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default QuizMenu;
