// // extensions/discount-function/src/run.js

// import {
//   DiscountClass,
//   ProductDiscountSelectionStrategy,
// } from '../generated/api';

// /**
//  * @typedef {import("../generated/api").CartInput} RunInput
//  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
//  */

// /**
//  * @param {RunInput} input
//  * @returns {CartLinesDiscountsGenerateRunResult}
//  */
// export function cartLinesDiscountsGenerateRun(input) {
//   // Check if we have cart lines
//   if (!input.cart.lines.length) {
//     return { operations: [] };
//   }

//   // Check if product discount is enabled
//   const hasProductDiscountClass = input.discount.discountClasses.includes(
//     DiscountClass.Product
//   );

//   if (!hasProductDiscountClass) {
//     return { operations: [] };
//   }

//   // Get discount configuration from metafield
//   let config = { groups: [], excludedVariantIds: [] };
  
//   if (input.discount.metafield?.value) {
//     try {
//       config = JSON.parse(input.discount.metafield.value);
//     } catch (e) {
//       // Failed to parse config, return empty operations
//       return { operations: [] };
//     }
//   }

//   // Check if we have any groups configured
//   if (!config.groups || config.groups.length === 0) {
//     return { operations: [] };
//   }

//   // Get customer's discount tier from metafield
//   const customerTier = input.cart.buyerIdentity?.customer?.metafield?.value;
  
//   // If no customer or no tier assigned, no discount
//   if (!customerTier) {
//     return { operations: [] };
//   }

//   // Find matching discount group (case-insensitive)
//   const matchingGroup = config.groups.find(
//     g => g.group && g.group.toLowerCase().trim() === customerTier.toLowerCase().trim()
//   );

//   // No matching group found
//   if (!matchingGroup || !matchingGroup.discount || matchingGroup.discount <= 0) {
//     return { operations: [] };
//   }

//   const discountPercentage = matchingGroup.discount;

//   // Filter eligible cart lines (exclude products in exclusion list)
//   const eligibleLines = input.cart.lines.filter(line => {
//     // Only apply to product variants
//     if (line.merchandise.__typename !== "ProductVariant") {
//       return false;
//     }
    
//     // Check if this variant is excluded
//     const variantId = line.merchandise.id;
//     return !config.excludedVariantIds.includes(variantId);
//   });

//   // No eligible lines
//   if (eligibleLines.length === 0) {
//     return { operations: [] };
//   }

//   // Create discount candidates for each eligible line
//   const candidates = eligibleLines.map(line => ({
//     message: `${discountPercentage}% ${customerTier.toUpperCase()} Discount`,
//     targets: [
//       {
//         cartLine: {
//           id: line.id,
//         },
//       },
//     ],
//     value: {
//       percentage: {
//         value: discountPercentage,
//       },
//     },
//   }));

//   return {
//     operations: [
//       {
//         productDiscountsAdd: {
//           candidates,
//           selectionStrategy: ProductDiscountSelectionStrategy.All,
//         },
//       },
//     ],
//   };
// }


// extensions/discount-function/src/run.js

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
  // Check if we have cart lines
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  // Check if product discount is enabled
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product
  );

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  // Get discount configuration from metafield
  let config = { groups: [], excludedVariantIds: [] };
  
  if (input.discount.metafield?.value) {
    try {
      config = JSON.parse(input.discount.metafield.value);
    } catch (e) {
      // Failed to parse config, return empty operations
      return { operations: [] };
    }
  }

  // Check if we have any groups configured
  if (!config.groups || config.groups.length === 0) {
    return { operations: [] };
  }

  // Get customer's discount tier from metafield
  const customerTier = input.cart.buyerIdentity?.customer?.metafield?.value;
  
  // If no customer or no tier assigned, no discount
  if (!customerTier) {
    return { operations: [] };
  }

  // Find matching discount group (case-insensitive)
  const normalizedTier = String(customerTier).toLowerCase().trim();

const matchingGroup = config.groups.find(g => {
  if (!g.group) return false;
  return String(g.group).toLowerCase().trim() === normalizedTier;
});

  // No matching group found
  if (!matchingGroup || !matchingGroup.discount || matchingGroup.discount <= 0) {
    return { operations: [] };
  }

  const discountPercentage = matchingGroup.discount;

  // Filter eligible cart lines (exclude products in exclusion list)
  const eligibleLines = input.cart.lines.filter(line => {
    // Only apply to product variants
    if (line.merchandise.__typename !== "ProductVariant") {
      return false;
    }
    
    // Check if this variant is excluded
    const variantId = line.merchandise.id;
    return !config.excludedVariantIds.includes(variantId);
  });

  // No eligible lines
  if (eligibleLines.length === 0) {
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