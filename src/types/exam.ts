export type ExamStatus = "draft" | "published" | "archived";
export type ExamQuestionType = "mcq" | "true_false" | "short_answer" | "essay" | "fill_blank";
export type ExamAttemptStatus = "in_progress" | "submitted" | "graded" | "expired";
export type ExamDifficulty = "easy" | "medium" | "hard";

export interface Exam {
  id: string;
  teacher_id: string;
  subject_id: string;
  group_id: string | null;
  sub_subject_id: string | null;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  instructions: string | null;
  duration_minutes: number;
  total_marks: number;
  pass_marks: number;
  start_at: string | null;
  end_at: string | null;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results_immediately: boolean;
  show_correct_answers: boolean;
  prevent_tab_switch: boolean;
  require_fullscreen: boolean;
  prevent_copy_paste: boolean;
  status: ExamStatus;
  is_published: boolean;
  difficulty: ExamDifficulty;
  term: string;
  is_ai_generated: boolean;
  total_attempts_count: number;
  created_at: string;
  updated_at: string;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  order_index: number;
  question_type: ExamQuestionType;
  question_text: string;
  image_url: string | null;
  marks: number;
  explanation: string | null;
  difficulty: ExamDifficulty;
  correct_answer: string | null;
  options?: ExamQuestionOption[];
}

export interface ExamQuestionOption {
  id: string;
  question_id: string;
  order_index: number;
  option_text: string;
  image_url: string | null;
  is_correct: boolean;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  attempt_number: number;
  status: ExamAttemptStatus;
  started_at: string;
  submitted_at: string | null;
  time_spent_seconds: number;
  total_score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  tab_switch_count: number;
  fullscreen_exits: number;
  is_graded: boolean;
  graded_at: string | null;
}

export interface ExamAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option_ids: string[];
  answer_text: string | null;
  is_correct: boolean | null;
  marks_awarded: number;
  ai_feedback: string | null;
  flagged_for_review: boolean;
}

export type ExamTab = "all" | "available" | "upcoming" | "ended";
