export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      active_streams: {
        Row: {
          created_at: string;
          is_live: boolean;
          last_checked: string;
          source: Database['public']['Enums']['source'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          is_live?: boolean;
          last_checked?: string;
          source: Database['public']['Enums']['source'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          is_live?: boolean;
          last_checked?: string;
          source?: Database['public']['Enums']['source'];
          updated_at?: string;
        };
        Relationships: [];
      };
      image_processing_jobs: {
        Row: {
          attempts: number;
          created_at: string;
          entity_id: string;
          entity_type: string;
          error_message: string | null;
          id: string;
          image_type: string;
          max_attempts: number;
          priority: number;
          processing_completed_at: string | null;
          processing_started_at: string | null;
          properties_hash: string | null;
          source_url: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          error_message?: string | null;
          id?: string;
          image_type: string;
          max_attempts?: number;
          priority?: number;
          processing_completed_at?: string | null;
          processing_started_at?: string | null;
          properties_hash?: string | null;
          source_url: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          error_message?: string | null;
          id?: string;
          image_type?: string;
          max_attempts?: number;
          priority?: number;
          processing_completed_at?: string | null;
          processing_started_at?: string | null;
          properties_hash?: string | null;
          source_url?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          action_url: string | null;
          created_at: string;
          created_by: string | null;
          end_datetime: string | null;
          id: number;
          is_test: boolean;
          message: string;
          metadata: Json | null;
          start_datetime: string | null;
          title: string;
          type: Database['public']['Enums']['notification_type'];
          updated_at: string;
        };
        Insert: {
          action_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          end_datetime?: string | null;
          id?: number;
          is_test?: boolean;
          message: string;
          metadata?: Json | null;
          start_datetime?: string | null;
          title: string;
          type?: Database['public']['Enums']['notification_type'];
          updated_at?: string;
        };
        Update: {
          action_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          end_datetime?: string | null;
          id?: number;
          is_test?: boolean;
          message?: string;
          metadata?: Json | null;
          start_datetime?: string | null;
          title?: string;
          type?: Database['public']['Enums']['notification_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      playlist_cleanup_queue: {
        Row: {
          cleanup_at: string;
          created_at: string;
          playlist_id: number;
          processed_at: string | null;
        };
        Insert: {
          cleanup_at: string;
          created_at?: string;
          playlist_id: number;
          processed_at?: string | null;
        };
        Update: {
          cleanup_at?: string;
          created_at?: string;
          playlist_id?: number;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'playlist_cleanup_queue_playlist_id_fkey';
            columns: ['playlist_id'];
            isOneToOne: true;
            referencedRelation: 'playlists';
            referencedColumns: ['id'];
          },
        ];
      };
      playlist_videos: {
        Row: {
          id: number;
          playlist_id: number;
          video_id: string;
          video_position: number | null;
        };
        Insert: {
          id?: number;
          playlist_id: number;
          video_id: string;
          video_position?: number | null;
        };
        Update: {
          id?: number;
          playlist_id?: number;
          video_id?: string;
          video_position?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'playlist_videos_playlist_id_fkey';
            columns: ['playlist_id'];
            isOneToOne: false;
            referencedRelation: 'playlists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'playlist_videos_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
      };
      playlists: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          duration_seconds: number | null;
          id: number;
          image_avif_url: string | null;
          image_processing_status:
            | Database['public']['Enums']['image_processing_status']
            | null;
          image_processing_updated_at: string | null;
          image_properties: Json | null;
          image_webp_url: string | null;
          name: string;
          search_vector: unknown | null;
          short_id: string;
          thumbnail_url: string | null;
          type: Database['public']['Enums']['playlist_type'];
          updated_at: string | null;
          youtube_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          id?: number;
          image_avif_url?: string | null;
          image_processing_status?:
            | Database['public']['Enums']['image_processing_status']
            | null;
          image_processing_updated_at?: string | null;
          image_properties?: Json | null;
          image_webp_url?: string | null;
          name: string;
          search_vector?: unknown | null;
          short_id: string;
          thumbnail_url?: string | null;
          type?: Database['public']['Enums']['playlist_type'];
          updated_at?: string | null;
          youtube_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          id?: number;
          image_avif_url?: string | null;
          image_processing_status?:
            | Database['public']['Enums']['image_processing_status']
            | null;
          image_processing_updated_at?: string | null;
          image_properties?: Json | null;
          image_webp_url?: string | null;
          name?: string;
          search_vector?: unknown | null;
          short_id?: string;
          thumbnail_url?: string | null;
          type?: Database['public']['Enums']['playlist_type'];
          updated_at?: string | null;
          youtube_id?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_type:
            | Database['public']['Enums']['profile_account_type']
            | null;
          avatar_url: string | null;
          content_description:
            | Database['public']['Enums']['content_description']
            | null;
          content_display:
            | Database['public']['Enums']['content_display']
            | null;
          id: string;
          providers: string[];
          sources: Database['public']['Enums']['source'][] | null;
          username: string | null;
          username_history: Json | null;
        };
        Insert: {
          account_type?:
            | Database['public']['Enums']['profile_account_type']
            | null;
          avatar_url?: string | null;
          content_description?:
            | Database['public']['Enums']['content_description']
            | null;
          content_display?:
            | Database['public']['Enums']['content_display']
            | null;
          id: string;
          providers?: string[];
          sources?: Database['public']['Enums']['source'][] | null;
          username?: string | null;
          username_history?: Json | null;
        };
        Update: {
          account_type?:
            | Database['public']['Enums']['profile_account_type']
            | null;
          avatar_url?: string | null;
          content_description?:
            | Database['public']['Enums']['content_description']
            | null;
          content_display?:
            | Database['public']['Enums']['content_display']
            | null;
          id?: string;
          providers?: string[];
          sources?: Database['public']['Enums']['source'][] | null;
          username?: string | null;
          username_history?: Json | null;
        };
        Relationships: [];
      };
      system_logs: {
        Row: {
          created_at: string;
          details: Json | null;
          event_type: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          details?: Json | null;
          event_type: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          details?: Json | null;
          event_type?: string;
          id?: string;
        };
        Relationships: [];
      };
      timestamps: {
        Row: {
          created_at: string;
          id: number;
          playlist_id: number | null;
          sort_order: Database['public']['Enums']['playlist_sort_order'] | null;
          sorted_by: Database['public']['Enums']['playlist_sorted_by'] | null;
          updated_at: string;
          user_id: string;
          video_id: string;
          video_start_seconds: number | null;
          watched_at: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          playlist_id?: number | null;
          sort_order?:
            | Database['public']['Enums']['playlist_sort_order']
            | null;
          sorted_by?: Database['public']['Enums']['playlist_sorted_by'] | null;
          updated_at?: string;
          user_id: string;
          video_id: string;
          video_start_seconds?: number | null;
          watched_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          playlist_id?: number | null;
          sort_order?:
            | Database['public']['Enums']['playlist_sort_order']
            | null;
          sorted_by?: Database['public']['Enums']['playlist_sorted_by'] | null;
          updated_at?: string;
          user_id?: string;
          video_id?: string;
          video_start_seconds?: number | null;
          watched_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'timestamps_playlist_id_fkey';
            columns: ['playlist_id'];
            isOneToOne: false;
            referencedRelation: 'playlists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_video_timestamps_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
      };
      user_notifications: {
        Row: {
          created_at: string;
          dismissed: boolean;
          id: string;
          notification_id: number;
          read: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dismissed?: boolean;
          id?: string;
          notification_id: number;
          read?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dismissed?: boolean;
          id?: string;
          notification_id?: number;
          read?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_notifications_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'active_user_notifications';
            referencedColumns: ['notification_id'];
          },
          {
            foreignKeyName: 'user_notifications_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notifications';
            referencedColumns: ['id'];
          },
        ];
      };
      user_playlists: {
        Row: {
          added_at: string;
          id: number;
          playlist_position: number | null;
          sort_order: Database['public']['Enums']['playlist_sort_order'];
          sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          user_id: string;
        };
        Insert: {
          added_at?: string;
          id: number;
          playlist_position?: number | null;
          sort_order?: Database['public']['Enums']['playlist_sort_order'];
          sorted_by?: Database['public']['Enums']['playlist_sorted_by'];
          user_id: string;
        };
        Update: {
          added_at?: string;
          id?: number;
          playlist_position?: number | null;
          sort_order?: Database['public']['Enums']['playlist_sort_order'];
          sorted_by?: Database['public']['Enums']['playlist_sorted_by'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_playlists_id_fkey';
            columns: ['id'];
            isOneToOne: false;
            referencedRelation: 'playlists';
            referencedColumns: ['id'];
          },
        ];
      };
      video_history: {
        Row: {
          created_at: string;
          seconds_watched: number;
          session_end_time: string | null;
          session_start_time: string;
          source: Database['public']['Enums']['source'];
          updated_at: string;
          user_id: string;
          video_id: string;
        };
        Insert: {
          created_at?: string;
          seconds_watched?: number;
          session_end_time?: string | null;
          session_start_time?: string;
          source: Database['public']['Enums']['source'];
          updated_at?: string;
          user_id: string;
          video_id: string;
        };
        Update: {
          created_at?: string;
          seconds_watched?: number;
          session_end_time?: string | null;
          session_start_time?: string;
          source?: Database['public']['Enums']['source'];
          updated_at?: string;
          user_id?: string;
          video_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'video_history_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
      };
      videos: {
        Row: {
          description: string;
          duration: string | null;
          id: string;
          image_processing_status:
            | Database['public']['Enums']['image_processing_status']
            | null;
          image_processing_updated_at: string | null;
          pending_delete: boolean | null;
          published_at: string;
          search_vector: unknown | null;
          source: Database['public']['Enums']['source'];
          thumbnail_avif_url: string | null;
          thumbnail_url: string;
          thumbnail_webp_url: string | null;
          title: string;
          views: number;
        };
        Insert: {
          description: string;
          duration?: string | null;
          id: string;
          image_processing_status?:
            | Database['public']['Enums']['image_processing_status']
            | null;
          image_processing_updated_at?: string | null;
          pending_delete?: boolean | null;
          published_at?: string;
          search_vector?: unknown | null;
          source: Database['public']['Enums']['source'];
          thumbnail_avif_url?: string | null;
          thumbnail_url: string;
          thumbnail_webp_url?: string | null;
          title: string;
          views?: number;
        };
        Update: {
          description?: string;
          duration?: string | null;
          id?: string;
          image_processing_status?:
            | Database['public']['Enums']['image_processing_status']
            | null;
          image_processing_updated_at?: string | null;
          pending_delete?: boolean | null;
          published_at?: string;
          search_vector?: unknown | null;
          source?: Database['public']['Enums']['source'];
          thumbnail_avif_url?: string | null;
          thumbnail_url?: string;
          thumbnail_webp_url?: string | null;
          title?: string;
          views?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      active_user_notifications: {
        Row: {
          action_url: string | null;
          assigned_at: string | null;
          created_by: string | null;
          dismissed: boolean | null;
          end_datetime: string | null;
          is_test: boolean | null;
          message: string | null;
          metadata: Json | null;
          notification_created_at: string | null;
          notification_id: number | null;
          read: boolean | null;
          start_datetime: string | null;
          title: string | null;
          type: Database['public']['Enums']['notification_type'] | null;
          user_id: string | null;
          user_notification_id: string | null;
          user_notification_updated_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      calculate_playlist_duration: {
        Args: { playlist_id_param: number };
        Returns: number;
      };
      can_user_access_playlist: {
        Args: { playlist_id: number; user_id?: string };
        Returns: boolean;
      };
      check_playlist_ownership: {
        Args: { playlist_id: number; user_id: string };
        Returns: boolean;
      };
      cleanup_deleted_playlists: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      cleanup_expired_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      cleanup_expired_notifications_cron: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      cleanup_old_bucket_images: {
        Args: {
          p_current_avif_path: string;
          p_current_webp_path: string;
          p_entity_id: string;
          p_entity_type: string;
        };
        Returns: string;
      };
      cleanup_old_completed_jobs: {
        Args: { days_old?: number };
        Returns: {
          deleted_count: number;
          newest_deleted: string;
          oldest_deleted: string;
        }[];
      };
      complete_image_processing_job: {
        Args: {
          avif_path?: string;
          job_id: string;
          jpg_path?: string;
          webp_path?: string;
        };
        Returns: boolean;
      };
      confirm_user: {
        Args: { user_email: string };
        Returns: boolean;
      };
      create_notification: {
        Args: {
          notification_action_url?: string;
          notification_end_datetime?: string;
          notification_is_test?: boolean;
          notification_message: string;
          notification_metadata?: Json;
          notification_start_datetime?: string;
          notification_title: string;
          notification_type: Database['public']['Enums']['notification_type'];
          target_user_ids?: string[];
        };
        Returns: number;
      };
      create_notification_for_all_users: {
        Args: {
          notification_action_url?: string;
          notification_end_datetime?: string;
          notification_is_test?: boolean;
          notification_message: string;
          notification_metadata?: Json;
          notification_start_datetime?: string;
          notification_title: string;
          notification_type: Database['public']['Enums']['notification_type'];
        };
        Returns: number;
      };
      create_user: {
        Args: { email: string; password: string; username: string };
        Returns: string;
      };
      delete_pending_videos: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      delete_playlist: {
        Args: { p_playlist_id: number };
        Returns: boolean;
      };
      delete_playlist_videos: {
        Args: { p_playlist_id: number; p_video_ids: string[] };
        Returns: {
          message: string;
          success: boolean;
          video_id: string;
        }[];
      };
      delete_timestamps: {
        Args: { p_video_ids: string[] };
        Returns: {
          description: string;
          duration: string;
          id: string;
          published_at: string;
          source: Database['public']['Enums']['source'];
          thumbnail_url: string;
          title: string;
          updated_at: string;
          video_start_seconds: number;
          watched_at: string;
        }[];
      };
      delete_user: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      duration_to_seconds: {
        Args: { duration_text: string };
        Returns: number;
      };
      fail_image_processing_job: {
        Args: { error_msg: string; job_id: string };
        Returns: boolean;
      };
      follow_playlist: {
        Args: { p_playlist_id: number };
        Returns: {
          playlist_id: number;
          playlist_position: number;
          user_id: string;
        }[];
      };
      force_cleanup_playlist: {
        Args: { p_playlist_id: number };
        Returns: boolean;
      };
      format_cleanup_time_for_user: {
        Args: { p_deleted_at: string; p_user_id: string };
        Returns: string;
      };
      generate_unique_username: {
        Args: { base_username: string; exclude_user_id?: string };
        Returns: string;
      };
      get_discord_avatar_url: {
        Args: { user_id: string };
        Returns: string;
      };
      get_image_processing_queue_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          count: number;
          newest_job: string;
          oldest_job: string;
          status: string;
        }[];
      };
      get_in_progress_videos_with_timestamps: {
        Args: { p_preferred_image_format?: string };
        Returns: {
          description: string;
          duration: string;
          id: string;
          image_processing_status: Database['public']['Enums']['image_processing_status'];
          image_processing_updated_at: string;
          image_url: string;
          playlist_name: string;
          playlist_short_id: string;
          playlist_sort_order: Database['public']['Enums']['playlist_sort_order'];
          playlist_sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          published_at: string;
          source: Database['public']['Enums']['source'];
          thumbnail_url: string;
          title: string;
          updated_at: string;
          video_start_seconds: number;
          views: number;
          watched_at: string;
        }[];
      };
      get_next_image_processing_job: {
        Args: Record<PropertyKey, never>;
        Returns: {
          attempts: number;
          entity_id: string;
          entity_type: string;
          image_type: string;
          job_id: string;
          source_url: string;
        }[];
      };
      get_playlist_by_youtube_id: {
        Args: { p_preferred_image_format?: string; p_youtube_id: string };
        Returns: {
          created_at: string;
          created_by: string;
          description: string;
          duration_seconds: number;
          id: number;
          image_properties: Json;
          name: string;
          profile_avatar_url: string;
          profile_username: string;
          short_id: string;
          sort_order: Database['public']['Enums']['playlist_sort_order'];
          sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          type: Database['public']['Enums']['playlist_type'];
          youtube_id: string;
        }[];
      };
      get_playlist_cleanup_info: {
        Args: { p_playlist_id: number; p_user_id?: string };
        Returns: {
          cleanup_at: string;
          days_remaining: number;
          deleted_at: string;
          formatted_cleanup_time: string;
          hours_remaining: number;
          playlist_id: number;
        }[];
      };
      get_playlist_data: {
        Args: {
          p_current_page?: number;
          p_limit?: number;
          p_preferred_image_format?: string;
          p_short_id?: string;
          p_sort_key?: string;
          p_sort_order?: string;
          p_youtube_id?: string;
        };
        Returns: {
          is_duration_row: boolean;
          playlist_created_at: string;
          playlist_created_by: string;
          playlist_deleted_at: string;
          playlist_description: string;
          playlist_id: number;
          playlist_image_processing_status: Database['public']['Enums']['image_processing_status'];
          playlist_image_properties: Json;
          playlist_image_url: string;
          playlist_name: string;
          playlist_position: number;
          playlist_short_id: string;
          playlist_sort_order: Database['public']['Enums']['playlist_sort_order'];
          playlist_sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          playlist_thumbnail_url: string;
          playlist_type: Database['public']['Enums']['playlist_type'];
          playlist_youtube_id: string;
          profile_avatar_url: string;
          profile_username: string;
          total_duration_seconds: number;
          total_videos_count: number;
          video_description: string;
          video_duration: string;
          video_id: string;
          video_image_processing_status: Database['public']['Enums']['image_processing_status'];
          video_image_url: string;
          video_position: number;
          video_published_at: string;
          video_source: Database['public']['Enums']['source'];
          video_start_seconds: number;
          video_thumbnail_url: string;
          video_title: string;
          video_updated_at: string;
          video_watched_at: string;
        }[];
      };
      get_playlist_video_context: {
        Args: {
          p_context_limit?: number;
          p_preferred_image_format?: string;
          p_short_id: string;
          p_sort_order?: string;
          p_sorted_by?: string;
          p_video_id: string;
        };
        Returns: {
          current_video_index: number;
          is_current_video: boolean;
          playlist_created_at: string;
          playlist_created_by: string;
          playlist_deleted_at: string;
          playlist_description: string;
          playlist_id: number;
          playlist_image_processing_status: Database['public']['Enums']['image_processing_status'];
          playlist_image_properties: Json;
          playlist_image_url: string;
          playlist_name: string;
          playlist_short_id: string;
          playlist_sort_order: Database['public']['Enums']['playlist_sort_order'];
          playlist_sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          playlist_thumbnail_url: string;
          playlist_type: Database['public']['Enums']['playlist_type'];
          playlist_youtube_id: string;
          profile_avatar_url: string;
          profile_username: string;
          total_videos_count: number;
          video_description: string;
          video_duration: string;
          video_id: string;
          video_image_url: string;
          video_position: number;
          video_published_at: string;
          video_source: Database['public']['Enums']['source'];
          video_start_seconds: number;
          video_thumbnail_url: string;
          video_timestamp_playlist_id: number;
          video_timestamp_sort_order: Database['public']['Enums']['playlist_sort_order'];
          video_timestamp_sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          video_title: string;
          video_updated_at: string;
          video_watched_at: string;
        }[];
      };
      get_playlists_for_username: {
        Args: { p_preferred_image_format?: string; p_username: string };
        Returns: {
          created_at: string;
          created_by: string;
          deleted_at: string;
          description: string;
          duration_seconds: number;
          id: number;
          image_processing_status: Database['public']['Enums']['image_processing_status'];
          image_properties: Json;
          image_url: string;
          name: string;
          playlist_thumbnail_url: string;
          profile_avatar_url: string;
          profile_username: string;
          short_id: string;
          sort_order: Database['public']['Enums']['playlist_sort_order'];
          sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          type: Database['public']['Enums']['playlist_type'];
          youtube_id: string;
        }[];
      };
      get_unread_notification_count: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      get_user_accessible_playlists: {
        Args: { target_user_id?: string };
        Returns: {
          created_at: string;
          created_by: string;
          id: number;
          name: string;
          type: Database['public']['Enums']['playlist_type'];
          updated_at: string;
        }[];
      };
      get_user_notifications: {
        Args: {
          filter_read?: boolean;
          filter_type?: Database['public']['Enums']['notification_type'];
          limit_count?: number;
          offset_count?: number;
        };
        Returns: {
          action_url: string;
          assigned_at: string;
          dismissed: boolean;
          end_datetime: string;
          is_test: boolean;
          message: string;
          metadata: Json;
          notification_created_at: string;
          notification_id: number;
          read: boolean;
          start_datetime: string;
          title: string;
          type: Database['public']['Enums']['notification_type'];
          user_notification_id: string;
          user_notification_updated_at: string;
        }[];
      };
      get_user_notifications_with_timing: {
        Args: { p_limit?: number; p_offset?: number; p_user_id?: string };
        Returns: {
          created_at: string;
          created_by: string;
          end_datetime: string;
          formatted_message: string;
          id: number;
          is_read: boolean;
          message: string;
          metadata: Json;
          read_at: string;
          start_datetime: string;
          title: string;
          type: Database['public']['Enums']['notification_type'];
          updated_at: string;
        }[];
      };
      get_user_playlists: {
        Args: { p_preferred_image_format?: string };
        Returns: {
          added_at: string;
          created_at: string;
          created_by: string;
          deleted_at: string;
          description: string;
          duration_seconds: number;
          id: number;
          image_processing_status: Database['public']['Enums']['image_processing_status'];
          image_properties: Json;
          image_url: string;
          name: string;
          playlist_position: number;
          playlist_thumbnail_url: string;
          profile_avatar_url: string;
          profile_username: string;
          short_id: string;
          sort_order: Database['public']['Enums']['playlist_sort_order'];
          sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          type: Database['public']['Enums']['playlist_type'];
          youtube_id: string;
        }[];
      };
      get_user_video_history: {
        Args: { p_limit?: number; p_offset?: number; p_video_id?: string };
        Returns: {
          created_at: string;
          id: string;
          seconds_watched: number;
          session_end_time: string;
          session_start_time: string;
          source: Database['public']['Enums']['source'];
          updated_at: string;
          video_duration: string;
          video_id: string;
          video_thumbnail_url: string;
          video_title: string;
        }[];
      };
      get_video_analytics: {
        Args: { p_days_back?: number; p_video_id?: string };
        Returns: {
          average_session_length: number;
          first_watched: string;
          last_watched: string;
          total_seconds_watched: number;
          total_sessions: number;
          video_id: string;
          video_title: string;
        }[];
      };
      get_videos_with_timestamps: {
        Args: { p_preferred_image_format?: string };
        Returns: {
          description: string;
          duration: string;
          id: string;
          image_processing_status: Database['public']['Enums']['image_processing_status'];
          image_processing_updated_at: string;
          image_url: string;
          playlist_id: number;
          playlist_name: string;
          playlist_short_id: string;
          playlist_sort_order: Database['public']['Enums']['playlist_sort_order'];
          playlist_sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          published_at: string;
          source: Database['public']['Enums']['source'];
          thumbnail_url: string;
          title: string;
          updated_at: string;
          video_start_seconds: number;
          views: number;
          watched_at: string;
        }[];
      };
      hash_image_properties: {
        Args: { properties: Json };
        Returns: string;
      };
      increment_video_views: {
        Args: { video_id: string };
        Returns: undefined;
      };
      initialize_user_playlist_positions: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      insert_playlist: {
        Args: {
          p_created_by: string;
          p_description?: string;
          p_image_properties?: Json;
          p_image_url?: string;
          p_name?: string;
          p_playlist_position?: number;
          p_preferred_image_format?: string;
          p_type?: Database['public']['Enums']['playlist_type'];
        };
        Returns: {
          created_at: string;
          created_by: string;
          description: string;
          image_avif_url: string;
          image_properties: Json;
          image_url: string;
          image_webp_url: string;
          name: string;
          playlist_id: number;
          playlist_position: number;
          short_id: string;
          type: Database['public']['Enums']['playlist_type'];
        }[];
      };
      insert_playlist_videos: {
        Args: { p_playlist_id: number; p_video_ids: string[] };
        Returns: {
          result_id: number;
          result_playlist_id: number;
          result_video_id: string;
          result_video_position: number;
        }[];
      };
      insert_timestamp: {
        Args: {
          p_playlist_id?: number;
          p_sort_order?: Database['public']['Enums']['playlist_sort_order'];
          p_sorted_by?: Database['public']['Enums']['playlist_sorted_by'];
          p_video_id: string;
          p_video_start_seconds?: number;
          p_watched_at?: string;
        };
        Returns: {
          description: string;
          duration: string;
          id: string;
          playlist_id: number;
          published_at: string;
          sort_order: Database['public']['Enums']['playlist_sort_order'];
          sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          source: Database['public']['Enums']['source'];
          thumbnail_url: string;
          title: string;
          updated_at: string;
          video_start_seconds: number;
          watched_at: string;
        }[];
      };
      insert_timestamps: {
        Args: {
          p_video_ids: string[];
          p_video_start_seconds?: number[];
          p_watched_at?: string[];
        };
        Returns: {
          description: string;
          duration: string;
          id: string;
          playlist_id: number;
          published_at: string;
          sort_order: Database['public']['Enums']['playlist_sort_order'];
          sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          source: Database['public']['Enums']['source'];
          thumbnail_url: string;
          title: string;
          updated_at: string;
          video_start_seconds: number;
          watched_at: string;
        }[];
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_unique_username: {
        Args: { p_username: string };
        Returns: boolean;
      };
      mark_notifications_as_read: {
        Args: { notification_ids?: number[] };
        Returns: undefined;
      };
      normalize_search_term: {
        Args: { search_term: string };
        Returns: string;
      };
      queue_image_processing_job: {
        Args: {
          p_entity_id: string;
          p_entity_type: string;
          p_image_properties?: Json;
          p_image_type: string;
          p_priority?: number;
          p_source_url: string;
        };
        Returns: string;
      };
      remove_notification: {
        Args: { notification_id: number };
        Returns: boolean;
      };
      remove_user_notification: {
        Args: { notification_ids: number[] };
        Returns: number;
      };
      reset_stuck_image_processing_jobs: {
        Args: { stuck_after_minutes?: number };
        Returns: {
          entity_id: string;
          entity_type: string;
          minutes_stuck: number;
          reset_job_id: string;
          stuck_since: string;
        }[];
      };
      search_playlists: {
        Args: { p_preferred_image_format?: string; search_term: string };
        Returns: {
          created_at: string;
          created_by: string;
          deleted_at: string;
          description: string;
          duration_seconds: number;
          id: number;
          image_processing_status: Database['public']['Enums']['image_processing_status'];
          image_properties: Json;
          image_url: string;
          name: string;
          playlist_thumbnail_url: string;
          profile_avatar_url: string;
          profile_username: string;
          search_rank: number;
          short_id: string;
          type: Database['public']['Enums']['playlist_type'];
          youtube_id: string;
        }[];
      };
      search_videos: {
        Args: { p_preferred_image_format?: string; search_term: string };
        Returns: {
          description: string;
          duration: string;
          id: string;
          image_processing_status: Database['public']['Enums']['image_processing_status'];
          image_processing_updated_at: string;
          image_url: string;
          playlist_name: string;
          playlist_short_id: string;
          playlist_sort_order: Database['public']['Enums']['playlist_sort_order'];
          playlist_sorted_by: Database['public']['Enums']['playlist_sorted_by'];
          published_at: string;
          search_rank: number;
          source: Database['public']['Enums']['source'];
          thumbnail_url: string;
          title: string;
          updated_at: string;
          video_start_seconds: number;
          views: number;
          watched_at: string;
        }[];
      };
      select_best_image_format: {
        Args: { avif_url: string; preferred_format?: string; webp_url: string };
        Returns: string;
      };
      setup_notification_cleanup_cron: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      start_image_processing_job: {
        Args: { job_id: string };
        Returns: boolean;
      };
      start_video_history_session: {
        Args: { p_session_start_time?: string; p_video_id: string };
        Returns: {
          created_at: string;
          id: string;
          is_resumed: boolean;
          seconds_watched: number;
          session_end_time: string;
          session_start_time: string;
          source: Database['public']['Enums']['source'];
          updated_at: string;
          video_id: string;
        }[];
      };
      unfollow_playlist: {
        Args: { p_playlist_id: number };
        Returns: {
          playlist_id: number;
          user_id: string;
        }[];
      };
      update_playlist_duration: {
        Args: { playlist_id_param: number };
        Returns: undefined;
      };
      update_playlist_position: {
        Args: { p_new_position: number; p_playlist_id: number };
        Returns: {
          playlist_id: number;
          playlist_position: number;
          success: boolean;
        }[];
      };
      update_playlist_thumbnail: {
        Args: {
          p_image_properties?: Json;
          p_playlist_id: number;
          p_thumbnail_url?: string;
        };
        Returns: {
          error_message: string;
          playlist_id: number;
          success: boolean;
          thumbnail_url: string;
        }[];
      };
      update_playlist_videos_positions: {
        Args: {
          p_new_position: number;
          p_playlist_id: number;
          p_video_ids: string[];
        };
        Returns: {
          result_id: number;
          result_playlist_id: number;
          result_video_id: string;
          result_video_position: number;
        }[];
      };
      update_video_history_end_time: {
        Args: {
          p_session_end_time?: string;
          p_session_start_time: string;
          p_video_id: string;
        };
        Returns: {
          created_at: string;
          id: string;
          seconds_watched: number;
          session_end_time: string;
          session_start_time: string;
          source: Database['public']['Enums']['source'];
          updated_at: string;
          video_id: string;
        }[];
      };
      update_video_history_seconds_watched: {
        Args: {
          p_seconds_watched: number;
          p_session_end_time?: string;
          p_session_start_time: string;
          p_video_id: string;
        };
        Returns: {
          created_at: string;
          id: string;
          seconds_watched: number;
          session_end_time: string;
          session_start_time: string;
          source: Database['public']['Enums']['source'];
          updated_at: string;
          video_id: string;
        }[];
      };
    };
    Enums: {
      content_description: 'FULL' | 'BRIEF' | 'NONE';
      content_display: 'TABLE' | 'TILES';
      image_processing_status:
        | 'pending'
        | 'processing'
        | 'completed'
        | 'failed';
      notification_type: 'system';
      playlist_sort_order: 'ascending' | 'descending';
      playlist_sorted_by: 'title' | 'datePublished' | 'playlistOrder';
      playlist_type: 'Public' | 'Private';
      profile_account_type: 'default' | 'admin';
      source: 'giantbomb' | 'nextlander' | 'jeffgerstmann' | 'remap';
    };
    CompositeTypes: {
      username_history_entry: {
        username: string | null;
        used_from: string | null;
        used_until: string | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      content_description: ['FULL', 'BRIEF', 'NONE'],
      content_display: ['TABLE', 'TILES'],
      image_processing_status: ['pending', 'processing', 'completed', 'failed'],
      notification_type: ['system'],
      playlist_sort_order: ['ascending', 'descending'],
      playlist_sorted_by: ['title', 'datePublished', 'playlistOrder'],
      playlist_type: ['Public', 'Private'],
      profile_account_type: ['default', 'admin'],
      source: ['giantbomb', 'nextlander', 'jeffgerstmann', 'remap'],
    },
  },
} as const;
