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
    PostgrestVersion: "14.17"
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
      admin_overview_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_closing: boolean
          kind: string
          notes: string | null
          period_end: string | null
          period_label: string
          period_start: string | null
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_closing?: boolean
          kind?: string
          notes?: string | null
          period_end?: string | null
          period_label: string
          period_start?: string | null
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_closing?: boolean
          kind?: string
          notes?: string | null
          period_end?: string | null
          period_label?: string
          period_start?: string | null
          snapshot?: Json
        }
        Relationships: []
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
      ai_gateway_providers: {
        Row: {
          api_key_env: string
          base_url: string
          is_active: boolean
          label: string
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_key_env: string
          base_url: string
          is_active?: boolean
          label: string
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_key_env?: string
          base_url?: string
          is_active?: boolean
          label?: string
          provider?: string
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
      ai_models: {
        Row: {
          code: string
          context_tokens: number | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          metadata: Json
          name: string
          provider_id: string
          updated_at: string
          use_case: Database["public"]["Enums"]["ai_model_use_case"]
        }
        Insert: {
          code: string
          context_tokens?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name: string
          provider_id: string
          updated_at?: string
          use_case: Database["public"]["Enums"]["ai_model_use_case"]
        }
        Update: {
          code?: string
          context_tokens?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json
          name?: string
          provider_id?: string
          updated_at?: string
          use_case?: Database["public"]["Enums"]["ai_model_use_case"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_function_settings: {
        Row: {
          enable_streaming: boolean
          fallback_delay_ms: number
          function_name: string
          max_retries: number
          models_to_try: string[]
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enable_streaming?: boolean
          fallback_delay_ms?: number
          function_name: string
          max_retries?: number
          models_to_try?: string[]
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enable_streaming?: boolean
          fallback_delay_ms?: number
          function_name?: string
          max_retries?: number
          models_to_try?: string[]
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_function_settings_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "ai_gateway_providers"
            referencedColumns: ["provider"]
          },
        ]
      }
      ai_providers: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_rate_limit_events: {
        Row: {
          created_at: string
          function_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_rate_limits: {
        Row: {
          daily_limit: number
          enabled: boolean
          feature: string
          per_minute_limit: number
          updated_at: string
        }
        Insert: {
          daily_limit?: number
          enabled?: boolean
          feature: string
          per_minute_limit?: number
          updated_at?: string
        }
        Update: {
          daily_limit?: number
          enabled?: boolean
          feature?: string
          per_minute_limit?: number
          updated_at?: string
        }
        Relationships: []
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
      ai_usage_counters: {
        Row: {
          day_count: number
          feature: string
          minute_bucket: string
          minute_count: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          day_count?: number
          feature: string
          minute_bucket?: string
          minute_count?: number
          updated_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          day_count?: number
          feature?: string
          minute_bucket?: string
          minute_count?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
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
      automated_messages: {
        Row: {
          created_at: string
          created_by: string | null
          delay_minutes: number
          event_key: string
          extra_filter: Json
          id: string
          is_active: boolean
          last_run_at: string | null
          link_template: string | null
          message_template: string
          name: string
          notification_type: string
          recipient_mode: string
          run_count: number
          title_template: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delay_minutes?: number
          event_key: string
          extra_filter?: Json
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          link_template?: string | null
          message_template: string
          name: string
          notification_type?: string
          recipient_mode?: string
          run_count?: number
          title_template: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delay_minutes?: number
          event_key?: string
          extra_filter?: Json
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          link_template?: string | null
          message_template?: string
          name?: string
          notification_type?: string
          recipient_mode?: string
          run_count?: number
          title_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_id: string | null
          created_at: string
          error_message: string | null
          event_key: string
          event_payload: Json
          id: string
          recipients_count: number
          status: string
        }
        Insert: {
          automation_id?: string | null
          created_at?: string
          error_message?: string | null
          event_key: string
          event_payload?: Json
          id?: string
          recipients_count?: number
          status?: string
        }
        Update: {
          automation_id?: string | null
          created_at?: string
          error_message?: string | null
          event_key?: string
          event_payload?: Json
          id?: string
          recipients_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automated_messages"
            referencedColumns: ["id"]
          },
        ]
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
          is_free_preview: boolean
          is_paid: boolean
          order_index: number | null
          page_count: number | null
          sub_subject: string | null
          sub_subject_id: string | null
          subject_id: string | null
          target_section: string | null
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
          is_free_preview?: boolean
          is_paid?: boolean
          order_index?: number | null
          page_count?: number | null
          sub_subject?: string | null
          sub_subject_id?: string | null
          subject_id?: string | null
          target_section?: string | null
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
          is_free_preview?: boolean
          is_paid?: boolean
          order_index?: number | null
          page_count?: number | null
          sub_subject?: string | null
          sub_subject_id?: string | null
          subject_id?: string | null
          target_section?: string | null
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
      content_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          embedding_model_id: string | null
          id: string
          metadata: Json
          ordinal: number
          search_tsv: unknown
          source_id: string
          token_count: number | null
          unit_id: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          embedding_model_id?: string | null
          id?: string
          metadata?: Json
          ordinal?: number
          search_tsv?: unknown
          source_id: string
          token_count?: number | null
          unit_id?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_model_id?: string | null
          id?: string
          metadata?: Json
          ordinal?: number
          search_tsv?: unknown
          source_id?: string
          token_count?: number | null
          unit_id?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_chunks_embedding_model_id_fkey"
            columns: ["embedding_model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_chunks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "knowledge_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_chunks_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
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
          weekly_schedule: Json
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
          weekly_schedule?: Json
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
          weekly_schedule?: Json
        }
        Relationships: []
      }
      deletion_audit_logs: {
        Row: {
          action_type: string
          actor_email: string | null
          actor_id: string | null
          bunny_details: Json
          bunny_failed: number
          bunny_success: number
          bunny_total: number
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          status: string
          target_id: string | null
          target_label: string | null
          target_meta: Json
        }
        Insert: {
          action_type: string
          actor_email?: string | null
          actor_id?: string | null
          bunny_details?: Json
          bunny_failed?: number
          bunny_success?: number
          bunny_total?: number
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          status?: string
          target_id?: string | null
          target_label?: string | null
          target_meta?: Json
        }
        Update: {
          action_type?: string
          actor_email?: string | null
          actor_id?: string | null
          bunny_details?: Json
          bunny_failed?: number
          bunny_success?: number
          bunny_total?: number
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          status?: string
          target_id?: string | null
          target_label?: string | null
          target_meta?: Json
        }
        Relationships: []
      }
      deposit_requests: {
        Row: {
          admin_message: string | null
          amount: number
          created_at: string
          deposit_type: string
          id: string
          notes: string | null
          payment_method: string | null
          phone_number: string | null
          processed_at: string | null
          processed_by: string | null
          receipt_url: string | null
          recharge_code: string | null
          recharge_code_id: string | null
          rejection_reason: string | null
          status: string
          student_id: string
          updated_at: string
          wallet_adjustment_id: string | null
        }
        Insert: {
          admin_message?: string | null
          amount: number
          created_at?: string
          deposit_type?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          phone_number?: string | null
          processed_at?: string | null
          processed_by?: string | null
          receipt_url?: string | null
          recharge_code?: string | null
          recharge_code_id?: string | null
          rejection_reason?: string | null
          status?: string
          student_id: string
          updated_at?: string
          wallet_adjustment_id?: string | null
        }
        Update: {
          admin_message?: string | null
          amount?: number
          created_at?: string
          deposit_type?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          phone_number?: string | null
          processed_at?: string | null
          processed_by?: string | null
          receipt_url?: string | null
          recharge_code?: string | null
          recharge_code_id?: string | null
          rejection_reason?: string | null
          status?: string
          student_id?: string
          updated_at?: string
          wallet_adjustment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_requests_recharge_code_id_fkey"
            columns: ["recharge_code_id"]
            isOneToOne: false
            referencedRelation: "recharge_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_requests_wallet_adjustment_id_fkey"
            columns: ["wallet_adjustment_id"]
            isOneToOne: false
            referencedRelation: "wallet_adjustments"
            referencedColumns: ["id"]
          },
        ]
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      exam_answers: {
        Row: {
          ai_feedback: string | null
          answer_text: string | null
          answered_at: string
          attempt_id: string
          auto_graded: boolean
          flagged_for_review: boolean
          id: string
          is_correct: boolean | null
          marks_awarded: number
          question_id: string
          selected_option_ids: string[]
          time_spent_seconds: number
        }
        Insert: {
          ai_feedback?: string | null
          answer_text?: string | null
          answered_at?: string
          attempt_id: string
          auto_graded?: boolean
          flagged_for_review?: boolean
          id?: string
          is_correct?: boolean | null
          marks_awarded?: number
          question_id: string
          selected_option_ids?: string[]
          time_spent_seconds?: number
        }
        Update: {
          ai_feedback?: string | null
          answer_text?: string | null
          answered_at?: string
          attempt_id?: string
          auto_graded?: boolean
          flagged_for_review?: boolean
          id?: string
          is_correct?: boolean | null
          marks_awarded?: number
          question_id?: string
          selected_option_ids?: string[]
          time_spent_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempt_debug_logs: {
        Row: {
          attempt_id: string | null
          created_at: string
          exam_id: string | null
          id: string
          payload: Json
          stage: string
          student_id: string | null
          trace_id: string
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          payload?: Json
          stage: string
          student_id?: string | null
          trace_id?: string
        }
        Update: {
          attempt_id?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          payload?: Json
          stage?: string
          student_id?: string | null
          trace_id?: string
        }
        Relationships: []
      }
      exam_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          created_at: string
          exam_id: string
          fullscreen_exit_count: number
          fullscreen_exits: number
          graded_at: string | null
          graded_by: string | null
          id: string
          is_graded: boolean
          max_score: number
          passed: boolean
          percentage: number
          started_at: string
          status: Database["public"]["Enums"]["exam_attempt_status"]
          student_id: string
          submitted_at: string | null
          suspicious_activity: Json
          tab_switch_count: number
          time_spent_seconds: number
          total_score: number
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          exam_id: string
          fullscreen_exit_count?: number
          fullscreen_exits?: number
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_graded?: boolean
          max_score?: number
          passed?: boolean
          percentage?: number
          started_at?: string
          status?: Database["public"]["Enums"]["exam_attempt_status"]
          student_id: string
          submitted_at?: string | null
          suspicious_activity?: Json
          tab_switch_count?: number
          time_spent_seconds?: number
          total_score?: number
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          exam_id?: string
          fullscreen_exit_count?: number
          fullscreen_exits?: number
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_graded?: boolean
          max_score?: number
          passed?: boolean
          percentage?: number
          started_at?: string
          status?: Database["public"]["Enums"]["exam_attempt_status"]
          student_id?: string
          submitted_at?: string | null
          suspicious_activity?: Json
          tab_switch_count?: number
          time_spent_seconds?: number
          total_score?: number
          updated_at?: string
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
      exam_drafts: {
        Row: {
          answers: Json
          attempt_id: string | null
          current_question_index: number
          exam_id: string
          id: string
          last_saved_at: string
          student_id: string
        }
        Insert: {
          answers?: Json
          attempt_id?: string | null
          current_question_index?: number
          exam_id: string
          id?: string
          last_saved_at?: string
          student_id: string
        }
        Update: {
          answers?: Json
          attempt_id?: string | null
          current_question_index?: number
          exam_id?: string
          id?: string
          last_saved_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_drafts_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_drafts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_question_options: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_correct: boolean
          option_text: string
          order_index: number
          question_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_correct?: boolean
          option_text: string
          order_index?: number
          question_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_correct?: boolean
          option_text?: string
          order_index?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          correct_answer: string | null
          created_at: string
          difficulty: Database["public"]["Enums"]["exam_difficulty"]
          exam_id: string
          explanation: string | null
          id: string
          image_url: string | null
          marks: number
          order_index: number
          question_text: string
          question_type: Database["public"]["Enums"]["exam_question_type"]
          updated_at: string
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["exam_difficulty"]
          exam_id: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          marks?: number
          order_index?: number
          question_text: string
          question_type?: Database["public"]["Enums"]["exam_question_type"]
          updated_at?: string
        }
        Update: {
          correct_answer?: string | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["exam_difficulty"]
          exam_id?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          marks?: number
          order_index?: number
          question_text?: string
          question_type?: Database["public"]["Enums"]["exam_question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_statistics: {
        Row: {
          average_percentage: number
          best_subject: string | null
          by_subject: Json
          student_id: string
          total_exams_taken: number
          total_passed: number
          total_time_spent_seconds: number
          updated_at: string
          weakest_subject: string | null
        }
        Insert: {
          average_percentage?: number
          best_subject?: string | null
          by_subject?: Json
          student_id: string
          total_exams_taken?: number
          total_passed?: number
          total_time_spent_seconds?: number
          updated_at?: string
          weakest_subject?: string | null
        }
        Update: {
          average_percentage?: number
          best_subject?: string | null
          by_subject?: Json
          student_id?: string
          total_exams_taken?: number
          total_passed?: number
          total_time_spent_seconds?: number
          updated_at?: string
          weakest_subject?: string | null
        }
        Relationships: []
      }
      exams: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          difficulty: Database["public"]["Enums"]["exam_difficulty"]
          duration_minutes: number
          end_at: string | null
          group_id: string | null
          id: string
          instructions: string | null
          is_ai_generated: boolean
          is_published: boolean
          max_attempts: number
          max_cheat_exits: number
          owner_student_id: string | null
          pass_marks: number
          prevent_copy_paste: boolean
          prevent_reload: boolean
          prevent_tab_switch: boolean
          random_snapshots: boolean
          require_fullscreen: boolean
          show_correct_answers: boolean
          show_results_immediately: boolean
          shuffle_options: boolean
          shuffle_questions: boolean
          source: string
          start_at: string | null
          status: Database["public"]["Enums"]["exam_status"]
          sub_subject_id: string | null
          subject_id: string
          target_education_type: string | null
          target_section: string | null
          teacher_id: string | null
          term: string
          title: string
          total_attempts_count: number
          total_marks: number
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["exam_difficulty"]
          duration_minutes?: number
          end_at?: string | null
          group_id?: string | null
          id?: string
          instructions?: string | null
          is_ai_generated?: boolean
          is_published?: boolean
          max_attempts?: number
          max_cheat_exits?: number
          owner_student_id?: string | null
          pass_marks?: number
          prevent_copy_paste?: boolean
          prevent_reload?: boolean
          prevent_tab_switch?: boolean
          random_snapshots?: boolean
          require_fullscreen?: boolean
          show_correct_answers?: boolean
          show_results_immediately?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          source?: string
          start_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          sub_subject_id?: string | null
          subject_id: string
          target_education_type?: string | null
          target_section?: string | null
          teacher_id?: string | null
          term?: string
          title: string
          total_attempts_count?: number
          total_marks?: number
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["exam_difficulty"]
          duration_minutes?: number
          end_at?: string | null
          group_id?: string | null
          id?: string
          instructions?: string | null
          is_ai_generated?: boolean
          is_published?: boolean
          max_attempts?: number
          max_cheat_exits?: number
          owner_student_id?: string | null
          pass_marks?: number
          prevent_copy_paste?: boolean
          prevent_reload?: boolean
          prevent_tab_switch?: boolean
          random_snapshots?: boolean
          require_fullscreen?: boolean
          show_correct_answers?: boolean
          show_results_immediately?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          source?: string
          start_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          sub_subject_id?: string | null
          subject_id?: string
          target_education_type?: string | null
          target_section?: string | null
          teacher_id?: string | null
          term?: string
          title?: string
          total_attempts_count?: number
          total_marks?: number
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
            foreignKeyName: "exams_sub_subject_id_fkey"
            columns: ["sub_subject_id"]
            isOneToOne: false
            referencedRelation: "sub_subjects"
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
      financial_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          amount: number | null
          created_at: string
          id: string
          metadata: Json
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          target_teacher_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_teacher_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          amount?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_teacher_id?: string | null
        }
        Relationships: []
      }
      group_lesson_reminder_log: {
        Row: {
          created_at: string
          group_id: string
          id: string
          occurrence_at: string
          recipients: number
          schedule_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          occurrence_at: string
          recipients?: number
          schedule_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          occurrence_at?: string
          recipients?: number
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_lesson_reminder_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_lesson_reminder_log_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "group_weekly_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      group_weekly_schedule: {
        Row: {
          created_at: string
          day_of_week: string
          group_id: string
          id: string
          is_active: boolean
          time: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: string
          group_id: string
          id?: string
          is_active?: boolean
          time: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: string
          group_id?: string
          id?: string
          is_active?: boolean
          time?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_weekly_schedule_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_lesson_index: {
        Row: {
          created_at: string
          id: string
          kind: string
          lesson_number: number | null
          normalized_title: string | null
          number_source: string
          ordinal: number
          page_end: number | null
          page_start: number | null
          parent_unit_id: string | null
          source_id: string
          title: string
          unit_id: string | null
          unit_number: number | null
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          lesson_number?: number | null
          normalized_title?: string | null
          number_source?: string
          ordinal?: number
          page_end?: number | null
          page_start?: number | null
          parent_unit_id?: string | null
          source_id: string
          title: string
          unit_id?: string | null
          unit_number?: number | null
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          lesson_number?: number | null
          normalized_title?: string | null
          number_source?: string
          ordinal?: number
          page_end?: number | null
          page_start?: number | null
          parent_unit_id?: string | null
          source_id?: string
          title?: string
          unit_id?: string | null
          unit_number?: number | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_lesson_index_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_lesson_index_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "knowledge_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_lesson_index_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_page_state: {
        Row: {
          char_count: number
          chunk_status: string
          content_hash: string | null
          created_at: string
          embedding_status: string
          error_category: string | null
          error_message: string | null
          extraction_status: string
          extractor: string | null
          id: string
          ocr_status: string
          page_number: number
          page_to: number | null
          retry_count: number
          updated_at: string
          version_id: string
        }
        Insert: {
          char_count?: number
          chunk_status?: string
          content_hash?: string | null
          created_at?: string
          embedding_status?: string
          error_category?: string | null
          error_message?: string | null
          extraction_status?: string
          extractor?: string | null
          id?: string
          ocr_status?: string
          page_number: number
          page_to?: number | null
          retry_count?: number
          updated_at?: string
          version_id: string
        }
        Update: {
          char_count?: number
          chunk_status?: string
          content_hash?: string | null
          created_at?: string
          embedding_status?: string
          error_category?: string | null
          error_message?: string | null
          extraction_status?: string
          extractor?: string | null
          id?: string
          ocr_status?: string
          page_number?: number
          page_to?: number | null
          retry_count?: number
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_page_state_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_pdf_parts: {
        Row: {
          asset_id: string | null
          byte_size: number | null
          created_at: string
          error_message: string | null
          id: string
          object_path: string | null
          page_from: number
          page_to: number
          part_index: number
          status: string
          updated_at: string
          version_id: string
        }
        Insert: {
          asset_id?: string | null
          byte_size?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          object_path?: string | null
          page_from: number
          page_to: number
          part_index: number
          status?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          asset_id?: string | null
          byte_size?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          object_path?: string | null
          page_from?: number
          page_to?: number
          part_index?: number
          status?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_pdf_parts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_pdf_parts_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_source_assets: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          ordinal: number
          role: string
          source_id: string
          unit_id: string | null
          updated_at: string
          version_id: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          ordinal?: number
          role?: string
          source_id: string
          unit_id?: string | null
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          ordinal?: number
          role?: string
          source_id?: string
          unit_id?: string | null
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_source_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_source_assets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_source_assets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "knowledge_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_source_assets_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_source_types: {
        Row: {
          code: string
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name_ar: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_source_versions: {
        Row: {
          created_at: string
          created_by: string | null
          credits_blocked_at: string | null
          credits_blocked_reason: string | null
          error_message: string | null
          extracted_language: string | null
          extracted_text: string | null
          failed_pages: Json
          id: string
          is_current: boolean
          notes: string | null
          page_count: number | null
          pages_failed: number
          pages_processed: number
          pages_total: number | null
          pipeline_completed_at: string | null
          pipeline_health: string | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          pipeline_started_at: string | null
          progress_pct: number
          source_id: string
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credits_blocked_at?: string | null
          credits_blocked_reason?: string | null
          error_message?: string | null
          extracted_language?: string | null
          extracted_text?: string | null
          failed_pages?: Json
          id?: string
          is_current?: boolean
          notes?: string | null
          page_count?: number | null
          pages_failed?: number
          pages_processed?: number
          pages_total?: number | null
          pipeline_completed_at?: string | null
          pipeline_health?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          pipeline_started_at?: string | null
          progress_pct?: number
          source_id: string
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credits_blocked_at?: string | null
          credits_blocked_reason?: string | null
          error_message?: string | null
          extracted_language?: string | null
          extracted_text?: string | null
          failed_pages?: Json
          id?: string
          is_current?: boolean
          notes?: string | null
          page_count?: number | null
          pages_failed?: number
          pages_processed?: number
          pages_total?: number | null
          pipeline_completed_at?: string | null
          pipeline_health?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          pipeline_started_at?: string | null
          progress_pct?: number
          source_id?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_source_versions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          author: string | null
          cover_asset_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          grade_id: string | null
          id: string
          language: string
          metadata: Json
          publication_year: number | null
          publisher: string | null
          section_id: string | null
          slug: string | null
          source_type_id: string
          stage_id: string | null
          status: Database["public"]["Enums"]["knowledge_source_status"]
          sub_subject_id: string | null
          subject_id: string | null
          term: number | null
          title: string
          track_id: string | null
          updated_at: string
        }
        Insert: {
          author?: string | null
          cover_asset_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          grade_id?: string | null
          id?: string
          language?: string
          metadata?: Json
          publication_year?: number | null
          publisher?: string | null
          section_id?: string | null
          slug?: string | null
          source_type_id: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["knowledge_source_status"]
          sub_subject_id?: string | null
          subject_id?: string | null
          term?: number | null
          title: string
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          author?: string | null
          cover_asset_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          grade_id?: string | null
          id?: string
          language?: string
          metadata?: Json
          publication_year?: number | null
          publisher?: string | null
          section_id?: string | null
          slug?: string | null
          source_type_id?: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["knowledge_source_status"]
          sub_subject_id?: string | null
          subject_id?: string | null
          term?: number | null
          title?: string
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_cover_asset_fk"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "library_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "library_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_source_type_id_fkey"
            columns: ["source_type_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "library_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_sub_subject_id_fkey"
            columns: ["sub_subject_id"]
            isOneToOne: false
            referencedRelation: "library_sub_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "library_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "library_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_tag_map: {
        Row: {
          created_at: string
          source_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          source_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          source_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_tag_map_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_tag_map_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "knowledge_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name_ar: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name_ar: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name_ar?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_units: {
        Row: {
          confidence: number | null
          content_text: string | null
          created_at: string
          formula_count: number | null
          id: string
          image_count: number | null
          kind: Database["public"]["Enums"]["knowledge_unit_kind"]
          language: string | null
          metadata: Json
          ordinal: number
          page_from: number | null
          page_to: number | null
          parent_id: string | null
          title: string | null
          updated_at: string
          version_id: string
          word_count: number | null
        }
        Insert: {
          confidence?: number | null
          content_text?: string | null
          created_at?: string
          formula_count?: number | null
          id?: string
          image_count?: number | null
          kind: Database["public"]["Enums"]["knowledge_unit_kind"]
          language?: string | null
          metadata?: Json
          ordinal?: number
          page_from?: number | null
          page_to?: number | null
          parent_id?: string | null
          title?: string | null
          updated_at?: string
          version_id: string
          word_count?: number | null
        }
        Update: {
          confidence?: number | null
          content_text?: string | null
          created_at?: string
          formula_count?: number | null
          id?: string
          image_count?: number | null
          kind?: Database["public"]["Enums"]["knowledge_unit_kind"]
          language?: string | null
          metadata?: Json
          ordinal?: number
          page_from?: number | null
          page_to?: number | null
          parent_id?: string | null
          title?: string | null
          updated_at?: string
          version_id?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "knowledge_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_units_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      library_access_tiers: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name_ar: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
        }
        Relationships: []
      }
      library_book_chunks: {
        Row: {
          book_id: string
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          page_number: number
          token_count: number | null
          updated_at: string
        }
        Insert: {
          book_id: string
          chunk_index: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          page_number: number
          token_count?: number | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          page_number?: number
          token_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_book_chunks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
        ]
      }
      library_book_conversations: {
        Row: {
          book_id: string
          created_at: string
          current_page: number | null
          current_section_id: string | null
          id: string
          last_index_id: string | null
          last_message_at: string
          student_id: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          current_page?: number | null
          current_section_id?: string | null
          id?: string
          last_index_id?: string | null
          last_message_at?: string
          student_id: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          current_page?: number | null
          current_section_id?: string | null
          id?: string
          last_index_id?: string | null
          last_message_at?: string
          student_id?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_book_conversations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_book_conversations_current_section_id_fkey"
            columns: ["current_section_id"]
            isOneToOne: false
            referencedRelation: "library_book_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_book_conversations_last_index_id_fkey"
            columns: ["last_index_id"]
            isOneToOne: false
            referencedRelation: "library_book_index"
            referencedColumns: ["id"]
          },
        ]
      }
      library_book_index: {
        Row: {
          book_id: string
          created_at: string
          embedding: string | null
          id: string
          keywords: string[]
          kind: string
          order_index: number
          page_end: number
          page_start: number
          parent_id: string | null
          summary: string | null
          title: string
        }
        Insert: {
          book_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          keywords?: string[]
          kind?: string
          order_index?: number
          page_end: number
          page_start: number
          parent_id?: string | null
          summary?: string | null
          title: string
        }
        Update: {
          book_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          keywords?: string[]
          kind?: string
          order_index?: number
          page_end?: number
          page_start?: number
          parent_id?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_book_index_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_book_index_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "library_book_index"
            referencedColumns: ["id"]
          },
        ]
      }
      library_book_pages: {
        Row: {
          book_id: string
          created_at: string
          embedding: string | null
          height: number | null
          id: string
          image_path: string | null
          keywords: string[]
          ocr_confidence: number | null
          ocr_text: string | null
          page_number: number
          page_summary: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          book_id: string
          created_at?: string
          embedding?: string | null
          height?: number | null
          id?: string
          image_path?: string | null
          keywords?: string[]
          ocr_confidence?: number | null
          ocr_text?: string | null
          page_number: number
          page_summary?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          book_id?: string
          created_at?: string
          embedding?: string | null
          height?: number | null
          id?: string
          image_path?: string | null
          keywords?: string[]
          ocr_confidence?: number | null
          ocr_text?: string | null
          page_number?: number
          page_summary?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "library_book_pages_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
        ]
      }
      library_book_sections: {
        Row: {
          bbox: Json
          book_id: string
          created_at: string
          embedding: string | null
          id: string
          kind: string
          order_index: number
          page_id: string
          raw_text: string | null
          updated_at: string
        }
        Insert: {
          bbox: Json
          book_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          kind: string
          order_index?: number
          page_id: string
          raw_text?: string | null
          updated_at?: string
        }
        Update: {
          bbox?: Json
          book_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          kind?: string
          order_index?: number
          page_id?: string
          raw_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_book_sections_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_book_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "library_book_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      library_books: {
        Row: {
          access_tier: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          edition_year: number | null
          education_type: string
          file_size: number | null
          grade_id: string | null
          id: string
          page_count: number | null
          pdf_path: string | null
          processing_error: string | null
          processing_progress: number
          processing_stage: string | null
          published_at: string | null
          section_id: string | null
          stage_id: string | null
          status: string
          sub_subject_id: string | null
          sub_subject_name: string | null
          subject_id: string | null
          subject_name_ar: string | null
          term: string | null
          title: string
          track_id: string | null
          updated_at: string
        }
        Insert: {
          access_tier?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          edition_year?: number | null
          education_type: string
          file_size?: number | null
          grade_id?: string | null
          id?: string
          page_count?: number | null
          pdf_path?: string | null
          processing_error?: string | null
          processing_progress?: number
          processing_stage?: string | null
          published_at?: string | null
          section_id?: string | null
          stage_id?: string | null
          status?: string
          sub_subject_id?: string | null
          sub_subject_name?: string | null
          subject_id?: string | null
          subject_name_ar?: string | null
          term?: string | null
          title: string
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          access_tier?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          edition_year?: number | null
          education_type?: string
          file_size?: number | null
          grade_id?: string | null
          id?: string
          page_count?: number | null
          pdf_path?: string | null
          processing_error?: string | null
          processing_progress?: number
          processing_stage?: string | null
          published_at?: string | null
          section_id?: string | null
          stage_id?: string | null
          status?: string
          sub_subject_id?: string | null
          sub_subject_name?: string | null
          subject_id?: string | null
          subject_name_ar?: string | null
          term?: string | null
          title?: string
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_books_access_tier_fkey"
            columns: ["access_tier"]
            isOneToOne: false
            referencedRelation: "library_access_tiers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "library_books_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "library_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_books_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "library_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_books_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "library_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_books_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_books_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "library_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      library_conversation_messages: {
        Row: {
          audio_path: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          page_number: number | null
          role: string
          scope: string
          section_id: string | null
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          audio_path?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          page_number?: number | null
          role: string
          scope?: string
          section_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          audio_path?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          page_number?: number | null
          role?: string
          scope?: string
          section_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "library_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "library_book_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_conversation_messages_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "library_book_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      library_generated_quizzes: {
        Row: {
          book_id: string
          created_at: string
          created_by: string | null
          hit_count: number
          id: string
          prompt_hash: string
          question_count: number
          questions: Json
          scope: string
          scope_ref: Json
        }
        Insert: {
          book_id: string
          created_at?: string
          created_by?: string | null
          hit_count?: number
          id?: string
          prompt_hash: string
          question_count?: number
          questions: Json
          scope: string
          scope_ref?: Json
        }
        Update: {
          book_id?: string
          created_at?: string
          created_by?: string | null
          hit_count?: number
          id?: string
          prompt_hash?: string
          question_count?: number
          questions?: Json
          scope?: string
          scope_ref?: Json
        }
        Relationships: [
          {
            foreignKeyName: "library_generated_quizzes_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
        ]
      }
      library_grades: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          sort_order: number
          stage_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
          stage_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_grades_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "library_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      library_processing_events: {
        Row: {
          book_id: string
          created_at: string
          data: Json
          event_key: string
          id: string
          job_id: string | null
          level: string
          message: string
          progress: number | null
        }
        Insert: {
          book_id: string
          created_at?: string
          data?: Json
          event_key: string
          id?: string
          job_id?: string | null
          level?: string
          message: string
          progress?: number | null
        }
        Update: {
          book_id?: string
          created_at?: string
          data?: Json
          event_key?: string
          id?: string
          job_id?: string | null
          level?: string
          message?: string
          progress?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "library_processing_events_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_processing_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "library_processing_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      library_processing_jobs: {
        Row: {
          attempts: number
          book_id: string
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          last_stack: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          page_number: number | null
          parent_job_id: string | null
          payload: Json
          priority: number
          progress: number
          stage: string
          started_at: string | null
          state: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          book_id: string
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          last_stack?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          page_number?: number | null
          parent_job_id?: string | null
          payload?: Json
          priority?: number
          progress?: number
          stage: string
          started_at?: string | null
          state?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          book_id?: string
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          last_stack?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          page_number?: number | null
          parent_job_id?: string | null
          payload?: Json
          priority?: number
          progress?: number
          stage?: string
          started_at?: string | null
          state?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_processing_jobs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_processing_jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "library_processing_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      library_recommendations: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          payload: Json
          score: number
          source_book_id: string | null
          source_page: number | null
          student_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          payload: Json
          score?: number
          source_book_id?: string | null
          source_page?: number | null
          student_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          score?: number
          source_book_id?: string | null
          source_page?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_recommendations_source_book_id_fkey"
            columns: ["source_book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
        ]
      }
      library_section_explanations: {
        Row: {
          audio_duration_seconds: number | null
          audio_path: string | null
          audio_quality: string | null
          audio_storage_path: string | null
          book_id: string
          created_at: string
          created_by: string | null
          hit_count: number
          id: string
          page_id: string | null
          prompt_hash: string
          section_id: string | null
          text_ar: string
          tokens_input: number | null
          tokens_output: number | null
          updated_at: string
          variant: string
          voice: string | null
          voice_settings: Json
        }
        Insert: {
          audio_duration_seconds?: number | null
          audio_path?: string | null
          audio_quality?: string | null
          audio_storage_path?: string | null
          book_id: string
          created_at?: string
          created_by?: string | null
          hit_count?: number
          id?: string
          page_id?: string | null
          prompt_hash: string
          section_id?: string | null
          text_ar: string
          tokens_input?: number | null
          tokens_output?: number | null
          updated_at?: string
          variant?: string
          voice?: string | null
          voice_settings?: Json
        }
        Update: {
          audio_duration_seconds?: number | null
          audio_path?: string | null
          audio_quality?: string | null
          audio_storage_path?: string | null
          book_id?: string
          created_at?: string
          created_by?: string | null
          hit_count?: number
          id?: string
          page_id?: string | null
          prompt_hash?: string
          section_id?: string | null
          text_ar?: string
          tokens_input?: number | null
          tokens_output?: number | null
          updated_at?: string
          variant?: string
          voice?: string | null
          voice_settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "library_section_explanations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_section_explanations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "library_book_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_section_explanations_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "library_book_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      library_sections: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      library_stages: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      library_student_book_progress: {
        Row: {
          book_id: string
          id: string
          last_page: number
          last_section_id: string | null
          reading_seconds: number
          student_id: string
          updated_at: string
        }
        Insert: {
          book_id: string
          id?: string
          last_page?: number
          last_section_id?: string | null
          reading_seconds?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          id?: string
          last_page?: number
          last_section_id?: string | null
          reading_seconds?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_student_book_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_student_book_progress_last_section_id_fkey"
            columns: ["last_section_id"]
            isOneToOne: false
            referencedRelation: "library_book_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      library_student_memory: {
        Row: {
          id: string
          last_answer: string | null
          last_audio_path: string | null
          last_book_id: string | null
          last_conversation_id: string | null
          last_page: number | null
          last_question: string | null
          last_section_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_answer?: string | null
          last_audio_path?: string | null
          last_book_id?: string | null
          last_conversation_id?: string | null
          last_page?: number | null
          last_question?: string | null
          last_section_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_answer?: string | null
          last_audio_path?: string | null
          last_book_id?: string | null
          last_conversation_id?: string | null
          last_page?: number | null
          last_question?: string | null
          last_section_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_student_memory_last_book_id_fkey"
            columns: ["last_book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_student_memory_last_conversation_id_fkey"
            columns: ["last_conversation_id"]
            isOneToOne: false
            referencedRelation: "library_book_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_student_memory_last_section_id_fkey"
            columns: ["last_section_id"]
            isOneToOne: false
            referencedRelation: "library_book_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      library_student_weaknesses: {
        Row: {
          book_id: string | null
          created_at: string
          id: string
          last_seen_at: string
          page_number: number | null
          right_count: number
          section_id: string | null
          strength_score: number
          student_id: string
          topic: string
          updated_at: string
          wrong_count: number
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          page_number?: number | null
          right_count?: number
          section_id?: string | null
          strength_score?: number
          student_id: string
          topic: string
          updated_at?: string
          wrong_count?: number
        }
        Update: {
          book_id?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          page_number?: number | null
          right_count?: number
          section_id?: string | null
          strength_score?: number
          student_id?: string
          topic?: string
          updated_at?: string
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_student_weaknesses_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_student_weaknesses_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "library_book_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      library_sub_subjects: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          sort_order: number
          subject_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
          subject_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_sub_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "library_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      library_subjects: {
        Row: {
          code: string
          created_at: string
          curriculum_track: string | null
          grade_id: string | null
          id: string
          is_active: boolean
          name_ar: string
          section_id: string | null
          sort_order: number
          source_category: string | null
          source_subject_id: string | null
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          curriculum_track?: string | null
          grade_id?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          section_id?: string | null
          sort_order?: number
          source_category?: string | null
          source_subject_id?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          curriculum_track?: string | null
          grade_id?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          section_id?: string | null
          sort_order?: number
          source_category?: string | null
          source_subject_id?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_subjects_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "library_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_subjects_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "library_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_subjects_source_subject_id_fkey"
            columns: ["source_subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_subjects_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "library_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      library_tracks: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
      login_lookup_attempts: {
        Row: {
          created_at: string
          id: string
          ip_hash: string
          phone_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash: string
          phone_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string
          phone_hash?: string
        }
        Relationships: []
      }
      modrek_ai_conversations: {
        Row: {
          assistant_type: string
          context_json: Json
          created_at: string
          id: string
          is_archived: boolean
          last_message_at: string
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assistant_type: string
          context_json?: Json
          created_at?: string
          id?: string
          is_archived?: boolean
          last_message_at?: string
          student_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          assistant_type?: string
          context_json?: Json
          created_at?: string
          id?: string
          is_archived?: boolean
          last_message_at?: string
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      modrek_ai_messages: {
        Row: {
          attachments: Json | null
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          parts: Json
          role: string
        }
        Insert: {
          attachments?: Json | null
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          parts?: Json
          role: string
        }
        Update: {
          attachments?: Json | null
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          parts?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "modrek_ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "modrek_ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      modrek_search_cache: {
        Row: {
          created_at: string
          expires_at: string
          filters: Json
          hits: number
          intent: string | null
          payload: Json
          query_hash: string
          query_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          filters?: Json
          hits?: number
          intent?: string | null
          payload: Json
          query_hash: string
          query_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          filters?: Json
          hits?: number
          intent?: string | null
          payload?: Json
          query_hash?: string
          query_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      modrek_search_logs: {
        Row: {
          cache_hit: boolean
          created_at: string
          duration_ms: number | null
          fallback_external: boolean
          filters: Json
          id: string
          intent: string | null
          query_text: string
          results_count: number
          role: string | null
          surface: string | null
          tier_used: string | null
          top_confidence: number | null
          trace: Json
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number | null
          fallback_external?: boolean
          filters?: Json
          id?: string
          intent?: string | null
          query_text: string
          results_count?: number
          role?: string | null
          surface?: string | null
          tier_used?: string | null
          top_confidence?: number | null
          trace?: Json
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number | null
          fallback_external?: boolean
          filters?: Json
          id?: string
          intent?: string | null
          query_text?: string
          results_count?: number
          role?: string | null
          surface?: string | null
          tier_used?: string | null
          top_confidence?: number | null
          trace?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      notification_delivery_logs: {
        Row: {
          body: string | null
          created_at: string
          delivery_channel: string
          details: Json
          error_message: string | null
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
          error_message?: string | null
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
          error_message?: string | null
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
      processing_events: {
        Row: {
          created_at: string
          data: Json
          id: string
          job_id: string
          level: string
          message: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          job_id: string
          level?: string
          message: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          job_id?: string
          level?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          asset_id: string | null
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          kind: Database["public"]["Enums"]["processing_job_kind"]
          max_attempts: number
          model_id: string | null
          next_run_at: string | null
          output: Json | null
          priority: number
          progress_pct: number
          provider_id: string | null
          source_id: string | null
          stage_order: number
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          updated_at: string
          version_id: string | null
        }
        Insert: {
          asset_id?: string | null
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind: Database["public"]["Enums"]["processing_job_kind"]
          max_attempts?: number
          model_id?: string | null
          next_run_at?: string | null
          output?: Json | null
          priority?: number
          progress_pct?: number
          provider_id?: string | null
          source_id?: string | null
          stage_order?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          asset_id?: string | null
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: Database["public"]["Enums"]["processing_job_kind"]
          max_attempts?: number
          model_id?: string | null
          next_run_at?: string | null
          output?: Json | null
          priority?: number
          progress_pct?: number
          provider_id?: string | null
          source_id?: string | null
          stage_order?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "storage_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_source_versions"
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
          is_test_account: boolean
          pending_commission_rate: number | null
          pending_effective_date: string | null
          phone: string | null
          role: string | null
          section: string | null
          stage: string | null
          student_code: string | null
          teacher_code: string | null
          teacher_terms_accepted_at: string | null
          teacher_terms_version: string | null
          test_account_code: string | null
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
          is_test_account?: boolean
          pending_commission_rate?: number | null
          pending_effective_date?: string | null
          phone?: string | null
          role?: string | null
          section?: string | null
          stage?: string | null
          student_code?: string | null
          teacher_code?: string | null
          teacher_terms_accepted_at?: string | null
          teacher_terms_version?: string | null
          test_account_code?: string | null
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
          is_test_account?: boolean
          pending_commission_rate?: number | null
          pending_effective_date?: string | null
          phone?: string | null
          role?: string | null
          section?: string | null
          stage?: string | null
          student_code?: string | null
          teacher_code?: string | null
          teacher_terms_accepted_at?: string | null
          teacher_terms_version?: string | null
          test_account_code?: string | null
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
      shared_subjects: {
        Row: {
          category: string
          created_at: string
          display_name: string
          id: string
          is_education_split: boolean
          key: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          display_name: string
          id?: string
          is_education_split?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          display_name?: string
          id?: string
          is_education_split?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      storage_assets: {
        Row: {
          bucket: string
          byte_size: number | null
          created_at: string
          id: string
          metadata: Json
          mime_type: string | null
          object_path: string
          original_filename: string | null
          sha256: string
          storage_provider: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          bucket: string
          byte_size?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          object_path: string
          original_filename?: string | null
          sha256: string
          storage_provider?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          byte_size?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          object_path?: string
          original_filename?: string | null
          sha256?: string
          storage_provider?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      student_activity_logs: {
        Row: {
          action_label: string | null
          action_type: string
          browser: string | null
          content_id: string | null
          created_at: string
          description: string | null
          device_type: string | null
          duration_seconds: number | null
          exam_id: string | null
          group_id: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          os: string | null
          page_path: string | null
          session_id: string | null
          student_id: string
          subject_id: string | null
          teacher_id: string | null
          user_agent: string | null
        }
        Insert: {
          action_label?: string | null
          action_type: string
          browser?: string | null
          content_id?: string | null
          created_at?: string
          description?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          exam_id?: string | null
          group_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          os?: string | null
          page_path?: string | null
          session_id?: string | null
          student_id: string
          subject_id?: string | null
          teacher_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action_label?: string | null
          action_type?: string
          browser?: string | null
          content_id?: string | null
          created_at?: string
          description?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          exam_id?: string | null
          group_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          os?: string | null
          page_path?: string | null
          session_id?: string | null
          student_id?: string
          subject_id?: string | null
          teacher_id?: string | null
          user_agent?: string | null
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
          shared_subject_id: string | null
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
          shared_subject_id?: string | null
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
          shared_subject_id?: string | null
          stage?: string
          subject_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_default_prices_shared_subject_id_fkey"
            columns: ["shared_subject_id"]
            isOneToOne: false
            referencedRelation: "shared_subjects"
            referencedColumns: ["id"]
          },
        ]
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
          shared_subject_id: string | null
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
          shared_subject_id?: string | null
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
          shared_subject_id?: string | null
          stage?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_shared_subject_id_fkey"
            columns: ["shared_subject_id"]
            isOneToOne: false
            referencedRelation: "shared_subjects"
            referencedColumns: ["id"]
          },
        ]
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
      support_contact_logs: {
        Row: {
          channel: string
          created_at: string
          id: string
          user_code: string | null
          user_id: string
          user_role: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          user_code?: string | null
          user_id: string
          user_role?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          user_code?: string | null
          user_id?: string
          user_role?: string | null
        }
        Relationships: []
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
          browser: string | null
          created_at: string
          description: string | null
          device_type: string | null
          duration_seconds: number | null
          id: string
          ip_address: string | null
          metadata: Json | null
          os: string | null
          page_path: string | null
          session_id: string | null
          teacher_id: string
          user_agent: string | null
        }
        Insert: {
          action_label: string
          action_type: string
          browser?: string | null
          created_at?: string
          description?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          os?: string | null
          page_path?: string | null
          session_id?: string | null
          teacher_id: string
          user_agent?: string | null
        }
        Update: {
          action_label?: string
          action_type?: string
          browser?: string | null
          created_at?: string
          description?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          os?: string | null
          page_path?: string | null
          session_id?: string | null
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
          snapshot: Json
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
          snapshot?: Json
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
          snapshot?: Json
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
          additional_categories: string[]
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
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          additional_categories?: string[]
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
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          additional_categories?: string[]
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
          terms_accepted_at?: string | null
          terms_version?: string | null
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
      teacher_visibility_diagnostics: {
        Row: {
          check_name: string
          created_at: string
          details: Json
          id: string
          status: string
          teacher_id: string | null
        }
        Insert: {
          check_name: string
          created_at?: string
          details?: Json
          id?: string
          status: string
          teacher_id?: string | null
        }
        Update: {
          check_name?: string
          created_at?: string
          details?: Json
          id?: string
          status?: string
          teacher_id?: string | null
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
      test_student_security_events: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          details: Json
          event_type: string
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          occurrence_count: number
          severity: string
          source_id: string | null
          source_table: string
          student_id: string | null
          teacher_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          details?: Json
          event_type: string
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          severity?: string
          source_id?: string | null
          source_table: string
          student_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          details?: Json
          event_type?: string
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          occurrence_count?: number
          severity?: string
          source_id?: string | null
          source_table?: string
          student_id?: string | null
          teacher_id?: string | null
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
      voice_answers: {
        Row: {
          answer_text: string
          audio_bytes: number | null
          audio_duration_seconds: number | null
          audio_quality: string
          audio_storage_path: string | null
          audio_url: string
          citations: Json | null
          created_at: string
          created_by: string | null
          grade: string | null
          id: string
          keywords: string[] | null
          last_used_at: string
          lesson_hint: string | null
          model: string | null
          question: string
          question_hash: string
          question_normalized: string
          record_type: string
          section: string | null
          source: string
          speech_text: string | null
          stage: string | null
          subject_id: string | null
          updated_at: string
          usage_count: number
          voice: string | null
          voice_settings: Json
        }
        Insert: {
          answer_text: string
          audio_bytes?: number | null
          audio_duration_seconds?: number | null
          audio_quality?: string
          audio_storage_path?: string | null
          audio_url: string
          citations?: Json | null
          created_at?: string
          created_by?: string | null
          grade?: string | null
          id?: string
          keywords?: string[] | null
          last_used_at?: string
          lesson_hint?: string | null
          model?: string | null
          question: string
          question_hash: string
          question_normalized: string
          record_type?: string
          section?: string | null
          source?: string
          speech_text?: string | null
          stage?: string | null
          subject_id?: string | null
          updated_at?: string
          usage_count?: number
          voice?: string | null
          voice_settings?: Json
        }
        Update: {
          answer_text?: string
          audio_bytes?: number | null
          audio_duration_seconds?: number | null
          audio_quality?: string
          audio_storage_path?: string | null
          audio_url?: string
          citations?: Json | null
          created_at?: string
          created_by?: string | null
          grade?: string | null
          id?: string
          keywords?: string[] | null
          last_used_at?: string
          lesson_hint?: string | null
          model?: string | null
          question?: string
          question_hash?: string
          question_normalized?: string
          record_type?: string
          section?: string | null
          source?: string
          speech_text?: string | null
          stage?: string | null
          subject_id?: string | null
          updated_at?: string
          usage_count?: number
          voice?: string | null
          voice_settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "voice_answers_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
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
      approved_teacher_assignments: {
        Row: {
          assigned_category: string | null
          assigned_grades: string[] | null
          assigned_stages: string[] | null
          education_type: string | null
          user_id: string | null
        }
        Insert: {
          assigned_category?: string | null
          assigned_grades?: string[] | null
          assigned_stages?: string[] | null
          education_type?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_category?: string | null
          assigned_grades?: string[] | null
          assigned_stages?: string[] | null
          education_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      developer_test_students: {
        Row: {
          created_at: string | null
          education_type: string | null
          full_name: string | null
          grade: string | null
          id: string | null
          section: string | null
          stage: string | null
          student_code: string | null
          test_account_code: string | null
        }
        Insert: {
          created_at?: string | null
          education_type?: string | null
          full_name?: string | null
          grade?: string | null
          id?: string | null
          section?: string | null
          stage?: string | null
          student_code?: string | null
          test_account_code?: string | null
        }
        Update: {
          created_at?: string | null
          education_type?: string | null
          full_name?: string | null
          grade?: string | null
          id?: string | null
          section?: string | null
          stage?: string | null
          student_code?: string | null
          test_account_code?: string | null
        }
        Relationships: []
      }
      public_teacher_profiles: {
        Row: {
          avatar_url: string | null
          education_type: string | null
          full_name: string | null
          grade: string | null
          id: string | null
          role: string | null
          section: string | null
          stage: string | null
          teacher_code: string | null
        }
        Insert: {
          avatar_url?: string | null
          education_type?: string | null
          full_name?: string | null
          grade?: string | null
          id?: string | null
          role?: string | null
          section?: string | null
          stage?: string | null
          teacher_code?: string | null
        }
        Update: {
          avatar_url?: string | null
          education_type?: string | null
          full_name?: string | null
          grade?: string | null
          id?: string | null
          role?: string | null
          section?: string | null
          stage?: string | null
          teacher_code?: string | null
        }
        Relationships: []
      }
      teacher_directory: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          education_type: string | null
          full_name: string | null
          grade: string | null
          id: string | null
          is_banned: boolean | null
          role: string | null
          section: string | null
          stage: string | null
          teacher_code: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          education_type?: string | null
          full_name?: string | null
          grade?: string | null
          id?: string | null
          is_banned?: boolean | null
          role?: string | null
          section?: string | null
          stage?: string | null
          teacher_code?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          education_type?: string | null
          full_name?: string | null
          grade?: string | null
          id?: string | null
          is_banned?: boolean | null
          role?: string | null
          section?: string | null
          stage?: string | null
          teacher_code?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _admin_build_financial_snapshot: {
        Args: { _period_end: string; _period_start: string }
        Returns: Json
      }
      ad_target_includes_me: { Args: { _target_id: string }; Returns: boolean }
      admin_add_student_wallet_credit: {
        Args: { _amount: number; _reason?: string; _student_id: string }
        Returns: Json
      }
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
      admin_capture_overview_snapshot: {
        Args: { _notes?: string }
        Returns: Json
      }
      admin_close_financial_month:
        | { Args: { _notes?: string }; Returns: Json }
        | {
            Args: {
              _notes?: string
              _period_month?: number
              _period_year?: number
            }
            Returns: Json
          }
      admin_delete_overview_snapshot: { Args: { _id: string }; Returns: Json }
      admin_financial_close_preview: { Args: never; Returns: Json }
      admin_financial_overview: { Args: never; Returns: Json }
      admin_get_ad_target: {
        Args: { _ad_id: string }
        Returns: {
          ad_id: string
          created_at: string
          education_type: string
          grade: string
          id: string
          section: string
          stage: string
          student_ids: string[]
          target_type: Database["public"]["Enums"]["ad_target_type"]
        }[]
      }
      admin_get_financial_close: { Args: { _id: string }; Returns: Json }
      admin_get_overview_snapshot: { Args: { _id: string }; Returns: Json }
      admin_get_student_deposit: { Args: { _id: string }; Returns: Json }
      admin_get_teacher_management: { Args: never; Returns: Json }
      admin_get_withdrawal_dashboard: { Args: never; Returns: Json }
      admin_list_audit_logs: {
        Args: {
          _action?: string
          _limit?: number
          _offset?: number
          _teacher_id?: string
        }
        Returns: Json
      }
      admin_list_overview_snapshots: { Args: never; Returns: Json }
      admin_list_student_deposits: {
        Args: {
          _from?: string
          _grade?: string
          _limit?: number
          _max_amount?: number
          _method?: string
          _min_amount?: number
          _offset?: number
          _search?: string
          _status?: string
          _to?: string
        }
        Returns: Json
      }
      admin_list_teacher_wallets: {
        Args: { _limit?: number; _offset?: number; _search?: string }
        Returns: Json
      }
      admin_manual_wallet_action: {
        Args: {
          _action: string
          _amount: number
          _reason?: string
          _teacher_id: string
        }
        Returns: Json
      }
      admin_monthly_history_summary: { Args: never; Returns: Json }
      admin_monthly_period_teachers: {
        Args: { _period_label: string }
        Returns: Json
      }
      admin_process_deposit_request: {
        Args: { _action: string; _message?: string; _request_id: string }
        Returns: Json
      }
      admin_remove_teacher_grade_workspace: {
        Args: { _assignment_ids: string[]; _teacher_id: string }
        Returns: Json
      }
      admin_save_withdrawal_closing_schedule: {
        Args: {
          _day: number
          _execution_month?: number
          _execution_year?: number
          _hour: number
          _manual_state?: string
          _minute: number
          _profit_month?: number
          _profit_year?: number
        }
        Returns: Json
      }
      admin_set_content_free_preview: {
        Args: { _content_id: string; _is_free_preview: boolean }
        Returns: {
          updated_count: number
          updated_ids: string[]
        }[]
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
      admin_set_withdrawal_profit_label: {
        Args: { _month: number; _year: number }
        Returns: Json
      }
      admin_set_withdrawal_requests_window: {
        Args: { _notice?: string; _open_at?: string; _state: string }
        Returns: Json
      }
      admin_set_withdrawal_schedule:
        | {
            Args: {
              _day: number
              _hour: number
              _manual_state?: string
              _minute: number
              _month?: number
              _year?: number
            }
            Returns: Json
          }
        | {
            Args: {
              _day: number
              _hour: number
              _manual_state?: string
              _minute: number
              _month?: number
              _schedule_month?: number
              _schedule_year?: number
              _year?: number
            }
            Returns: Json
          }
      admin_set_withdrawal_schedule_impl:
        | {
            Args: {
              _day: number
              _hour: number
              _manual_state?: string
              _minute: number
              _month?: number
              _year?: number
            }
            Returns: Json
          }
        | {
            Args: {
              _day: number
              _hour: number
              _manual_state?: string
              _minute: number
              _month?: number
              _schedule_month?: number
              _schedule_year?: number
              _year?: number
            }
            Returns: Json
          }
      admin_student_deposit_stats: { Args: never; Returns: Json }
      admin_switch_system_terms: {
        Args: { _target_term: string; _term_ids: string[] }
        Returns: Json
      }
      admin_sync_teacher_teaching_scope: {
        Args: {
          _categories: string[]
          _education_type?: string
          _grades: string[]
          _stages: string[]
          _teacher_id: string
          _teaches_integrated_science?: boolean
        }
        Returns: Json
      }
      admin_teacher_monthly_statement: {
        Args: { _period_label: string; _teacher_id: string }
        Returns: Json
      }
      admin_withdrawal_scheduler_diagnostics: { Args: never; Returns: Json }
      ai_rate_limit_consume: {
        Args: {
          _function_name: string
          _max_per_day?: number
          _max_per_hour?: number
          _user_id: string
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
      apply_teacher_request_assignments: {
        Args: { _user_id: string }
        Returns: number
      }
      archive_all_teachers_period: { Args: never; Returns: Json }
      archive_teacher_period: { Args: { _teacher_id: string }; Returns: Json }
      assert_admin_caller: { Args: never; Returns: undefined }
      audit_test_student_visibility: {
        Args: never
        Returns: {
          row_count: number
          source: string
        }[]
      }
      audit_test_student_visibility_impl: {
        Args: never
        Returns: {
          row_count: number
          source: string
        }[]
      }
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
      catalog_subjects_match: {
        Args: {
          p_candidate_category: string
          p_candidate_name: string
          p_target_category: string
          p_target_name: string
        }
        Returns: boolean
      }
      claim_library_job: {
        Args: { _worker: string }
        Returns: {
          attempts: number
          book_id: string
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          last_stack: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          page_number: number | null
          parent_job_id: string | null
          payload: Json
          priority: number
          progress: number
          stage: string
          started_at: string | null
          state: string
          updated_at: string
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "library_processing_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_ai_daily_usage: { Args: never; Returns: number }
      cleanup_ai_rate_limit_events: { Args: never; Returns: undefined }
      cleanup_modrek_search_cache: { Args: never; Returns: number }
      cleanup_modrek_search_logs: { Args: never; Returns: number }
      cleanup_notification_delivery_logs: { Args: never; Returns: number }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      cleanup_pg_net_http_logs: { Args: never; Returns: undefined }
      cleanup_processing_jobs: { Args: never; Returns: number }
      cleanup_student_activity_logs: { Args: never; Returns: number }
      cleanup_voice_answers: { Args: never; Returns: number }
      complete_user_profile: {
        Args: {
          _full_name: string
          _phone: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      compute_bundle_price: { Args: { _package_id: string }; Returns: Json }
      consume_ai_quota: {
        Args: { _cost?: number; _feature: string; _user_id: string }
        Returns: Json
      }
      content_effective_education_type: {
        Args: { _content_edu: string; _content_group_id?: string }
        Returns: string
      }
      content_effective_section: {
        Args: {
          _content_group_id?: string
          _content_subject_id: string
          _content_target_section: string
        }
        Returns: string
      }
      content_group_sibling_ids: {
        Args: { _group_id: string }
        Returns: string[]
      }
      content_target_matches_student:
        | {
            Args: {
              _content_edu: string
              _content_group_id: string
              _content_subject_id: string
              _student_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _content_edu: string
              _content_group_id: string
              _content_subject_id: string
              _content_target_section: string
              _student_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _content_edu: string
              _content_subject_id: string
              _student_id: string
            }
            Returns: boolean
          }
        | {
            Args: { _content_edu: string; _student_id: string }
            Returns: boolean
          }
      create_modrek_ai_training_exam: {
        Args: { _payload: Json }
        Returns: Json
      }
      debug_student_group_exam_visibility: {
        Args: { _group_id: string; _sub_subject_id?: string }
        Returns: {
          exam_group_id: string
          exam_id: string
          exam_subject_id: string
          in_broadcast_scope: boolean
          is_published: boolean
          normalized_target_education_type: string
          normalized_target_section: string
          reason: string
          reason_code: string
          requested_group_id: string
          requested_subject_id: string
          source_file: string
          source_function: string
          status: string
          student_education_type: string
          student_section: string
          sub_subject_matches: boolean
          target_matches: boolean
          term_matches: boolean
          title: string
          visibility_status: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_group_content: { Args: { _content_id: string }; Returns: Json }
      diagnose_student_group_exam_visibility: {
        Args: { _group_id: string; _sub_subject_id?: string }
        Returns: {
          exam_group_id: string
          exam_id: string
          exam_subject_id: string
          in_broadcast_scope: boolean
          is_published: boolean
          normalized_target_education_type: string
          normalized_target_section: string
          reason: string
          reason_code: string
          requested_group_id: string
          requested_subject_id: string
          source_file: string
          source_function: string
          status: string
          student_education_type: string
          student_section: string
          sub_subject_matches: boolean
          target_matches: boolean
          term_matches: boolean
          title: string
          visibility_status: string
        }[]
      }
      dispatch_automation: {
        Args: {
          _actor_user_id: string
          _event_key: string
          _payload?: Json
          _related_user_id: string
        }
        Returns: undefined
      }
      dispatch_notification_push:
        | {
            Args: {
              p_body: string
              p_link?: string
              p_title: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_body: string
              p_link?: string
              p_notification_id?: string
              p_title: string
              p_user_id: string
            }
            Returns: undefined
          }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_library_book_processing: {
        Args: { _book_id: string }
        Returns: string
      }
      ensure_shared_subject: {
        Args: { p_category: string; p_subject_name?: string }
        Returns: string
      }
      ensure_teacher_visibility: {
        Args: { _teacher_id: string }
        Returns: Json
      }
      exam_best_aligned_model_answer: {
        Args: {
          _answer_text: string
          _attempt_id: string
          _current_model: string
          _max_score: number
          _question_id: string
        }
        Returns: Json
      }
      exam_boolean_answer_key: { Args: { _value: string }; Returns: string }
      exam_broadcast_group_ids: {
        Args: { _group_id: string }
        Returns: string[]
      }
      exam_effective_education_type: {
        Args: { _group_id?: string; _target_edu: string }
        Returns: string
      }
      exam_effective_section: {
        Args: {
          _exam_group_id?: string
          _exam_subject_id: string
          _exam_target_section: string
        }
        Returns: string
      }
      exam_meaningful_tokens: { Args: { _value: string }; Returns: string[] }
      exam_target_matches_student: {
        Args: {
          _group_id?: string
          _student_id: string
          _subject_id?: string
          _target_education_type: string
          _target_section: string
        }
        Returns: boolean
      }
      exam_text_feedback:
        | {
            Args: {
              _answer: string
              _max_score: number
              _model: string
              _score: number
            }
            Returns: string
          }
        | {
            Args: {
              _alignment_source: string
              _answer: string
              _max_score: number
              _model: string
              _score: number
            }
            Returns: string
          }
      exam_text_similarity: {
        Args: { _answer: string; _model: string }
        Returns: number
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
      get_developer_smart_reports: { Args: never; Returns: Json }
      get_developer_student_exam_filter_options: {
        Args: { _student_id: string }
        Returns: Json
      }
      get_developer_student_exams: {
        Args: { _student_id: string }
        Returns: {
          attempt_id: string
          created_at: string
          end_at: string
          exam_id: string
          exam_title: string
          grade: string
          group_id: string
          group_title: string
          percentage: number
          score: number
          start_at: string
          status: string
          subject_name: string
          submitted_at: string
          teacher_id: string
          teacher_name: string
          total: number
        }[]
      }
      get_developer_student_overview: {
        Args: { _student_id: string }
        Returns: Json
      }
      get_developer_student_progress: {
        Args: { _student_id: string }
        Returns: Json
      }
      get_developer_student_progress_monthly: {
        Args: { _months?: number; _student_id: string }
        Returns: {
          avg_percentage: number
          exams_taken: number
          logins: number
          period_label: string
          period_start: string
          videos_watched: number
          watch_hours: number
        }[]
      }
      get_developer_student_progress_monthly_impl: {
        Args: { _months?: number; _student_id: string }
        Returns: {
          avg_percentage: number
          exams_taken: number
          logins: number
          period_label: string
          period_start: string
          videos_watched: number
          watch_hours: number
        }[]
      }
      get_developer_student_teachers: {
        Args: { _student_id: string }
        Returns: {
          avatar_url: string
          courses_count: number
          last_interaction: string
          status: string
          teacher_id: string
          teacher_name: string
          total_paid: number
        }[]
      }
      get_developer_student_video_progress: {
        Args: { _student_id: string }
        Returns: {
          avg_completion: number
          fully_watched: number
          group_id: string
          group_title: string
          not_opened: number
          partially_watched: number
          subject_name: string
          teacher_id: string
          teacher_name: string
          total_videos: number
        }[]
      }
      get_developer_student_video_progress_impl: {
        Args: { _student_id: string }
        Returns: {
          avg_completion: number
          fully_watched: number
          group_id: string
          group_title: string
          not_opened: number
          partially_watched: number
          subject_name: string
          teacher_id: string
          teacher_name: string
          total_videos: number
        }[]
      }
      get_developer_teacher_courses: {
        Args: { _teacher_id: string }
        Returns: {
          created_at: string
          grade: string
          group_id: string
          group_title: string
          is_active: boolean
          pdfs_count: number
          price: number
          revenue: number
          stage: string
          students_count: number
          subject_name: string
          videos_count: number
        }[]
      }
      get_developer_teacher_courses_impl: {
        Args: { _teacher_id: string }
        Returns: {
          created_at: string
          grade: string
          group_id: string
          group_title: string
          is_active: boolean
          pdfs_count: number
          price: number
          revenue: number
          stage: string
          students_count: number
          subject_name: string
          videos_count: number
        }[]
      }
      get_developer_teacher_group_details: {
        Args: { _grade?: string; _teacher_id: string }
        Returns: {
          created_at: string
          grade: string
          group_id: string
          group_title: string
          new_month: number
          new_today: number
          price: number
          revenue: number
          students_count: number
          subject_name: string
        }[]
      }
      get_developer_teacher_group_details_impl: {
        Args: { _grade?: string; _teacher_id: string }
        Returns: {
          created_at: string
          grade: string
          group_id: string
          group_title: string
          new_month: number
          new_today: number
          price: number
          revenue: number
          students_count: number
          subject_name: string
        }[]
      }
      get_developer_teacher_logs: {
        Args: { _limit?: number; _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_logs_impl: {
        Args: { _limit?: number; _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_overview: {
        Args: { _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_overview_impl: {
        Args: { _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_profile: {
        Args: { _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_profile_impl: {
        Args: { _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_students: {
        Args: { _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_students_by_grade: {
        Args: { _teacher_id: string }
        Returns: {
          avatar_url: string
          email: string
          first_purchase: string
          full_name: string
          grade: string
          groups_count: number
          last_activity: string
          phone: string
          section: string
          stage: string
          student_code: string
          student_id: string
          total_paid: number
        }[]
      }
      get_developer_teacher_students_by_grade_impl: {
        Args: { _teacher_id: string }
        Returns: {
          avatar_url: string
          email: string
          first_purchase: string
          full_name: string
          grade: string
          groups_count: number
          last_activity: string
          phone: string
          section: string
          stage: string
          student_code: string
          student_id: string
          total_paid: number
        }[]
      }
      get_developer_teacher_students_impl: {
        Args: { _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_subs_by_grade: {
        Args: { _teacher_id: string }
        Returns: {
          active_subs: number
          grade: string
          groups_count: number
          monthly_revenue: number
          new_this_month: number
          new_this_week: number
          stage: string
        }[]
      }
      get_developer_teacher_subs_by_grade_impl: {
        Args: { _teacher_id: string }
        Returns: {
          active_subs: number
          grade: string
          groups_count: number
          monthly_revenue: number
          new_this_month: number
          new_this_week: number
          stage: string
        }[]
      }
      get_developer_teacher_subscriptions: {
        Args: { _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_wallet_monthly: {
        Args: { _period?: string; _teacher_id: string }
        Returns: Json
      }
      get_developer_teacher_wallet_monthly_impl: {
        Args: { _period?: string; _teacher_id: string }
        Returns: Json
      }
      get_developer_test_students: {
        Args: never
        Returns: {
          education_type: string
          full_name: string
          grade: string
          id: string
          section: string
          stage: string
          test_account_code: string
        }[]
      }
      get_effective_teacher_commission: {
        Args: { _teacher_id: string }
        Returns: number
      }
      get_email_by_phone: { Args: { _phone: string }; Returns: string }
      get_exam_leaderboard: {
        Args: { _exam_id: string; _limit?: number }
        Returns: {
          percentage: number
          rank: number
          student_id: string
          student_name: string
          submitted_at: string
          time_spent_seconds: number
          total_score: number
        }[]
      }
      get_exam_questions_for_student: {
        Args: { _exam_id: string }
        Returns: Json
      }
      get_exam_review_questions: {
        Args: { _attempt_id: string }
        Returns: Json
      }
      get_literary_student_group_content_catalog: {
        Args: { _group_id: string }
        Returns: {
          created_at: string
          description: string
          education_type: string
          file_url: string
          group_id: string
          id: string
          is_accessible: boolean
          is_free_preview: boolean
          is_paid: boolean
          sub_subject: string
          sub_subject_id: string
          subject_id: string
          subject_section: string
          thumbnail_url: string
          title: string
          type: string
        }[]
      }
      get_literary_student_group_exam_catalog: {
        Args: { _group_id: string }
        Returns: {
          created_at: string
          description: string
          duration_minutes: number
          end_at: string
          group_id: string
          id: string
          is_accessible: boolean
          is_ai_generated: boolean
          pass_marks: number
          start_at: string
          sub_subject_id: string
          subject_id: string
          target_education_type: string
          target_section: string
          term: string
          title: string
          total_marks: number
        }[]
      }
      get_modrek_library_bootstrap: { Args: never; Returns: Json }
      get_modrek_training_questions_for_attempt: {
        Args: { _attempt_id: string }
        Returns: Json
      }
      get_student_group_content_catalog: {
        Args: { _group_id: string; _sub_subject_id?: string }
        Returns: {
          created_at: string
          description: string
          education_type: string
          file_url: string
          group_id: string
          id: string
          is_accessible: boolean
          is_free_preview: boolean
          is_paid: boolean
          sub_subject: string
          sub_subject_id: string
          subject_id: string
          subject_section: string
          thumbnail_url: string
          title: string
          type: string
        }[]
      }
      get_student_group_content_diagnostics: {
        Args: { _group_id: string; _sub_subject_id?: string }
        Returns: {
          group_subject_id: string
          group_term: string
          matching_sub_subject_content: number
          matching_term_content: number
          reason: string
          student_education_type: string
          student_section: string
          total_teacher_content: number
          visible_to_student_content: number
        }[]
      }
      get_student_group_content_target_debug: {
        Args: {
          _group_id: string
          _student_id: string
          _sub_subject_id?: string
        }
        Returns: {
          allowed: boolean
          content_id: string
          decision_reason: string
          division_matches: boolean
          education_matches: boolean
          effective_education_type: string
          group_id: string
          saved_division: string
          saved_education_type: string
          student_division: string
          student_education_type: string
          title: string
        }[]
      }
      get_student_group_exam_catalog: {
        Args: { _group_id: string; _sub_subject_id?: string }
        Returns: {
          created_at: string
          description: string
          duration_minutes: number
          end_at: string
          group_id: string
          id: string
          is_accessible: boolean
          is_ai_generated: boolean
          pass_marks: number
          start_at: string
          sub_subject_id: string
          subject_id: string
          target_education_type: string
          target_section: string
          term: string
          title: string
          total_marks: number
        }[]
      }
      get_student_purchased_group_teacher_details: {
        Args: { _group_ids: string[]; _student_id: string }
        Returns: {
          group_id: string
          teacher_avatar: string
          teacher_id: string
          teacher_name: string
        }[]
      }
      get_subject_default_prices: {
        Args: { p_education_type: string; p_grade: string; p_stage: string }
        Returns: {
          category: string
          education_type: string
          grade: string
          id: string
          price: number
          section: string
          shared_subject_id: string
          shared_subject_key: string
          stage: string
          subject_name: string
          updated_at: string
        }[]
      }
      get_teacher_exam_roster: { Args: { _exam_id: string }; Returns: Json }
      get_withdrawal_requests_window: { Args: never; Returns: Json }
      grade_exam_attempt_core: {
        Args: {
          _attempt_id: string
          _fullscreen_exits?: number
          _tab_switches?: number
        }
        Returns: Json
      }
      group_matches_current_system_term: {
        Args: { _subject_id: string; _term: string }
        Returns: boolean
      }
      has_ai_lesson_page_access: { Args: { _name: string }; Returns: boolean }
      has_content_storage_access: {
        Args: { _bucket: string; _name: string }
        Returns: boolean
      }
      has_library_access: {
        Args: { _tier: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_voice_usage: { Args: { p_id: string }; Returns: undefined }
      is_approved_teacher: { Args: { _user_id: string }; Returns: boolean }
      is_developer_admin: { Args: { _user_id: string }; Returns: boolean }
      is_exam_non_answer: { Args: { _answer: string }; Returns: boolean }
      is_modrek_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_modrek_ai_training_exam_for_student: {
        Args: {
          _group_id: string
          _owner_student_id: string
          _source: string
          _student_id: string
          _teacher_id: string
        }
        Returns: boolean
      }
      is_modrek_training_exam_accessible: {
        Args: { _exam_id: string; _student_id: string }
        Returns: boolean
      }
      is_test_student: { Args: { _user_id: string }; Returns: boolean }
      is_valid_target_education_type: {
        Args: { _value: string }
        Returns: boolean
      }
      is_valid_target_section: { Args: { _value: string }; Returns: boolean }
      is_withdrawal_requests_open: { Args: never; Returns: boolean }
      library_book_progress_v2: { Args: { p_book_id: string }; Returns: Json }
      library_canonical_track_name: { Args: { _code: string }; Returns: string }
      library_canonical_track_sort: { Args: { _code: string }; Returns: number }
      library_claim_next_job: {
        Args: { p_kinds?: string[]; p_limit?: number; p_worker_id: string }
        Returns: {
          attempts: number
          book_id: string
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          last_stack: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          page_number: number | null
          parent_job_id: string | null
          payload: Json
          priority: number
          progress: number
          stage: string
          started_at: string | null
          state: string
          updated_at: string
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "library_processing_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      library_complete_job: {
        Args: { p_job_id: string; p_progress?: number }
        Returns: undefined
      }
      library_ensure_track_code: { Args: { _code: string }; Returns: string }
      library_fail_job: {
        Args: {
          p_backoff_seconds?: number
          p_error: string
          p_job_id: string
          p_stack?: string
        }
        Returns: string
      }
      library_grade_code_from_subject: {
        Args: { _grade: string; _stage: string }
        Returns: string
      }
      library_match_chunks: {
        Args: {
          p_book_id: string
          p_match_count?: number
          p_query_embedding: string
        }
        Returns: {
          content: string
          id: string
          page_number: number
          similarity: number
        }[]
      }
      library_match_chunks_multi: {
        Args: {
          p_book_ids: string[]
          p_match_count?: number
          p_query_embedding: string
        }
        Returns: {
          book_id: string
          content: string
          id: string
          page_number: number
          similarity: number
        }[]
      }
      library_profile_grade_code: {
        Args: { _grade: string; _stage: string }
        Returns: string
      }
      library_profile_track_code: {
        Args: { _section: string }
        Returns: string
      }
      library_search_chunks_text: {
        Args: { p_book_ids: string[]; p_match_count?: number; p_query: string }
        Returns: {
          book_id: string
          content: string
          id: string
          page_number: number
          rank: number
        }[]
      }
      library_stage_code_from_subject: {
        Args: { _stage: string }
        Returns: string
      }
      library_subject_track_code: {
        Args: { _section: string }
        Returns: string
      }
      library_track_code_from_section: {
        Args: { p_section: string }
        Returns: string
      }
      library_track_code_from_subject: {
        Args: { _section: string }
        Returns: string
      }
      library_track_display_name: { Args: { _code: string }; Returns: string }
      library_track_matches_student: {
        Args: { p_book_track: string; p_section: string }
        Returns: boolean
      }
      library_track_sort_order: { Args: { _code: string }; Returns: number }
      library_worker_heartbeat: { Args: never; Returns: undefined }
      log_exam_attempt_debug: {
        Args: {
          _attempt_id?: string
          _exam_id?: string
          _payload?: Json
          _stage: string
          _student_id?: string
        }
        Returns: undefined
      }
      log_library_processing_event: {
        Args: {
          _book_id: string
          _data?: Json
          _event_key: string
          _job_id: string
          _level?: string
          _message: string
          _progress?: number
        }
        Returns: string
      }
      log_test_student_teacher_leak: {
        Args: {
          _details?: Json
          _event_type: string
          _source_id?: string
          _source_table: string
          _student_id?: string
          _teacher_id?: string
        }
        Returns: undefined
      }
      modrek_admin_repair_source: {
        Args: { p_source_id: string }
        Returns: Json
      }
      modrek_bulk_set_embeddings: {
        Args: { p_model_id?: string; p_rows: Json }
        Returns: number
      }
      modrek_claim_next_job: {
        Args: never
        Returns: {
          asset_id: string | null
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          kind: Database["public"]["Enums"]["processing_job_kind"]
          max_attempts: number
          model_id: string | null
          next_run_at: string | null
          output: Json | null
          priority: number
          progress_pct: number
          provider_id: string | null
          source_id: string | null
          stage_order: number
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          updated_at: string
          version_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "processing_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      modrek_enqueue_stage: {
        Args: {
          p_asset_id?: string
          p_input?: Json
          p_kind: Database["public"]["Enums"]["processing_job_kind"]
          p_max_attempts?: number
          p_stage_order: number
          p_version_id: string
        }
        Returns: string
      }
      modrek_extract_heading_number: {
        Args: { p_title: string }
        Returns: number
      }
      modrek_extract_text_fallback: {
        Args: { p_asset_id: string }
        Returns: string
      }
      modrek_hybrid_search: {
        Args: {
          p_grade_id?: string
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: string
          p_query_text: string
          p_section_id?: string
          p_source_ids?: string[]
          p_source_type_id?: string
          p_stage_id?: string
          p_subject_id?: string
          p_track_id?: string
        }
        Returns: {
          chunk_id: string
          chunk_metadata: Json
          composite_score: number
          content: string
          ordinal: number
          page_from: number
          page_to: number
          similarity: number
          source_id: string
          source_publication_year: number
          source_title: string
          source_type_code: string
          source_type_priority: number
          text_rank: number
          unit_id: string
          unit_kind: string
          unit_title: string
          version_id: string
        }[]
      }
      modrek_library_diagnostics: {
        Args: never
        Returns: {
          chunks: number
          embedded_chunks: number
          grade: string
          issues: string[]
          latest_version_id: string
          lessons: number
          linked_chunks: number
          numbered_lessons: number
          pages: number
          pipeline_stage: string
          searchable: boolean
          source_id: string
          status: string
          subject: string
          title: string
          units: number
          updated_at: string
          versions: number
        }[]
      }
      modrek_log_event: {
        Args: {
          p_data?: Json
          p_job_id: string
          p_level: string
          p_message: string
        }
        Returns: string
      }
      modrek_rebuild_lessons_from_text: {
        Args: { p_source_id: string }
        Returns: Json
      }
      modrek_register_bunny_upload: {
        Args: {
          p_bunny_path: string
          p_filename: string
          p_mime: string
          p_sha256: string
          p_size: number
          p_version_id: string
        }
        Returns: Json
      }
      modrek_reindex_lessons_backlog: {
        Args: { p_limit?: number }
        Returns: number
      }
      modrek_repair_lesson_index: {
        Args: { p_source_id: string }
        Returns: Json
      }
      modrek_rescue_stuck_version: {
        Args: { p_version_id: string }
        Returns: Json
      }
      modrek_retry_failed_pages: {
        Args: { p_version_id: string }
        Returns: Json
      }
      modrek_search_cache_cleanup: { Args: never; Returns: undefined }
      modrek_subjects_equivalent: {
        Args: { _left: string; _right: string }
        Returns: boolean
      }
      modrek_version_page_summary: {
        Args: { p_version_id: string }
        Returns: Json
      }
      modrek_worker_heartbeat: { Args: never; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_content_education_type: {
        Args: { _value: string }
        Returns: string
      }
      normalize_content_section: { Args: { _value: string }; Returns: string }
      normalize_exam_grading_text: { Args: { _value: string }; Returns: string }
      normalize_exam_semantic_token: {
        Args: { _word: string }
        Returns: string
      }
      normalize_exam_target_education_type: {
        Args: { _value: string }
        Returns: string
      }
      normalize_exam_target_section: {
        Args: { _value: string }
        Returns: string
      }
      normalize_price_scope_text: { Args: { p_value: string }; Returns: string }
      price_requires_education_split:
        | { Args: { p_category: string }; Returns: boolean }
        | {
            Args: { p_category: string; p_subject_name?: string }
            Returns: boolean
          }
      process_scheduled_withdrawal_release: { Args: never; Returns: Json }
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
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_admin_wallet_deposit_request: {
        Args: { _adjustment_id: string }
        Returns: undefined
      }
      record_recharge_code_deposit_request: {
        Args: { _code_id: string; _used_at?: string; _user_id: string }
        Returns: undefined
      }
      redeem_recharge_code: {
        Args: { _code_text: string; _user_id: string }
        Returns: Json
      }
      refresh_student_exam_stats: {
        Args: { _student_id: string }
        Returns: undefined
      }
      register_device_push_token: {
        Args: { p_diagnostics?: Json; p_platform?: string; p_token: string }
        Returns: undefined
      }
      render_notification_template: {
        Args: { _tpl: string; _vars: Json }
        Returns: string
      }
      replace_exam_questions_atomic: {
        Args: { _exam_id: string; _questions?: Json }
        Returns: Json
      }
      report_test_student_query_result: {
        Args: { _context?: Json; _source_table: string; _student_ids: string[] }
        Returns: undefined
      }
      request_external_sync: {
        Args: { sync_scope?: string }
        Returns: undefined
      }
      resolve_developer_test_student: {
        Args: { _target_user_id?: string; _test_account_code?: string }
        Returns: {
          email: string
          full_name: string
          id: string
          is_test_account: boolean
          test_account_code: string
        }[]
      }
      resolve_login_email_rate_limited: {
        Args: { _ip_hash: string; _max_per_hour?: number; _phone: string }
        Returns: Json
      }
      resolve_shared_subject_key: {
        Args: { p_category: string; p_subject_name?: string }
        Returns: string
      }
      resolve_teacher_target_group: {
        Args: {
          _source_group_id: string
          _target_subject_id: string
          _teacher_id?: string
        }
        Returns: string
      }
      run_subscription_expiry_automation: { Args: never; Returns: undefined }
      run_teacher_visibility_audit: { Args: never; Returns: Json }
      save_exam_answer: {
        Args: {
          _answer_text?: string
          _attempt_id: string
          _flagged?: boolean
          _question_id: string
          _selected_option_ids?: string[]
          _time_spent?: number
        }
        Returns: Json
      }
      set_subject_default_price: {
        Args: {
          p_category: string
          p_education_type: string
          p_grade: string
          p_price: number
          p_stage: string
          p_subject_name: string
        }
        Returns: {
          applied_groups: number
          category: string
          education_type: string
          grade: string
          id: string
          price: number
          section: string
          shared_subject_id: string
          shared_subject_key: string
          stage: string
          subject_name: string
          updated_at: string
        }[]
      }
      set_support_resolution: {
        Args: { _resolved: boolean; _user_id: string }
        Returns: Json
      }
      shared_subject_category: {
        Args: { p_category?: string; p_key: string }
        Returns: string
      }
      shared_subject_display_name: {
        Args: { p_category?: string; p_key: string; p_subject_name?: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      smart_exam_text_score: {
        Args: { _answer: string; _max_score: number; _model: string }
        Returns: number
      }
      start_exam_attempt: { Args: { _exam_id: string }; Returns: Json }
      start_modrek_training_attempt: {
        Args: { _attempt_id?: string; _exam_id: string }
        Returns: Json
      }
      student_has_modrek_training_attempt: {
        Args: { _exam_id: string; _student_id: string }
        Returns: boolean
      }
      submit_exam_attempt: {
        Args: {
          _attempt_id: string
          _fullscreen_exits?: number
          _tab_switches?: number
        }
        Returns: Json
      }
      submit_exam_attempt_resilient: {
        Args: {
          _answers?: Json
          _attempt_id?: string
          _exam_id?: string
          _fullscreen_exits?: number
          _tab_switches?: number
        }
        Returns: Json
      }
      sync_exam_attempts_count: {
        Args: { _exam_id: string }
        Returns: undefined
      }
      sync_library_taxonomy_from_subjects: { Args: never; Returns: Json }
      teacher_request_withdrawal: {
        Args: {
          _amount: number
          _payment_method: string
          _phone_number: string
        }
        Returns: Json
      }
      teacher_test_student_query_regression: {
        Args: never
        Returns: {
          leaked_count: number
          scenario: string
        }[]
      }
      teacher_wallet_tx_is_for_test_student: {
        Args: { _metadata: Json }
        Returns: boolean
      }
      term_grade_key: { Args: { _grade: string }; Returns: string }
      term_item_matches_current_system_term: {
        Args: { _group_id: string; _subject_id: string; _term: string }
        Returns: boolean
      }
      validate_financial_closing_functions: { Args: never; Returns: Json }
      validate_recharge_code: {
        Args: { code_text: string }
        Returns: {
          amount: number
          id: string
          is_valid: boolean
        }[]
      }
      verify_cron_secret: {
        Args: { _name: string; _secret: string }
        Returns: boolean
      }
      voice_answers_find_similar: {
        Args: {
          p_grade: string
          p_normalized: string
          p_subject_id: string
          p_threshold?: number
        }
        Returns: {
          answer_text: string
          audio_url: string
          citations: Json
          id: string
          model: string
          similarity: number
          source: string
          voice: string
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
      ai_model_use_case:
        | "text"
        | "vision"
        | "ocr"
        | "embedding"
        | "tts"
        | "stt"
        | "image_gen"
        | "multimodal"
      app_role: "admin" | "teacher" | "student" | "support"
      approval_status: "pending" | "approved" | "rejected"
      bundles_placement: "hidden" | "sidebar" | "ad_slider" | "homepage_banner"
      exam_attempt_status: "in_progress" | "submitted" | "graded" | "expired"
      exam_difficulty: "easy" | "medium" | "hard"
      exam_question_type:
        | "mcq"
        | "true_false"
        | "short_answer"
        | "essay"
        | "fill_blank"
        | "section"
        | "tf"
      exam_status: "draft" | "published" | "archived"
      knowledge_source_status:
        | "draft"
        | "processing"
        | "ready"
        | "archived"
        | "failed"
      knowledge_unit_kind:
        | "unit"
        | "chapter"
        | "lesson"
        | "section"
        | "page"
        | "question"
        | "model_answer"
        | "glossary"
        | "other"
        | "part"
        | "paragraph"
        | "heading"
        | "definition"
        | "formula"
        | "example"
        | "exercise"
        | "note"
        | "objective"
        | "table"
        | "figure"
        | "image"
        | "equation"
        | "answer"
      pipeline_stage:
        | "uploaded"
        | "queued"
        | "detecting"
        | "ocr"
        | "text_extraction"
        | "structure_analysis"
        | "knowledge_extraction"
        | "embedding"
        | "indexing"
        | "completed"
        | "failed"
      processing_job_kind:
        | "ocr"
        | "parse"
        | "normalize"
        | "chunk"
        | "embed"
        | "index"
        | "classify"
        | "extract_questions"
        | "custom"
        | "detect"
        | "extract_text"
        | "structure"
        | "extract_knowledge"
        | "extract_page"
        | "merge_text"
        | "upload_pdf_chunk"
        | "split_pdf"
      processing_job_status:
        | "pending"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "retrying"
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
      ai_model_use_case: [
        "text",
        "vision",
        "ocr",
        "embedding",
        "tts",
        "stt",
        "image_gen",
        "multimodal",
      ],
      app_role: ["admin", "teacher", "student", "support"],
      approval_status: ["pending", "approved", "rejected"],
      bundles_placement: ["hidden", "sidebar", "ad_slider", "homepage_banner"],
      exam_attempt_status: ["in_progress", "submitted", "graded", "expired"],
      exam_difficulty: ["easy", "medium", "hard"],
      exam_question_type: [
        "mcq",
        "true_false",
        "short_answer",
        "essay",
        "fill_blank",
        "section",
        "tf",
      ],
      exam_status: ["draft", "published", "archived"],
      knowledge_source_status: [
        "draft",
        "processing",
        "ready",
        "archived",
        "failed",
      ],
      knowledge_unit_kind: [
        "unit",
        "chapter",
        "lesson",
        "section",
        "page",
        "question",
        "model_answer",
        "glossary",
        "other",
        "part",
        "paragraph",
        "heading",
        "definition",
        "formula",
        "example",
        "exercise",
        "note",
        "objective",
        "table",
        "figure",
        "image",
        "equation",
        "answer",
      ],
      pipeline_stage: [
        "uploaded",
        "queued",
        "detecting",
        "ocr",
        "text_extraction",
        "structure_analysis",
        "knowledge_extraction",
        "embedding",
        "indexing",
        "completed",
        "failed",
      ],
      processing_job_kind: [
        "ocr",
        "parse",
        "normalize",
        "chunk",
        "embed",
        "index",
        "classify",
        "extract_questions",
        "custom",
        "detect",
        "extract_text",
        "structure",
        "extract_knowledge",
        "extract_page",
        "merge_text",
        "upload_pdf_chunk",
        "split_pdf",
      ],
      processing_job_status: [
        "pending",
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "retrying",
      ],
      question_type: ["mcq", "true_false", "essay"],
    },
  },
} as const
