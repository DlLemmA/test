export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      customers: {
        Row: {
          id: number;
          is_self: boolean;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          id?: number;
          is_self?: boolean;
          name: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Update: {
          id?: number;
          is_self?: boolean;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      parcel_items: {
        Row: {
          created_at: string;
          customer_id: number;
          id: number;
          name: string;
          parcel_id: number;
          price_byn: number;
          price_cny: number;
          quantity: number;
          status: string;
          track_numbers: string;
          tracks_completed_at: string | null;
          unit: string;
          updated_at: string;
          weights_g: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          customer_id: number;
          id?: number;
          name: string;
          parcel_id: number;
          price_byn: number;
          price_cny: number;
          quantity?: number;
          status?: string;
          track_numbers?: string;
          tracks_completed_at?: string | null;
          unit?: string;
          updated_at?: string;
          weights_g?: string;
          workspace_id?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: number;
          id?: number;
          name?: string;
          parcel_id?: number;
          price_byn?: number;
          price_cny?: number;
          quantity?: number;
          status?: string;
          track_numbers?: string;
          tracks_completed_at?: string | null;
          unit?: string;
          updated_at?: string;
          weights_g?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parcel_items_workspace_id_customer_id_fkey";
            columns: ["workspace_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "parcel_items_workspace_id_parcel_id_fkey";
            columns: ["workspace_id", "parcel_id"];
            isOneToOne: false;
            referencedRelation: "parcels";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      parcels: {
        Row: {
          box_weight_g: number | null;
          comment: string | null;
          completed_at: string | null;
          created_at: string;
          id: number;
          name: string | null;
          received_at: string | null;
          shipped_at: string | null;
          shipping_cost_byn: number | null;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          box_weight_g?: number | null;
          comment?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: number;
          name?: string | null;
          received_at?: string | null;
          shipped_at?: string | null;
          shipping_cost_byn?: number | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Update: {
          box_weight_g?: number | null;
          comment?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: number;
          name?: string | null;
          received_at?: string | null;
          shipped_at?: string | null;
          shipping_cost_byn?: number | null;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          created_at: string;
          customer_id: number;
          id: number;
          item_id: number | null;
          paid: boolean;
          paid_at: string | null;
          parcel_id: number;
          type: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          customer_id: number;
          id?: number;
          item_id?: number | null;
          paid?: boolean;
          paid_at?: string | null;
          parcel_id: number;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: number;
          id?: number;
          item_id?: number | null;
          paid?: boolean;
          paid_at?: string | null;
          parcel_id?: number;
          type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_workspace_id_customer_id_fkey";
            columns: ["workspace_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "payments_workspace_id_item_id_fkey";
            columns: ["workspace_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "parcel_items";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "payments_workspace_id_parcel_id_fkey";
            columns: ["workspace_id", "parcel_id"];
            isOneToOne: false;
            referencedRelation: "parcels";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      workspace_invites: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          email: string;
          user_id: string;
        };
        Insert: {
          email: string;
          user_id: string;
        };
        Update: {
          email?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_parcel_with_items: {
        Args: { p_items?: Json[]; p_parcel: Json; p_payments?: Json[] };
        Returns: Json;
      };
      is_workspace_member: { Args: never; Returns: boolean };
      replace_workspace: { Args: { p_snapshot: Json }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
