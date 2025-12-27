import { Product, ProductVariant } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

const VARIANT_TYPE_LABELS: Record<ProductVariant['variant_type'], string> = {
  weight: 'Weight',
  pcs: 'Pieces',
  price: 'Price',
  flavor: 'Flavor',
  size: 'Size',
};

const parseNumericValue = (value: string): number | null => {
  const match = value.match(/[\d\.]+/);
  if (!match) {
    return null;
  }

  const numeric = Number.parseFloat(match[0]);
  return Number.isNaN(numeric) ? null : numeric;
};

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

  if (lowerValue.includes('kg')) {
    return num * 1000;
  } else if (lowerValue.includes('g') && !lowerValue.includes('kg')) {
    return num;
  } else if (lowerValue.includes('mg')) {
    return num / 1000;
  } else if (lowerValue.includes('lb') || lowerValue.includes('pound')) {
    return num * 453.592;
  } else if (lowerValue.includes('oz') || lowerValue.includes('ounce')) {
    return num * 28.3495;
  }

  return num;
};

const sortVariants = (variants: ProductVariant[]) => {
  return [...variants].sort((a, b) => {
    const isWeightVariant = a.variant_type === 'weight' || b.variant_type === 'weight';

    let aValue: number | null;
    let bValue: number | null;

    if (isWeightVariant) {
      aValue = parseWeightInGrams(a.variant_value);
      bValue = parseWeightInGrams(b.variant_value);
    } else {
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

interface ProductDetailDialogProps {
  item: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProductDetailDialog({
  item,
  open,
  onOpenChange,
}: ProductDetailDialogProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  if (!item) return null;

  const sortedVariants = sortVariants(item.variants);
  const defaultVariant = sortedVariants[0] || null;
  const activeVariant = selectedVariantId
    ? sortedVariants.find((v) => v.id === selectedVariantId) || defaultVariant
    : defaultVariant;

  const displayPrice = activeVariant?.price ?? null;
  const displayQuantity = activeVariant?.quantity ?? null;
  const displaySKU = activeVariant?.sku ?? null;

  const formatCurrency = (value: number | null | undefined) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(value ?? 0);

  const formatTimestamp = (timestamp?: string | null) => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-2 border-primary/20 shadow-2xl shadow-primary/10 backdrop-blur-sm">
        <DialogHeader className="border-b border-primary/10 pb-4">
          <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
            {item.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-8 pt-4">
          {/* Image Section */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 via-primary/30 to-primary/50 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition duration-500"></div>
            <div className="relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center border border-primary/20 shadow-lg">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full"></div>
                    <Package className="relative w-24 h-24 mb-4 text-primary/50" />
                  </div>
                  <p className="text-sm font-medium">No image available</p>
                </div>
              )}
            </div>
          </div>

          {/* Details Section */}
          <div className="space-y-6">
            {/* Category */}
            {item.category && (
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                <Badge variant="secondary" className="text-sm font-semibold px-4 py-1.5 bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30 hover:border-primary/50 transition-colors">
                  {item.category}
                </Badge>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
              </div>
            )}

            {/* Description */}
            {item.description && (
              <div className="relative group/desc">
                <div className="absolute -inset-2 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg opacity-0 group-hover/desc:opacity-100 transition duration-300"></div>
                <div className="relative p-4 rounded-lg border border-primary/10 bg-card/50 backdrop-blur-sm">
                  <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span className="w-1 h-4 bg-gradient-to-b from-primary to-primary/50 rounded-full"></span>
                    Description
                  </h3>
                  <p className="text-sm text-foreground/90 leading-relaxed">{item.description}</p>
                </div>
              </div>
            )}

            {/* Variants */}
            {sortedVariants.length > 0 && (
              <div className="relative">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gradient-to-b from-primary to-primary/50 rounded-full"></span>
                  Select Variant
                </h3>
                <Select
                  value={activeVariant?.id ?? sortedVariants[0]?.id}
                  onValueChange={setSelectedVariantId}
                >
                  <SelectTrigger className="w-full border-primary/30 bg-gradient-to-r from-card to-card/80 hover:border-primary/50 transition-colors shadow-sm hover:shadow-md">
                    <SelectValue placeholder="Choose variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedVariants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {VARIANT_TYPE_LABELS[variant.variant_type]
                          ? `${variant.variant_value} • ${VARIANT_TYPE_LABELS[variant.variant_type]}`
                          : variant.variant_value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* SKU */}
            {displaySKU && (
              <div>
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gradient-to-b from-primary to-primary/50 rounded-full"></span>
                  SKU
                </h3>
                <code className="text-sm bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 px-4 py-2 rounded-lg font-mono font-semibold inline-block hover:border-primary/50 transition-colors">
                  {displaySKU}
                </code>
              </div>
            )}

            {/* Price and Availability */}
            <div className="relative pt-6">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative group/price">
                  <div className="absolute -inset-2 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl opacity-0 group-hover/price:opacity-100 transition duration-300"></div>
                  <div className="relative p-4 rounded-xl border border-primary/20 bg-card/50 backdrop-blur-sm">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                      Price
                    </h3>
                    <p className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                      {displayPrice !== null ? formatCurrency(displayPrice) : '—'}
                    </p>
                  </div>
                </div>
                <div className="relative group/stock">
                  <div className="absolute -inset-2 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl opacity-0 group-hover/stock:opacity-100 transition duration-300"></div>
                  <div className="relative p-4 rounded-xl border border-primary/20 bg-card/50 backdrop-blur-sm">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                      Availability
                    </h3>
                    <Badge
                      variant={
                        displayQuantity !== null && displayQuantity === 0
                          ? 'destructive'
                          : displayQuantity !== null && displayQuantity > 0
                            ? 'default'
                            : 'outline'
                      }
                      className="text-sm px-4 py-1.5 font-semibold shadow-sm"
                    >
                      {displayQuantity !== null
                        ? displayQuantity === 0
                          ? 'Out of Stock'
                          : `${displayQuantity} in stock`
                        : 'N/A'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Last Updated */}
            <div className="relative pt-4">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-3">
                <span className="w-2 h-2 rounded-full bg-primary/50 animate-breathe"></span>
                <span>Last Updated: </span>
                <span className="font-semibold text-foreground/80">
                  {activeVariant
                    ? formatTimestamp(activeVariant.last_updated)
                    : formatTimestamp(item.last_updated)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
