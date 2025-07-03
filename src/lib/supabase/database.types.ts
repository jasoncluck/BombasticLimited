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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
          content_description:
            | Database["public"]["Enums"]["contentdescription"]
            | null
          content_display: Database["public"]["Enums"]["contentdisplay"] | null
          id: string
          sources: Database["public"]["Enums"]["source"][] | null
          username: string | null
        }
        Insert: {
          content_description?:
            | Database["public"]["Enums"]["contentdescription"]
            | null
          content_display?: Database["public"]["Enums"]["contentdisplay"] | null
          id: string
          sources?: Database["public"]["Enums"]["source"][] | null
          username?: string | null
        }
        Update: {
          content_description?:
            | Database["public"]["Enums"]["contentdescription"]
            | null
          content_display?: Database["public"]["Enums"]["contentdisplay"] | null
          id?: string
          sources?: Database["public"]["Enums"]["source"][] | null
          username?: string | null
        }
        Relationships: []
      }
      timestamps: {
        Row: {
          created_at: string
          id: number
          updated_at: string
          user_id: string
          video_id: string
          video_start_seconds: number | null
          watched_at: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          updated_at?: string
          user_id: string
          video_id: string
          video_start_seconds?: number | null
          watched_at?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          updated_at?: string
          user_id?: string
          video_id?: string
          video_start_seconds?: number | null
          watched_at?: string | null
        }
        Relationships: [
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
          user_id: string
        }
        Insert: {
          id: number
          playlist_position?: number | null
          user_id: string
        }
        Update: {
          id?: number
          playlist_position?: number | null
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
      create_user: {
        Args: { email: string; password: string; username: string }
        Returns: string
      }
      delete_pending_videos: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      delete_playlist: {
        Args: { p_user_id: string; p_playlist_id: number }
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
        Args: { p_user_id: string; p_video_ids: string[] }
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
        Args: {
          p_user_id: string
          p_playlist_id: number
          p_playlist_position?: number
        }
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
        }[]
      }
      get_playlist_by_short_id: {
        Args: { p_short_id: string }
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
        }[]
      }
      get_playlist_videos: {
        Args: { p_playlist_id: number }
        Returns: {
          id: string
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
        }[]
      }
      get_user_playlists: {
        Args: { p_user_id: string }
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
          youtube_id: string
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
        }[]
      }
      initialize_user_playlist_positions: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      insert_playlist: {
        Args: {
          p_created_by: string
          p_name: string
          p_description?: string
          p_type?: Database["public"]["Enums"]["playlist_type"]
          p_thumbnail_url?: string
          p_thumbnail_maxres_url?: string
          p_image_properties?: Json
          p_playlist_position?: number
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
      insert_timestamps: {
        Args: {
          p_user_id: string
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
        }[]
      }
      is_unique_username: {
        Args: { p_username: string }
        Returns: boolean
      }
      search_playlists: {
        Args: { search_term: string; playlist_limit?: number }
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
        }[]
      }
      search_videos: {
        Args: { search_term: string }
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
        }[]
      }
      unfollow_playlist: {
        Args: { p_user_id: string; p_playlist_id: number }
        Returns: {
          playlist_id: number
          user_id: string
        }[]
      }
      update_playlist_position: {
        Args: {
          p_user_id: string
          p_playlist_id: number
          p_new_position: number
        }
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
          playlist_position: number
        }[]
      }
      update_playlist_videos_positions: {
        Args: {
          p_playlist_id: number
          p_video_ids: string[]
          p_new_position: number
        }
        Returns: {
          id: number
          playlist_id: number
          video_id: string
          video_position: number
        }[]
      }
      validate_playlist_thumbnail_urls: {
        Args: {
          p_playlist_id: number
          p_thumbnail_url?: string
          p_thumbnail_maxres_url?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      contentdescription: "FULL" | "BRIEF" | "NONE"
      contentdisplay: "TILES" | "CAROUSEL"
      playlist_type: "Official" | "Public" | "Private"
      source: "giantbomb" | "nextlander" | "remap"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      contentdescription: ["FULL", "BRIEF", "NONE"],
      contentdisplay: ["TILES", "CAROUSEL"],
      playlist_type: ["Official", "Public", "Private"],
      source: ["giantbomb", "nextlander", "remap"],
    },
  },
} as const

