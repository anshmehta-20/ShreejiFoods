import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase, Product } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormDescription,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';

const inventorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z
    .string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .or(z.literal('')),
  category: z
    .string()
    .max(120, 'Category name must be less than 120 characters')
    .nullable()
    .optional(),
  is_visible: z.boolean().default(true),
  has_variants: z.boolean().default(false),
  image_url: z
    .string()
    .url('Please enter a valid URL')
    .optional()
    .or(z.literal('')),
  sku: z
    .string()
    .max(120, 'SKU must be less than 120 characters')
    .optional()
    .or(z.literal('')),
  price: z.coerce
    .number({ invalid_type_error: 'Price is required' })
    .min(0, 'Price cannot be negative')
    .default(0),
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantity is required' })
    .min(0, 'Quantity cannot be negative')
    .default(0),
}).refine((data) => data.has_variants || (typeof data.sku === 'string' && data.sku.trim() !== ''), {
  path: ['sku'],
  message: 'SKU is required when variants are disabled.',
});

type InventoryFormData = z.infer<typeof inventorySchema>;

interface InventoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: Product | null;
  onSuccess: () => void;
}

export default function InventoryForm({
  open,
  onOpenChange,
  item,
  onSuccess,
}: InventoryFormProps) {
  const [loading, setLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuth();
  const categoryFieldRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<InventoryFormData>({
    resolver: zodResolver(inventorySchema),
    defaultValues: {
      name: '',
      description: '',
      category: null,
      is_visible: true,
      has_variants: false,
      image_url: '',
      sku: '',
      price: 0,
      quantity: 0,
    },
  });

  // Update form values when item changes
  useEffect(() => {
    if (item) {
      form.reset({
        name: item.name,
        description: item.description ?? '',
        category: item.category ?? null,
        is_visible: item.is_visible,
        image_url: item.image_url ?? '',
      });
    } else {
      form.reset({
        name: '',
        description: '',
        category: null,
        is_visible: true,
        image_url: '',
      });
    }
  }, [item, form]);

  const watchHasVariants = form.watch('has_variants');

  // Fetch available categories when the dialog opens so the dropdown has options ready.
  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    const fetchCategories = async () => {
      try {
        setCategoryLoading(true);
        const { data, error } = await supabase
          .from('category')
          .select('name')
          .order('name', { ascending: true });

        if (error) throw error;

        if (!isMounted) return;

        const names = (data ?? [])
          .map((row) => (row?.name ?? '').trim())
          .filter((name) => name.length > 0);

        setCategoryOptions(Array.from(new Set(names)));
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error.message || 'Failed to load categories',
        });
      } finally {
        if (isMounted) {
          setCategoryLoading(false);
        }
      }
    };

    fetchCategories();

    return () => {
      isMounted = false;
    };
  }, [open, toast]);

  // Close the dropdown when clicking outside of the category field container.
  useEffect(() => {
    if (!categoryDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryFieldRef.current &&
        !categoryFieldRef.current.contains(event.target as Node)
      ) {
        setCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [categoryDropdownOpen]);

  // Helper function to convert string to Title Case
  const toTitleCase = (str: string): string => {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const onSubmit = async (data: InventoryFormData) => {
    try {
      setLoading(true);

      const descriptionValue = data.description?.trim() ?? '';
      const categoryValue = typeof data.category === 'string' ? data.category.trim() : '';
      const skuValue = typeof data.sku === 'string' ? data.sku.trim() : '';
      const imageUrlValue = typeof data.image_url === 'string' ? data.image_url.trim() : '';

      const submitData = {
        name: toTitleCase(data.name.trim()),
        description: descriptionValue === '' ? null : descriptionValue,
        category: categoryValue === '' ? null : categoryValue.toLowerCase(),
        is_visible: data.is_visible,
        has_variants: data.has_variants,
        image_url: imageUrlValue === '' ? null : imageUrlValue,
        price: data.has_variants ? 0 : data.price,
        quantity: data.has_variants ? 0 : data.quantity,
        sku: data.has_variants ? null : skuValue === '' ? null : skuValue,
        updated_by: profile?.id ?? null,
      };

      if (item) {
        const { error } = await supabase
          .from('product')
          .update(submitData)
          .eq('id', item.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Item updated successfully',
        });
      } else {
        const { error } = await supabase.from('product').insert([submitData]);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Item created successfully',
        });
      }

      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save item',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Item' : 'Add New Item'}</DialogTitle>
          <DialogDescription>
            {item
              ? 'Update the inventory item details below.'
              : 'Add a new item to your inventory.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-1">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Product name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <div className="relative" ref={categoryFieldRef}>
                      <Input
                        placeholder="e.g., Sweets"
                        name={field.name}
                        ref={field.ref}
                        value={field.value ?? ''}
                        className="pr-9"
                        autoComplete="off"
                        onChange={(event) => {
                          const newValue = event.target.value.trim();
                          field.onChange(newValue === '' ? null : event.target.value);
                          setCategoryDropdownOpen(true);
                        }}
                        onFocus={() => {
                          setCategoryDropdownOpen(true);
                        }}
                        onBlur={() => {
                          field.onBlur();
                        }}
                      />
                      <button
                        type="button"
                        aria-label={categoryDropdownOpen ? 'Hide categories' : 'Show categories'}
                        aria-expanded={categoryDropdownOpen}
                        className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setCategoryDropdownOpen((prev) => !prev);
                        }}
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {categoryDropdownOpen && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover px-1 py-1 shadow-md">
                          {categoryLoading ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              Loading categories...
                            </div>
                          ) : (
                            <>
                              {(() => {
                                const inputValue = typeof field.value === 'string' ? field.value : '';
                                const trimmedInput = inputValue.trim();
                                const lowercaseQuery = inputValue.toLowerCase();
                                const filteredOptions = inputValue
                                  ? categoryOptions.filter((option) =>
                                    option.toLowerCase().includes(lowercaseQuery)
                                  )
                                  : categoryOptions;
                                return (
                                  <>
                                    {filteredOptions.length === 0 && trimmedInput.length === 0 && (
                                      <div className="px-3 py-2 text-sm text-muted-foreground">
                                        No categories found.
                                      </div>
                                    )}
                                    {filteredOptions.map((option) => (
                                      <button
                                        key={option}
                                        type="button"
                                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                          field.onChange(option);
                                          setCategoryDropdownOpen(false);
                                        }}
                                      >
                                        <span className="flex-1 truncate pr-2 text-left">{option}</span>
                                        {field.value === option && (
                                          <span className="ml-auto text-xs font-medium text-primary">Selected</span>
                                        )}
                                      </button>
                                    ))}
                                  </>
                                );
                              })()}
                              {field.value && (
                                <button
                                  type="button"
                                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    field.onChange(null);
                                    setCategoryDropdownOpen(false);
                                  }}
                                >
                                  Clear selection
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Start typing to filter categories.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Product description"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://example.com/product-image.jpg"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the URL of the product image.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., ITEM-SKU-001"
                      disabled={watchHasVariants}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Required when variants are disabled; leave blank for variant-based items.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_visible"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3">
                  <div className="space-y-0.5">
                    <FormLabel>Visible to customers</FormLabel>
                    <FormDescription>
                      Hide an item to keep it available for admins only.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Toggle customer visibility"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="has_variants"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3">
                  <div className="space-y-0.5">
                    <FormLabel>Manage with variants</FormLabel>
                    <FormDescription>
                      Enable to track multiple sizes, weights, or flavors for this item.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Toggle variant-based inventory"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (INR)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={watchHasVariants}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Used when variants are disabled.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={watchHasVariants}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Track available stock for single-variant items.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : item ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
