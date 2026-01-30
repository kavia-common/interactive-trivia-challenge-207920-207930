import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  adminCreateQuestion,
  adminDeleteQuestion,
  adminListQuestions,
  getCurrentQuestion,
  startGame,
  submitAnswer,
} from "./api/triviaApi";

/**
 * UI States:
 * - Gameplay: shows current question + choices
 * - Feedback: shows correctness and correct answer after selection
 * - Game Over: final score with restart
 * - Admin (optional): list/create/delete questions
 *
 * Backend integration:
 * - Uses fetch via apiRequest()
 * - Shows loading and error states
 * - If backend endpoints aren't available (OpenAPI currently only has "/"),
 *   we gracefully fall back to client-side mock endpoints for UI continuity.
 */

const MOCK_QUESTIONS = [
  {
    id: "q1",
    prompt: "In classic arcade cabinets, what does CRT stand for?",
    choices: ["Cathode-Ray Tube", "Core Runtime", "Color Render Technique", "Circuit Relay Trigger"],
    correctIndex: 0,
    explanation: "CRT stands for Cathode-Ray Tube, used in older displays.",
  },
  {
    id: "q2",
    prompt: "Which color is often associated with 'neon' cyberpunk accents?",
    choices: ["Beige", "Neon Cyan", "Olive", "Brown"],
    correctIndex: 1,
    explanation: "Neon cyan (and magenta) are iconic cyberpunk palette accents.",
  },
  {
    id: "q3",
    prompt: "What input did many early arcade games rely on most?",
    choices: ["Touchscreen", "Mouse", "Joystick + buttons", "Voice commands"],
    correctIndex: 2,
    explanation: "Joystick + buttons were the standard controls in arcades.",
  },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function indexToLetter(i) {
  return String.fromCharCode("A".charCodeAt(0) + i);
}

// PUBLIC_INTERFACE
function App() {
  /** Main application entry for gameplay + optional admin. */

  const [view, setView] = useState("play"); // "play" | "admin"
  const [playerName, setPlayerName] = useState("Player 1");

  // Gameplay state
  const [gameStarted, setGameStarted] = useState(false);
  const [question, setQuestion] = useState(null); // {id,prompt,choices}
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [answerResult, setAnswerResult] = useState(null); // {correct, correctIndex, explanation, score, questionNumber, totalQuestions, gameOver}
  const [score, setScore] = useState(0);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(MOCK_QUESTIONS.length);
  const [gameOver, setGameOver] = useState(false);

  // Admin state
  const [adminQuestions, setAdminQuestions] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");

  // UX state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usingMockBackend, setUsingMockBackend] = useState(false);

  const abortRef = useRef(null);

  const progressPct = useMemo(() => {
    if (!totalQuestions) return 0;
    return clamp(Math.round((questionNumber / totalQuestions) * 100), 0, 100);
  }, [questionNumber, totalQuestions]);

  function clearAbort() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }

  async function tryBackendOrMock(fn, mockFn) {
    try {
      return await fn();
    } catch (e) {
      // If backend is not ready (404/405/CORS), fall back to local mock.
      const status = e?.status;
      const msg = String(e?.message || "");
      const looksLikeMissingEndpoint =
        status === 404 ||
        status === 405 ||
        /Failed to fetch/i.test(msg) ||
        /NetworkError/i.test(msg) ||
        /CORS/i.test(msg);

      if (looksLikeMissingEndpoint) {
        setUsingMockBackend(true);
        return mockFn();
      }

      throw e;
    }
  }

  function mockStart() {
    const q = MOCK_QUESTIONS[0];
    setScore(0);
    setQuestionNumber(1);
    setTotalQuestions(MOCK_QUESTIONS.length);
    setQuestion({ id: q.id, prompt: q.prompt, choices: q.choices });
    setSelectedIndex(null);
    setAnswerResult(null);
    setGameOver(false);
    setGameStarted(true);
    return { ok: true };
  }

  function mockGetQuestion(currentNumber) {
    const idx = clamp((currentNumber || 1) - 1, 0, MOCK_QUESTIONS.length - 1);
    const q = MOCK_QUESTIONS[idx];
    return { id: q.id, prompt: q.prompt, choices: q.choices, total_questions: MOCK_QUESTIONS.length, question_number: idx + 1 };
  }

  function mockSubmitAnswer(questionId, selectedIdx) {
    const q = MOCK_QUESTIONS.find((x) => x.id === questionId) || MOCK_QUESTIONS[0];
    const correct = selectedIdx === q.correctIndex;

    const newScore = score + (correct ? 1 : 0);
    const isLast = questionNumber >= MOCK_QUESTIONS.length;

    return {
      correct,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      score: newScore,
      questionNumber,
      totalQuestions: MOCK_QUESTIONS.length,
      gameOver: isLast,
    };
  }

  async function handleStartGame() {
    setError("");
    setLoading(true);
    clearAbort();
    abortRef.current = new AbortController();

    try {
      await tryBackendOrMock(
        async () => startGame({ playerName }),
        async () => mockStart()
      );

      // After start, load first question
      const q = await tryBackendOrMock(
        async () => getCurrentQuestion(),
        async () => mockGetQuestion(1)
      );

      setQuestion({
        id: q.id || q.question_id || q.questionId || "unknown",
        prompt: q.prompt || q.question || q.text || "Question",
        choices: q.choices || q.options || [],
      });

      const tn = q.total_questions ?? q.totalQuestions ?? MOCK_QUESTIONS.length;
      const qn = q.question_number ?? q.questionNumber ?? 1;

      setTotalQuestions(tn);
      setQuestionNumber(qn);
      setScore(0);
      setSelectedIndex(null);
      setAnswerResult(null);
      setGameOver(false);
      setGameStarted(true);
    } catch (e) {
      setError(e?.message || "Unable to start game");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectAnswer(idx) {
    if (!question || loading || selectedIndex !== null || gameOver) return;

    setError("");
    setLoading(true);
    clearAbort();
    abortRef.current = new AbortController();

    try {
      setSelectedIndex(idx);

      const result = await tryBackendOrMock(
        async () => submitAnswer({ questionId: question.id, selectedIndex: idx }),
        async () => mockSubmitAnswer(question.id, idx)
      );

      const normalized = {
        correct: !!(result.correct ?? result.is_correct),
        correctIndex: result.correctIndex ?? result.correct_index ?? 0,
        explanation: result.explanation ?? "",
        score: result.score ?? score,
        questionNumber: result.questionNumber ?? result.question_number ?? questionNumber,
        totalQuestions: result.totalQuestions ?? result.total_questions ?? totalQuestions,
        gameOver: !!(result.gameOver ?? result.game_over),
      };

      setAnswerResult(normalized);
      setScore(normalized.score);
      setTotalQuestions(normalized.totalQuestions);
      setGameOver(normalized.gameOver);
    } catch (e) {
      setSelectedIndex(null);
      setError(e?.message || "Unable to submit answer");
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    if (!answerResult || loading) return;

    if (answerResult.gameOver) {
      // stay on game over view
      setGameOver(true);
      return;
    }

    setError("");
    setLoading(true);
    clearAbort();
    abortRef.current = new AbortController();

    try {
      const nextNumber = questionNumber + 1;

      const q = await tryBackendOrMock(
        async () => getCurrentQuestion(),
        async () => mockGetQuestion(nextNumber)
      );

      setQuestion({
        id: q.id || q.question_id || q.questionId || "unknown",
        prompt: q.prompt || q.question || q.text || "Question",
        choices: q.choices || q.options || [],
      });

      const tn = q.total_questions ?? q.totalQuestions ?? totalQuestions;
      const qn = q.question_number ?? q.questionNumber ?? nextNumber;

      setTotalQuestions(tn);
      setQuestionNumber(qn);
      setSelectedIndex(null);
      setAnswerResult(null);
      setGameOver(false);
    } catch (e) {
      setError(e?.message || "Unable to load next question");
    } finally {
      setLoading(false);
    }
  }

  async function refreshAdmin() {
    setAdminError("");
    setAdminLoading(true);
    try {
      const list = await adminListQuestions();
      const items = Array.isArray(list) ? list : (list.items || list.questions || []);
      setAdminQuestions(items);
    } catch (e) {
      setAdminError(e?.message || "Unable to load admin questions");
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    return () => clearAbort();
  }, []);

  useEffect(() => {
    if (view === "admin") {
      refreshAdmin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const showFeedback = !!answerResult;
  const correctIndex = answerResult?.correctIndex ?? null;
  const isCorrect = answerResult?.correct ?? false;

  const statusText = gameOver
    ? "GAME OVER"
    : gameStarted
      ? showFeedback
        ? "RESULT"
        : "PLAYING"
      : "READY";

  return (
    <div className="App">
      <div className="container">
        <div className="header">
          <div className="brand" role="banner" aria-label="Retro Trivia Game">
            <div className="brandTitle">
              RETRO<span>TRIVIA</span>
            </div>
            <div className="brandSub">Answer fast. Shine brighter. Keep the streak alive.</div>
          </div>

          <div className="nav" role="navigation" aria-label="Primary">
            <span className="pill" aria-label="Score">
              <span className="kbd">SCORE</span> <strong>{score}</strong>
            </span>
            <span className="pill" aria-label="Status">
              <span className="kbd">STATUS</span> <strong>{statusText}</strong>
            </span>
            <button
              className={`btn ${view === "play" ? "btnPrimary" : ""}`}
              onClick={() => setView("play")}
              aria-current={view === "play" ? "page" : undefined}
            >
              Play
            </button>
            <button
              className={`btn ${view === "admin" ? "btnPrimary" : ""}`}
              onClick={() => setView("admin")}
              aria-current={view === "admin" ? "page" : undefined}
              title="Optional admin panel (requires backend admin endpoints)"
            >
              Admin
            </button>
          </div>
        </div>

        {usingMockBackend ? (
          <div className="inlineError" role="status" aria-live="polite">
            Backend endpoints not detected yet — running in UI mock mode. Set <strong>REACT_APP_TRIVIA_API_BASE_URL</strong> and/or start the backend to enable live gameplay.
          </div>
        ) : null}

        {view === "play" ? (
          <div className="panel">
            <div className="panelHeader">
              <h1>Arcade Run</h1>
              <div className="progressRow" style={{ width: "min(420px, 100%)" }}>
                <div className="progressBar" aria-label="Progress">
                  <div className="progressFill" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="kbd" aria-label="Question counter">
                  {questionNumber || 0}/{totalQuestions || 0}
                </div>
              </div>
            </div>

            <div className="panelBody">
              {!gameStarted ? (
                <div className="formGrid">
                  <div>
                    <div className="fieldLabel">Player Name</div>
                    <input
                      className="input"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Enter your name"
                      aria-label="Player name"
                      maxLength={32}
                    />
                    <div className="small" style={{ marginTop: 6 }}>
                      Tip: Use a short handle, like <strong>NEONFOX</strong>.
                    </div>
                  </div>

                  {error ? (
                    <div className="inlineError" role="alert">
                      {error}
                    </div>
                  ) : null}

                  <div className="footerRow">
                    <button className="btn btnPrimary" onClick={handleStartGame} disabled={loading || !playerName.trim()}>
                      {loading ? "Starting…" : "Start Game"}
                    </button>
                    <span className="kbd">Powered by fetch() • No heavy UI libs</span>
                  </div>
                </div>
              ) : (
                <>
                  {!question ? (
                    <div>
                      <div className="skeleton" style={{ height: 18, width: "70%" }} />
                      <div className="skeleton" style={{ height: 18, width: "55%", marginTop: 10 }} />
                      <div className="skeleton" style={{ height: 64, width: "100%", marginTop: 18 }} />
                      <div className="skeleton" style={{ height: 64, width: "100%", marginTop: 12 }} />
                    </div>
                  ) : (
                    <>
                      <div className="questionPrompt" aria-label="Question prompt">
                        {question.prompt}
                      </div>

                      <div className="choicesGrid" role="list" aria-label="Answer choices">
                        {question.choices.map((choice, idx) => {
                          const locked = selectedIndex !== null;
                          const isThisCorrect = locked && correctIndex === idx;
                          const isThisWrong = locked && selectedIndex === idx && correctIndex !== idx;

                          return (
                            <button
                              key={`${question.id}-${idx}`}
                              className={[
                                "choiceBtn",
                                isThisCorrect ? "choiceCorrect" : "",
                                isThisWrong ? "choiceWrong" : "",
                              ].join(" ")}
                              onClick={() => handleSelectAnswer(idx)}
                              disabled={loading || locked || gameOver}
                              role="listitem"
                              aria-label={`Answer ${indexToLetter(idx)}: ${choice}`}
                            >
                              <div className="choiceState" />
                              <span className="choiceLabel">{indexToLetter(idx)}</span>
                              <span className="choiceText">{choice}</span>
                            </button>
                          );
                        })}
                      </div>

                      {error ? (
                        <div className="inlineError" role="alert" style={{ marginTop: 14 }}>
                          {error}
                        </div>
                      ) : null}

                      {showFeedback ? (
                        <div
                          className={[
                            "feedback",
                            isCorrect ? "feedbackGood" : "feedbackBad",
                          ].join(" ")}
                          role="status"
                          aria-live="polite"
                        >
                          <p className="feedbackTitle">{isCorrect ? "Correct!" : "Not quite…"}</p>
                          <p className="feedbackBody">
                            {isCorrect ? (
                              <>
                                +1 point. Your score is now <strong>{score}</strong>.
                              </>
                            ) : (
                              <>
                                The correct answer was{" "}
                                <strong>
                                  {indexToLetter(correctIndex)}. {question.choices[correctIndex]}
                                </strong>
                                .
                              </>
                            )}
                            {answerResult?.explanation ? (
                              <>
                                {" "}
                                <span className="small">{answerResult.explanation}</span>
                              </>
                            ) : null}
                          </p>

                          <div className="footerRow">
                            <button
                              className="btn btnPrimary"
                              onClick={handleNext}
                              disabled={loading}
                              aria-label={answerResult?.gameOver ? "Show game over" : "Next question"}
                            >
                              {loading ? "Loading…" : answerResult?.gameOver ? "Finish Run" : "Next Question"}
                            </button>

                            <button
                              className="btn"
                              onClick={() => {
                                setGameStarted(false);
                                setQuestion(null);
                                setSelectedIndex(null);
                                setAnswerResult(null);
                                setGameOver(false);
                                setError("");
                              }}
                              disabled={loading}
                            >
                              Restart
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {gameOver ? (
                        <div className="feedback feedbackGood" style={{ marginTop: 16 }} role="status" aria-live="polite">
                          <p className="feedbackTitle">Run complete</p>
                          <p className="feedbackBody">
                            Final score: <strong>{score}</strong> / {totalQuestions}.{" "}
                            {score === totalQuestions ? "Perfect run!" : "Want another go?"}
                          </p>
                          <div className="footerRow">
                            <button className="btn btnPrimary" onClick={handleStartGame} disabled={loading}>
                              {loading ? "Starting…" : "Play Again"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panelHeader">
              <h2>Admin Console</h2>
              <div className="kbd">Requires backend /admin/questions endpoints</div>
            </div>
            <div className="panelBody">
              {adminError ? (
                <div className="inlineError" role="alert">
                  {adminError}
                </div>
              ) : null}

              <AdminCreateForm
                disabled={adminLoading}
                onCreate={async (payload) => {
                  setAdminError("");
                  setAdminLoading(true);
                  try {
                    await adminCreateQuestion(payload);
                    await refreshAdmin();
                  } catch (e) {
                    setAdminError(e?.message || "Unable to create question");
                  } finally {
                    setAdminLoading(false);
                  }
                }}
              />

              <div className="footerRow" style={{ marginTop: 16 }}>
                <button className="btn" onClick={refreshAdmin} disabled={adminLoading}>
                  {adminLoading ? "Refreshing…" : "Refresh"}
                </button>
                <span className="small">Tip: Keep choices short for best UX.</span>
              </div>

              <table className="table" aria-label="Admin question list">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Prompt</th>
                    <th className="small">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminLoading ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="skeleton" style={{ height: 36, width: "100%" }} />
                      </td>
                    </tr>
                  ) : adminQuestions.length ? (
                    adminQuestions.map((q) => (
                      <tr key={q.id || q.question_id || q.questionId}>
                        <td className="small">{q.id || q.question_id || q.questionId}</td>
                        <td>{q.prompt || q.question || q.text}</td>
                        <td>
                          <button
                            className="btn btnDanger"
                            onClick={async () => {
                              const id = q.id || q.question_id || q.questionId;
                              if (!id) return;
                              setAdminError("");
                              setAdminLoading(true);
                              try {
                                await adminDeleteQuestion(id);
                                await refreshAdmin();
                              } catch (e) {
                                setAdminError(e?.message || "Unable to delete question");
                              } finally {
                                setAdminLoading(false);
                              }
                            }}
                            disabled={adminLoading}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="small">
                        No questions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// PUBLIC_INTERFACE
function AdminCreateForm({ disabled, onCreate }) {
  /** Admin form to create a new question. */
  const [prompt, setPrompt] = useState("");
  const [choicesText, setChoicesText] = useState("Choice A\nChoice B\nChoice C\nChoice D");
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [localError, setLocalError] = useState("");

  function parseChoices() {
    return choicesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return (
    <div className="panel" style={{ marginBottom: 14, background: "rgba(11, 16, 48, 0.35)" }}>
      <div className="panelHeader">
        <h2>Create Question</h2>
        <div className="kbd">POST /admin/questions</div>
      </div>
      <div className="panelBody">
        {localError ? (
          <div className="inlineError" role="alert" style={{ marginBottom: 12 }}>
            {localError}
          </div>
        ) : null}

        <div className="formGrid">
          <div>
            <div className="fieldLabel">Prompt</div>
            <input
              className="input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type the question prompt…"
              disabled={disabled}
            />
          </div>

          <div>
            <div className="fieldLabel">Choices (one per line)</div>
            <textarea
              className="textarea"
              value={choicesText}
              onChange={(e) => setChoicesText(e.target.value)}
              disabled={disabled}
            />
          </div>

          <div>
            <div className="fieldLabel">Correct choice index</div>
            <input
              className="input"
              type="number"
              min={0}
              max={10}
              value={correctIndex}
              onChange={(e) => setCorrectIndex(Number(e.target.value))}
              disabled={disabled}
            />
            <div className="small" style={{ marginTop: 6 }}>
              0-based index (0=A, 1=B, …). Keep within number of choices.
            </div>
          </div>

          <div>
            <div className="fieldLabel">Explanation (optional)</div>
            <input
              className="input"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Why is this the right answer?"
              disabled={disabled}
            />
          </div>

          <div className="footerRow">
            <button
              className="btn btnPrimary"
              disabled={disabled}
              onClick={async () => {
                setLocalError("");
                const choices = parseChoices();
                if (!prompt.trim()) return setLocalError("Prompt is required.");
                if (choices.length < 2) return setLocalError("Provide at least 2 choices.");
                if (correctIndex < 0 || correctIndex >= choices.length) {
                  return setLocalError("Correct index is out of range for the provided choices.");
                }

                await onCreate({
                  prompt: prompt.trim(),
                  choices,
                  correctIndex,
                  explanation: explanation.trim() || undefined,
                });

                setPrompt("");
                setExplanation("");
              }}
            >
              {disabled ? "Saving…" : "Create"}
            </button>
            <span className="kbd">Validate input before sending</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
