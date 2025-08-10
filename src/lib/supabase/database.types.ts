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
        Relationships: [
          {
            foreignKeyName: "playlists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          content_description: Database["public"]["Enums"]["content_description"]
          content_display: Database["public"]["Enums"]["content_display"]
          id: string
          sources: Database["public"]["Enums"]["source"][]
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          content_description?: Database["public"]["Enums"]["content_description"]
          content_display?: Database["public"]["Enums"]["content_display"]
          id: string
          sources?: Database["public"]["Enums"]["source"][]
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          content_description?: Database["public"]["Enums"]["content_description"]
          content_display?: Database["public"]["Enums"]["content_display"]
          id?: string
          sources?: Database["public"]["Enums"]["source"][]
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "users"
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
      user_playlists: {
        Row: {
          id: number
          playlist_position: number | null
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          user_id: string | null
        }
        Insert: {
          id: number
          playlist_position?: number | null
          sort_order?: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"]
          user_id?: string | null
        }
        Update: {
          id?: number
          playlist_position?: number | null
          sort_order?: Database["public"]["Enums"]["playlist_sort_order"]
          sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"]
          user_id?: string | null
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      video_history: {
        Row: {
          id: number
          user_id: string
          video_id: string
          source: Database["public"]["Enums"]["source"]
          seconds_watched: number
          session_start_time: string
          session_end_time: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          video_id: string
          source: Database["public"]["Enums"]["source"]
          seconds_watched?: number
          session_start_time?: string
          session_end_time?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          video_id?: string
          source?: Database["public"]["Enums"]["source"]
          seconds_watched?: number
          session_start_time?: string
          session_end_time?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          pending_delete: boolean
          published_at: string
          search_vector: unknown | null
          source: Database["public"]["Enums"]["source"]
          thumbnail_maxres_url: string | null
          thumbnail_url: string
          title: string
        }
        Insert: {
          description: string
          duration?: string
          id: string
          pending_delete?: boolean
          published_at?: string
          search_vector?: unknown | null
          source: Database["public"]["Enums"]["source"]
          thumbnail_maxres_url?: string | null
          thumbnail_url: string
          title: string
        }
        Update: {
          description?: string
          duration?: string
          id?: string
          pending_delete?: boolean
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
        Args: {
          p_playlist_id: number
        }
        Returns: boolean
      }
      create_user: {
        Args: {
          p_email: string
          p_password: string
          p_username?: string
        }
        Returns: string
      }
      delete_pending_videos: {
        Args: Record<PropertyKey, never>
        Returns: {
          video_id: string
          success: boolean
          message: string
        }[]
      }
      delete_playlist: {
        Args: {
          p_playlist_id: number
        }
        Returns: boolean
      }
      delete_playlist_videos: {
        Args: {
          p_playlist_id: number
          p_video_ids: string[]
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
        }[]
      }
      delete_timestamps: {
        Args: {
          p_video_ids: string[]
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
        }[]
      }
      delete_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      follow_playlist: {
        Args: {
          p_playlist_id: number
        }
        Returns: boolean
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
      get_playlist_videos_with_timestamps: {
        Args: {
          p_playlist_id: number
        }
        Returns: {
          video_id: string
          video_position: number
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
          is_duration_row: boolean
          total_duration_seconds: number
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
          youtube_id: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          image_properties: Json
          type: Database["public"]["Enums"]["playlist_type"]
          deleted_at: string
          playlist_position: number
          sorted_by: Database["public"]["Enums"]["playlist_sorted_by"]
          sort_order: Database["public"]["Enums"]["playlist_sort_order"]
          profile_username: string
        }[]
      }
      get_user_video_history: {
        Args: {
          p_video_id?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          id: number
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
        Args: {
          p_video_id?: string
          p_days_back?: number
        }
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
      insert_timestamp: {
        Args: {
          p_video_id: string
          p_video_start_seconds?: number
          p_watched_at?: string
          p_playlist_id?: number
          p_sorted_by?: Database["public"]["Enums"]["playlist_sorted_by"]
          p_sort_order?: Database["public"]["Enums"]["playlist_sort_order"]
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
      record_video_history: {
        Args: {
          p_video_id: string
          p_seconds_watched?: number
          p_session_start_time?: string
          p_session_end_time?: string
        }
        Returns: {
          id: number
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
      search_videos: {
        Args: {
          search_term: string
          offset_count?: number
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
          updated_at: string
          search_rank: number
        }[]
      }
      unfollow_playlist: {
        Args: {
          p_playlist_id: number
        }
        Returns: boolean
      }
      update_video_history_session: {
        Args: {
          p_history_id: number
          p_seconds_watched?: number
          p_session_end_time?: string
        }
        Returns: {
          id: number
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
      upsert_playlist: {
        Args: {
          p_playlist_id?: number
          p_name?: string
          p_description?: string
          p_thumbnail_url?: string
          p_thumbnail_maxres_url?: string
          p_image_properties?: Json
          p_youtube_id?: string
          p_type?: Database["public"]["Enums"]["playlist_type"]
        }
        Returns: {
          id: number
          created_by: string
          created_at: string
          name: string
          short_id: string
          youtube_id: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          image_properties: Json
          type: Database["public"]["Enums"]["playlist_type"]
          deleted_at: string
        }[]
      }
      upsert_playlist_videos: {
        Args: {
          p_playlist_id: number
          p_video_ids: string[]
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
        }[]
      }
      validate_playlist_thumbnail_urls: {
        Args: Record<PropertyKey, never>
        Returns: {
          playlist_id: number
          name: string
          thumbnail_url: string
          thumbnail_maxres_url: string
          status: string
          error: string
        }[]
      }
    }
    Enums: {
      content_description: "NONE" | "BRIEF" | "DETAILED"
      content_display: "CARDS" | "TILES" | "TILES_LARGE" | "LIST"
      playlist_sort_order: "ascending" | "descending"
      playlist_sorted_by:
        | "playlistOrder"
        | "publishedAt"
        | "title"
        | "duration"
        | "watchedAt"
      playlist_type: "Private" | "Public" | "YouTube"
      source: "giantbomb" | "nextlander" | "jeffgerstmann" | "remap"
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