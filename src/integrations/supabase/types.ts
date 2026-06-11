export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ad_settings: {
        Row: {
          bundles_button_order: number
          bundles_button_placement: Database["public"]["Enums"]["bundles_placement"]
          id: number
          show_student_code_with_ads: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bundles_button_order?: number
          bundles_button_placement?: Database["public"]["Enums"]["bundles_placement"]
          id?: number
          show_student_code_with_ads?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bundles_button_order?: number
          bundles_button_placement?: Database["public"]["Enums"]["bundles_placement"]
          id?: number
          show_student_code_with_ads?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ad_targets: {
        Row: {
          ad_id: string
          created_at: string
          education_type: string | null
          grade: string | null
          id: string
          section: string | null
          stage: string | null
          student_ids: string[] | null
          target_type: Database["public"]["Enums"]["ad_target_type"]
        }
        Insert: {
          ad_id: string
          created_at?: string
          education_type?: string | null
          grade?: string | null
          id?: string
          section?: string | null
          stage?: string | null
          student_ids?: string[] | null
          target_type?: Database["public"]["Enums"]["ad_target_type"]
        }
        Update: {
          ad_id?: string
          created_at?: string
          education_type?: string | null
          grade?: string | null
          id?: string
          section?: string | null
          stage?: string | null
          student_ids?: string[] | null
          target_type?: Database["public"]["Enums"]["ad_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ad_targets_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_views: {
        Row: {
          ad_id: string
          clicked: boolean
          clicked_at: string | null
          id: string
          student_id: string
          viewed_at: string
        }
        Insert: {
          ad_id: string
          clicked?: boolean
          clicked_at?: string | null
          id?: string
          student_id: string
          viewed_at?: string
        }
        Update: {
          ad_id?: string
          clicked?: boolean
          clicked_at?: string | null
          id?: string
          student_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_views_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          ad_type: Database["public"]["Enums"]["ad_type"]
          additional_images: string[] | null
          color: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          display_order: number
          end_date: string | null
          external_url: string | null
          full_content: string | null
          id: string
          internal_route: string | null
          is_active: boolean
          link_type: Database["public"]["Enums"]["ad_link_type"]
          short_description: string | null
          slide_duration_seconds: number
          start_date: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          ad_type?: Database["public"]["Enums"]["ad_type"]
          additional_images?: string[] | null
          color?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          end_date?: string | null
          external_url?: string | null
          full_content?: string | null
          id?: string
          internal_route?: string | null
          is_active?: boolean
          link_type?: Database["public"]["Enums"]["ad_link_type"]
          short_description?: string | null
          slide_duration_seconds?: number
          start_date?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          ad_type?: Database["public"]["Enums"]["ad_type"]
          additional_images?: string[] | null
          color?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          end_date?: string | null
          external_url?: string | null
          full_content?: string | null
          id?: string
          internal_route?: string | null
          is_active?: boolean
          link_type?: Database["public"]["Enums"]["ad_link_type"]
          short_description?: string | null
          slide_duration_seconds?: number
          start_date?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      ai_admin_instructions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          instruction: string
          is_active: boolean | null
          subject_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          instruction: string
          is_active?: boolean | null
          subject_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          instruction?: string
          is_active?: boolean | null
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_admin_instructions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          subject_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_daily_usage: {
        Row: {
          date: string
          id: string
          question_count: number
          student_id: string
        }
        Insert: {
          date?: string
          id?: string
          question_count?: number
          student_id: string
        }
        Update: {
          date?: string
          id?: string
          question_count?: number
          student_id?: string
        }
        Relationships: []
      }
      ai_function_settings: {
        Row: {
          enable_streaming: boolean
          fallback_delay_ms: number
          function_name: string
          max_retries: number
          models_to_try: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enable_streaming?: boolean
          fallback_delay_ms?: number
          function_name: string
          max_retries?: number
          models_to_try?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enable_streaming?: boolean
          fallback_delay_ms?: number
          function_name?: string
          max_retries?: number
          models_to_try?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_lesson_pages: {
        Row: {
          created_at: string
          created_by: string
          id: string
          image_url: string
          lesson_id: string
          notes: string | null
          page_number: number
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          image_url: string
          lesson_id: string
          notes?: string | null
          page_number?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          image_url?: string
          lesson_id?: string
          notes?: string | null
          page_number?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_lesson_pages_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "ai_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_lessons: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          group_id: string | null
          id: string
          is_active: boolean
          source_pdf_url: string | null
          sub_subject_id: string | null
          subject_id: string
          term: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          source_pdf_url?: string | null
          sub_subject_id?: string | null
          subject_id: string
          term?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          source_pdf_url?: string | null
          sub_subject_id?: string | null
          subject_id?: string
          term?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_lessons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_lessons_sub_subject_id_fkey"
            columns: ["sub_subject_id"]
            isOneToOne: false
            referencedRelation: "sub_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_sources: {
        Row: {
          created_at: string | null
          file_name: string
          file_url: string
          id: string
          subject_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_url: string
          id?: string
          subject_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_url?: string
          id?: string
          subject_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_sources_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      app_versions: {
        Row: {
          created_at: string
          force_update: boolean
          id: string
          is_active: boolean
          latest_build_number: number
          latest_version: string
          min_supported_version: string | null
          platform: string
          release_notes: string | null
          store_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          force_update?: boolean
          id?: string
          is_active?: boolean
          latest_build_number?: number
          latest_version: string
          min_supported_version?: string | null
          platform: string
          release_notes?: string | null
          store_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          force_update?: boolean
          id?: string
          is_active?: boolean
          latest_build_number?: number
          latest_version?: string
          min_supported_version?: string | null
          platform?: string
          release_notes?: string | null
          store_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      bundled_package_subjects: {
        Row: {
          created_at: string
          id: string
          package_id: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          subject_id: string
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundled_package_subjects_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "bundled_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundled_package_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      bundled_package_subscription_groups: {
        Row: {
          created_at: string
          group_id: string
          group_purchase_id: string | null
          id: string
          price_at_purchase: number
          subject_id: string
          subscription_id: string
          teacher_id: string | null
        }
        Insert: {
          created_at?: string
          group_id: string
          group_purchase_id?: string | null
          id?: string
          price_at_purchase?: number
          subject_id: string
          subscription_id: string
          teacher_id?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string
          group_purchase_id?: string | null
          id?: string
          price_at_purchase?: number
          subject_id?: string
          subscription_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundled_package_subscription_groups_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "bundled_package_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      bundled_package_subscriptions: {
        Row: {
          created_at: string
          discount_applied: number
          id: string
          package_id: string
          student_id: string
          total_original: number
          total_paid: number
        }
        Insert: {
          created_at?: string
          discount_applied?: number
          id?: string
          package_id: string
          student_id: string
          total_original?: number
          total_paid?: number
        }
        Update: {
          created_at?: string
          discount_applied?: number
          id?: string
          package_id?: string
          student_id?: string
          total_original?: number
          total_paid?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundled_package_subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "bundled_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      bundled_packages: {
        Row: {
          category_keys: string[]
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          discount_amount: number | null
          discount_percentage: number
          discount_type: string
          education_type: string
          expires_at: string | null
          grade: string
          id: string
          image_url: string | null
          manual_final_price: number | null
          max_subscriptions: number | null
          name: string | null
          publish_at: string | null
          section: string | null
          stage: string
          status: string
          subscriptions_count: number
          updated_at: string
        }
        Insert: {
          category_keys?: string[]
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number
          discount_type?: string
          education_type: string
          expires_at?: string | null
          grade: string
          id?: string
          image_url?: string | null
          manual_final_price?: number | null
          max_subscriptions?: number | null
          name?: string | null
          publish_at?: string | null
          section?: string | null
          stage: string
          status?: string
          subscriptions_count?: number
          updated_at?: string
        }
        Update: {
          category_keys?: string[]
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number
          discount_type?: string
          education_type?: string
          expires_at?: string | null
          grade?: string
          id?: string
          image_url?: string | null
          manual_final_price?: number | null
          max_subscriptions?: number | null
          name?: string | null
          publish_at?: string | null
          section?: string | null
          stage?: string
          status?: string
          subscriptions_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      content: {
        Row: {
          created_at: string | null
          description: string | null
          duration: string | null
          education_type: string | null
          file_url: string
          group_id: string | null
          id: string
          is_active: boolean | null
          is_paid: boolean
          order_index: number | null
          page_count: number | null
          sub_subject: string | null
          sub_subject_id: string | null
          subject_id: string | null
          term: string
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration?: string | null
          education_type?: string | null
          file_url: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          is_paid?: boolean
          order_index?: number | null
          page_count?: number | null
          sub_subject?: string | null
          sub_subject_id?: string | null
          subject_id?: string | null
          term?: string
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration?: string | null
          education_type?: string | null
          file_url?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          is_paid?: boolean
          order_index?: number | null
          page_count?: number | null
          sub_subject?: string | null
          sub_subject_id?: string | null
          subject_id?: string | null
          term?: string
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_sub_subject_id_fkey"
            columns: ["sub_subject_id"]
            isOneToOne: false
            referencedRelation: "sub_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          education_type: string | null
          end_date: string | null
          id: string
          image_url: string | null
          is_active: boolean
          lesson_count: number | null
          month_label: string | null
          price: number
          price_approved: boolean | null
          section_name: string
          start_date: string | null
          subject_id: string
          teacher_id: string | null
          term: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          education_type?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          lesson_count?: number | null
          month_label?: string | null
          price?: number
          price_approved?: boolean | null
          section_name: string
          start_date?: string | null
          subject_id: string
          teacher_id?: string | null
          term?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          education_type?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          lesson_count?: number | null
          month_label?: string | null
          price?: number
          price_approved?: boolean | null
          section_name?: string
          start_date?: string | null
          subject_id?: string
          teacher_id?: string | null
          term?: string
          title?: string
        }
        Relationships: []
      }
      deposit_requests: {
        Row: {
          admin_message: string | null
          amount: number
          created_at: string
          id: string
          payment_method: string | null
          phone_number: string
          processed_at: string | null
          processed_by: string | null
          receipt_url: string
          rejection_reason: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          admin_message?: string | null
          amount: number
          created_at?: string
          id?: string
          payment_method?: string | null
          phone_number: string
          processed_at?: string | null
          processed_by?: string | null
          receipt_url: string
          rejection_reason?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          admin_message?: string | null
          amount?: number
          created_at?: string
          id?: string
          payment_method?: string | null
          phone_number?: string
          processed_at?: string | null
          processed_by?: string | null
          receipt_url?: string
          rejection_reason?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exam_attempts: {
        Row: {
          answers: Json
          essay_feedback: Json | null
          essay_scores: Json | null
          exam_id: string
          id: string
          is_graded: boolean
          score: number
          student_id: string
          submitted_at: string
          time_taken: number
          total: number
        }
        Insert: {
          answers?: Json
          essay_feedback?: Json | null
          essay_scores?: Json | null
          exam_id: string
          id?: string
          is_graded?: boolean
          score?: number
          student_id: string
          submitted_at?: string
          time_taken?: number
          total?: number
        }
        Update: {
          answers?: Json
          essay_feedback?: Json | null
          essay_scores?: Json | null
          exam_id?: string
          id?: string
          is_graded?: boolean
          score?: number
          student_id?: string
          submitted_at?: string
          time_taken?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number
          end_at: string | null
          group_id: string | null
          id: string
          is_ai_generated: boolean
          is_published: boolean
          questions: Json
          start_at: string | null
          subject_id: string
          term: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number
          end_at?: string | null
          group_id?: string | null
          id?: string
          is_ai_generated?: boolean
          is_published?: boolean
          questions?: Json
          start_at?: string | null
          subject_id: string
          term?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          end_at?: string | null
          group_id?: string | null
          id?: string
          is_ai_generated?: boolean
          is_published?: boolean
          questions?: Json
          start_at?: string | null
          subject_id?: string
          term?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          session_id: string
          student_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          session_id: string
          student_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_messages: {
        Row: {
          created_at: string
          id: string
          is_teacher: boolean
          message: string
          session_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_teacher?: boolean
          message: string
          session_id: string
          user_id: string
          user_name?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_teacher?: boolean
          message?: string
          session_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_recordings: {
        Row: {
          created_at: string
          duration: string | null
          group_id: string
          id: string
          session_id: string
          teacher_id: string
          title: string
          video_url: string
        }
        Insert: {
          created_at?: string
          duration?: string | null
          group_id: string
          id?: string
          session_id: string
          teacher_id: string
          title?: string
          video_url: string
        }
        Update: {
          created_at?: string
          duration?: string | null
          group_id?: string
          id?: string
          session_id?: string
          teacher_id?: string
          title?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          allow_student_camera: boolean
          allow_student_mic: boolean
          created_at: string
          ended_at: string | null
          group_id: string
          id: string
          room_name: string
          started_at: string
          status: string
          teacher_id: string
          title: string
          viewer_count: number
        }
        Insert: {
          allow_student_camera?: boolean
          allow_student_mic?: boolean
          created_at?: string
          ended_at?: string | null
          group_id: string
          id?: string
          room_name: string
          started_at?: string
          status?: string
          teacher_id: string
          title?: string
          viewer_count?: number
        }
        Update: {
          allow_student_camera?: boolean
          allow_student_mic?: boolean
          created_at?: string
          ended_at?: string | null
          group_id?: string
          id?: string
          room_name?: string
          started_at?: string
          status?: string
          teacher_id?: string
          title?: string
          viewer_count?: number
        }
        Relationships: []
      }
      notification_delivery_logs: {
        Row: {
          body: string | null
          created_at: string
          delivery_channel: string
          details: Json
          event_type: string
          id: string
          link: string | null
          notification_id: string | null
          notification_type: string | null
          source_id: string | null
          source_table: string | null
          status: string
          title: string | null
          token: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          delivery_channel?: string
          details?: Json
          event_type: string
          id?: string
          link?: string | null
          notification_id?: string | null
          notification_type?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string
          title?: string | null
          token?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          delivery_channel?: string
          details?: Json
          event_type?: string
          id?: string
          link?: string | null
          notification_id?: string | null
          notification_type?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string
          title?: string | null
          token?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_logs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_read: boolean | null
          is_sent: boolean | null
          link: string | null
          message: string
          notification_type: string | null
          scheduled_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_read?: boolean | null
          is_sent?: boolean | null
          link?: string | null
          message: string
          notification_type?: string | null
          scheduled_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_read?: boolean | null
          is_sent?: boolean | null
          link?: string | null
          message?: string
          notification_type?: string | null
          scheduled_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      price_change_requests: {
        Row: {
          admin_message: string | null
          created_at: string
          current_price: number
          group_id: string
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string
          requested_price: number
          status: string
          teacher_id: string
        }
        Insert: {
          admin_message?: string | null
          created_at?: string
          current_price: number
          group_id: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason: string
          requested_price: number
          status?: string
          teacher_id: string
        }
        Update: {
          admin_message?: string | null
          created_at?: string
          current_price?: number
          group_id?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          requested_price?: number
          status?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_change_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          commission_rate: number | null
          created_at: string | null
          education_type: string | null
          email: string
          full_name: string
          grade: string | null
          id: string
          is_banned: boolean | null
          pending_commission_rate: number | null
          pending_effective_date: string | null
          phone: string | null
          role: string | null
          section: string | null
          stage: string | null
          student_code: string | null
          teacher_code: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string | null
          education_type?: string | null
          email: string
          full_name: string
          grade?: string | null
          id: string
          is_banned?: boolean | null
          pending_commission_rate?: number | null
          pending_effective_date?: string | null
          phone?: string | null
          role?: string | null
          section?: string | null
          stage?: string | null
          student_code?: string | null
          teacher_code?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string | null
          education_type?: string | null
          email?: string
          full_name?: string
          grade?: string | null
          id?: string
          is_banned?: boolean | null
          pending_commission_rate?: number | null
          pending_effective_date?: string | null
          phone?: string | null
          role?: string | null
          section?: string | null
          stage?: string | null
          student_code?: string | null
          teacher_code?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recharge_code_uses: {
        Row: {
          code_id: string
          id: string
          used_at: string
          user_id: string
        }
        Insert: {
          code_id: string
          id?: string
          used_at?: string
          user_id: string
        }
        Update: {
          code_id?: string
          id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recharge_code_uses_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "recharge_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      recharge_codes: {
        Row: {
          amount: number
          code: string
          created_at: string
          created_by: string | null
          current_uses: number
          id: string
          is_active: boolean
          max_uses: number
        }
        Insert: {
          amount: number
          code: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number
        }
        Relationships: []
      }
      student_group_purchases: {
        Row: {
          activated_by_admin: boolean
          amount_paid: number | null
          group_id: string
          id: string
          purchased_at: string
          student_id: string
        }
        Insert: {
          activated_by_admin?: boolean
          amount_paid?: number | null
          group_id: string
          id?: string
          purchased_at?: string
          student_id: string
        }
        Update: {
          activated_by_admin?: boolean
          amount_paid?: number | null
          group_id?: string
          id?: string
          purchased_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_group_purchases_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      student_teacher_choices: {
        Row: {
          category: string
          created_at: string
          grade: string
          id: string
          stage: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          category: string
          created_at?: string
          grade: string
          id?: string
          stage: string
          student_id: string
          teacher_id: string
        }
        Update: {
          category?: string
          created_at?: string
          grade?: string
          id?: string
          stage?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: []
      }
      sub_subjects: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          group_id: string
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          order_index: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          group_id: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          order_index?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          group_id?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          order_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_subjects_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_default_prices: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          education_type: string
          grade: string
          id: string
          price: number
          section: string | null
          stage: string
          subject_name: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          education_type: string
          grade: string
          id?: string
          price?: number
          section?: string | null
          stage: string
          subject_name?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          education_type?: string
          grade?: string
          id?: string
          price?: number
          section?: string | null
          stage?: string
          subject_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          grade: string
          id: string
          is_active: boolean | null
          name: string
          section: string | null
          stage: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          grade: string
          id?: string
          is_active?: boolean | null
          name: string
          section?: string | null
          stage: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          grade?: string
          id?: string
          is_active?: boolean | null
          name?: string
          section?: string | null
          stage?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_messages: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          grade: string
          id: string
          includes_description: string | null
          price: string
          section: string | null
          stage: string
          updated_at: string | null
          welcome_message: string
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          grade: string
          id?: string
          includes_description?: string | null
          price: string
          section?: string | null
          stage: string
          updated_at?: string | null
          welcome_message: string
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          grade?: string
          id?: string
          includes_description?: string | null
          price?: string
          section?: string | null
          stage?: string
          updated_at?: string | null
          welcome_message?: string
        }
        Relationships: []
      }
      subscription_requests: {
        Row: {
          amount: string | null
          created_at: string | null
          id: string
          notes: string | null
          receipt_url: string
          status: string | null
          student_id: string | null
          subject_id: string | null
          teacher_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          receipt_url: string
          status?: string | null
          student_id?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          receipt_url?: string
          status?: string | null
          student_id?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          is_active: boolean
          notes: string | null
          renewal_count: number | null
          start_date: string
          student_id: string
          subject_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          notes?: string | null
          renewal_count?: number | null
          start_date?: string
          student_id: string
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          renewal_count?: number | null
          start_date?: string
          student_id?: string
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      support_internal_notes: {
        Row: {
          admin_id: string
          conversation_user_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          admin_id: string
          conversation_user_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          admin_id?: string
          conversation_user_id?: string
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_from_admin: boolean | null
          is_read: boolean | null
          is_resolved: boolean
          is_teacher_request: boolean
          message: string
          metadata: Json
          resolved_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_from_admin?: boolean | null
          is_read?: boolean | null
          is_resolved?: boolean
          is_teacher_request?: boolean
          message: string
          metadata?: Json
          resolved_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_from_admin?: boolean | null
          is_read?: boolean | null
          is_resolved?: boolean
          is_teacher_request?: boolean
          message?: string
          metadata?: Json
          resolved_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_terms: {
        Row: {
          current_term: string
          grade: string
          id: string
          stage: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          current_term?: string
          grade: string
          id?: string
          stage: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          current_term?: string
          grade?: string
          id?: string
          stage?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      teacher_activity_logs: {
        Row: {
          action_label: string
          action_type: string
          created_at: string
          duration_seconds: number | null
          id: string
          ip_address: string | null
          metadata: Json | null
          page_path: string | null
          teacher_id: string
          user_agent: string | null
        }
        Insert: {
          action_label: string
          action_type: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          page_path?: string | null
          teacher_id: string
          user_agent?: string | null
        }
        Update: {
          action_label?: string
          action_type?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          page_path?: string | null
          teacher_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      teacher_assignments: {
        Row: {
          category: string
          created_at: string | null
          education_type: string | null
          grade: string
          id: string
          section: string | null
          stage: string
          teacher_id: string
          teaches_integrated_science: boolean
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          education_type?: string | null
          grade: string
          id?: string
          section?: string | null
          stage: string
          teacher_id: string
          teaches_integrated_science?: boolean
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          education_type?: string | null
          grade?: string
          id?: string
          section?: string | null
          stage?: string
          teacher_id?: string
          teaches_integrated_science?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      teacher_commission_history: {
        Row: {
          applied: boolean
          applied_at: string | null
          changed_by: string | null
          created_at: string
          effective_date: string
          id: string
          new_rate: number
          note: string | null
          old_rate: number | null
          scheduled: boolean
          teacher_id: string
        }
        Insert: {
          applied?: boolean
          applied_at?: string | null
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          id?: string
          new_rate: number
          note?: string | null
          old_rate?: number | null
          scheduled?: boolean
          teacher_id: string
        }
        Update: {
          applied?: boolean
          applied_at?: string | null
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          id?: string
          new_rate?: number
          note?: string | null
          old_rate?: number | null
          scheduled?: boolean
          teacher_id?: string
        }
        Relationships: []
      }
      teacher_earning_records: {
        Row: {
          commission_rate: number
          created_at: string
          gross_amount: number
          group_id: string
          id: string
          is_archived: boolean
          is_frozen: boolean
          net_amount: number
          period_label: string
          purchase_id: string
          student_id: string
          subject_id: string | null
          teacher_id: string
        }
        Insert: {
          commission_rate: number
          created_at?: string
          gross_amount: number
          group_id: string
          id?: string
          is_archived?: boolean
          is_frozen?: boolean
          net_amount: number
          period_label: string
          purchase_id: string
          student_id: string
          subject_id?: string | null
          teacher_id: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          gross_amount?: number
          group_id?: string
          id?: string
          is_archived?: boolean
          is_frozen?: boolean
          net_amount?: number
          period_label?: string
          purchase_id?: string
          student_id?: string
          subject_id?: string | null
          teacher_id?: string
        }
        Relationships: []
      }
      teacher_messages: {
        Row: {
          created_at: string
          file_type: string | null
          file_url: string | null
          id: string
          is_from_teacher: boolean
          is_read: boolean
          message: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_from_teacher?: boolean
          is_read?: boolean
          message: string
          student_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_from_teacher?: boolean
          is_read?: boolean
          message?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: []
      }
      teacher_monthly_archives: {
        Row: {
          archived_at: string
          breakdown: Json
          commission_rate: number
          id: string
          period_end: string
          period_label: string
          period_start: string
          teacher_id: string
          total_earned: number
          total_groups: number
          total_subscribers: number
        }
        Insert: {
          archived_at?: string
          breakdown?: Json
          commission_rate: number
          id?: string
          period_end: string
          period_label: string
          period_start: string
          teacher_id: string
          total_earned?: number
          total_groups?: number
          total_subscribers?: number
        }
        Update: {
          archived_at?: string
          breakdown?: Json
          commission_rate?: number
          id?: string
          period_end?: string
          period_label?: string
          period_start?: string
          teacher_id?: string
          total_earned?: number
          total_groups?: number
          total_subscribers?: number
        }
        Relationships: []
      }
      teacher_payment_methods: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          method_type: string
          phone_number: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          method_type?: string
          phone_number: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          method_type?: string
          phone_number?: string
          teacher_id?: string
        }
        Relationships: []
      }
      teacher_profiles: {
        Row: {
          achievements: Json
          bio: string | null
          contact_links: Json
          cover_image_url: string | null
          created_at: string | null
          experience_years: number
          gallery_urls: string[]
          is_approved: boolean | null
          photo_url: string | null
          professional_title: string | null
          qualifications: Json
          teacher_id: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          achievements?: Json
          bio?: string | null
          contact_links?: Json
          cover_image_url?: string | null
          created_at?: string | null
          experience_years?: number
          gallery_urls?: string[]
          is_approved?: boolean | null
          photo_url?: string | null
          professional_title?: string | null
          qualifications?: Json
          teacher_id: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          achievements?: Json
          bio?: string | null
          contact_links?: Json
          cover_image_url?: string | null
          created_at?: string | null
          experience_years?: number
          gallery_urls?: string[]
          is_approved?: boolean | null
          photo_url?: string | null
          professional_title?: string | null
          qualifications?: Json
          teacher_id?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      teacher_requests: {
        Row: {
          assigned_category: string | null
          assigned_grades: string[] | null
          assigned_sections: string[] | null
          assigned_stages: string[] | null
          created_at: string | null
          education_type: string | null
          email: string
          employee_id: string | null
          full_name: string
          id: string
          phone: string | null
          proof_document_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_name: string | null
          status: Database["public"]["Enums"]["approval_status"] | null
          teaches_integrated_science: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_category?: string | null
          assigned_grades?: string[] | null
          assigned_sections?: string[] | null
          assigned_stages?: string[] | null
          created_at?: string | null
          education_type?: string | null
          email: string
          employee_id?: string | null
          full_name: string
          id?: string
          phone?: string | null
          proof_document_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_name?: string | null
          status?: Database["public"]["Enums"]["approval_status"] | null
          teaches_integrated_science?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_category?: string | null
          assigned_grades?: string[] | null
          assigned_sections?: string[] | null
          assigned_stages?: string[] | null
          created_at?: string | null
          education_type?: string | null
          email?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          proof_document_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_name?: string | null
          status?: Database["public"]["Enums"]["approval_status"] | null
          teaches_integrated_science?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      teacher_schedules: {
        Row: {
          created_at: string
          day_of_week: string
          id: string
          teacher_id: string
          time_slot: string
        }
        Insert: {
          created_at?: string
          day_of_week: string
          id?: string
          teacher_id: string
          time_slot: string
        }
        Update: {
          created_at?: string
          day_of_week?: string
          id?: string
          teacher_id?: string
          time_slot?: string
        }
        Relationships: []
      }
      teacher_wallet_transactions: {
        Row: {
          admin_id: string | null
          admin_message: string | null
          amount: number
          balance_after: number | null
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          teacher_id: string
          transaction_type: string
        }
        Insert: {
          admin_id?: string | null
          admin_message?: string | null
          amount: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          teacher_id: string
          transaction_type: string
        }
        Update: {
          admin_id?: string | null
          admin_message?: string | null
          amount?: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          teacher_id?: string
          transaction_type?: string
        }
        Relationships: []
      }
      teacher_wallets: {
        Row: {
          balance: number
          created_at: string
          current_period: string
          frozen_balance: number
          id: string
          teacher_id: string
          total_earned: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          current_period?: string
          frozen_balance?: number
          id?: string
          teacher_id: string
          total_earned?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          current_period?: string
          frozen_balance?: number
          id?: string
          teacher_id?: string
          total_earned?: number
          updated_at?: string
        }
        Relationships: []
      }
      teacher_withdrawal_requests: {
        Row: {
          admin_message: string | null
          amount: number
          created_at: string
          id: string
          payment_method: string
          phone_number: string
          processed_at: string | null
          processed_by: string | null
          status: string
          teacher_id: string
          transfer_receipt_url: string | null
        }
        Insert: {
          admin_message?: string | null
          amount: number
          created_at?: string
          id?: string
          payment_method?: string
          phone_number: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          teacher_id: string
          transfer_receipt_url?: string | null
        }
        Update: {
          admin_message?: string | null
          amount?: number
          created_at?: string
          id?: string
          payment_method?: string
          phone_number?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          teacher_id?: string
          transfer_receipt_url?: string | null
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          action: string
          content_id: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          content_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          content_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_progress: {
        Row: {
          content_id: string
          duration_seconds: number
          id: string
          progress_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          content_id: string
          duration_seconds?: number
          id?: string
          progress_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          content_id?: string
          duration_seconds?: number
          id?: string
          progress_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_progress_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_adjustments: {
        Row: {
          admin_id: string
          amount: number
          created_at: string
          id: string
          reason: string | null
          student_id: string
          type: string
        }
        Insert: {
          admin_id: string
          amount: number
          created_at?: string
          id?: string
          reason?: string | null
          student_id: string
          type?: string
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string
          id?: string
          reason?: string | null
          student_id?: string
          type?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ad_targets_safe: {
        Row: {
          ad_id: string | null
          created_at: string | null
          education_type: string | null
          grade: string | null
          id: string | null
          section: string | null
          stage: string | null
          student_ids: string[] | null
          target_type: Database["public"]["Enums"]["ad_target_type"] | null
        }
        Insert: {
          ad_id?: string | null
          created_at?: string | null
          education_type?: string | null
          grade?: string | null
          id?: string | null
          section?: string | null
          stage?: string | null
          student_ids?: never
          target_type?: Database["public"]["Enums"]["ad_target_type"] | null
        }
        Update: {
          ad_id?: string | null
          created_at?: string | null
          education_type?: string | null
          grade?: string | null
          id?: string | null
          section?: string | null
          stage?: string | null
          student_ids?: never
          target_type?: Database["public"]["Enums"]["ad_target_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_targets_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_adjust_teacher_wallet: {
        Args: {
          _admin_message?: string
          _amount: number
          _description?: string
          _teacher_id: string
          _transaction_type: string
        }
        Returns: Json
      }
      admin_set_teacher_commission: {
        Args: {
          _effective_date?: string
          _new_rate: number
          _note?: string
          _teacher_id: string
        }
        Returns: Json
      }
      apply_default_price_to_existing_groups: {
        Args: {
          p_category: string
          p_education_type: string
          p_grade: string
          p_price: number
          p_section: string
          p_stage: string
          p_subject_name: string
        }
        Returns: number
      }
      apply_pending_commissions: { Args: never; Returns: Json }
      archive_all_teachers_period: { Args: never; Returns: Json }
      archive_teacher_period: { Args: { _teacher_id: string }; Returns: Json }
      auto_archive_if_due: { Args: never; Returns: Json }
      broadcast_notification: {
        Args: {
          _link?: string
          _message: string
          _scheduled_at?: string
          _title: string
        }
        Returns: Json
      }
      bundle_category_matches_subject: {
        Args: {
          _category_key: string
          _subject_category: string
          _subject_name: string
        }
        Returns: boolean
      }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      complete_user_profile: {
        Args: {
          _full_name: string
          _phone: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      compute_bundle_price: { Args: { _package_id: string }; Returns: Json }
      dispatch_notification_push: {
        Args: {
          p_body: string
          p_link?: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      generate_student_code: { Args: never; Returns: string }
      generate_unique_teacher_code: { Args: never; Returns: string }
      get_default_sub_subject_names: {
        Args: {
          p_category: string
          p_grade: string
          p_section?: string
          p_stage: string
          p_subject_name?: string
        }
        Returns: string[]
      }
      get_effective_teacher_commission: {
        Args: { _teacher_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purchase_bundle_by_categories: {
        Args: { _package_id: string; _selections: Json }
        Returns: Json
      }
      purchase_bundled_package: {
        Args: { _package_id: string; _selections: Json }
        Returns: Json
      }
      purchase_group_with_wallet: {
        Args: { p_group_id: string }
        Returns: Json
      }
      redeem_recharge_code: {
        Args: { _code_text: string; _user_id: string }
        Returns: Json
      }
      request_external_sync: {
        Args: { sync_scope?: string }
        Returns: undefined
      }
      set_support_resolution: {
        Args: { _resolved: boolean; _user_id: string }
        Returns: Json
      }
      teacher_request_withdrawal: {
        Args: {
          _amount: number
          _payment_method: string
          _phone_number: string
        }
        Returns: Json
      }
      validate_recharge_code: {
        Args: { code_text: string }
        Returns: {
          amount: number
          id: string
          is_valid: boolean
        }[]
      }
    }
    Enums: {
      ad_link_type: "none" | "external" | "internal"
      ad_target_type:
        | "all"
        | "stage"
        | "grade"
        | "section"
        | "specific_students"
      ad_type:
        | "teachers"
        | "subjects"
        | "discounts"
        | "info"
        | "updates"
        | "general"
      app_role: "admin" | "teacher" | "student" | "support"
      approval_status: "pending" | "approved" | "rejected"
      bundles_placement: "hidden" | "sidebar" | "ad_slider" | "homepage_banner"
      question_type: "mcq" | "true_false" | "essay"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ad_link_type: ["none", "external", "internal"],
      ad_target_type: ["all", "stage", "grade", "section", "specific_students"],
      ad_type: [
        "teachers",
        "subjects",
        "discounts",
        "info",
        "updates",
        "general",
      ],
      app_role: ["admin", "teacher", "student", "support"],
      approval_status: ["pending", "approved", "rejected"],
      bundles_placement: ["hidden", "sidebar", "ad_slider", "homepage_banner"],
      question_type: ["mcq", "true_false", "essay"],
    },
  },
} as const
