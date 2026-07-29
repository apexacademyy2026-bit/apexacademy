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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          created_at: string
          event_id: string
          fee_override: number | null
          homework_note: string | null
          id: string
          present: boolean
          student_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          fee_override?: number | null
          homework_note?: string | null
          id?: string
          present?: boolean
          student_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          fee_override?: number | null
          homework_note?: string | null
          id?: string
          present?: boolean
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "schedule_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          class_id: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_documents: {
        Row: {
          class_id: string
          created_at: string
          id: string
          lesson_id: string | null
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          lesson_id?: string | null
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          lesson_id?: string | null
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_documents_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_documents_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      class_members: {
        Row: {
          class_id: string
          id: string
          joined_at: string
          student_id: string
        }
        Insert: {
          class_id: string
          id?: string
          joined_at?: string
          student_id: string
        }
        Update: {
          class_id?: string
          id?: string
          joined_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedules: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          category: string | null
          color: string
          created_at: string
          end_date: string | null
          fee_per_month: number
          fee_per_session: number
          grade: string | null
          id: string
          join_code: string | null
          name: string
          notes: string | null
          start_date: string | null
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          color?: string
          created_at?: string
          end_date?: string | null
          fee_per_month?: number
          fee_per_session?: number
          grade?: string | null
          id?: string
          join_code?: string | null
          name: string
          notes?: string | null
          start_date?: string | null
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          color?: string
          created_at?: string
          end_date?: string | null
          fee_per_month?: number
          fee_per_session?: number
          grade?: string | null
          id?: string
          join_code?: string | null
          name?: string
          notes?: string | null
          start_date?: string | null
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          student_id: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          student_id: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          class_id: string | null
          created_at: string
          cycle_label: string
          cycle_type: string
          id: string
          paid_at: string
          period_end: string | null
          period_start: string | null
          session_count: number | null
          student_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          class_id?: string | null
          created_at?: string
          cycle_label: string
          cycle_type: string
          id?: string
          paid_at?: string
          period_end?: string | null
          period_start?: string | null
          session_count?: number | null
          student_id: string
          user_id: string
        }
        Update: {
          amount?: number
          class_id?: string | null
          created_at?: string
          cycle_label?: string
          cycle_type?: string
          id?: string
          paid_at?: string
          period_end?: string | null
          period_start?: string | null
          session_count?: number | null
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_code: string | null
          brand_name: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          id: string
          language: string
          parent_name: string | null
          parent_phone: string | null
          phone: string | null
          school_class: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          brand_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          id: string
          language?: string
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          school_class?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          brand_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          id?: string
          language?: string
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          school_class?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      schedule_events: {
        Row: {
          class_id: string
          created_at: string
          end_time: string
          event_date: string
          id: string
          notes: string | null
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          end_time: string
          event_date: string
          id?: string
          notes?: string | null
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          end_time?: string
          event_date?: string
          id?: string
          notes?: string | null
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          color: string
          created_at: string
          fee_per_month: number
          fee_per_session: number
          grade: string | null
          id: string
          linked_user_id: string | null
          name: string
          notes: string | null
          parent_name: string | null
          parent_phone: string | null
          payment_mode: string
          sessions_per_cycle: number
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          fee_per_month?: number
          fee_per_session?: number
          grade?: string | null
          id?: string
          linked_user_id?: string | null
          name: string
          notes?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          payment_mode?: string
          sessions_per_cycle?: number
          start_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          fee_per_month?: number
          fee_per_session?: number
          grade?: string | null
          id?: string
          linked_user_id?: string | null
          name?: string
          notes?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          payment_mode?: string
          sessions_per_cycle?: number
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      test_attempts: {
        Row: {
          answers: Json
          id: string
          max_score: number
          score: number
          started_at: string
          student_id: string
          submitted_at: string | null
          test_id: string
        }
        Insert: {
          answers?: Json
          id?: string
          max_score?: number
          score?: number
          started_at?: string
          student_id: string
          submitted_at?: string | null
          test_id: string
        }
        Update: {
          answers?: Json
          id?: string
          max_score?: number
          score?: number
          started_at?: string
          student_id?: string
          submitted_at?: string | null
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_parts: {
        Row: {
          audio_url: string | null
          created_at: string
          id: string
          passage: string | null
          position: number
          section: string | null
          test_id: string
          title: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          id?: string
          passage?: string | null
          position?: number
          section?: string | null
          test_id: string
          title?: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          id?: string
          passage?: string | null
          position?: number
          section?: string | null
          test_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_parts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_questions: {
        Row: {
          audio_url: string | null
          correct: Json
          created_at: string
          id: string
          image_url: string | null
          options: Json
          part: string
          part_id: string | null
          passage: string | null
          points: number
          position: number
          section: string | null
          statement_latex: string
          test_id: string
        }
        Insert: {
          audio_url?: string | null
          correct?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          options?: Json
          part: string
          part_id?: string | null
          passage?: string | null
          points?: number
          position?: number
          section?: string | null
          statement_latex?: string
          test_id: string
        }
        Update: {
          audio_url?: string | null
          correct?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          options?: Json
          part?: string
          part_id?: string | null
          passage?: string | null
          points?: number
          position?: number
          section?: string | null
          statement_latex?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_questions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "test_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          class_id: string
          created_at: string
          duration_minutes: number
          id: string
          is_open: boolean
          lesson_id: string | null
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_open?: boolean
          lesson_id?: string | null
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_open?: boolean
          lesson_id?: string | null
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vocabulary: {
        Row: {
          audio_uk_url: string | null
          audio_us_url: string | null
          created_at: string
          example: string | null
          id: string
          lesson_id: string
          meaning_en: string | null
          meaning_vi: string | null
          phonetic_uk: string | null
          phonetic_us: string | null
          position: number
          updated_at: string
          user_id: string
          word: string
          word_class: string | null
        }
        Insert: {
          audio_uk_url?: string | null
          audio_us_url?: string | null
          created_at?: string
          example?: string | null
          id?: string
          lesson_id: string
          meaning_en?: string | null
          meaning_vi?: string | null
          phonetic_uk?: string | null
          phonetic_us?: string | null
          position?: number
          updated_at?: string
          user_id: string
          word: string
          word_class?: string | null
        }
        Update: {
          audio_uk_url?: string | null
          audio_us_url?: string | null
          created_at?: string
          example?: string | null
          id?: string
          lesson_id?: string
          meaning_en?: string | null
          meaning_vi?: string | null
          phonetic_uk?: string | null
          phonetic_us?: string | null
          position?: number
          updated_at?: string
          user_id?: string
          word?: string
          word_class?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gen_join_code: { Args: never; Returns: string }
      get_attempt_review: {
        Args: { _attempt_id: string }
        Returns: {
          correct: Json
          id: string
          image_url: string
          options: Json
          part: string
          points: number
          position: number
          statement_latex: string
          test_id: string
        }[]
      }
      get_test_questions_for_student: {
        Args: { _test_id: string }
        Returns: {
          audio_url: string
          id: string
          image_url: string
          options: Json
          part: string
          part_id: string
          passage: string
          points: number
          position: number
          section: string
          statement_latex: string
          test_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      join_class_with_code: { Args: { _code: string }; Returns: string }
      submit_test_attempt: {
        Args: { _answers: Json; _attempt_id: string }
        Returns: {
          max_score: number
          score: number
        }[]
      }
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
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
      app_role: ["student", "teacher", "admin"],
    },
  },
} as const
