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
      content: {
        Row: {
          created_at: string | null
          description: string | null
          duration: string | null
          file_url: string
          group_id: string | null
          id: string
          is_active: boolean | null
          is_paid: boolean
          order_index: number | null
          page_count: number | null
          subject_id: string | null
          title: string
          type: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration?: string | null
          file_url: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          is_paid?: boolean
          order_index?: number | null
          page_count?: number | null
          subject_id?: string | null
          title: string
          type: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration?: string | null
          file_url?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          is_paid?: boolean
          order_index?: number | null
          page_count?: number | null
          subject_id?: string | null
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
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
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
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
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
      notifications: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
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
          created_at: string | null
          email: string
          full_name: string
          grade: string | null
          id: string
          is_banned: boolean | null
          phone: string | null
          role: string | null
          section: string | null
          stage: string | null
          student_code: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name: string
          grade?: string | null
          id: string
          is_banned?: boolean | null
          phone?: string | null
          role?: string | null
          section?: string | null
          stage?: string | null
          student_code?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          grade?: string | null
          id?: string
          is_banned?: boolean | null
          phone?: string | null
          role?: string | null
          section?: string | null
          stage?: string | null
          student_code?: string | null
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
      support_messages: {
        Row: {
          created_at: string | null
          id: string
          is_from_admin: boolean | null
          is_read: boolean | null
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_from_admin?: boolean | null
          is_read?: boolean | null
          message: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_from_admin?: boolean | null
          is_read?: boolean | null
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_assignments: {
        Row: {
          category: string
          created_at: string | null
          grade: string
          id: string
          section: string | null
          stage: string
          teacher_id: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          grade: string
          id?: string
          section?: string | null
          stage: string
          teacher_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          grade?: string
          id?: string
          section?: string | null
          stage?: string
          teacher_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      teacher_profiles: {
        Row: {
          bio: string | null
          created_at: string | null
          is_approved: boolean | null
          photo_url: string | null
          teacher_id: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          is_approved?: boolean | null
          photo_url?: string | null
          teacher_id: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          is_approved?: boolean | null
          photo_url?: string | null
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
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_category?: string | null
          assigned_grades?: string[] | null
          assigned_sections?: string[] | null
          assigned_stages?: string[] | null
          created_at?: string | null
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
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_category?: string | null
          assigned_grades?: string[] | null
          assigned_sections?: string[] | null
          assigned_stages?: string[] | null
          created_at?: string | null
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
      [_ in never]: never
    }
    Functions: {
      generate_student_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student" | "support"
      approval_status: "pending" | "approved" | "rejected"
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
      app_role: ["admin", "teacher", "student", "support"],
      approval_status: ["pending", "approved", "rejected"],
    },
  },
} as const
