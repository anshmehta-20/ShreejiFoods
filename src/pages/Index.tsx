import { useEffect, useState } from 'react';
import { supabase, Product, ProductVariant } from '@/lib/supabase';
import Header from '@/components/Header';
import ProductDetailDialog from '@/components/ProductDetailDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Package, Search } from 'lucide-react';
import { format } from 'date-fns';

const parseNumericValue = (value: string): number | null => {
  const match = value.match(/[\d\.]+/);
  if (!match) {
    return null;
  }

  const numeric = Number.parseFloat(match[0]);
  return Number.isNaN(numeric) ? null : numeric;
};

// Convert weight to grams for proper sorting
const parseWeightInGrams = (value: string): number | null => {
  const lowerValue = value.toLowerCase();
  const numMatch = lowerValue.match(/(\d+(?:\.\d+)?)/);

  if (!numMatch) {
    return null;
  }

  const num = Number.parseFloat(numMatch[1]);
  if (Number.isNaN(num)) {
    return null;
  }

  // Convert to grams based on unit
  if (lowerValue.includes('kg')) {
    return num * 1000; // kg to grams
  } else if (lowerValue.includes('g') && !lowerValue.includes('kg')) {
    return num; // already in grams
  } else if (lowerValue.includes('mg')) {
    return num / 1000; // mg to grams
  } else if (lowerValue.includes('lb') || lowerValue.includes('pound')) {
    return num * 453.592; // pounds to grams
  } else if (lowerValue.includes('oz') || lowerValue.includes('ounce')) {
    return num * 28.3495; // ounces to grams
  }

  // If no unit found, treat as the raw number
  return num;
};

const sortVariants = (variants: ProductVariant[]) => {
  return [...variants].sort((a, b) => {
    // Check if this is a weight-based variant
    const isWeightVariant = a.variant_type === 'weight' || b.variant_type === 'weight';

    let aValue: number | null;
    let bValue: number | null;

    if (isWeightVariant) {
      // Use weight-aware parsing for weight variants
      aValue = parseWeightInGrams(a.variant_value);
      bValue = parseWeightInGrams(b.variant_value);
    } else {
      // Use simple numeric parsing for other variants
      aValue = parseNumericValue(a.variant_value);
      bValue = parseNumericValue(b.variant_value);
    }

    if (aValue !== null && bValue !== null && aValue !== bValue) {
      return aValue - bValue;
    }

    if (aValue !== null && bValue === null) {
      return -1;
    }

    if (aValue === null && bValue !== null) {
      return 1;
    }

    if (aValue === null && bValue === null && a.price !== b.price) {
      return a.price - b.price;
    }

    return a.variant_value.localeCompare(b.variant_value, undefined, { sensitivity: 'base' });
  });
};

const VARIANT_TYPE_LABELS: Record<ProductVariant['variant_type'], string> = {
  weight: 'Weight',
  pcs: 'Pieces',
  price: 'Price',
  flavor: 'Flavor',
  size: 'Size',
};

type RawProduct = Omit<Product, 'product_variants'> & {
  product_variants: ProductVariant[] | null;
};

export default function UserDashboard() {
  const [items, setItems] = useState<Product[]>([]);
  const [filteredItems, setFilteredItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [storeStatus, setStoreStatus] = useState<boolean | null>(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(true);
  const [categoryCount, setCategoryCount] = useState(0);
  const [categoryCountLoading, setCategoryCountLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Product | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchStoreStatus = async () => {
    setStoreStatusLoading(true);
    try {
      const { data, error } = await supabase
        .from('store_status')
        .select('is_open')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        setStoreStatus(data[0].is_open);
      } else {
        setStoreStatus(true);
      }
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load store status',
      });
      setStoreStatus(true);
    } finally {
      setStoreStatusLoading(false);
    }
  };

  const fetchCategoryCount = async (withLoading = false) => {
    if (withLoading) {
      setCategoryCountLoading(true);
    }

    try {
      const { count, error } = await supabase
        .from('category')
        .select('id', { count: 'exact', head: true });

      if (error) throw error;

      setCategoryCount(count ?? 0);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load category count',
      });
    } finally {
      if (withLoading) {
        setCategoryCountLoading(false);
      }
    }
  };

  // Refresh store status periodically to reflect automated changes
  useEffect(() => {
    // Refresh status every 10 minutes to catch automated updates
    const interval = setInterval(() => {
      fetchStoreStatus();
    }, 600000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchItems();
    fetchStoreStatus();
    fetchCategoryCount(true);

    const inventoryChannel = supabase
      .channel('inventory_changes_public')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product' },
        () => {
          fetchItems();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_variants' },
        () => {
          fetchItems();
        }
      )
      .subscribe();

    const categoryChannel = supabase
      .channel('category_changes_public')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'category' },
        () => {
          fetchCategoryCount();
        }
      )
      .subscribe();

    const storeChannel = supabase
      .channel('store_status_public')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_status' },
        (payload) => {
          const next = (payload.new as { is_open?: boolean }) || {};
          if (typeof next.is_open === 'boolean') {
            setStoreStatus(next.is_open);
          }
        }
      )
      .subscribe();

    return () => {
      inventoryChannel.unsubscribe();
      categoryChannel.unsubscribe();
      storeChannel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredItems(items);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredItems(
        items.filter((item) => {
          const matchesItem =
            item.name.toLowerCase().includes(query) ||
            (item.category && item.category.toLowerCase().includes(query)) ||
            (item.description && item.description.toLowerCase().includes(query));

          const matchesVariant = item.variants.some((variant) => {
            const value = variant.variant_value?.toLowerCase() || '';
            const sku = variant.sku?.toLowerCase() || '';
            const type = variant.variant_type?.toLowerCase() || '';

            return (
              value.includes(query) ||
              sku.includes(query) ||
              type.includes(query) ||
              variant.price.toString().includes(query) ||
              variant.quantity.toString().includes(query)
            );
          });

          return matchesItem || matchesVariant;
        })
      );
    }
  }, [searchQuery, items]);

  useEffect(() => {
    setSelectedVariants((prev) => {
      let changed = false;
      const next: Record<string, string> = { ...prev };
      const itemIds = new Set(items.map((item) => item.id));

      Object.keys(next).forEach((itemId) => {
        if (!itemIds.has(itemId)) {
          delete next[itemId];
          changed = true;
        }
      });

      items.forEach((item) => {
        const sorted = sortVariants(item.variants);

        if (sorted.length === 0) {
          if (next[item.id]) {
            delete next[item.id];
            changed = true;
          }
          return;
        }

        const current = next[item.id];
        const exists = current ? sorted.some((variant) => variant.id === current) : false;

        if (!exists) {
          next[item.id] = sorted[0].id;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [items]);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('product')
        .select(
          'id, name, description, category, is_visible, image_url, last_updated, updated_by, product_variants(*)'
        )
        .order('name', { ascending: true })
        .order('variant_value', { referencedTable: 'product_variants', ascending: true });

      if (error) throw error;

      const normalizedItems = ((data || []) as RawProduct[]).map((item) => ({
        ...item,
        variants: Array.isArray(item.product_variants) ? item.product_variants : [],
      }));

      const visibleItems = normalizedItems.filter((item) => item.is_visible);
      setItems(visibleItems);
      setFilteredItems(visibleItems);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to fetch items',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVariantSelect = (itemId: string, variantId: string) => {
    setSelectedVariants((prev) => ({ ...prev, [itemId]: variantId }));
  };

  const getVariantsForItem = (item: Product) => {
    const sortedVariants = sortVariants(item.variants);
    const currentId = selectedVariants[item.id];
    const selectedVariant =
      (currentId && sortedVariants.find((variant) => variant.id === currentId)) ||
      sortedVariants[0] ||
      null;

    return { sortedVariants, selectedVariant };
  };

  const formatCurrency = (value: number | null | undefined) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(value ?? 0);

  const formatVariantTimestamp = (timestamp?: string | null) => {
    if (!timestamp) {
      return '—';
    }

    const utcDate = new Date(timestamp);
    if (Number.isNaN(utcDate.getTime())) {
      return '—';
    }

    const istDate = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
    return format(istDate, 'MMM d, yyyy • h:mm a');
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 right-10 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl" />
      </div>

      <Header />

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Stats Cards with Enhanced Design */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {/* Store Status Card */}
          <div
            className={`group relative rounded-[var(--radius)] border p-6 text-card-foreground transition-all duration-500 backdrop-blur-sm overflow-hidden ${storeStatus === null || storeStatusLoading
                ? 'bg-card/80 border-border shadow-lg hover:shadow-xl'
                : storeStatus
                  ? 'bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border-emerald-400/75 shadow-[0_0_48px_rgba(16,185,129,0.3)] hover:shadow-[0_0_60px_rgba(16,185,129,0.4)]'
                  : 'bg-gradient-to-br from-destructive/15 to-destructive/5 border-destructive/75 shadow-[0_0_48px_rgba(239,68,68,0.3)] hover:shadow-[0_0_60px_rgba(239,68,68,0.4)]'
              }`}
          >
            {/* Animated background gradient */}
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${storeStatus ? 'bg-gradient-to-tr from-emerald-500/10 to-transparent' : 'bg-gradient-to-tr from-destructive/10 to-transparent'
              }`} />

            <div className="flex flex-col space-y-3 relative z-10">
              <CardDescription className="text-sm font-medium">Store Status</CardDescription>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <span
                    className={`block h-4 w-4 rounded-full shadow-[0_0_16px_currentColor] transition-all duration-300 group-hover:scale-110 ${storeStatus === null || storeStatusLoading
                        ? 'bg-muted-foreground/40 text-muted-foreground/40'
                        : storeStatus
                          ? 'bg-emerald-400 text-emerald-400 animate-pulse'
                          : 'bg-destructive text-destructive animate-pulse'
                      }`}
                    aria-hidden="true"
                  />
                  {storeStatus && (
                    <span className="absolute inset-0 h-4 w-4 rounded-full bg-emerald-400 animate-ping opacity-75" />
                  )}
                </div>
                <CardTitle className="text-4xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
                  {storeStatus === null || storeStatusLoading
                    ? '—'
                    : storeStatus
                      ? 'Open'
                      : 'Closed'}
                </CardTitle>
              </div>
            </div>
          </div>

          {/* Total Items Card */}
          <Card className="group relative overflow-hidden border-2 hover:border-amber-500/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-gradient-to-br from-card to-card/80 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardHeader className="pb-3 relative z-10">
              <CardDescription className="text-sm font-medium flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600" />
                Total Items
              </CardDescription>
              <CardTitle className="text-4xl font-bold bg-gradient-to-br from-amber-600 to-orange-600 bg-clip-text text-transparent">
                {loading ? '—' : items.length}
              </CardTitle>
              <div className="h-1 w-16 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full mt-2" />
            </CardHeader>
          </Card>

          {/* Categories Card */}
          <Card className="group relative overflow-hidden border-2 hover:border-rose-500/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-gradient-to-br from-card to-card/80 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <CardHeader className="pb-3 relative z-10">
              <CardDescription className="text-sm font-medium flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Categories
              </CardDescription>
              <CardTitle className="text-4xl font-bold bg-gradient-to-br from-rose-600 to-pink-600 bg-clip-text text-transparent">
                {categoryCountLoading ? '—' : categoryCount}
              </CardTitle>
              <div className="h-1 w-16 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full mt-2" />
            </CardHeader>
          </Card>
        </div>

        {/* Enhanced Search Card */}
        <Card className="mb-8 border-2 hover:border-primary/30 transition-all duration-300 bg-gradient-to-br from-card to-card/80 backdrop-blur-sm shadow-lg hover:shadow-xl group">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-xl bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Search Inventory
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5 pointer-events-none transition-colors group-focus-within:text-primary" />
              <Input
                type="text"
                placeholder="Search by item, variant, SKU, category, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                className="pl-12 h-12 text-base border-2 focus:border-primary/50 transition-all duration-300 rounded-xl shadow-sm"
              />
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-primary/10 backdrop-blur-sm">
              <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-lg font-medium text-foreground">Loading inventory...</span>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <Card className="border-2 border-dashed bg-gradient-to-br from-card to-muted/20 backdrop-blur-sm">
            <CardContent className="text-center py-16">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Package className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                {searchQuery ? 'No Results Found' : 'No Items Available'}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {searchQuery
                  ? 'Try adjusting your search terms or filters'
                  : 'There are currently no items in the inventory'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => {
              const { sortedVariants, selectedVariant } = getVariantsForItem(item);
              const priceToDisplay = selectedVariant?.price ?? null;
              const quantityToDisplay = selectedVariant?.quantity ?? null;
              const lastUpdatedDisplay = selectedVariant?.last_updated ?? null;

              return (
                <Card
                  key={item.id}
                  className="flex h-full flex-col hover:shadow-2xl transition-all duration-500 cursor-pointer group border-2 hover:border-primary/30 overflow-hidden relative bg-gradient-to-br from-card to-card/90 backdrop-blur-sm hover:-translate-y-2"
                  onClick={() => {
                    setSelectedItem(item);
                    setDetailDialogOpen(true);
                  }}
                >
                  {/* Hover Gradient Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Image Section */}
                  {item.image_url && (
                    <div className="relative h-48 overflow-hidden bg-gradient-to-br from-muted/30 to-muted/10">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                      {item.category && (
                        <Badge variant="secondary" className="absolute top-3 right-3 backdrop-blur-md bg-background/80 shadow-lg">
                          {item.category}
                        </Badge>
                      )}
                    </div>
                  )}

                  <CardHeader className="space-y-3 pb-4 relative z-10">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text group-hover:from-primary group-hover:to-primary/80 transition-all duration-300">
                        {item.name}
                      </CardTitle>
                      {item.category && !item.image_url && (
                        <Badge variant="secondary" className="ml-auto backdrop-blur-sm">
                          {item.category}
                        </Badge>
                      )}
                    </div>
                    <div className="!mt-0 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {sortedVariants.length > 0 ? (
                        <Select
                          value={selectedVariant?.id ?? sortedVariants[0].id}
                          onValueChange={(value) => handleVariantSelect(item.id, value)}
                          aria-label={`Select variant for ${item.name}`}
                        >
                          <SelectTrigger className="one-shadow h-7 min-w-[6rem] w-auto max-w-[12rem] rounded-[var(--radius)] border border-border text-xs hover:border-accent hover:bg-accent/50 hover:text-accent-foreground active:scale-[0.98] touch-manipulation">
                            <SelectValue placeholder="Variant" />
                          </SelectTrigger>
                          <SelectContent className="touch-manipulation">
                            {sortedVariants.map((variant) => (
                              <SelectItem key={variant.id} value={variant.id} className="touch-manipulation cursor-pointer">
                                {VARIANT_TYPE_LABELS[variant.variant_type]
                                  ? `${variant.variant_value} • ${VARIANT_TYPE_LABELS[variant.variant_type]}`
                                  : variant.variant_value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className="one-shadow text-xs font-medium rounded-[var(--radius)]"
                        >
                          No variants yet
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col space-y-4 pb-5 relative z-10">
                    {item.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    <div className="mt-auto space-y-4 border-t-2 border-gradient-to-r from-border via-primary/20 to-border pt-4">
                      {/* Price and Quantity Section with Enhanced Design */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Available Quantity</p>
                          <Badge
                            variant={
                              quantityToDisplay !== null && quantityToDisplay === 0
                                ? 'destructive'
                                : 'default'
                            }
                            className="px-4 py-1.5 text-sm font-bold shadow-md"
                          >
                            {quantityToDisplay ?? '—'}
                          </Badge>
                        </div>
                        <div className="flex flex-col items-end">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Price</p>
                          <p className="text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                            {priceToDisplay !== null ? formatCurrency(priceToDisplay) : '—'}
                          </p>
                        </div>
                      </div>

                      {/* Last Updated Section */}
                      <div className="text-xs text-muted-foreground pt-3 border-t border-border/50 dark:border-[#080808]/50 flex items-center gap-2">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">
                          {lastUpdatedDisplay
                            ? formatVariantTimestamp(lastUpdatedDisplay)
                            : 'Never updated'}
                        </span>
                      </div>

                      {/* Click Indicator */}
                      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="flex items-center gap-1 text-xs text-primary font-medium">
                          <span>View Details</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ProductDetailDialog
        item={selectedItem}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </div>
  );
}