import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Profile {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_visible: boolean;
  image_url: string | null;
  last_updated: string | null;
  updated_by: string | null;
  variants: ProductVariant[];
}

// Legacy type alias for backward compatibility during migration
export type InventoryItem = Product;

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  variant_type: 'weight' | 'pcs' | 'price' | 'flavor' | 'size';
  variant_value: string;
  price: number;
  quantity: number;
  last_updated: string;
  updated_by: string | null;
}

// Legacy type alias for backward compatibility during migration
export type ItemVariant = ProductVariant;

export interface StoreStatus {
  id: string;
  is_open: boolean;
  updated_at: string | null;
  updated_by: string | null;
}
