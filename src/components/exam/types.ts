export type ExamQuestion = {
  question: string;
  options: string[];
  correct_answer: string;
};

export type ExamRow = {
  id: string;
  subject_id: string;
  title: string;
  questions: ExamQuestion[];
  duration_minutes: number;
  start_at: string | null;
  end_at: string | null;
  created_by: string;
  is_published: boolean;
  is_ai_generated: boolean;
  created_at: string;
};

export type ExamAttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  answers: Record<number, string>;
  score: number;
  total: number;
  submitted_at: string;
  time_taken: number;
};
