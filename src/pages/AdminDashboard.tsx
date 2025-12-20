import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Product, ProductVariant } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Package, Search, MoreVertical, CircleMinus, RefreshCw, Check, ChevronDown, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import InventoryForm from '@/components/InventoryForm';
import CategoryForm from '@/components/CategoryForm';
import VariantForm from '@/components/VariantForm';

const VARIANT_TYPE_LABELS: Record<ProductVariant['variant_type'], string> = {
  weight: 'Weight',
  pcs: 'Pieces',
  price: 'Price',
  flavor: 'Flavor',
  size: 'Size',
};

type RawProduct = Omit<Product, 'variants'> & {
  product_variants: ProductVariant[] | null;
};

type CategoryOption = {
  id: string;
  name: string;
};

const parseNumericValue = (value: string): number | null => {
  const match = value.match(/[^\d]*(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const numeric = Number.parseFloat(match[1]);
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

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [filteredItems, setFilteredItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);
  const [variantFormOpen, setVariantFormOpen] = useState(false);
  const [variantParentItemId, setVariantParentItemId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [variantDeleteDialogOpen, setVariantDeleteDialogOpen] = useState(false);
  const [variantToDelete, setVariantToDelete] = useState<ProductVariant | null>(null);
  const [variantParentItemName, setVariantParentItemName] = useState<string>('');
  const [selectedVariantsMap, setSelectedVariantsMap] = useState<Record<string, string>>({});
  const [storeStatus, setStoreStatus] = useState<boolean | null>(null);
  const [storeStatusId, setStoreStatusId] = useState<string | null>(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(true);
  const [updatingStoreStatus, setUpdatingStoreStatus] = useState(false);
  const [removeCategoryOpen, setRemoveCategoryOpen] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<CategoryOption[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [removingCategory, setRemovingCategory] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryPickerSearch, setCategoryPickerSearch] = useState('');
  const [categoryCount, setCategoryCount] = useState(0);
  const [categoryCountLoading, setCategoryCountLoading] = useState(true);
  const [quantityDialogOpen, setQuantityDialogOpen] = useState(false);
  const [quantityEditItem, setQuantityEditItem] = useState<{ item: Product; variant: ProductVariant | null } | null>(null);
  const [newQuantity, setNewQuantity] = useState<string>('');
  const [updatingQuantity, setUpdatingQuantity] = useState(false);
  const { toast } = useToast();
  const categoryPickerRef = useRef<HTMLDivElement | null>(null);

  const fetchStoreStatus = async () => {
    setStoreStatusLoading(true);
    try {
      const { data, error } = await supabase
        .from('store_status')
        .select('id, is_open')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        setStoreStatusId(data[0].id);
        setStoreStatus(data[0].is_open);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('store_status')
          .insert({ is_open: true, updated_by: profile?.id ?? null })
          .select('id, is_open')
          .single();

        if (insertError) throw insertError;

        if (inserted) {
          setStoreStatusId(inserted.id);
          setStoreStatus(inserted.is_open);
        }
      }
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load store status',
      });
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
        description: error.message || 'Failed to load category count.',
      });
    } finally {
      if (withLoading) {
        setCategoryCountLoading(false);
      }
    }
  };

  const handleStoreStatusToggle = async (nextState: boolean) => {
    const previousState = storeStatus ?? false;
    setStoreStatus(nextState);
    setUpdatingStoreStatus(true);

    try {
      if (storeStatusId) {
        const { error } = await supabase
          .from('store_status')
          .update({ is_open: nextState, updated_by: profile?.id ?? null })
          .eq('id', storeStatusId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('store_status')
          .insert({ is_open: nextState, updated_by: profile?.id ?? null })
          .select('id, is_open')
          .single();

        if (error) throw error;

        if (data) {
          setStoreStatusId(data.id);
          setStoreStatus(data.is_open);
        }
      }

      toast({
        title: 'Store status updated',
        description: `Store is now ${nextState ? 'open' : 'closed'}.`,
      });
    } catch (error: any) {
      setStoreStatus(previousState);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update store status',
      });
    } finally {
      setUpdatingStoreStatus(false);
    }
  };

  const handleVariantSelect = (itemId: string, variantId: string) => {
    setSelectedVariantsMap((prev) => ({ ...prev, [itemId]: variantId }));
  };

  const getVariantsForItem = (item: Product) => {
    if (!item.has_variants) {
      return { sortedVariants: [], selectedVariant: null };
    }

    const sortedVariants = sortVariants(item.variants);
    const currentId = selectedVariantsMap[item.id];
    const selectedVariant =
      (currentId && sortedVariants.find((variant) => variant.id === currentId)) ||
      sortedVariants[0] ||
      null;

    return { sortedVariants, selectedVariant };
  };

  // Store automation: Open at 8:35 AM, Close at 9:35 PM (IST - Testing)
  useEffect(() => {
    const scheduleStoreUpdates = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Define open and close times
      const openHour = 8;
      const openMinute = 35;
      const closeHour = 21;
      const closeMinute = 35;

      // Calculate time until next open (8:35 AM)
      let msUntilOpen = 0;
      if (currentHour < openHour || (currentHour === openHour && currentMinute < openMinute)) {
        // Today's open time hasn't passed yet
        const targetOpen = new Date(now);
        targetOpen.setHours(openHour, openMinute, 0, 0);
        msUntilOpen = targetOpen.getTime() - now.getTime();
      } else {
        // Schedule for tomorrow's open time
        const targetOpen = new Date(now);
        targetOpen.setDate(targetOpen.getDate() + 1);
        targetOpen.setHours(openHour, openMinute, 0, 0);
        msUntilOpen = targetOpen.getTime() - now.getTime();
      }

      // Calculate time until next close (8:05 PM)
      let msUntilClose = 0;
      if (currentHour < closeHour || (currentHour === closeHour && currentMinute < closeMinute)) {
        // Today's close time hasn't passed yet
        const targetClose = new Date(now);
        targetClose.setHours(closeHour, closeMinute, 0, 0);
        msUntilClose = targetClose.getTime() - now.getTime();
      } else {
        // Schedule for tomorrow's close time
        const targetClose = new Date(now);
        targetClose.setDate(targetClose.getDate() + 1);
        targetClose.setHours(closeHour, closeMinute, 0, 0);
        msUntilClose = targetClose.getTime() - now.getTime();
      }

      // Schedule open action
      const openTimeout = setTimeout(async () => {
        console.log('Auto-opening store at 8:35 AM');
        try {
          if (!storeStatusId) return;
          await supabase
            .from('store_status')
            .update({ is_open: true, updated_by: profile?.id ?? null })
            .eq('id', storeStatusId);
        } catch (error) {
          console.error('Failed to auto-open store:', error);
        }
      }, msUntilOpen);

      // Schedule close action
      const closeTimeout = setTimeout(async () => {
        console.log('Auto-closing store at 9:35 PM');
        try {
          if (!storeStatusId) return;
          await supabase
            .from('store_status')
            .update({ is_open: false, updated_by: profile?.id ?? null })
            .eq('id', storeStatusId);
        } catch (error) {
          console.error('Failed to auto-close store:', error);
        }
      }, msUntilClose);

      return { openTimeout, closeTimeout };
    };

    if (storeStatusId) {
      const timeouts = scheduleStoreUpdates();

      return () => {
        clearTimeout(timeouts.openTimeout);
        clearTimeout(timeouts.closeTimeout);
      };
    }
  }, [storeStatusId, profile?.id]);

  useEffect(() => {
    fetchItems();
    fetchStoreStatus();
    fetchCategoryCount(true);

    const inventoryChannel = supabase
      .channel('inventory_changes_admin')
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
      .channel('category_changes_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'category' },
        () => {
          fetchCategoryCount();
        }
      )
      .subscribe();

    const storeChannel = supabase
      .channel('store_status_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_status' },
        (payload) => {
          const next = (payload.new as { id?: string; is_open?: boolean }) || {};
          if (typeof next.is_open === 'boolean') {
            setStoreStatus(next.is_open);
          }
          if (next.id) {
            setStoreStatusId(next.id);
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

          const matchesVariant = item.variants.some((variant: ProductVariant) => {
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

          const priceMatches =
            item.price !== null && item.price !== undefined &&
            item.price.toString().includes(query);

          const quantityMatches =
            item.quantity !== null && item.quantity !== undefined &&
            item.quantity.toString().includes(query);

          const matchesSinglePrice = !item.has_variants ? priceMatches || quantityMatches : false;

          const matchesSku = item.sku ? item.sku.toLowerCase().includes(query) : false;

          return matchesItem || matchesVariant || matchesSinglePrice || matchesSku;
        })
      );
    }
  }, [searchQuery, items]);

  useEffect(() => {
    setSelectedVariantsMap((prev) => {
      let hasChanges = false;
      const next: Record<string, string> = { ...prev };
      const itemIds = new Set(items.map((item) => item.id));

      Object.keys(next).forEach((itemId) => {
        if (!itemIds.has(itemId)) {
          delete next[itemId];
          hasChanges = true;
        }
      });

      items.forEach((item) => {
        if (!item.has_variants) {
          if (next[item.id]) {
            delete next[item.id];
            hasChanges = true;
          }
          return;
        }

        const sorted = sortVariants(item.variants);

        if (sorted.length === 0) {
          if (next[item.id]) {
            delete next[item.id];
            hasChanges = true;
          }
          return;
        }

        const current = next[item.id];
        const exists = current ? sorted.some((variant) => variant.id === current) : false;

        if (!exists) {
          next[item.id] = sorted[0].id;
          hasChanges = true;
        }
      });

      return hasChanges ? next : prev;
    });
  }, [items]);

  useEffect(() => {
    if (!removeCategoryOpen) {
      setAvailableCategories([]);
      setSelectedCategoryId('');
      setCategoriesLoading(false);
      setRemovingCategory(false);
      setCategoryPickerOpen(false);
      setCategoryPickerSearch('');
      return;
    }

    const fetchCategories = async () => {
      setCategoriesLoading(true);
      try {
        const { data, error } = await supabase
          .from('category')
          .select('id, name')
          .order('name', { ascending: true });

        if (error) throw error;

        const categoryList = (data ?? []) as CategoryOption[];
        setAvailableCategories(categoryList);
        if (categoryList.length > 0) {
          setSelectedCategoryId(categoryList[0].id);
          setCategoryPickerSearch(categoryList[0].name);
        } else {
          setSelectedCategoryId('');
          setCategoryPickerSearch('');
        }
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error.message || 'Failed to load categories.',
        });
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchCategories();
  }, [removeCategoryOpen, toast]);

  useEffect(() => {
    if (availableCategories.length === 0) {
      if (selectedCategoryId !== '') {
        setSelectedCategoryId('');
      }
      if (!categoryPickerOpen) {
        setCategoryPickerSearch('');
      }
      return;
    }

    const exists = availableCategories.some((category) => category.id === selectedCategoryId);
    if (!exists) {
      setSelectedCategoryId(availableCategories[0].id);
      if (!categoryPickerOpen) {
        setCategoryPickerSearch(availableCategories[0].name);
      }
    }
  }, [availableCategories, selectedCategoryId, categoryPickerOpen]);

  const selectedCategory = useMemo(
    () => availableCategories.find((category) => category.id === selectedCategoryId) ?? null,
    [availableCategories, selectedCategoryId]
  );

  useEffect(() => {
    if (!categoryPickerOpen) {
      setCategoryPickerSearch(selectedCategory?.name ?? '');
    }
  }, [selectedCategory, categoryPickerOpen]);

  useEffect(() => {
    if (!categoryPickerOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(event.target as Node)) {
        setCategoryPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [categoryPickerOpen]);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('product')
        .select(
          'id, name, description, category, is_visible, has_variants, price, quantity, sku, image_url, last_updated, updated_by, product_variants(*)'
        )
        .order('name', { ascending: true })
        .order('variant_value', { referencedTable: 'product_variants', ascending: true });

      if (error) throw error;
      const typedData = ((data || []) as RawProduct[]).map((item) => ({
        ...item,
        variants: Array.isArray(item.product_variants) ? item.product_variants : [],
      }));
      setItems(typedData);
      setFilteredItems(typedData);
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

  const handleEdit = (item: Product) => {
    setSelectedItem(item);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from('product')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Item deleted successfully',
      });
      await fetchItems();
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to delete item',
      });
    }
  };

  const openDeleteDialog = (item: Product) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleVisibilityToggle = async (item: Product, isVisible: boolean) => {
    try {
      const { error } = await supabase
        .from('product')
        .update({ is_visible: isVisible, updated_by: profile?.id ?? null })
        .eq('id', item.id);

      if (error) throw error;

      setItems((prev) =>
        prev.map((existing) =>
          existing.id === item.id ? { ...existing, is_visible: isVisible } : existing
        )
      );

      await fetchItems();

      toast({
        title: 'Visibility updated',
        description: `${item.name} is now ${isVisible ? 'visible' : 'hidden'} to customers.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update visibility',
      });
    }
  };

  const openVariantForm = (item: Product, variant?: ProductVariant | null) => {
    setVariantParentItemId(item.id);
    setVariantParentItemName(item.name);
    setSelectedVariant(variant ?? null);
    setVariantFormOpen(true);
  };

  const openVariantDeleteDialog = (item: Product, variant: ProductVariant) => {
    setVariantParentItemName(item.name);
    setVariantToDelete(variant);
    setVariantDeleteDialogOpen(true);
  };

  const openQuantityDialog = (item: Product, variant: ProductVariant | null) => {
    setQuantityEditItem({ item, variant });
    const currentQuantity = variant ? variant.quantity : item.quantity;
    setNewQuantity(currentQuantity?.toString() ?? '0');
    setQuantityDialogOpen(true);
  };

  const handleQuantityUpdate = async () => {
    if (!quantityEditItem) return;

    const qty = parseInt(newQuantity, 10);
    if (isNaN(qty) || qty < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid quantity',
        description: 'Please enter a valid quantity (0 or greater).',
      });
      return;
    }

    try {
      setUpdatingQuantity(true);

      if (quantityEditItem.variant) {
        // Update variant quantity
        const { error } = await supabase
          .from('product_variants')
          .update({
            quantity: qty,
            updated_by: profile?.id ?? null,
          })
          .eq('id', quantityEditItem.variant.id);

        if (error) throw error;
      } else {
        // Update item quantity (no variants)
        const { error } = await supabase
          .from('product')
          .update({
            quantity: qty,
            last_updated: new Date().toISOString(),
            updated_by: profile?.id ?? null,
          })
          .eq('id', quantityEditItem.item.id);

        if (error) throw error;
      }

      toast({
        title: 'Quantity updated',
        description: 'The quantity has been updated successfully.',
      });

      await fetchItems();
      setQuantityDialogOpen(false);
      setQuantityEditItem(null);
      setNewQuantity('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update quantity.',
      });
    } finally {
      setUpdatingQuantity(false);
    }
  };

  const handleVariantDelete = async () => {
    if (!variantToDelete) return;

    try {
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', variantToDelete.id);

      if (error) throw error;

      toast({
        title: 'Variant removed',
        description: 'Variant deleted successfully',
      });
      await fetchItems();
      setVariantDeleteDialogOpen(false);
      setVariantToDelete(null);
      setVariantParentItemName('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to delete variant',
      });
    }
  };

  const handleRemoveCategory = async () => {
    if (!selectedCategoryId) {
      toast({
        variant: 'destructive',
        title: 'Select a category',
        description: 'Choose a category to remove.',
      });
      return;
    }

    const categoryDetails = selectedCategory;

    try {
      setRemovingCategory(true);

      const { error } = await supabase
        .from('category')
        .delete()
        .eq('id', selectedCategoryId);

      if (error) throw error;

      toast({
        title: 'Category removed',
        description: categoryDetails
          ? `"${categoryDetails.name}" has been deleted.`
          : 'Category deleted successfully.',
      });

      setRemoveCategoryOpen(false);
      await fetchItems();
      await fetchCategoryCount();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to remove category.',
      });
    } finally {
      setRemovingCategory(false);
    }
  };

  const handleVariantFormOpenChange = (open: boolean) => {
    setVariantFormOpen(open);
    if (!open) {
      setVariantParentItemId(null);
      setVariantParentItemName('');
      setSelectedVariant(null);
    }
  };

  const handleVariantDeleteDialogChange = (open: boolean) => {
    setVariantDeleteDialogOpen(open);
    if (!open) {
      setVariantToDelete(null);
      setVariantParentItemName('');
    }
  };

  const totalQuantity = useMemo(
    () =>
      items.reduce((sum, item) => {
        if (!item.has_variants) {
          return sum + (item.quantity ?? 0);
        }

        const variants = Array.isArray(item.variants) ? item.variants : [];
        const variantTotal = variants.reduce(
          (variantSum: number, variant: ProductVariant) => variantSum + variant.quantity,
          0
        );
        return sum + variantTotal;
      }, 0),
    [items]
  );
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
    <div className="min-h-screen bg-background">
      <Header
        title="Shreeji Foods"
        subtitle={profile?.email ?? ''}
      />

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="pb-6 space-y-3">
              <CardDescription>Store Status</CardDescription>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-3xl">
                  <span
                    className={`transition-colors ${
                      storeStatus === null
                        ? 'text-foreground'
                        : storeStatus
                        ? 'text-emerald-500'
                        : 'text-destructive'
                    }`}
                  >
                    {storeStatus === null ? '—' : storeStatus ? 'Open' : 'Closed'}
                  </span>
                </CardTitle>
                <Switch
                  size="default"
                  checked={Boolean(storeStatus)}
                  onCheckedChange={handleStoreStatusToggle}
                  disabled={storeStatusLoading || updatingStoreStatus}
                  aria-label="Toggle store status"
                />
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-6">
              <CardDescription>Total Items</CardDescription>
              <CardTitle className="text-3xl">{loading ? '—' : items.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-6">
              <CardDescription>Total Quantity</CardDescription>
              <CardTitle className="text-3xl">{loading ? '—' : totalQuantity}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-6">
              <CardDescription>Categories</CardDescription>
              <CardTitle className="text-3xl">
                {categoryCountLoading ? '—' : categoryCount}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Inventory Items</CardTitle>
                <CardDescription>Manage products and their variants</CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-border"
                      aria-label="Open quick actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => setCategoryFormOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Category
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setRemoveCategoryOpen(true)}>
                      <CircleMinus className="mr-2 h-4 w-4" />
                      Remove Category
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => fetchItems()}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh Data
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  onClick={() => {
                    setSelectedItem(null);
                    setFormOpen(true);
                  }}
                  className="w-full rounded-[var(--radius)] border border-border sm:w-auto"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search by item, variant, SKU, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading inventory...
          </div>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No items match your search' : 'No items in inventory'}
              </p>
              <Button
                variant="outline"
                className="mt-4 border-border"
                onClick={() => {
                  setSelectedItem(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Item
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block rounded-md border border-border]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-center">Category</TableHead>
                        <TableHead className="text-center">SKU</TableHead>
                        <TableHead className="text-center">Variants</TableHead>
                        <TableHead className="text-center">Price</TableHead>
                        <TableHead className="text-center">Quantity</TableHead>
                        <TableHead className="text-center">Visibility</TableHead>
                        <TableHead className="text-center">Last Updated</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredItems.map((item) => {
                      const { sortedVariants, selectedVariant: activeVariant } = getVariantsForItem(item);
                      const displayPrice = item.has_variants
                        ? activeVariant?.price ?? null
                        : item.price ?? null;
                      const displayQuantity = item.has_variants
                        ? activeVariant?.quantity ?? null
                        : item.quantity ?? null;
                      const lastUpdatedValue = item.has_variants
                        ? activeVariant?.last_updated ?? null
                        : item.last_updated;
                      const skuLabel = item.has_variants
                        ? activeVariant?.sku ?? null
                        : item.sku ?? null;
                      const variantMeta =
                        item.has_variants && activeVariant
                          ? `${activeVariant.variant_value} • ${VARIANT_TYPE_LABELS[activeVariant.variant_type]}`
                          : null;

                      return (
                        <TableRow
                          key={item.id}
                          className={!item.is_visible ? 'bg-muted/40' : undefined}
                        >
                          <TableCell>
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{item.name}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {item.has_variants ? (
                                  sortedVariants.length > 0 ? (
                                    <Select
                                      value={activeVariant?.id ?? sortedVariants[0].id}
                                      onValueChange={(value) => handleVariantSelect(item.id, value)}
                                      aria-label={`Select variant for ${item.name}`}
                                    >
                                      <SelectTrigger className="one-shadow h-7 min-w-[6rem] w-auto max-w-[10rem] rounded-[var(--radius)] border border-border text-xs hover:border-accent hover:bg-accent/50 hover:text-accent-foreground active:scale-[0.98] touch-manipulation">
                                        <SelectValue placeholder="Variant" />
                                      </SelectTrigger>
                                      <SelectContent className="touch-manipulation">
                                        {sortedVariants.map((variant) => {
                                          const variantLabel = VARIANT_TYPE_LABELS[variant.variant_type]
                                            ? `${variant.variant_value} • ${VARIANT_TYPE_LABELS[variant.variant_type]}`
                                            : variant.variant_value;

                                          return (
                                            <SelectItem key={variant.id} value={variant.id} className="touch-manipulation cursor-pointer">
                                              {variantLabel}
                                            </SelectItem>
                                          );
                                        })}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="one-shadow text-xs font-medium rounded-[var(--radius)]"
                                    >
                                      No variants yet
                                    </Badge>
                                  )
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="one-shadow text-xs font-medium rounded-[var(--radius)]"
                                  >
                                    No Variant
                                  </Badge>
                                )}
                              </div>
                              {item.description && (
                                <div className="text-xs text-muted-foreground">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {item.category ? (
                              <Badge variant="secondary">{item.category}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.has_variants ? (
                              sortedVariants.length > 0 && activeVariant ? (
                                <div className="space-y-1">
                                  {skuLabel ? (
                                    <code className="text-xs bg-muted px-2 py-1 rounded">{skuLabel}</code>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">No SKU</span>
                                  )}
                                  {variantMeta && (
                                    <span className="block text-xs text-muted-foreground">{variantMeta}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">No variants yet</span>
                              )
                            ) : (
                              <div className="space-y-1">
                                {skuLabel ? (
                                  <code className="text-xs bg-muted px-2 py-1 rounded">{skuLabel}</code>
                                ) : (
                                  <span className="text-sm text-muted-foreground">SKU not set</span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">
                              {item.has_variants ? sortedVariants.length : '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {displayPrice !== null ? (
                              <span className="font-medium">{formatCurrency(displayPrice)}</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              {displayQuantity !== null ? (
                                <Badge variant={displayQuantity === 0 ? 'destructive' : 'default'}>
                                  {displayQuantity}
                                </Badge>
                              ) : (
                                <Badge variant="outline">—</Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openQuantityDialog(item, activeVariant)}
                                title="Update quantity"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Switch
                                size="sm"
                                checked={item.is_visible}
                                onCheckedChange={(checked) => handleVisibilityToggle(item, checked)}
                                aria-label={`Toggle visibility for ${item.name}`}
                              />
                              <span className="text-sm text-muted-foreground">
                                {item.is_visible ? 'Visible' : 'Hidden'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {lastUpdatedValue ? formatVariantTimestamp(lastUpdatedValue) : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full rounded-[var(--radius)] border-border sm:w-auto"
                                >
                                  Manage
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Item</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => handleEdit(item)}>
                                  Edit Item
                                </DropdownMenuItem>
                                {item.has_variants ? (
                                  <>
                                    <DropdownMenuItem onSelect={() => openVariantForm(item)}>
                                      Add Variant
                                    </DropdownMenuItem>
                                    {sortedVariants.length > 0 && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel>Variants</DropdownMenuLabel>
                                        {sortedVariants.map((variant) => (
                                          <DropdownMenuSub key={variant.id}>
                                            <DropdownMenuSubTrigger>
                                              {variant.variant_value}
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent>
                                              <DropdownMenuItem
                                                onSelect={() => openVariantForm(item, variant)}
                                              >
                                                Edit Variant
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                className="text-destructive focus:text-destructive"
                                                onSelect={() => openVariantDeleteDialog(item, variant)}
                                              >
                                                Delete Variant
                                              </DropdownMenuItem>
                                            </DropdownMenuSubContent>
                                          </DropdownMenuSub>
                                        ))}
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <DropdownMenuItem disabled className="opacity-75 cursor-not-allowed">
                                    Enable variants from item settings
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => openDeleteDialog(item)}
                                >
                                  Delete Item
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="grid gap-6 md:hidden">
                {filteredItems.map((item) => {
                  const { sortedVariants, selectedVariant: activeVariant } = getVariantsForItem(item);
                  const isVariantBased = item.has_variants;
                  const displayPrice = isVariantBased
                    ? activeVariant?.price ?? null
                    : item.price ?? null;
                  const displayQuantity = isVariantBased
                    ? activeVariant?.quantity ?? null
                    : item.quantity ?? null;
                  const lastUpdatedValue = isVariantBased
                    ? activeVariant?.last_updated ?? null
                    : item.last_updated;
                  const skuLabel = isVariantBased
                    ? activeVariant?.sku ?? null
                    : item.sku ?? null;

                  return (
                    <Card
                      key={item.id}
                      className={`flex h-full flex-col hover:shadow-lg transition-shadow ${!item.is_visible ? 'bg-muted/40' : ''}`}
                    >
                      <CardHeader className="space-y-2 pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <CardTitle className="text-lg">{item.name}</CardTitle>
                          {item.category && (
                            <Badge variant="secondary" className="ml-auto">
                              {item.category}
                            </Badge>
                          )}
                        </div>
                        <div className="!mt-0 flex flex-wrap items-center gap-2">
                          {isVariantBased && sortedVariants.length > 0 ? (
                            <Select
                              value={activeVariant?.id ?? sortedVariants[0].id}
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
                          ) : isVariantBased ? (
                            <Badge
                              variant="outline"
                              className="one-shadow text-xs font-medium rounded-[var(--radius)]"
                            >
                              No variants yet
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="one-shadow text-xs font-medium rounded-[var(--radius)]"
                            >
                              No Variant
                            </Badge>
                          )}
                          {skuLabel ? (
                            <code className="bg-muted px-2 py-1 rounded-[calc(var(--radius)*0.5)] text-xs text-muted-foreground ml-auto text-center min-w-[80px] inline-block">
                              {skuLabel}
                            </code>
                          ) : (
                            <span className="text-xs text-muted-foreground ml-auto text-center min-w-[80px] inline-block">SKU unavailable</span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col space-y-4 pb-4">
                        {item.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {item.description}
                          </p>
                        )}

                        <div className="mt-auto space-y-3 border-t border-border dark:border-[#080808] pt-2">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground mb-1.5">Available Quantity</p>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    displayQuantity !== null && displayQuantity === 0
                                      ? 'destructive'
                                      : 'default'
                                  }
                                  className="px-3 py-1"
                                >
                                  {displayQuantity ?? '—'}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openQuantityDialog(item, activeVariant)}
                                  title="Update quantity"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <p className="text-xs text-muted-foreground mb-1.5">Price</p>
                              <p className="text-base font-semibold">
                                {displayPrice !== null ? formatCurrency(displayPrice) : '—'}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground pt-2 border-t border-border/50 dark:border-[#080808]/50">
                            <span className="inline-block">Last Updated:</span>{' '}
                            <span className="font-medium">
                              {lastUpdatedValue ? formatVariantTimestamp(lastUpdatedValue) : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-border dark:border-[#080808] pt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Visibility</span>
                            <div className="flex items-center gap-2">
                              <Switch
                                size="sm"
                                checked={item.is_visible}
                                onCheckedChange={(checked) => handleVisibilityToggle(item, checked)}
                                aria-label={`Toggle visibility for ${item.name}`}
                              />
                              <span className="text-xs text-muted-foreground">
                                {item.is_visible ? 'Visible' : 'Hidden'}
                              </span>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full rounded-[var(--radius)] border-border"
                              >
                                Manage
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Item</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => handleEdit(item)}>
                                Edit Item
                              </DropdownMenuItem>
                              {item.has_variants ? (
                                <>
                                  <DropdownMenuItem onSelect={() => openVariantForm(item)}>
                                    Add Variant
                                  </DropdownMenuItem>
                                  {sortedVariants.length > 0 && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuLabel>Variants</DropdownMenuLabel>
                                      {sortedVariants.map((variant) => (
                                        <DropdownMenuSub key={variant.id}>
                                          <DropdownMenuSubTrigger>
                                            {variant.variant_value}
                                          </DropdownMenuSubTrigger>
                                          <DropdownMenuSubContent>
                                            <DropdownMenuItem
                                              onSelect={() => openVariantForm(item, variant)}
                                            >
                                              Edit Variant
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              className="text-destructive focus:text-destructive"
                                              onSelect={() => openVariantDeleteDialog(item, variant)}
                                            >
                                              Delete Variant
                                            </DropdownMenuItem>
                                          </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                      ))}
                                    </>
                                  )}
                                </>
                              ) : (
                                <DropdownMenuItem disabled className="opacity-75 cursor-not-allowed">
                                  Enable variants from item settings
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => openDeleteDialog(item)}
                              >
                                Delete Item
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
        )}
      </div>

      <InventoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        item={selectedItem}
        onSuccess={fetchItems}
      />

      <CategoryForm
        open={categoryFormOpen}
        onOpenChange={setCategoryFormOpen}
        onSuccess={() => {
          void fetchItems();
          void fetchCategoryCount();
        }}
      />

      <Dialog open={removeCategoryOpen} onOpenChange={setRemoveCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Category</DialogTitle>
            <DialogDescription>
              Select a category to delete. Any items assigned to it will have their category cleared.
            </DialogDescription>
          </DialogHeader>
          {categoriesLoading ? (
            <div className="py-4 text-sm text-muted-foreground">Loading categories...</div>
          ) : availableCategories.length === 0 ? (
            <div className="py-4 text-sm text-muted-foreground">
              No categories available to remove.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">Category</p>
              <div className="relative" ref={categoryPickerRef}>
                <Input
                  placeholder="Select a category"
                  value={categoryPickerSearch}
                  disabled={removingCategory}
                  className="pr-10"
                  onChange={(event) => {
                    if (removingCategory) return;
                    setCategoryPickerSearch(event.target.value);
                    setCategoryPickerOpen(true);
                  }}
                  onFocus={() => {
                    if (!removingCategory) {
                      setCategoryPickerOpen(true);
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={categoryPickerOpen ? 'Hide categories' : 'Show categories'}
                  aria-expanded={categoryPickerOpen}
                  className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (removingCategory) return;
                    setCategoryPickerOpen((prev) => !prev);
                  }}
                  disabled={removingCategory}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${categoryPickerOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {categoryPickerOpen && (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover px-1 py-1 shadow-md">
                    {(() => {
                      const query = categoryPickerSearch.trim().toLowerCase();
                      const filtered = query
                        ? availableCategories.filter((category) =>
                            category.name.toLowerCase().includes(query)
                          )
                        : availableCategories;

                      if (filtered.length === 0) {
                        return (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No categories found.
                          </div>
                        );
                      }

                      return (
                        <>
                          {filtered.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setSelectedCategoryId(category.id);
                                setCategoryPickerSearch(category.name);
                                setCategoryPickerOpen(false);
                              }}
                            >
                              <span className="flex-1 truncate text-left">{category.name}</span>
                              <Check
                                className={`ml-2 h-4 w-4 ${
                                  selectedCategoryId === category.id ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                            </button>
                          ))}
                        </>
                      );
                    })()}
                    {selectedCategoryId && (
                      <button
                        type="button"
                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setSelectedCategoryId('');
                          setCategoryPickerSearch('');
                          setCategoryPickerOpen(false);
                        }}
                      >
                        Clear selection
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              onClick={() => setRemoveCategoryOpen(false)}
              disabled={removingCategory}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveCategory}
              disabled={
                removingCategory ||
                !selectedCategoryId ||
                availableCategories.length === 0
              }
            >
              {removingCategory ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VariantForm
        open={variantFormOpen}
        onOpenChange={handleVariantFormOpenChange}
        itemId={variantParentItemId}
        itemName={variantParentItemName}
        variant={selectedVariant}
        onSuccess={fetchItems}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{itemToDelete?.name}"
              {itemToDelete?.has_variants && itemToDelete.variants.length > 0 
                ? ` and all its ${itemToDelete.variants.length} variant${itemToDelete.variants.length !== 1 ? 's' : ''}`
                : ''
              }. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={variantDeleteDialogOpen} onOpenChange={handleVariantDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete variant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{variantToDelete?.variant_value}" from "{variantParentItemName}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVariantDelete}>
              Delete Variant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={quantityDialogOpen} onOpenChange={setQuantityDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Quantity</DialogTitle>
            <DialogDescription>
              {quantityEditItem?.variant
                ? `Update the quantity for variant "${quantityEditItem.variant.variant_value}" of "${quantityEditItem.item.name}"`
                : `Update the quantity for "${quantityEditItem?.item.name}"`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="quantity" className="text-sm font-medium">
                New Quantity
              </label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="1"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleQuantityUpdate();
                  }
                }}
                placeholder="Enter quantity"
                disabled={updatingQuantity}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuantityDialogOpen(false)}
              disabled={updatingQuantity}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleQuantityUpdate}
              disabled={updatingQuantity}
            >
              {updatingQuantity ? 'Updating...' : 'Update Quantity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}