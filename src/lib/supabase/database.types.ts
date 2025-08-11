export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      playlist_videos: {
        Row: {
          id: number
          playlist_id: number
          video_id: string
          video_position: number | null
        }
        Insert: {
          id?: number
          playlist_id: number
          video_id: string
          video_position?: number | null
        }
        Update: {
          id?: number
          playlist_id?: number
          video_id?: string
          video_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "playlist_videos_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_videos_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          id: number
          image_properties: Json | null
          name: string
          search_vector: unknown | null
          short_id: string
          thumbnail_maxres_url: string | null
          thumbnail_url: string | null
          type: Database["public"]["Enums"]["playlist_type"]
          youtube_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          id?: number
          image_properties?: Json | null
          name: string
          search_vector?: unknown | null
          short_id: string
          thumbnail_maxres_url?: string | null
          thumbnail_url?: string | null
          type?: Database["public"]["Enums"]["playlist_type"]
          youtube_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          id?: number
          image_properties?: Json | null
          name?: string
          search_vector?: unknown | null
          short_id?: string
          thumbnail_maxres_url?: string | null
          thumbnail_url?: string | null
          type?: Database["public"]["Enums"]["playlist_type"]
          youtube_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          content_description:
            | Database["public"]["Enums"]["content_description"]
            | null
          content_display: Database["public"]["Enums"]["content_display"] | null
          id: string
          providers: string[]
          sources: Database["public"]["Enums"]["source"][] | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          content_description?:
            | Database["public"]["Enums"]["content_description"]
            | null
          content_display?:
            | Database["public"]["Enums"]["content_display"]
            | null
          id: string
          providers?: string[]
          sources?: Database["public"]["Enums"]["source"][] | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          content_description?:
            | Database["public"]["Enums"]["content_description"]
            | null
          content_display?:
            | Database["public"]["Enums"]["content_display"]
            | null
          id?: string
          providers?: string[]
          sources?: Database["public"]["Enums"]["source"][] | null
          username?: string | null
        }
        Relationships: []
      }
      timestamps: {
        Row: {
          created_at: string
          id: number
          playlist_id: number | null
          sort_order: Database["public"]["Enums"]["playlist_sort_order"] | null
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"] | null
          updated_at: string
          user_id: string
          video_id: string
          video_start_seconds: number | null
          watched_at: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          playlist_id?: number | null
          sort_order?: Database["public"]["Enums"]["playlist_sort_order"] | null
          sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"] | null
          updated_at?: string
          user_id: string
          video_id: string
          video_start_seconds?: number | null
          watched_at?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          playlist_id?: number | null
          sort_order?: Database["public"]["Enums"]["playlist_sort_order"] | null
          sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"] | null
          updated_at?: string
          user_id?: string
          video_id?: string
          video_start_seconds?: number | null
          watched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timestamps_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_video_timestamps_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_playlists: {
        Row: {
          id: number
          playlist_position: number | null
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          user_id: string
        }
        Insert: {
          id: number
          playlist_position?: number | null
          sort_order?: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"]
          user_id: string
        }
        Update: {
          id?: number
          playlist_position?: number | null
          sort_order?: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_playlists_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      video_history: {
        Row: {
          created_at: string
          seconds_watched: number
          session_end_time: string | null
          session_start_time: string
          source: Database["public"]["Enums"]["source"]
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          seconds_watched?: number
          session_end_time?: string | null
          session_start_time?: string
          source: Database["public"]["Enums"]["source"]
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          seconds_watched?: number
          session_end_time?: string | null
          session_start_time?: string
          source?: Database["public"]["Enums"]["source"]
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_history_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          description: string
          duration: string | null
          id: string
          pending_delete: boolean | null
          published_at: string
          search_vector: unknown | null
          source: Database["public"]["Enums"]["source"]
          thumbnail_maxres_url: string | null
          thumbnail_url: string
          title: string
        }
        Insert: {
          description: string
          duration?: string | null
          id: string
          pending_delete?: boolean | null
          published_at?: string
          search_vector?: unknown | null
          source: Database["public"]["Enums"]["source"]
          thumbnail_maxres_url?: string | null
          thumbnail_url: string
          title: string
        }
        Update: {
          description?: string
          duration?: string | null
          id?: string
          pending_delete?: boolean | null
          published_at?: string
          search_vector?: unknown | null
          source?: Database["public"]["Enums"]["source"]
          thumbnail_maxres_url?: string | null
          thumbnail_url?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_user_access_playlist: {
        Args: { playlist_id: number; user_id?: string }
        Returns: boolean
      }
      create_user: {
        Args: { email: string; password: string; username: string }
        Returns: string
      }
      delete_pending_videos: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      delete_playlist: {
        Args: { p_playlist_id: number }
        Returns: boolean
      }
      delete_playlist_videos: {
        Args: { p_playlist_id: number; p_video_ids: string[] }
        Returns: {
          video_id: string
          success: boolean
          message: string
        }[]
      }
      delete_timestamps: {
        Args: { p_video_ids: string[] }
        Returns: {
          id: string
          source: Database["public"]["Enums"]["source"]
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          published_at: string
          duration: string
          video_start_seconds: number
          watched_at: string
          updated_at: string
        }[]
      }
      delete_user: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      follow_playlist: {
        Args: { p_playlist_id: number; p_playlist_position?: number }
        Returns: {
          playlist_id: number
          user_id: string
          playlist_position: number
        }[]
      }
      generate_unique_username: {
        Args: { base_username: string; exclude_user_id?: string }
        Returns: string
      }
      get_discord_avatar_url: {
        Args: { user_id: string }
        Returns: string
      }
      get_in_progress_videos_with_timestamps: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          source: Database["public"]["Enums"]["source"]
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          published_at: string
          duration: string
          video_start_seconds: number
          watched_at: string
          updated_at: string
          playlist_sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          playlist_sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          playlist_name: string
          playlist_short_id: string
        }[]
      }
      get_playlist_by_youtube_id: {
        Args: { p_youtube_id: string }
        Returns: {
          id: number
          created_at: string
          name: string
          short_id: string
          created_by: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          type: Database["public"]["Enums"]["playlist_type"]
          image_properties: Json
          youtube_id: string
          profile_username: string
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
        }[]
      }
      get_playlist_data: {
        Args: {
          p_current_page?: number
          p_limit?: number
          p_short_id?: string
          p_sort_key?: string
          p_sort_order?: string
          p_user_id?: string
          p_youtube_id?: string
        }
        Returns: {
          playlist_id: number
          playlist_created_at: string
          playlist_name: string
          playlist_short_id: string
          playlist_created_by: string
          playlist_description: string
          playlist_thumbnail_url: string
          playlist_thumbnail_maxres_url: string
          playlist_type: Database["public"]["Enums"]["playlist_type"]
          playlist_image_properties: Json
          playlist_youtube_id: string
          profile_username: string
          playlist_sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          playlist_sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          video_id: string
          video_position: number
          video_source: Database["public"]["Enums"]["source"]
          video_title: string
          video_description: string
          video_thumbnail_url: string
          video_thumbnail_maxres_url: string
          video_published_at: string
          video_duration: string
          video_start_seconds: number
          video_watched_at: string
          video_updated_at: string
          total_videos_count: number
          total_duration_seconds: number
          is_duration_row: boolean
        }[]
      }
      get_playlist_video_context: {
        Args: {
          p_context_limit?: number
          p_short_id: string
          p_video_id: string
        }
        Returns: {
          playlist_id: number
          playlist_created_at: string
          playlist_name: string
          playlist_short_id: string
          playlist_created_by: string
          playlist_description: string
          playlist_thumbnail_url: string
          playlist_thumbnail_maxres_url: string
          playlist_type: Database["public"]["Enums"]["playlist_type"]
          playlist_image_properties: Json
          playlist_youtube_id: string
          profile_username: string
          playlist_sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          playlist_sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          video_id: string
          video_position: number
          video_source: Database["public"]["Enums"]["source"]
          video_title: string
          video_description: string
          video_thumbnail_url: string
          video_thumbnail_maxres_url: string
          video_published_at: string
          video_duration: string
          video_start_seconds: number
          video_watched_at: string
          video_updated_at: string
          video_timestamp_playlist_id: number
          video_timestamp_sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          video_timestamp_sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          is_current_video: boolean
          total_videos_count: number
          current_video_index: number
        }[]
      }
      get_playlists_for_username: {
        Args: { p_username: string }
        Returns: {
          id: number
          created_at: string
          name: string
          short_id: string
          created_by: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          type: Database["public"]["Enums"]["playlist_type"]
          image_properties: Json
          youtube_id: string
          profile_username: string
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          deleted_at: string
        }[]
      }
      get_user_accessible_playlists: {
        Args: { target_user_id?: string }
        Returns: {
          id: number
          name: string
          type: Database["public"]["Enums"]["playlist_type"]
          created_by: string
          created_at: string
          updated_at: string
        }[]
      }
      get_user_playlists: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: number
          created_by: string
          created_at: string
          name: string
          short_id: string
          description: string
          type: Database["public"]["Enums"]["playlist_type"]
          thumbnail_url: string
          thumbnail_maxres_url: string
          image_properties: Json
          playlist_position: number
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          youtube_id: string
          profile_username: string
          deleted_at: string
        }[]
      }
      get_user_video_history: {
        Args: { p_limit?: number; p_offset?: number; p_video_id?: string }
        Returns: {
          id: string
          user_id: string
          video_id: string
          source: Database["public"]["Enums"]["source"]
          seconds_watched: number
          session_start_time: string
          session_end_time: string
          created_at: string
          updated_at: string
          video_title: string
          video_duration: string
          video_thumbnail_url: string
        }[]
      }
      get_video_analytics: {
        Args: { p_days_back?: number; p_video_id?: string }
        Returns: {
          video_id: string
          video_title: string
          total_sessions: number
          total_seconds_watched: number
          average_session_length: number
          last_watched: string
          first_watched: string
        }[]
      }
      get_videos_with_timestamps: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          source: Database["public"]["Enums"]["source"]
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          published_at: string
          duration: string
          video_start_seconds: number
          watched_at: string
          updated_at: string
          playlist_id: number
        }[]
      }
      initialize_user_playlist_positions: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      insert_playlist: {
        Args: {
          p_created_by: string
          p_description?: string
          p_image_properties?: Json
          p_name?: string
          p_playlist_position?: number
          p_thumbnail_maxres_url?: string
          p_thumbnail_url?: string
          p_type?: Database["public"]["Enums"]["playlist_type"]
        }
        Returns: {
          playlist_id: number
          created_by: string
          created_at: string
          name: string
          short_id: string
          description: string
          type: Database["public"]["Enums"]["playlist_type"]
          thumbnail_url: string
          thumbnail_maxres_url: string
          image_properties: Json
          playlist_position: number
        }[]
      }
      insert_playlist_videos: {
        Args: { p_playlist_id: number; p_video_ids: string[] }
        Returns: {
          id: number
          playlist_id: number
          video_id: string
          video_position: number
        }[]
      }
      insert_timestamp: {
        Args: {
          p_playlist_id?: number
          p_sort_order?: Database["public"]["Enums"]["playlist_sort_order"]
          p_sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"]
          p_video_id: string
          p_video_start_seconds?: number
          p_watched_at?: string
        }
        Returns: {
          id: string
          source: Database["public"]["Enums"]["source"]
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          published_at: string
          duration: string
          video_start_seconds: number
          watched_at: string
          updated_at: string
          playlist_id: number
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
        }[]
      }
      insert_timestamps: {
        Args: {
          p_video_ids: string[]
          p_video_start_seconds?: number[]
          p_watched_at?: string[]
        }
        Returns: {
          id: string
          source: Database["public"]["Enums"]["source"]
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          published_at: string
          duration: string
          video_start_seconds: number
          watched_at: string
          updated_at: string
          playlist_id: number
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
        }[]
      }
      is_unique_username: {
        Args: { p_username: string }
        Returns: boolean
      }
      restore_playlist: {
        Args: { p_playlist_id: number }
        Returns: boolean
      }
      search_playlists: {
        Args: {
          current_user_id?: string
          limit_count?: number
          offset_count?: number
          search_term: string
        }
        Returns: {
          id: number
          short_id: string
          name: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          image_properties: Json
          created_at: string
          created_by: string
          type: Database["public"]["Enums"]["playlist_type"]
          youtube_id: string
          profile_username: string
          search_rank: number
          deleted_at: string
        }[]
      }
      search_videos: {
        Args: { offset_count?: number; search_term: string }
        Returns: {
          id: string
          source: Database["public"]["Enums"]["source"]
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          published_at: string
          duration: string
          video_start_seconds: number
          updated_at: string
          search_rank: number
        }[]
      }
      start_video_history_session: {
        Args: { p_session_start_time?: string; p_video_id: string }
        Returns: {
          id: string
          user_id: string
          video_id: string
          source: Database["public"]["Enums"]["source"]
          seconds_watched: number
          session_start_time: string
          session_end_time: string
          created_at: string
          updated_at: string
          is_resumed: boolean
        }[]
      }
      unfollow_playlist: {
        Args: { p_playlist_id: number }
        Returns: {
          playlist_id: number
          user_id: string
        }[]
      }
      update_playlist_position: {
        Args: { p_new_position: number; p_playlist_id: number }
        Returns: {
          playlist_id: number
          user_id: string
          created_by: string
          created_at: string
          name: string
          short_id: string
          description: string
          type: Database["public"]["Enums"]["playlist_type"]
          thumbnail_url: string
          thumbnail_maxres_url: string
          image_properties: Json
          youtube_id: string
          playlist_position: number
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
        }[]
      }
      update_playlist_videos_positions: {
        Args: {
          p_new_position: number
          p_playlist_id: number
          p_video_ids: string[]
        }
        Returns: {
          result_id: number
          result_playlist_id: number
          result_video_id: string
          result_video_position: number
        }[]
      }
      update_video_history_end_time: {
        Args: {
          p_session_end_time?: string
          p_session_start_time: string
          p_video_id: string
        }
        Returns: {
          id: string
          user_id: string
          video_id: string
          source: Database["public"]["Enums"]["source"]
          seconds_watched: number
          session_start_time: string
          session_end_time: string
          created_at: string
          updated_at: string
        }[]
      }
      update_video_history_seconds_watched: {
        Args: {
          p_seconds_watched: number
          p_session_end_time?: string
          p_session_start_time: string
          p_video_id: string
        }
        Returns: {
          id: string
          user_id: string
          video_id: string
          source: Database["public"]["Enums"]["source"]
          seconds_watched: number
          session_start_time: string
          session_end_time: string
          created_at: string
          updated_at: string
        }[]
      }
      validate_playlist_thumbnail_urls: {
        Args: {
          p_playlist_id: number
          p_thumbnail_maxres_url?: string
          p_thumbnail_url?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      content_description: "FULL" | "BRIEF" | "NONE"
      content_display: "TABLE" | "TILES"
      playlist_sort_order: "ascending" | "descending"
      playlist_sorted_by: "title" | "datePublished" | "playlistOrder"
      playlist_type: "Public" | "Private"
      source: "giantbomb" | "nextlander" | "jeffgerstmann" | "remap"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      content_description: ["FULL", "BRIEF", "NONE"],
      content_display: ["TABLE", "TILES"],
      playlist_sort_order: ["ascending", "descending"],
      playlist_sorted_by: ["title", "datePublished", "playlistOrder"],
      playlist_type: ["Public", "Private"],
      source: ["giantbomb", "nextlander", "jeffgerstmann", "remap"],
    },
  },
} as const

