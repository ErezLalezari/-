// Mastery System — adaptive learning engine for Leya
// 6 levels per book: 0=story, 1=characters/places, 2=facts/numbers, 3=verses, 4=sources, 5=real-quiz
//
// Pedagogy: she progresses level by level. Can't reach L5 (real quiz) without mastering L0-L4 first.
// Each level needs 80% accuracy on 10+ questions to "master" and unlock next.

import { ALL_TANAKH_BOOKS } from "./tanakhBooks";

export const LEVELS = [
  {n: 0, name: "סיפור", emoji: "📖", desc: "מה הספר מספר", minAttempts: 5, masterPct: 80},
  {n: 1, name: "דמויות ומקומות", emoji: "👥", desc: "מי ואיפה", minAttempts: 8, masterPct: 80},
  {n: 2, name: "עובדות", emoji: "🔢", desc: "כמה, מתי, סדר", minAttempts: 10, masterPct: 80},
  {n: 3, name: "פסוקים", emoji: "📜", desc: "ציטוטים, מי אמר", minAttempts: 10, masterPct: 75},
  {n: 4, name: "מקורות", emoji: "🔍", desc: "באיזה ספר ופרק", minAttempts: 10, masterPct: 75},
  {n: 5, name: "חידון רשמי", emoji: "🏆", desc: "שאלות אמיתיות", minAttempts: 10, masterPct: 70},
];

// Initial focus order — Leya starts with these books
export const FOCUS_ORDER = [
  "bereshit", "shemot", "shoftim", "shmuel_a", "rut", "esther", "yona",
  "yehoshua", "bamidbar", "devarim", "melachim_a", "melachim_b",
  "daniel", "nechemya", "ezra", "yirmiyahu",
];

/**
 * Calculate mastery state from raw mastery records
 * Returns matrix: { [book]: { [level]: { score, attempts, status } } }
 * Status: locked | unlocked | in-progress | mastered
 */
export function buildMatrix(masteryRecords = []) {
  const matrix = {};
  // Initialize all books × levels as locked
  ALL_TANAKH_BOOKS.forEach(book => {
    matrix[book.id] = {};
    LEVELS.forEach(lvl => {
      matrix[book.id][lvl.n] = {
        attempts: 0, correct: 0, score: 0,
        status: lvl.n === 0 ? "unlocked" : "locked", // L0 always open
      };
    });
  });

  // Apply records
  masteryRecords.forEach(r => {
    if (matrix[r.book] && matrix[r.book][r.level] !== undefined) {
      const cell = matrix[r.book][r.level];
      cell.attempts = r.attempts || 0;
      cell.correct = r.correct || 0;
      cell.score = parseFloat(r.score) || 0;

      const lvl = LEVELS[r.level];
      if (cell.attempts >= lvl.minAttempts && cell.score >= lvl.masterPct) {
        cell.status = "mastered";
      } else if (cell.attempts > 0) {
        cell.status = "in-progress";
      } else {
        cell.status = "unlocked";
      }
    }
  });

  // Cascade unlocks: if level N is mastered, level N+1 unlocks
  ALL_TANAKH_BOOKS.forEach(book => {
    for (let lvl = 0; lvl < LEVELS.length - 1; lvl++) {
      if (matrix[book.id][lvl].status === "mastered") {
        if (matrix[book.id][lvl + 1].status === "locked") {
          matrix[book.id][lvl + 1].status = "unlocked";
        }
      }
    }
  });

  return matrix;
}

/**
 * Pick the next best task for Leya.
 * Strategy: weakest level in priority book that's unlocked.
 */
export function pickNextTask(matrix) {
  // Priority 1: any in-progress level not yet mastered, lowest level first
  for (const bookId of FOCUS_ORDER) {
    if (!matrix[bookId]) continue;
    for (let lvl = 0; lvl < LEVELS.length; lvl++) {
      const cell = matrix[bookId][lvl];
      if (cell.status === "in-progress") {
        return {bookId, level: lvl, reason: "continue"};
      }
    }
  }

  // Priority 2: any newly unlocked level
  for (const bookId of FOCUS_ORDER) {
    if (!matrix[bookId]) continue;
    for (let lvl = 0; lvl < LEVELS.length; lvl++) {
      const cell = matrix[bookId][lvl];
      if (cell.status === "unlocked" && cell.attempts === 0) {
        return {bookId, level: lvl, reason: "new"};
      }
    }
  }

  // Priority 3: review old mastered levels (spaced repetition)
  for (const bookId of FOCUS_ORDER) {
    if (!matrix[bookId]) continue;
    for (let lvl = 0; lvl < LEVELS.length; lvl++) {
      const cell = matrix[bookId][lvl];
      if (cell.status === "mastered" && cell.score < 95) {
        return {bookId, level: lvl, reason: "review"};
      }
    }
  }

  return null;
}

/**
 * Compute overall progress: what % of "matrix" is mastered
 */
export function overallProgress(matrix) {
  const totalCells = Object.keys(matrix).length * LEVELS.length;
  let mastered = 0, inProgress = 0, unlocked = 0;
  Object.values(matrix).forEach(book => {
    Object.values(book).forEach(cell => {
      if (cell.status === "mastered") mastered++;
      else if (cell.status === "in-progress") inProgress++;
      else if (cell.status === "unlocked") unlocked++;
    });
  });
  return {
    totalCells, mastered, inProgress, unlocked,
    masteredPct: Math.round(100 * mastered / totalCells),
    activePct: Math.round(100 * (mastered + inProgress) / totalCells),
  };
}

/**
 * Estimate readiness for the real quiz at each stage
 * Returns: { school: 0-100, district: 0-100, national: 0-100, world: 0-100 }
 */
export function estimateReadiness(matrix) {
  // School level: needs L0-L2 mastered on basic books
  const schoolBooks = ["bereshit", "shemot", "shoftim", "shmuel_a", "rut", "esther", "yona"];
  const districtBooks = [...schoolBooks, "yehoshua", "bamidbar", "melachim_a"];
  const nationalBooks = [...districtBooks, "devarim", "melachim_b", "daniel"];
  const worldBooks = ALL_TANAKH_BOOKS.map(b => b.id);

  const score = (books, maxLevel) => {
    let total = 0, achieved = 0;
    books.forEach(b => {
      if (!matrix[b]) return;
      for (let lvl = 0; lvl <= maxLevel; lvl++) {
        total++;
        const cell = matrix[b][lvl];
        if (cell.status === "mastered") achieved++;
        else if (cell.status === "in-progress") achieved += cell.score / 100;
      }
    });
    return total > 0 ? Math.round(100 * achieved / total) : 0;
  };

  return {
    school: score(schoolBooks, 2),
    district: score(districtBooks, 3),
    national: score(nationalBooks, 4),
    world: score(worldBooks, 5),
  };
}

/**
 * Update mastery after answering a question
 */
export async function recordAttempt(supabase, book, level, correct) {
  if (!supabase || !book || level === undefined) return;
  // Get current
  const {data: existing} = await supabase
    .from("mastery")
    .select("*")
    .eq("book", book)
    .eq("level", level)
    .maybeSingle();

  const attempts = (existing?.attempts || 0) + 1;
  const correctCount = (existing?.correct || 0) + (correct ? 1 : 0);
  const streak = correct ? (existing?.current_streak || 0) + 1 : 0;
  const bestStreak = Math.max(existing?.best_streak || 0, streak);
  const wasMastered = existing?.mastered_at;
  const lvl = LEVELS[level];
  const score = attempts > 0 ? (100 * correctCount / attempts) : 0;
  const isMastered = attempts >= lvl.minAttempts && score >= lvl.masterPct;

  const row = {
    book, level,
    attempts, correct: correctCount,
    current_streak: streak, best_streak: bestStreak,
    last_tested: new Date().toISOString(),
    unlocked_at: existing?.unlocked_at || new Date().toISOString(),
    mastered_at: isMastered && !wasMastered ? new Date().toISOString() : (existing?.mastered_at || null),
  };

  await supabase.from("mastery").upsert(row, {onConflict: "book,level"});
  return {newlyMastered: isMastered && !wasMastered, score};
}
