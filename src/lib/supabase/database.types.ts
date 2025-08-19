export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      videos: {
        Row: {
          id: string
          source: string
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string | null
          thumbnail_webp_url: string | null
          thumbnail_avif_url: string | null
          thumbnail_maxres_webp_url: string | null
          thumbnail_maxres_avif_url: string | null
          image_processing_status: string
          image_processing_updated_at: string | null
          published_at: string
          duration: string
          views: number
          pending_delete: boolean
          search_vector: unknown | null
        }
        Insert: {
          id: string
          source: string
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url?: string | null
          thumbnail_webp_url?: string | null
          thumbnail_avif_url?: string | null
          thumbnail_maxres_webp_url?: string | null
          thumbnail_maxres_avif_url?: string | null
          image_processing_status?: string
          image_processing_updated_at?: string | null
          published_at?: string
          duration?: string
          views?: number
          pending_delete?: boolean
          search_vector?: unknown | null
        }
        Update: {
          id?: string
          source?: string
          title?: string
          description?: string
          thumbnail_url?: string
          thumbnail_maxres_url?: string | null
          thumbnail_webp_url?: string | null
          thumbnail_avif_url?: string | null
          thumbnail_maxres_webp_url?: string | null
          thumbnail_maxres_avif_url?: string | null
          image_processing_status?: string
          image_processing_updated_at?: string | null
          published_at?: string
          duration?: string
          views?: number
          pending_delete?: boolean
          search_vector?: unknown | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_videos_with_timestamps: {
        Args: {
          p_preferred_image_format?: string
        }
        Returns: {
          id: string
          source: string
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string | null
          thumbnail_webp_url: string | null
          thumbnail_avif_url: string | null
          thumbnail_maxres_webp_url: string | null
          thumbnail_maxres_avif_url: string | null
          image_url: string | null
          image_processing_status: string
          image_processing_updated_at: string | null
          published_at: string
          duration: string
          views: number
          video_start_seconds: number | null
          watched_at: string | null
          updated_at: string | null
          playlist_id: number | null
          playlist_name: string | null
          playlist_short_id: string | null
          playlist_sorted_by: string | null
          playlist_sort_order: string | null
        }[]
      }
      search_videos: {
        Args: {
          search_term: string
          offset_count?: number
          p_preferred_image_format?: string
        }
        Returns: {
          id: string
          source: string
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string | null
          thumbnail_webp_url: string | null
          thumbnail_avif_url: string | null
          thumbnail_maxres_webp_url: string | null
          thumbnail_maxres_avif_url: string | null
          image_url: string | null
          image_processing_status: string
          image_processing_updated_at: string | null
          published_at: string
          duration: string
          views: number
          video_start_seconds: number | null
          updated_at: string | null
          watched_at: string | null
          playlist_name: string | null
          playlist_short_id: string | null
          playlist_sorted_by: string | null
          playlist_sort_order: string | null
          search_rank: number
        }[]
      }
      get_in_progress_videos_with_timestamps: {
        Args: {
          p_preferred_image_format?: string
        }
        Returns: {
          id: string
          source: string
          title: string
          description: string
          thumbnail_url: string
          thumbnail_maxres_url: string | null
          thumbnail_webp_url: string | null
          thumbnail_avif_url: string | null
          thumbnail_maxres_webp_url: string | null
          thumbnail_maxres_avif_url: string | null
          image_url: string | null
          image_processing_status: string
          image_processing_updated_at: string | null
          published_at: string
          duration: string
          views: number
          video_start_seconds: number | null
          watched_at: string | null
          updated_at: string | null
          playlist_sorted_by: string | null
          playlist_sort_order: string | null
          playlist_name: string | null
          playlist_short_id: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
