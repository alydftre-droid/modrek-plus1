export type QuestionType = "mcq" | "true_false" | "essay";

export type ExamQuestion = {
  question: string;
  type: QuestionType;
  options: string[];
  correct_answer: string;
  model_answer?: string;
  points?: number;
};

export type ExamRow = {
  id: string;
  subject_id: string;
  group_id: string | null;
  title: string;
  description: string | null;
  questions: ExamQuestion[];
  duration_minutes: number;
  start_at: string | null;
  end_at: string | null;
  created_by: string;
  is_published: boolean;
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
};

export type ExamAttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  answers: Record<number | string, string>;
  score: number;
  total: number;
  essay_scores: Record<string, number> | null;
  essay_feedback: Record<string, string> | null;
  submitted_at: string;
  time_taken: number;
  is_graded: boolean;
};
