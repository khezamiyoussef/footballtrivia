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
      answers: {
        Row: {
          choice: string
          created_at: string
          id: string
          is_correct: boolean | null
          points_awarded: number
          question_id: string
          user_id: string
        }
        Insert: {
          choice: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number
          question_id: string
          user_id: string
        }
        Update: {
          choice?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_bonuses: {
        Row: {
          play_date: string
          points: number
          user_id: string
        }
        Insert: {
          play_date: string
          points: number
          user_id: string
        }
        Update: {
          play_date?: string
          points?: number
          user_id?: string
        }
        Relationships: []
      }
      email_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          current_streak: number
          display_name: string
          email: string | null
          email_verified_at: string | null
          needs_email: boolean
          id: string
          last_played_date: string | null
          longest_streak: number
          total_points: number
        }
        Insert: {
          created_at?: string
          current_streak?: number
          display_name: string
          email?: string | null
          email_verified_at?: string | null
          needs_email?: boolean
          id: string
          last_played_date?: string | null
          longest_streak?: number
          total_points?: number
        }
        Update: {
          created_at?: string
          current_streak?: number
          display_name?: string
          email?: string | null
          email_verified_at?: string | null
          needs_email?: boolean
          id?: string
          last_played_date?: string | null
          longest_streak?: number
          total_points?: number
        }
        Relationships: []
      }
      questions: {
        Row: {
          created_at: string
          id: string
          option_a_label: string | null
          option_b_label: string | null
          order_index: number
          outcome: string | null
          play_date: string
          resolved_at: string | null
          resolved_by: string | null
          source_note: string | null
          status: string
          text: string
          type: string
          options: Json | null
          is_double: boolean
          has_timer: boolean
          xo_event_slug: string | null
          xo_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          option_a_label?: string | null
          option_b_label?: string | null
          order_index: number
          outcome?: string | null
          play_date: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_note?: string | null
          status?: string
          text: string
          type: string
          options?: Json | null
          is_double?: boolean
          has_timer?: boolean
          xo_event_slug?: string | null
          xo_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          option_a_label?: string | null
          option_b_label?: string | null
          order_index?: number
          outcome?: string | null
          play_date?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_note?: string | null
          status?: string
          text?: string
          type?: string
          options?: Json | null
          is_double?: boolean
          has_timer?: boolean
          xo_event_slug?: string | null
          xo_url?: string | null
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_players: {
        Args: never
        Returns: {
          answers_count: number
          created_at: string
          current_streak: number
          display_name: string
          last_played_date: string
          longest_streak: number
          total_points: number
          user_id: string
        }[]
      }
      admin_reset_player: { Args: { _uid: string }; Returns: undefined }
      admin_stats: {
        Args: { _date: string }
        Returns: {
          players_today: number
          total_answers: number
          total_players: number
        }[]
      }
      clean_display_name: { Args: { _n: string }; Returns: string }
      crowd_split: {
        Args: { _date: string }
        Returns: {
          choice: string
          question_id: string
          votes: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      leaderboard: {
        Args: { _period: string }
        Returns: {
          current_streak: number
          display_name: string
          points: number
          user_id: string
        }[]
      }
      recompute_points: { Args: { _uid: string }; Returns: undefined }
      resolve_question: {
        Args: { _outcome: string; _question_id: string }
        Returns: undefined
      }
      submit_answers: { Args: { _answers: Json }; Returns: undefined }
      username_status: { Args: { _name: string }; Returns: string }
      create_share: { Args: { _date: string }; Returns: string }
      get_share: { Args: { _id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
