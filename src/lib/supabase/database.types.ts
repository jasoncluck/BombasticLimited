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
      image_processing_jobs: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          image_type: string
          max_attempts: number
          priority: number
          processing_completed_at: string | null
          processing_started_at: string | null
          source_url: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          image_type: string
          max_attempts?: number
          priority?: number
          processing_completed_at?: string | null
          processing_started_at?: string | null
          source_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          image_type?: string
          max_attempts?: number
          priority?: number
          processing_completed_at?: string | null
          processing_started_at?: string | null
          source_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          created_by: string | null
          end_datetime: string | null
          id: number
          is_test: boolean
          message: string
          metadata: Json | null
          start_datetime: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          created_by?: string | null
          end_datetime?: string | null
          id?: number
          is_test?: boolean
          message: string
          metadata?: Json | null
          start_datetime?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          action_url?: string | null
          created_at?: string
          created_by?: string | null
          end_datetime?: string | null
          id?: number
          is_test?: boolean
          message?: string
          metadata?: Json | null
          start_datetime?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          duration_seconds: number | null
          id: number
          image_avif_url: string | null
          image_processing_status: string | null
          image_processing_updated_at: string | null
          image_properties: Json | null
          image_url: string | null
          image_webp_url: string | null
          name: string
          search_vector: unknown | null
          short_id: string
          type: Database["public"]["Enums"]["playlist_type"]
          updated_at: string | null
          youtube_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: number
          image_avif_url?: string | null
          image_processing_status?: string | null
          image_processing_updated_at?: string | null
          image_properties?: Json | null
          image_url?: string | null
          image_webp_url?: string | null
          name: string
          search_vector?: unknown | null
          short_id: string
          type?: Database["public"]["Enums"]["playlist_type"]
          updated_at?: string | null
          youtube_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: number
          image_avif_url?: string | null
          image_processing_status?: string | null
          image_processing_updated_at?: string | null
          image_properties?: Json | null
          image_url?: string | null
          image_webp_url?: string | null
          name?: string
          search_vector?: unknown | null
          short_id?: string
          type?: Database["public"]["Enums"]["playlist_type"]
          updated_at?: string | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playlists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["profile_account_type"]
          avatar_url: string | null
          content_description: Database["public"]["Enums"]["content_description"]
          content_display: Database["public"]["Enums"]["content_display"]
          id: string
          sources: Database["public"]["Enums"]["source"][]
          username: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["profile_account_type"]
          avatar_url?: string | null
          content_description?: Database["public"]["Enums"]["content_description"]
          content_display?: Database["public"]["Enums"]["content_display"]
          id: string
          sources?: Database["public"]["Enums"]["source"][]
          username?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["profile_account_type"]
          avatar_url?: string | null
          content_description?: Database["public"]["Enums"]["content_description"]
          content_display?: Database["public"]["Enums"]["content_display"]
          id?: string
          sources?: Database["public"]["Enums"]["source"][]
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
            foreignKeyName: "timestamps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timestamps_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          assigned_at: string
          dismissed: boolean
          id: string
          notification_id: number
          read: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          dismissed?: boolean
          id?: string
          notification_id: number
          read?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          dismissed?: boolean
          id?: string
          notification_id?: number
          read?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_playlists: {
        Row: {
          added_at: string
          id: number
          playlist_position: number | null
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          user_id: string
        }
        Insert: {
          added_at?: string
          id: number
          playlist_position?: number | null
          sort_order?: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"]
          user_id: string
        }
        Update: {
          added_at?: string
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
          {
            foreignKeyName: "user_playlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "video_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          duration: string
          id: string
          image_processing_status: string | null
          image_processing_updated_at: string | null
          pending_delete: boolean | null
          published_at: string
          search_vector: unknown | null
          source: Database["public"]["Enums"]["source"]
          thumbnail_avif_url: string | null
          thumbnail_maxres_avif_url: string | null
          thumbnail_maxres_url: string | null
          thumbnail_maxres_webp_url: string | null
          thumbnail_url: string
          thumbnail_webp_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          description: string
          duration?: string
          id: string
          image_processing_status?: string | null
          image_processing_updated_at?: string | null
          pending_delete?: boolean | null
          published_at?: string
          search_vector?: unknown | null
          source: Database["public"]["Enums"]["source"]
          thumbnail_avif_url?: string | null
          thumbnail_maxres_avif_url?: string | null
          thumbnail_maxres_url?: string | null
          thumbnail_maxres_webp_url?: string | null
          thumbnail_url: string
          thumbnail_webp_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          description?: string
          duration?: string
          id?: string
          image_processing_status?: string | null
          image_processing_updated_at?: string | null
          pending_delete?: boolean | null
          published_at?: string
          search_vector?: unknown | null
          source?: Database["public"]["Enums"]["source"]
          thumbnail_avif_url?: string | null
          thumbnail_maxres_avif_url?: string | null
          thumbnail_maxres_url?: string | null
          thumbnail_maxres_webp_url?: string | null
          thumbnail_url?: string
          thumbnail_webp_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_playlist_data: {
        Args: {
          p_short_id?: string
          p_youtube_id?: string
          p_user_id?: string
          p_current_page?: number
          p_limit?: number
          p_sort_key?: string
          p_sort_order?: string
        }
        Returns: {
          playlist_id: number
          playlist_created_at: string
          playlist_name: string
          playlist_short_id: string
          playlist_created_by: string
          playlist_description: string
          playlist_image_url: string
          playlist_image_webp_url: string
          playlist_image_avif_url: string
          playlist_image_processing_status: string
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
          video_thumbnail_webp_url: string
          video_thumbnail_avif_url: string
          video_thumbnail_maxres_webp_url: string
          video_thumbnail_maxres_avif_url: string
          video_image_processing_status: string
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
      get_user_playlists: {
        Args: Record<PropertyKey, never>
        Returns: {
          added_at: string
          avatar_url: string
          created_at: string
          created_by: string
          deleted_at: string
          description: string
          duration_seconds: number
          id: number
          image_avif_url: string
          image_url: string
          image_processing_status: string
          image_properties: Json
          image_webp_url: string
          name: string
          playlist_position: number
          profile_username: string
          short_id: string
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          type: Database["public"]["Enums"]["playlist_type"]
          youtube_id: string
        }[]
      }
      get_playlists_for_username: {
        Args: { p_username: string }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string
          description: string
          duration_seconds: number
          id: number
          image_avif_url: string
          image_url: string
          image_processing_status: string
          image_properties: Json
          image_webp_url: string
          name: string
          profile_username: string
          short_id: string
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          type: Database["public"]["Enums"]["playlist_type"]
          youtube_id: string
        }[]
      }
      search_playlists: {
        Args: {
          current_user_id?: string
          limit_count?: number
          offset_count?: number
          search_term: string
        }
        Returns: {
          created_at: string
          created_by: string
          deleted_at: string
          description: string
          duration_seconds: number
          id: number
          image_avif_url: string
          image_url: string
          image_processing_status: string
          image_properties: Json
          image_webp_url: string
          name: string
          profile_username: string
          search_rank: number
          short_id: string
          type: Database["public"]["Enums"]["playlist_type"]
          youtube_id: string
        }[]
      }
      update_playlist_uploaded_image: {
        Args: {
          p_playlist_id: number
          p_image_url: string
          p_image_properties?: Json
        }
        Returns: {
          success: boolean
          playlist_id: number
          image_url: string
        }[]
      }
    }
    Enums: {
      content_description: "BRIEF" | "NORMAL" | "DETAILED"
      content_display: "TILES" | "LIST"
      notification_type: "system" | "playlist_deleted" | "global"
      playlist_sort_order: "ascending" | "descending"
      playlist_sorted_by: "playlistOrder" | "publishedAt" | "duration" | "addedAt"
      playlist_type: "Private" | "Public" | "Unlisted"
      profile_account_type: "default" | "staff" | "premium"
      source: "giantbomb" | "jeffgerstmann" | "nextlander" | "remap"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof Database["public"]["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof Database["public"]["CompositeTypes"]
    ? Database["public"]["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never