export interface Organization {
  id: string
  name: string
  created_at: string
}

export interface Dataset {
  id: string
  organization_id: string
  report_name: string | null
  report_type: 'overview' | 'google_ads' | 'meta_ads'
  detected_date_column: string | null
  metric_mappings: Record<string, string | null>
  schema_profile: Record<string, unknown>
  ingestion_warnings: string[]
  file_name: string
  file_size: number | null
  row_count: number
  column_headers: string[]
  storage_path: string | null
  status: 'queued' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  uploaded_at: string
  updated_at: string
}

export interface Thread {
  id: string
  organization_id: string
  dataset_id: string
  user_id: string
  title: string
  created_at: string
}

export interface Message {
  id: string
  thread_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: Record<string, any>
  created_at: string
}

export interface AnalyticsRequest {
  dataset_id: string
  operation: 'describe' | 'value_counts' | 'groupby' | 'auto'
  column?: string
  group_by?: string
  date_preset?: string
  date_column?: string
  start_date?: string
  end_date?: string
}

export interface AnalyticsResult {
  dataset_id: string
  operation: string
  result: Record<string, unknown> & { granularity?: 'daily' | 'monthly' }
}

export interface InsightsRequest {
  dataset_id: string
  date_preset?: string
  date_column?: string
  start_date?: string
  end_date?: string
}

export interface AIInsight {
  type: 'success' | 'trend' | 'warning' | 'alert'
  text: string
}

export interface InsightsResult {
  dataset_id: string
  insights: AIInsight[]
}

export interface DateRange {
  start: Date | null
  end: Date | null
}

export interface UserProfile {
  id: string
  email: string
  organization: Organization | null
  role: 'admin' | 'user' | null
}

export interface UploadStatus {
  status: 'uploading' | 'processing' | 'done' | 'error'
  dataset_id?: string
  message?: string
}

export interface HelpArticle {
  id: string
  title: string
  body: string
  category: string
  sort_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface SupportMessage {
  id: string
  user_id: string
  organization_id: string
  email: string
  message: string
  status: 'open' | 'resolved'
  created_at: string
}
