
import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  
  console.log(" FUNCTION INPUT:", JSON.stringify({
    hasLines: input.cart.lines.length,
    discountClasses: input.discount.discountClasses,
    metafieldValue: input.discount.metafield?.value,
    customerTier: input.cart.buyerIdentity?.customer?.metafield?.value,
  }));

  
  if (!input.cart.lines.length) {
    console.log(" No cart lines");
    return { operations: [] };
  }

  
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product
  );

  if (!hasProductDiscountClass) {
    console.log(" No product discount class");
    return { operations: [] };
  }

  
  let config = { groups: [], excludedVariantIds: [] };
  
  if (input.discount.metafield?.value) {
    try {
      config = JSON.parse(input.discount.metafield.value);
      console.log(" Config loaded:", JSON.stringify(config));
    } catch (e) {
      console.log(" Failed to parse config");
      return { operations: [] };
    }
  } else {
    console.log(" No metafield value");
    return { operations: [] };
  }

  
  if (!config.groups || config.groups.length === 0) {
    console.log(" No groups configured");
    return { operations: [] };
  }

  
  const customerTier = input.cart.buyerIdentity?.customer?.metafield?.value;
  console.log(" Customer tier:", customerTier);
  
  
  if (!customerTier) {
    console.log(" No customer tier");
    return { operations: [] };
  }

  
  const normalizedTier = String(customerTier).toLowerCase().trim();

  const matchingGroup = config.groups.find(g => {
    if (!g.group) return false;
    return String(g.group).toLowerCase().trim() === normalizedTier;
  });

  console.log(" Matching group:", JSON.stringify(matchingGroup));

  
  if (!matchingGroup || !matchingGroup.discount || matchingGroup.discount <= 0) {
    console.log(" No matching group or invalid discount");
    return { operations: [] };
  }

  const discountPercentage = matchingGroup.discount;
  console.log("💰 Discount percentage:", discountPercentage);

  // Filter eligible cart lines (exclude products in exclusion list)
  const eligibleLines = input.cart.lines.filter(line => {
    if (line.merchandise.__typename !== "ProductVariant") {
      return false;
    }
    const variantId = line.merchandise.id;
    return !config.excludedVariantIds.includes(variantId);
  });

  console.log("📦 Eligible lines:", eligibleLines.length);

  // No eligible lines
  if (eligibleLines.length === 0) {
    console.log("❌ No eligible lines");
    return { operations: [] };
  }

  // Create discount candidates for each eligible line
  const candidates = eligibleLines.map(line => ({
    message: `${discountPercentage}% ${customerTier.toUpperCase()} Discount`,
    targets: [
      {
        cartLine: {
          id: line.id,
        },
      },
    ],
    value: {
      percentage: {
        value: discountPercentage,
      },
    },
  }));

  console.log(" Returning candidates:", candidates.length);

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}