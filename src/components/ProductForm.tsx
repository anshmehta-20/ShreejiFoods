import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase, Product, ProductVariant } from '@/lib/supabase';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';

const variantSchema = z.object({
    variant_type: z.enum(['weight', 'pcs', 'price', 'flavor', 'size'], {
        errorMap: () => ({ message: 'Please select a variant type' }),
    }),
    variant_value: z.string().min(1, 'Variant value is required'),
    price: z.coerce.number().min(0, 'Price must be 0 or greater'),
    quantity: z.coerce.number().min(0, 'Quantity must be 0 or greater'),
});

const productSchema = z.object({
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
    image_url: z
        .string()
        .url('Please enter a valid URL')
        .optional()
        .or(z.literal('')),
    variants: z.array(variantSchema).min(1, 'At least one variant is required'),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item?: Product | null;
    onSuccess: () => void;
}

const VARIANT_TYPE_LABELS: Record<ProductVariant['variant_type'], string> = {
    weight: 'Weight',
    pcs: 'Pieces',
    price: 'Price',
    flavor: 'Flavor',
    size: 'Size',
};

export default function ProductForm({
    open,
    onOpenChange,
    item,
    onSuccess,
}: ProductFormProps) {
    const [loading, setLoading] = useState(false);
    const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const { toast } = useToast();
    const { profile } = useAuth();
    const categoryFieldRef = useRef<HTMLDivElement | null>(null);

    const form = useForm<ProductFormData>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            name: '',
            description: '',
            category: null,
            is_visible: true,
            image_url: '',
            variants: [
                {
                    variant_type: '' as any,
                    variant_value: '',
                    price: 0,
                    quantity: 0,
                },
            ],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'variants',
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
                variants: item.variants.length > 0
                    ? item.variants.map((v) => ({
                        variant_type: v.variant_type,
                        variant_value: v.variant_value,
                        price: v.price,
                        quantity: v.quantity,
                    }))
                    : [
                        {
                            variant_type: 'pcs',
                            variant_value: 'default',
                            price: 0,
                            quantity: 0,
                        },
                    ],
            });
        } else {
            form.reset({
                name: '',
                description: '',
                category: null,
                is_visible: true,
                image_url: '',
                variants: [
                    {
                        variant_type: '' as any,
                        variant_value: '',
                        price: 0,
                        quantity: 0,
                    },
                ],
            });
        }
    }, [item, form]);

    // Fetch available categories when the dialog opens
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

    // Close the dropdown when clicking outside
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
    // Capitalizes first letter and letters after spaces, hyphens, and opening brackets
    const toTitleCase = (str: string): string => {
        return str
            .toLowerCase()
            .replace(/(?:^|\s|-|\()([a-z])/g, (match) => match.toUpperCase());
    };

    const onSubmit = async (data: ProductFormData) => {
        try {
            setLoading(true);

            const descriptionValue = data.description?.trim() ?? '';
            const categoryValue = typeof data.category === 'string' ? data.category.trim() : '';
            const imageUrlValue = typeof data.image_url === 'string' ? data.image_url.trim() : '';

            const productData = {
                name: toTitleCase(data.name.trim()),
                description: descriptionValue === '' ? null : descriptionValue,
                category: categoryValue === '' ? null : categoryValue.toLowerCase(),
                is_visible: data.is_visible,
                image_url: imageUrlValue === '' ? null : imageUrlValue,
                updated_by: profile?.id ?? null,
            };

            if (item) {
                // Update existing product
                const { error } = await supabase
                    .from('product')
                    .update(productData)
                    .eq('id', item.id);

                if (error) throw error;

                toast({
                    title: 'Success',
                    description: 'Product updated successfully',
                });
            } else {
                // Create new product
                const { data: newProduct, error: productError } = await supabase
                    .from('product')
                    .insert([productData])
                    .select()
                    .single();

                if (productError) throw productError;

                // Get the auto-created default variant
                const { data: autoVariant, error: fetchError } = await supabase
                    .from('product_variants')
                    .select('id')
                    .eq('product_id', newProduct.id)
                    .single();

                if (fetchError) throw fetchError;

                // Update the auto-created variant with the first user-defined variant
                const { error: updateError } = await supabase
                    .from('product_variants')
                    .update({
                        variant_type: data.variants[0].variant_type,
                        variant_value: data.variants[0].variant_value,
                        price: data.variants[0].price,
                        quantity: data.variants[0].quantity,
                        updated_by: profile?.id ?? null,
                    })
                    .eq('id', autoVariant.id);

                if (updateError) throw updateError;

                // Insert any additional variants (if more than 1)
                if (data.variants.length > 1) {
                    // Insert variants one at a time to allow SKU auto-generation
                    for (const variant of data.variants.slice(1)) {
                        // Call generate_sku() function for each variant
                        const { data: skuData, error: skuError } = await supabase
                            .rpc('generate_sku');

                        if (skuError) throw skuError;

                        const { error: variantError } = await supabase
                            .from('product_variants')
                            .insert({
                                product_id: newProduct.id,
                                sku: skuData,
                                variant_type: variant.variant_type,
                                variant_value: variant.variant_value,
                                price: variant.price,
                                quantity: variant.quantity,
                                updated_by: profile?.id ?? null,
                            });

                        if (variantError) throw variantError;
                    }
                }

                toast({
                    title: 'Success',
                    description: `Product created with ${data.variants.length} variant(s)`,
                });
            }

            form.reset();
            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'Failed to save product',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{item ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                    <DialogDescription>
                        {item
                            ? 'Update the product details below. Manage variants separately.'
                            : 'Add a new product with one or more variants.'}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-1">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Product Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Gulab Jamun" {...field} />
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
                                                placeholder="e.g., sweets"
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
                            name="is_visible"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3">
                                    <div className="space-y-0.5">
                                        <FormLabel>Visible to customers</FormLabel>
                                        <FormDescription>
                                            Hide a product to keep it available for admins only.
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

                        {!item && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <FormLabel>Variants</FormLabel>
                                        <FormDescription className="mt-1">
                                            Add one or more variants for this product
                                        </FormDescription>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            append({
                                                variant_type: '' as any,
                                                variant_value: '',
                                                price: 0,
                                                quantity: 0,
                                            })
                                        }
                                    >
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add Variant
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {fields.map((field, index) => (
                                        <Card key={field.id} className="p-3 relative">
                                            {fields.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="absolute top-1 right-1 h-6 w-6 p-0"
                                                    onClick={() => remove(index)}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            )}

                                            <div className="grid gap-2 grid-cols-2">
                                                <FormField
                                                    control={form.control}
                                                    name={`variants.${index}.variant_type`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Type</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                                                                <FormControl>
                                                                    <SelectTrigger className="h-8">
                                                                        <SelectValue placeholder="Select type" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    {Object.entries(VARIANT_TYPE_LABELS).map(([value, label]) => (
                                                                        <SelectItem key={value} value={value}>
                                                                            {label}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage className="text-xs" />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name={`variants.${index}.variant_value`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Value</FormLabel>
                                                            <FormControl>
                                                                <Input className="h-8" placeholder="e.g., 250g" {...field} />
                                                            </FormControl>
                                                            <FormMessage className="text-xs" />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name={`variants.${index}.price`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Price (₹)</FormLabel>
                                                            <FormControl>
                                                                <Input className="h-8" type="number" min="0" step="1" {...field} />
                                                            </FormControl>
                                                            <FormMessage className="text-xs" />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name={`variants.${index}.quantity`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs">Qty</FormLabel>
                                                            <FormControl>
                                                                <Input className="h-8" type="number" min="0" step="1" {...field} />
                                                            </FormControl>
                                                            <FormMessage className="text-xs" />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

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
