export type SandboxConfig = {
  type: "coding" | "written";
  difficulty: "easy" | "medium" | "hard";
  time_limit_minutes: number;
};

export type Posting = {
  id: string;
  title: string;
  description: string;
  location: string;
  work_mode?: "remote" | "hybrid" | "onsite" | string;
  employment_type: string;
  status: "draft" | "published" | "closed";
  unit_id: string | null;
  pack_id: string | null;
  pack_version: string | null;
  pool_status: "not_generated" | "generated" | "curated" | "locked";
  question_pool: QuestionPool | null;
  workflow_snapshot: WorkflowSnapshot | null;
  sandbox_required: boolean;
  sandbox: SandboxConfig | null;
  created_at: string;
  published_at: string | null;
  closed_at: string | null;
  application_count?: number;
};

export type SandboxProblem = {
  id: string;
  title: string;
  statement: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  starter_code: string;
  language_hint: string;
};

export type SandboxWrittenExercise = {
  prompts: { id: string; question: string; min_words: number }[];
};

export type SandboxSessionState = {
  status: "not_started" | "in_progress" | "submitted" | "expired";
  type: "coding" | "written";
  difficulty: "easy" | "medium" | "hard";
  time_limit_minutes: number;
  started_at: string | null;
  deadline: string | null;
  submitted_at: string | null;
  problem?: SandboxProblem;
  exercise?: SandboxWrittenExercise;
  submission: {
    code: string;
    language: string | null;
    answers: Record<string, string>;
    updated_at: string | null;
  };
  violations: { type: string; detail: string; at: string }[];
  evaluation: { score: number | null } | null;
  recording_path: string | null;
};

export type SandboxState = {
  required: boolean;
  config: SandboxConfig | null;
  session: SandboxSessionState | null;
};

export type Question = {
  id: string;
  prompt: string;
  competency: string;
  expected_concepts?: string[];
};

export type QuestionPool = {
  version: number;
  status: string;
  task_style: string;
  questions: Question[];
  rubric_dimensions: { id: string; label: string; description?: string }[];
  generated_at?: string;
  locked_at?: string;
};

export type WorkflowSnapshot = {
  stages: WorkflowStage[];
  candidate_status_mapping: Record<string, string>;
  version: number;
};

export type WorkflowStage = {
  id: string;
  label: string;
  category: string;
  requires_reason?: boolean;
};

export type IdentityVerification = {
  status: "match" | "ambiguous" | "mismatch" | "no_reference_photo" | "unavailable";
  confidence: number | null;
  detail: string;
  checked_at: string;
};

export type PipelineCard = {
  id: string;
  candidate_name: string;
  candidate_has_avatar?: boolean;
  candidate_avatar_url?: string | null;
  identity_verification?: IdentityVerification | null;
  posting_id: string;
  job_title: string;
  stage_id: string;
  stage_label: string;
  stage_category: string;
  stage_position: { current: number; total: number } | null;
  stage_version: number;
  profile_interview_score: number | null;
  job_match_score?: number | null;
  job_match_reasons?: string | null;
  ai_improvement_feedback?: string | null;
  applied_interview_status: string | null;
  sandbox_status?: string | null;
  sandbox_score?: number | null;
  applied_at: string;
  updated_at: string;
  valid_destinations: { id: string; label: string; requires_reason: boolean }[];
};

export type PipelineColumn = {
  stage_id: string;
  label: string;
  category: string;
  cards: PipelineCard[];
};

export type Evaluation = {
  evaluator_version: string;
  pack_id: string;
  pack_version: string;
  overall_score: number;
  dimension_scores: { dimension_id: string; label: string; score: number }[];
  question_results: {
    question_id: string;
    competency: string;
    score: number;
    covered_concepts: { concept: string; evidence: string }[];
    missing_concepts: string[];
    word_count: number;
  }[];
  strengths: string[];
  gaps: string[];
  answered_questions: number;
  total_questions: number;
  requires_human_decision: boolean;
  evidence?: {
    dimension_id: string;
    text: string;
    timestamp_range?: { start: number; end: number };
  }[];
};

export type ApplicationDetail = PipelineCard & {
  profile_snapshot: {
    headline: string;
    summary: string;
    skills: string[];
    credentials: string[];
    experiences: string[];
    availability: string;
  };
  answers: Record<string, string>;
  applied_interview: {
    attempt_id: string;
    status: string;
    questions: Question[];
    responses: Record<string, string>;
    evaluation: Evaluation | null;
    identity_verification?: IdentityVerification | null;
    invited_at: string;
    submitted_at: string | null;
  } | null;
  scorecards: {
    id: string;
    reviewer_name: string;
    scores: Record<string, number>;
    recommendation: string;
    note: string;
    created_at: string;
  }[];
  transitions: {
    id: string;
    from_stage: string;
    to_stage: string;
    reason_code: string;
    note: string;
    actor_name: string;
    occurred_at: string;
  }[];
  history?: {
    id: string;
    action: string;
    detail: string;
    timestamp: string;
    actor_id: string;
  }[];
};

export type Job = {
  id: string;
  title: string;
  description: string;
  location: string;
  work_mode?: string;
  employment_type: string;
  organization_name: string;
  published_at: string | null;
  requires_applied_interview: boolean;
  candidate_process: string[];
  already_applied?: boolean;
  application_id?: string | null;
};

export type CandidateApplication = {
  id: string;
  job_title: string;
  organization_name: string;
  status: string;
  status_order: string[];
  applied_at: string;
  updated_at: string;
  applied_interview: {
    attempt_id: string;
    status: string;
    sandbox?: { required: boolean; status: string | null } | null;
  } | null;
  job_match_score?: number | null;
  job_match_reasons?: string | null;
  ai_improvement_feedback?: string | null;
};

export type Timeline = {
  application_id: string;
  job_title: string;
  current_status: string;
  last_updated: string;
  steps: { status: string; state: "completed" | "current" | "upcoming"; occurred_at: string | null }[];
  next_action: string | null;
  applied_interview: { attempt_id: string; status: string } | null;
};

export type CvSection = {
  title: string;
  description: string;
  content: string[];
};

export type ParsedCv = {
  sections: CvSection[];
  source_filename: string | null;
  parser: string;
  parsed_at: string;
};

export type CandidateProfile = {
  id: string;
  profile: {
    headline: string;
    summary: string;
    skills: string[];
    credentials: string[];
    experiences: string[];
    availability: string;
  };
  consents: Record<string, boolean>;
  target_domains: string[];
  updated_at: string;
  parsed_cv?: ParsedCv | null;
  embedding_model?: string | null;
  embedded_at?: string | null;
  has_embedding?: boolean;
};

export type InterviewAttempt = {
  id: string;
  status: string;
  attempt_number?: number;
  questions: Question[];
  responses: Record<string, string>;
  evaluation?: Evaluation | null;
  resumed?: boolean;
  started_at?: string;
  submitted_at?: string | null;
};

export type AttemptSummary = {
  id: string;
  pack_id: string;
  pack_version: string;
  attempt_number: number;
  status: string;
  started_at: string;
  submitted_at: string | null;
  overall_score: number | null;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  link: string;
  read: number;
  created_at: string;
};

export type AuditRecord = {
  id: string;
  actor_user_id: string;
  actor_name?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  old_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

export type Analytics = {
  total_postings: number;
  published_postings: number;
  total_applications: number;
  applications_by_category: Record<string, number>;
  hired: number;
  rejected: number;
  in_flight: number;
};

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_role: "employer" | "candidate";
  sender_name: string;
  body: string;
  read_by_recipient: number;
  sent_at: string;
};

export type Conversation = {
  id: string;
  tenant_id: string;
  application_id: string | null;
  posting_id: string | null;
  candidate_id: string;
  subject: string;
  last_message_preview: string;
  last_message_at: string;
  created_at: string;
  candidate_name?: string;
  candidate_email?: string;
  organization_name?: string;
  posting_title?: string;
  unread_count?: number;
};

export type AutomationCondition = {
  field: string;
  op: "eq" | "neq" | "gte" | "lte" | "contains";
  value: any;
};

export type AutomationAction = {
  type: string;
  config: Record<string, any>;
};

export type AutomationRule = {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  trigger_event: string;
  trigger_config: Record<string, any>;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  is_active: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  run_count?: number;
  last_run_at?: string | null;
};

export type AutomationRun = {
  id: string;
  tenant_id: string;
  rule_id: string;
  rule_name?: string;
  trigger_resource_id: string;
  status: "completed" | "skipped" | "failed";
  execution_log: string;
  error_message?: string | null;
  executed_at: string;
};


