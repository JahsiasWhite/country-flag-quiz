import React, {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
} from 'react';

const QuizMenu = forwardRef(({ countryMeta, stateRef }, ref) => {
  const [quizType, setQuizType] = useState('flag'); // user-selected quiz type
  const [quizQuestion, setQuizQuestion] = useState(null);
  const [feedback, setFeedback] = useState('');

  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0); // seconds

  const quizRef = useRef(null);
  const [quizMode, setQuizMode] = useState(false);
  const quizModeRef = useRef(false);
  useEffect(() => {
    quizModeRef.current = quizMode;
  }, [quizMode]); // TODO: Unnecessary

  const [correctCount, setCorrectCount] = useState(0); // first-try correct per question
  const [totalCount, setTotalCount] = useState(0); // total attempts
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
        highlightCountry(correctCountry, 0x00ff00);
      } else {
        // setFeedback(`✅ Correct (not first try).`);
        highlightCountry(correctCountry, 0xffff00);
      }
      nextQuestion();
    } else {
      quizRef.current.firstTryFlag = false;
      if (quizRef.current.type === 'name') {
        setFeedback(`❌ Wrong!`);
      } else {
        setFeedback(`❌ Wrong! Correct country: ${correctCountry}`);
      }
    }
  }

  function clearAllCountryColors() {
    const mats = stateRef.current.materialByCountry;
    mats.forEach((mat) => {
      mat.color.setHex(0xffffff);
      mat.opacity = 0.65;
      mat.transparent = true;
      mat.needsUpdate = true;
    });
  }
  function highlightCountry(name, color = 0x00ff00) {
    const lines = stateRef.current.countryLines[name];
    if (!lines) return;

    lines.forEach((line) => {
      line.material = line.material.clone(); // clone to avoid affecting others
      line.material.color.setHex(color);
    });
  }

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
    // clearAllCountryColors();
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
              <div style={{ fontSize: 12, opacity: 0.9 }}>{elapsed}</div>
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

            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
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
    </>
  );
});

export default QuizMenu;
