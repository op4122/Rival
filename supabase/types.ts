// Generated from the live schema of project rwlpwhwagcrzpusplvcz (Supabase generate_typescript_types).
// The app is plain JavaScript; editors use these types through JSDoc. Regenerate after every migration.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      exercises: {
        Row: {
          attachment: string | null
          base_slug: string | null
          created_at: string
          equipment: string
          id: string
          increment_kg: number
          is_compound: boolean
          is_custom: boolean
          name: string
          per_side: boolean
          primary_muscles: string[]
          secondary_muscles: string[]
          slug: string
          user_id: string | null
        }
        Insert: {
          attachment?: string | null
          base_slug?: string | null
          created_at?: string
          equipment?: string
          id?: string
          increment_kg?: number
          is_compound?: boolean
          is_custom?: boolean
          name: string
          per_side?: boolean
          primary_muscles?: string[]
          secondary_muscles?: string[]
          slug: string
          user_id?: string | null
        }
        Update: {
          attachment?: string | null
          base_slug?: string | null
          created_at?: string
          equipment?: string
          id?: string
          increment_kg?: number
          is_compound?: boolean
          is_custom?: boolean
          name?: string
          per_side?: boolean
          primary_muscles?: string[]
          secondary_muscles?: string[]
          slug?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          settings: Json
          units: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          settings?: Json
          units?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          settings?: Json
          units?: string
          updated_at?: string
        }
        Relationships: []
      }
      readiness_checkins: {
        Row: {
          created_at: string
          energy: number
          id: string
          score: number
          sleep_quality: number
          soreness: number
          stress: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          energy: number
          id?: string
          score: number
          sleep_quality: number
          soreness: number
          stress?: number | null
          user_id?: string
        }
        Update: {
          created_at?: string
          energy?: number
          id?: string
          score?: number
          sleep_quality?: number
          soreness?: number
          stress?: number | null
          user_id?: string
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          client_id: string
          completed_at: string
          created_at: string
          exercise_id: string
          id: string
          is_warmup: boolean
          reps: number
          rpe: number | null
          set_index: number
          user_id: string
          weight: number
          workout_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string
          created_at?: string
          exercise_id: string
          id?: string
          is_warmup?: boolean
          reps: number
          rpe?: number | null
          set_index: number
          user_id?: string
          weight?: number
          workout_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string
          created_at?: string
          exercise_id?: string
          id?: string
          is_warmup?: boolean
          reps?: number
          rpe?: number | null
          set_index?: number
          user_id?: string
          weight?: number
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          day_name: string | null
          ended_at: string | null
          id: string
          notes: string | null
          readiness_id: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_name?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          readiness_id?: string | null
          started_at: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          day_name?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          readiness_id?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_readiness_id_fkey"
            columns: ["readiness_id"]
            isOneToOne: false
            referencedRelation: "readiness_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_ghost_sets: {
        Args: { p_exclude_workout_id?: string; p_exercise_id: string }
        Returns: {
          completed_at: string
          reps: number
          rpe: number
          set_index: number
          weight: number
          workout_id: string
        }[]
      }
      get_weekly_muscle_volume: {
        Args: { p_tz?: string; p_weeks?: number }
        Returns: {
          muscle: string
          sets: number
          volume: number
          week_start: string
        }[]
      }
      is_valid_muscle_list: { Args: { m: string[] }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
