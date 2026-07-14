// Central React Query key registry.
// -----------------------------------------------------------------------------
// Every new query should use a factory here — never inline string literals in
// components. Typos in inline keys create silent cache duplication (two hooks
// caching the same rows under different keys, one gets invalidated, the other
// keeps serving stale data — a classic "Web shows X, Mobile shows Y" bug).
//
// Keep keys stable: changing a key = invalidating every persisted client. If
// you must break a key shape, also bump DATA_SCHEMA_VERSION in cacheVersion.ts.

export const qk = {
  wallet: {
    student: (userId: string) => ["wallet", "student", userId] as const,
    teacher: (userId: string) => ["wallet", "teacher", userId] as const,
    transactions: (walletId: string) => ["wallet", "transactions", walletId] as const,
  },
  subscriptions: {
    mine: (userId: string) => ["subscriptions", "mine", userId] as const,
    forSubject: (userId: string, subjectId: string) =>
      ["subscriptions", "mine", userId, subjectId] as const,
  },
  notifications: {
    inbox: (userId: string) => ["notifications", "inbox", userId] as const,
    unreadCount: (userId: string) => ["notifications", "unread", userId] as const,
  },
  profile: {
    me: (userId: string) => ["profile", "me", userId] as const,
  },
  library: {
    booksForStudent: (userId: string) => ["library", "books", "student", userId] as const,
    book: (bookId: string) => ["library", "book", bookId] as const,
  },
  exams: {
    forStudent: (userId: string) => ["exams", "student", userId] as const,
    attempt: (attemptId: string) => ["exams", "attempt", attemptId] as const,
  },
  integrity: {
    serverHash: (userId: string) => ["integrity", "server-hash", userId] as const,
  },
} as const;
