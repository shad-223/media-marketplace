export type Mini = { id: number; username: string; is_verified: boolean };

export type Listing = {
  id: number;
  title: string;
  category: string;
  category_label: string;
  group: string;
  niche: string;
  audience: number;
  monthly_traffic: number;
  monthly_revenue: string;
  age_months: number;
  monetized: boolean;
  price: string;
  allow_offers: boolean;
  thumbnail: string | null;
  is_verified: boolean;
  status: string;
  status_label?: string;
  seller: Mini & { avatar?: string | null; rating?: { average: number; count: number }; completed_trades?: number; bio?: string; date_joined?: string };
  is_saved: boolean;
  approved_at: string | null;
  created_at: string;
  description?: string;
  asset_url?: string;
  country?: string;
  views?: number;
  admin_note?: string;
  verify_code?: string;
  ownership_found?: boolean | null;
  ownership_checked_at?: string | null;
  has_proof?: boolean;
};

export type Offer = {
  id: number;
  listing: Listing;
  buyer: Mini;
  amount: string;
  message: string;
  counter_amount: string | null;
  counter_message: string;
  status: string;
  status_label: string;
  created_at: string;
};

export type Order = {
  id: number;
  code: string;
  listing: Listing;
  buyer: Mini;
  seller: Mini;
  amount: string;
  fee: string;
  seller_net: string;
  status: "in_escrow" | "transferred" | "protection" | "disputed" | "completed" | "refunded";
  status_label: string;
  transferred_at: string | null;
  confirmed_at: string | null;
  release_at: string | null;
  closed_at: string | null;
  created_at: string;
  disputes?: { id: number; opened_by: string; reason: string; status: string; resolution: string; admin_note: string; created_at: string }[];
  reviews?: { reviewer: string; rating: number; comment: string }[];
  my_role?: "buyer" | "seller" | "admin";
  cancel_request?: { id: number; requested_by: string; reason: string; created_at: string } | null;
};

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
