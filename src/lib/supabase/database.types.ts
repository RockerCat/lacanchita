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
      control_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_id: string | null
          id: number
          new_values: Json | null
          old_values: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_id?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_id?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      data_imports: {
        Row: {
          id: string
          imported_at: string
          script: string
          source_key: string
          source_sha256: string
          summary: Json
        }
        Insert: {
          id?: string
          imported_at?: string
          script: string
          source_key: string
          source_sha256: string
          summary: Json
        }
        Update: {
          id?: string
          imported_at?: string
          script?: string
          source_key?: string
          source_sha256?: string
          summary?: Json
        }
        Relationships: []
      }
      event_close_runs: {
        Row: {
          backup_ref: string | null
          details: Json
          error: string | null
          event_id: string
          finished_at: string | null
          id: string
          mode: string
          requested_by: string | null
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          backup_ref?: string | null
          details?: Json
          error?: string | null
          event_id: string
          finished_at?: string | null
          id?: string
          mode: string
          requested_by?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          backup_ref?: string | null
          details?: Json
          error?: string | null
          event_id?: string
          finished_at?: string | null
          id?: string
          mode?: string
          requested_by?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_close_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_results: {
        Row: {
          event_id: string
          result_key: string
          source_match_id: string
          team_id: string
        }
        Insert: {
          event_id: string
          result_key: string
          source_match_id: string
          team_id: string
        }
        Update: {
          event_id?: string
          result_key?: string
          source_match_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_results_event_id_team_id_fkey"
            columns: ["event_id", "team_id"]
            isOneToOne: false
            referencedRelation: "event_teams"
            referencedColumns: ["event_id", "team_id"]
          },
          {
            foreignKeyName: "event_results_source_match_id_event_id_fkey"
            columns: ["source_match_id", "event_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      event_stages: {
        Row: {
          code: string
          event_id: string
          exact_points: number
          id: string
          is_knockout: boolean
          name: string
          result_points: number
          sort_order: number
        }
        Insert: {
          code: string
          event_id: string
          exact_points: number
          id?: string
          is_knockout?: boolean
          name: string
          result_points: number
          sort_order: number
        }
        Update: {
          code?: string
          event_id?: string
          exact_points?: number
          id?: string
          is_knockout?: boolean
          name?: string
          result_points?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_stages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_teams: {
        Row: {
          event_id: string
          group_code: string | null
          team_id: string
        }
        Insert: {
          event_id: string
          group_code?: string | null
          team_id: string
        }
        Update: {
          event_id?: string
          group_code?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          landing_visible: boolean
          name: string
          official_end_at: string | null
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          landing_visible?: boolean
          name: string
          official_end_at?: string | null
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          landing_visible?: boolean
          name?: string
          official_end_at?: string | null
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      landing_settings: {
        Row: {
          featured_event_id: string | null
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          featured_event_id?: string | null
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          featured_event_id?: string | null
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_settings_featured_event_id_fkey"
            columns: ["featured_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_placeholder: string | null
          away_score: number | null
          away_team_id: string | null
          created_at: string
          event_id: string
          group_code: string | null
          home_placeholder: string | null
          home_score: number | null
          home_team_id: string | null
          id: string
          match_number: number | null
          result_confirmed_at: string | null
          result_confirmed_by: string | null
          result_revision: number
          round_label: string | null
          stage_id: string
          starts_at: string
          status: string
          teams_source: string | null
          updated_at: string
          venue: string | null
          winner_side: string | null
        }
        Insert: {
          away_placeholder?: string | null
          away_score?: number | null
          away_team_id?: string | null
          created_at?: string
          event_id: string
          group_code?: string | null
          home_placeholder?: string | null
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          match_number?: number | null
          result_confirmed_at?: string | null
          result_confirmed_by?: string | null
          result_revision?: number
          round_label?: string | null
          stage_id: string
          starts_at: string
          status?: string
          teams_source?: string | null
          updated_at?: string
          venue?: string | null
          winner_side?: string | null
        }
        Update: {
          away_placeholder?: string | null
          away_score?: number | null
          away_team_id?: string | null
          created_at?: string
          event_id?: string
          group_code?: string | null
          home_placeholder?: string | null
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          match_number?: number | null
          result_confirmed_at?: string | null
          result_confirmed_by?: string | null
          result_revision?: number
          round_label?: string | null
          stage_id?: string
          starts_at?: string
          status?: string
          teams_source?: string | null
          updated_at?: string
          venue?: string | null
          winner_side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_event_id_away_team_id_fkey"
            columns: ["event_id", "away_team_id"]
            isOneToOne: false
            referencedRelation: "event_teams"
            referencedColumns: ["event_id", "team_id"]
          },
          {
            foreignKeyName: "matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_event_id_home_team_id_fkey"
            columns: ["event_id", "home_team_id"]
            isOneToOne: false
            referencedRelation: "event_teams"
            referencedColumns: ["event_id", "team_id"]
          },
          {
            foreignKeyName: "matches_stage_id_event_id_fkey"
            columns: ["stage_id", "event_id"]
            isOneToOne: false
            referencedRelation: "event_stages"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      news: {
        Row: {
          content: string
          created_at: string
          event_id: string
          id: string
          match_id: string
          match_revision: number
          parche_event_id: string | null
          summary: string
          superseded_at: string | null
          superseded_reason: string | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          event_id: string
          id?: string
          match_id: string
          match_revision: number
          parche_event_id?: string | null
          summary: string
          superseded_at?: string | null
          superseded_reason?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          event_id?: string
          id?: string
          match_id?: string
          match_revision?: number
          parche_event_id?: string | null
          summary?: string
          superseded_at?: string | null
          superseded_reason?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_match_fk"
            columns: ["match_id", "event_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "news_parche_event_fk"
            columns: ["parche_event_id", "event_id"]
            isOneToOne: false
            referencedRelation: "parche_events"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      parche_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          parche_id: string
          predictions_visibility: string
          status: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          parche_id: string
          predictions_visibility?: string
          status?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          parche_id?: string
          predictions_visibility?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "parche_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parche_events_parche_id_fkey"
            columns: ["parche_id"]
            isOneToOne: false
            referencedRelation: "parches"
            referencedColumns: ["id"]
          },
        ]
      }
      parche_invitations: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          max_uses: number | null
          parche_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          last_used_at?: string | null
          max_uses?: number | null
          parche_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          max_uses?: number | null
          parche_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "parche_invitations_parche_id_fkey"
            columns: ["parche_id"]
            isOneToOne: false
            referencedRelation: "parches"
            referencedColumns: ["id"]
          },
        ]
      }
      parche_member_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          parche_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          parche_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          parche_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parche_member_events_parche_id_fkey"
            columns: ["parche_id"]
            isOneToOne: false
            referencedRelation: "parches"
            referencedColumns: ["id"]
          },
        ]
      }
      parche_members: {
        Row: {
          disabled_at: string | null
          id: string
          joined_at: string
          parche_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          disabled_at?: string | null
          id?: string
          joined_at?: string
          parche_id: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          disabled_at?: string | null
          id?: string
          joined_at?: string
          parche_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parche_members_parche_id_fkey"
            columns: ["parche_id"]
            isOneToOne: false
            referencedRelation: "parches"
            referencedColumns: ["id"]
          },
        ]
      }
      parches: {
        Row: {
          created_at: string
          created_by: string | null
          creation_request_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          creation_request_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          creation_request_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      predictions: {
        Row: {
          away_score: number
          created_at: string
          event_id: string
          home_score: number
          id: string
          match_id: string
          parche_event_id: string
          points: number | null
          points_reason: string | null
          scored_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          away_score: number
          created_at?: string
          event_id: string
          home_score: number
          id?: string
          match_id: string
          parche_event_id: string
          points?: number | null
          points_reason?: string | null
          scored_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          away_score?: number
          created_at?: string
          event_id?: string
          home_score?: number
          id?: string
          match_id?: string
          parche_event_id?: string
          points?: number | null
          points_reason?: string | null
          scored_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_event_id_fkey"
            columns: ["match_id", "event_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "predictions_parche_event_id_event_id_fkey"
            columns: ["parche_event_id", "event_id"]
            isOneToOne: false
            referencedRelation: "parche_events"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      standing_snapshot_rows: {
        Row: {
          display_name: string
          exact_hits: number | null
          membership_role: string
          membership_status: string
          misses: number | null
          participation: string
          points: number | null
          position: number | null
          position_shared: boolean | null
          predictions_count: number | null
          result_hits: number | null
          row_number: number
          snapshot_id: string
          stats_status: string
          tiebreak_values: Json | null
          unranked_reason: string | null
          user_id: string | null
        }
        Insert: {
          display_name: string
          exact_hits?: number | null
          membership_role: string
          membership_status: string
          misses?: number | null
          participation: string
          points?: number | null
          position?: number | null
          position_shared?: boolean | null
          predictions_count?: number | null
          result_hits?: number | null
          row_number: number
          snapshot_id: string
          stats_status: string
          tiebreak_values?: Json | null
          unranked_reason?: string | null
          user_id?: string | null
        }
        Update: {
          display_name?: string
          exact_hits?: number | null
          membership_role?: string
          membership_status?: string
          misses?: number | null
          participation?: string
          points?: number | null
          position?: number | null
          position_shared?: boolean | null
          predictions_count?: number | null
          result_hits?: number | null
          row_number?: number
          snapshot_id?: string
          stats_status?: string
          tiebreak_values?: Json | null
          unranked_reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "standing_snapshot_rows_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "standing_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      standing_snapshots: {
        Row: {
          close_run_id: string | null
          computed_at: string
          created_at: string
          data_cutoff_at: string | null
          id: string
          kind: string
          member_count: number
          notes: string | null
          parche_event_id: string
          ranked_count: number
          ranking_rules: Json
          rows_checksum: string | null
          scoring_rules: Json
          sealed_at: string | null
          source: string
          source_ref: string | null
          version: number
        }
        Insert: {
          close_run_id?: string | null
          computed_at: string
          created_at?: string
          data_cutoff_at?: string | null
          id?: string
          kind: string
          member_count: number
          notes?: string | null
          parche_event_id: string
          ranked_count: number
          ranking_rules: Json
          rows_checksum?: string | null
          scoring_rules: Json
          sealed_at?: string | null
          source: string
          source_ref?: string | null
          version: number
        }
        Update: {
          close_run_id?: string | null
          computed_at?: string
          created_at?: string
          data_cutoff_at?: string | null
          id?: string
          kind?: string
          member_count?: number
          notes?: string | null
          parche_event_id?: string
          ranked_count?: number
          ranking_rules?: Json
          rows_checksum?: string | null
          scoring_rules?: Json
          sealed_at?: string | null
          source?: string
          source_ref?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "standing_snapshots_close_run_id_fkey"
            columns: ["close_run_id"]
            isOneToOne: false
            referencedRelation: "event_close_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standing_snapshots_parche_event_id_fkey"
            columns: ["parche_event_id"]
            isOneToOne: false
            referencedRelation: "parche_events"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          code: string | null
          created_at: string
          crest_path: string | null
          flag_emoji: string | null
          id: string
          kind: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          crest_path?: string | null
          flag_emoji?: string | null
          id?: string
          kind?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          crest_path?: string | null
          flag_emoji?: string | null
          id?: string
          kind?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_parche_invitation: {
        Args: { p_token: string }
        Returns: {
          parche_id: string
          status: string
        }[]
      }
      add_event_to_parche: {
        Args: { p_event_id: string; p_parche_id: string }
        Returns: string
      }
      control_create_event: {
        Args: { p_name: string; p_slug: string; p_timezone: string }
        Returns: string
      }
      control_event_lock_reasons: {
        Args: never
        Returns: {
          event_id: string
          reason: string
        }[]
      }
      control_event_publish_issues: {
        Args: { p_event_id: string }
        Returns: string[]
      }
      control_landing_featured: { Args: never; Returns: string }
      control_move_stage: {
        Args: { p_direction: string; p_event_id: string; p_stage_id: string }
        Returns: undefined
      }
      control_news_context: { Args: { p_match_id: string }; Returns: Json }
      control_pending_results: {
        Args: { p_event_id: string }
        Returns: {
          away_score: number
          home_score: number
          match_id: string
          recorded_at: string
          revision: number
          winner_side: string
        }[]
      }
      control_publish_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      control_publish_match_news: {
        Args: { p_items: Json; p_match_id: string; p_revision: number }
        Returns: number
      }
      control_remove_event_team: {
        Args: { p_event_id: string; p_team_id: string }
        Returns: undefined
      }
      control_reopen_match: {
        Args: {
          p_expected_revision: number
          p_match_id: string
          p_reason: string
        }
        Returns: number
      }
      control_rescore_match: { Args: { p_match_id: string }; Returns: number }
      control_resolve_pending_result: {
        Args: {
          p_action: string
          p_expected_revision: number
          p_match_id: string
        }
        Returns: number
      }
      control_save_match: {
        Args: {
          p_away_placeholder: string
          p_away_team_id: string
          p_event_id: string
          p_group_code: string
          p_home_placeholder: string
          p_home_team_id: string
          p_match_id: string
          p_match_number: number
          p_round_label?: string
          p_stage_id: string
          p_starts_at: string
          p_status: string
          p_venue: string
        }
        Returns: string
      }
      control_save_stage: {
        Args: {
          p_code: string
          p_event_id: string
          p_exact_points: number
          p_is_knockout: boolean
          p_name: string
          p_result_points: number
          p_sort_order: number
          p_stage_id: string
        }
        Returns: string
      }
      control_save_team: {
        Args: {
          p_code: string
          p_flag_emoji: string
          p_kind: string
          p_name: string
          p_team_id: string
        }
        Returns: string
      }
      control_set_event_status: {
        Args: { p_event_id: string; p_status: string }
        Returns: undefined
      }
      control_set_event_team: {
        Args: { p_event_id: string; p_group_code: string; p_team_id: string }
        Returns: string
      }
      control_set_featured_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      control_set_landing_visible: {
        Args: { p_event_id: string; p_visible: boolean }
        Returns: undefined
      }
      control_set_team_crest: {
        Args: { p_path: string; p_team_id: string }
        Returns: undefined
      }
      control_update_event: {
        Args: {
          p_event_id: string
          p_name: string
          p_official_end_at: string
          p_slug: string
          p_timezone: string
        }
        Returns: undefined
      }
      control_update_match_live: {
        Args: {
          p_away: number
          p_expected_revision: number
          p_home: number
          p_match_id: string
          p_reason: string
          p_status: string
          p_winner_side: string
        }
        Returns: number
      }
      create_parche: {
        Args: { p_name: string; p_request_id: string }
        Returns: string
      }
      create_parche_invitation: {
        Args: { p_parche_id: string }
        Returns: {
          expires_at: string
          token: string
        }[]
      }
      get_landing_tournaments: {
        Args: never
        Returns: {
          first_match_at: string
          has_live: boolean
          is_manual: boolean
          last_match_at: string
          name: string
          next_match_at: string
          slug: string
          status: string
          timezone: string
        }[]
      }
      get_match_missing_predictions: {
        Args: { p_match_id: string; p_parche_event_id: string }
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      get_match_predictions: {
        Args: { p_match_id: string; p_parche_event_id: string }
        Returns: {
          display_name: string
          points: number
          points_reason: string
          pred_away: number
          pred_home: number
          predicted_at: string
          user_id: string
        }[]
      }
      get_news_feed: {
        Args: { p_before?: string; p_limit?: number; p_parche_event_id: string }
        Returns: {
          created_at: string
          id: string
          match_id: string
          scope: string
          summary: string
          title: string
        }[]
      }
      get_news_item: {
        Args: { p_news_id: string; p_parche_event_id: string }
        Returns: {
          content: string
          created_at: string
          id: string
          match_id: string
          scope: string
          summary: string
          title: string
        }[]
      }
      get_parche_event_leaderboard: {
        Args: { p_parche_event_id: string }
        Returns: {
          display_name: string
          exact_count: number
          pred_count: number
          rank: number
          result_count: number
          total_points: number
          user_id: string
        }[]
      }
      get_parche_invitation: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          parche_id: string
          parche_name: string
          status: string
        }[]
      }
      get_parche_members: {
        Args: { p_parche_id: string }
        Returns: {
          display_name: string
          is_me: boolean
          joined_at: string
          role: string
          status: string
          user_id: string
        }[]
      }
      is_platform_admin: { Args: never; Returns: boolean }
      leave_parche: { Args: { p_parche_id: string }; Returns: undefined }
      revoke_parche_invitation: {
        Args: { p_parche_id: string }
        Returns: undefined
      }
      save_prediction: {
        Args: {
          p_away: number
          p_home: number
          p_match_id: string
          p_parche_event_id: string
        }
        Returns: {
          away_score: number
          created_at: string
          event_id: string
          home_score: number
          id: string
          match_id: string
          parche_event_id: string
          points: number | null
          points_reason: string | null
          scored_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "predictions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_parche_member_role: {
        Args: { p_parche_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      set_parche_member_status: {
        Args: { p_parche_id: string; p_status: string; p_user_id: string }
        Returns: undefined
      }
      sync_due_matches: { Args: never; Returns: number }
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
