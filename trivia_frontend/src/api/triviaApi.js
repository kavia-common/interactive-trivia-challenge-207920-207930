import { apiRequest } from "./client";

/**
 * NOTE:
 * The downloaded backend OpenAPI spec currently only exposes "/".
 * This module is written to match the planned trivia backend shape:
 * - /game/start
 * - /game/question
 * - /game/answer
 * - /admin/questions (CRUD)
 *
 * If those endpoints are not yet available, the UI will fall back to mocked data
 * from /mock/* implemented in App.js (client-side) ONLY for development/preview.
 */

/** @typedef {{ id: string, prompt: string, choices: string[] }} TriviaQuestion */
/** @typedef {{ correct: boolean, correctIndex: number, explanation?: string, score: number, questionNumber: number, totalQuestions: number, gameOver?: boolean }} AnswerResult */

// PUBLIC_INTERFACE
export async function healthCheck() {
  /** Basic health check to verify backend connectivity. */
  return apiRequest("/", { method: "GET" });
}

// PUBLIC_INTERFACE
export async function startGame({ playerName } = {}) {
  /** Start/reset a game session. */
  return apiRequest("/game/start", { method: "POST", body: { player_name: playerName || "Player 1" } });
}

// PUBLIC_INTERFACE
export async function getCurrentQuestion() {
  /** Fetch the current question for the active session. */
  return apiRequest("/game/question", { method: "GET" });
}

// PUBLIC_INTERFACE
export async function submitAnswer({ questionId, selectedIndex }) {
  /** Submit an answer and receive correctness + updated score/progress. */
  return apiRequest("/game/answer", { method: "POST", body: { question_id: questionId, selected_index: selectedIndex } });
}

// ===== Optional Admin =====

// PUBLIC_INTERFACE
export async function adminListQuestions() {
  /** List questions for admin management. */
  return apiRequest("/admin/questions", { method: "GET" });
}

// PUBLIC_INTERFACE
export async function adminCreateQuestion({ prompt, choices, correctIndex, explanation } = {}) {
  /** Create a question (admin). */
  return apiRequest("/admin/questions", {
    method: "POST",
    body: { prompt, choices, correct_index: correctIndex, explanation },
  });
}

// PUBLIC_INTERFACE
export async function adminUpdateQuestion(id, { prompt, choices, correctIndex, explanation } = {}) {
  /** Update a question by id (admin). */
  return apiRequest(`/admin/questions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { prompt, choices, correct_index: correctIndex, explanation },
  });
}

// PUBLIC_INTERFACE
export async function adminDeleteQuestion(id) {
  /** Delete a question by id (admin). */
  return apiRequest(`/admin/questions/${encodeURIComponent(id)}`, { method: "DELETE" });
}
