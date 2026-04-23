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
      ai_reviews: {
        Row: {
          comments: string | null
          created_at: string
          frames_analyzed: number
          id: string
          model: string
          provider: string
          raw_response: Json | null
          rubric: Json
          score: number | null
          submission_id: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          frames_analyzed?: number
          id?: string
          model: string
          provider: string
          raw_response?: Json | null
          rubric?: Json
          score?: number | null
          submission_id: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          frames_analyzed?: number
          id?: string
          model?: string
          provider?: string
          raw_response?: Json | null
          rubric?: Json
          score?: number | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_reviews_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          assigned_by: string | null
          course_id: string
          created_at: string
          deadline: string | null
          id: string
          priority: Database["public"]["Enums"]["assignment_priority"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          course_id: string
          created_at?: string
          deadline?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["assignment_priority"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          course_id?: string
          created_at?: string
          deadline?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["assignment_priority"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_snapshots: {
        Row: {
          captured_at: string
          id: string
          kind: string
          session_id: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          id?: string
          kind: string
          session_id?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          captured_at?: string
          id?: string
          kind?: string
          session_id?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          status: Database["public"]["Enums"]["course_status"]
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["course_status"]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["course_status"]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      franchises: {
        Row: {
          archived_at: string | null
          auto_delete_at: string | null
          created_at: string
          id: string
          location: string | null
          manager_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          auto_delete_at?: string | null
          created_at?: string
          id?: string
          location?: string | null
          manager_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          auto_delete_at?: string | null
          created_at?: string
          id?: string
          location?: string | null
          manager_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          franchise_id: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          franchise_id?: string | null
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          franchise_id?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          id: string
          last_position: number
          lesson_id: string
          progress_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          last_position?: number
          lesson_id: string
          progress_percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          last_position?: number
          lesson_id?: string
          progress_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: Json
          created_at: string
          duration_seconds: number | null
          id: string
          position: number
          section_id: string
          title: string
          type: Database["public"]["Enums"]["lesson_type"]
        }
        Insert: {
          content?: Json
          created_at?: string
          duration_seconds?: number | null
          id?: string
          position?: number
          section_id: string
          title: string
          type: Database["public"]["Enums"]["lesson_type"]
        }
        Update: {
          content?: Json
          created_at?: string
          duration_seconds?: number | null
          id?: string
          position?: number
          section_id?: string
          title?: string
          type?: Database["public"]["Enums"]["lesson_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lessons_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          franchise_id: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          franchise_id?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          franchise_id?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          priority: Database["public"]["Enums"]["assignment_priority"]
          project_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["assignment_priority"]
          project_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["assignment_priority"]
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_submissions: {
        Row: {
          created_at: string
          feedback: string | null
          file_url: string
          grade: number | null
          id: string
          letter_grade: string | null
          project_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["submission_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          file_url: string
          grade?: number | null
          id?: string
          letter_grade?: string | null
          project_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          file_url?: string
          grade?: number | null
          id?: string
          letter_grade?: string | null
          project_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          attachment_path: string | null
          created_at: string
          created_by: string
          deadline: string | null
          description: string | null
          franchise_id: string | null
          id: string
          status: Database["public"]["Enums"]["course_status"]
          title: string
          updated_at: string
        }
        Insert: {
          attachment_path?: string | null
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string | null
          franchise_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["course_status"]
          title: string
          updated_at?: string
        }
        Update: {
          attachment_path?: string | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string | null
          franchise_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["course_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          course_id: string
          created_at: string
          id: string
          position: number
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          position?: number
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          active_seconds: number
          blur_count: number
          client_info: Json
          course_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          idle_seconds: number
          last_heartbeat_at: string
          lesson_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          active_seconds?: number
          blur_count?: number
          client_info?: Json
          course_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          idle_seconds?: number
          last_heartbeat_at?: string
          lesson_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          active_seconds?: number
          blur_count?: number
          client_info?: Json
          course_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          idle_seconds?: number
          last_heartbeat_at?: string
          lesson_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          created_at: string
          feedback: string | null
          file_url: string
          grade: number | null
          id: string
          lesson_id: string
          letter_grade: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["submission_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          file_url: string
          grade?: number | null
          id?: string
          lesson_id: string
          letter_grade?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          file_url?: string
          grade?: number | null
          id?: string
          lesson_id?: string
          letter_grade?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_lesson_id_fkey"
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
          franchise_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          franchise_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          franchise_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_franchise_id_fkey"
            columns: ["franchise_id"]
            isOneToOne: false
            referencedRelation: "franchises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { _token: string }; Returns: Json }
      archive_franchise: { Args: { _franchise_id: string }; Returns: Json }
      claim_first_ceo: { Args: never; Returns: boolean }
      close_stale_sessions: { Args: never; Returns: number }
      get_franchise_member_emails: {
        Args: { _franchise_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_user_franchise: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_franchise: {
        Args: { _force?: boolean; _franchise_id: string }
        Returns: Json
      }
      remove_member_from_franchise: {
        Args: { _user_id: string }
        Returns: Json
      }
      restore_franchise: { Args: { _franchise_id: string }; Returns: Json }
      seed_demo_content: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "ceo" | "incharge" | "member"
      assignment_priority: "mandatory" | "recommended"
      course_status: "draft" | "published"
      lesson_type: "video" | "pdf" | "quiz" | "practical"
      submission_status: "pending" | "approved" | "revision"
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
      app_role: ["ceo", "incharge", "member"],
      assignment_priority: ["mandatory", "recommended"],
      course_status: ["draft", "published"],
      lesson_type: ["video", "pdf", "quiz", "practical"],
      submission_status: ["pending", "approved", "revision"],
    },
  },
} as const
