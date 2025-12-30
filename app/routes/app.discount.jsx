// import { authenticate } from "../shopify.server";
// import { useLoaderData, useSubmit, useActionData, useNavigation } from "react-router";
// import { useState, useCallback, useMemo } from "react";

// // Constants
// const DISCOUNT_TITLE = "Tier Discount Auto";
// const METAFIELD_NAMESPACE = "discount_config";
// const METAFIELD_KEY = "tier_settings";

// // Default config (only used if no metafield exists)
// const DEFAULT_CONFIG = {
//   groups: [
//     { group: "tier1", discount: 10 },
//     { group: "tier2", discount: 20 },
//     { group: "tier3", discount: 30 }
//   ],
//   excludedVariantIds: []
// };

// // GraphQL Queries
// const GET_SHOP_FUNCTIONS = `
//   query GetShopFunctions {
//     shopifyFunctions(first: 25) {
//       nodes {
//         id
//         title
//         apiType
//       }
//     }
//   }
// `;

// const GET_AUTOMATIC_DISCOUNTS = `
//   query GetAutomaticDiscounts {
//     discountNodes(first: 100, query: "type:automatic") {
//       nodes {
//         id
//         discount {
//           ... on DiscountAutomaticApp {
//             title
//             status
//             discountId
//           }
//         }
//         metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
//           id
//           value
//         }
//       }
//     }
//   }
// `;

// const CREATE_AUTOMATIC_DISCOUNT = `
//   mutation CreateAutomaticDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
//     discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
//       automaticAppDiscount {
//         discountId
//         title
//         status
//       }
//       userErrors {
//         field
//         message
//       }
//     }
//   }
// `;

// const UPDATE_AUTOMATIC_DISCOUNT = `
//   mutation UpdateAutomaticDiscount($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
//     discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
//       automaticAppDiscount {
//         discountId
//         title
//         status
//       }
//       userErrors {
//         field
//         message
//       }
//     }
//   }
// `;

// const GET_PRODUCTS = `
//   query GetProducts {
//     products(first: 100) {
//       nodes {
//         id
//         title
//         variants(first: 50) {
//           nodes {
//             id
//             title
//             displayName
//           }
//         }
//       }
//     }
//   }
// `;

// // Loader - runs on page load
// export const loader = async ({ request }) => {
//   const { admin } = await authenticate.admin(request);

//   try {
//     // 1. Get app functions to find our discount function
//     const functionsResponse = await admin.graphql(GET_SHOP_FUNCTIONS);
//     const functionsData = await functionsResponse.json();
    
//     // Find the discount function
//     const discountFunction = functionsData.data?.shopifyFunctions?.nodes?.find(
//       fn => fn.apiType === "cart_lines_discounts_generate" || 
//             fn.title === "discount-function" ||
//             fn.title.toLowerCase().includes("discount")
//     );

//     // 2. Get existing discounts to check if our discount already exists
//     const discountsResponse = await admin.graphql(GET_AUTOMATIC_DISCOUNTS);
//     const discountsData = await discountsResponse.json();
    
//     // Find our tier discount
//     const existingDiscount = discountsData.data?.discountNodes?.nodes?.find(
//       node => node.discount?.title === DISCOUNT_TITLE
//     );

//     // 3. Get products for exclusion list
//     const productsResponse = await admin.graphql(GET_PRODUCTS);
//     const productsData = await productsResponse.json();
    
//     const products = [];
//     productsData.data?.products?.nodes?.forEach(product => {
//       product.variants.nodes.forEach(variant => {
//         products.push({
//           productId: product.id,
//           productTitle: product.title,
//           variantId: variant.id,
//           variantTitle: variant.title,
//           title: `${product.title} - ${variant.title}`
//         });
//       });
//     });

//     // 4. Parse existing config from metafield or use defaults
//     let config = { ...DEFAULT_CONFIG };

//     if (existingDiscount?.metafield?.value) {
//       try {
//         const parsedConfig = JSON.parse(existingDiscount.metafield.value);
//         config = {
//           groups: parsedConfig.groups || DEFAULT_CONFIG.groups,
//           excludedVariantIds: parsedConfig.excludedVariantIds || []
//         };
//       } catch (e) {
//         console.error("Failed to parse existing config:", e);
//       }
//     }

//     // Return as plain object
//     return {
//       functionId: discountFunction?.id || null,
//       discountExists: !!existingDiscount,
//       discountId: existingDiscount?.id || null,
//       metafieldId: existingDiscount?.metafield?.id || null,
//       config,
//       products,
//       error: null
//     };
//   } catch (error) {
//     console.error("Loader error:", error);
//     return {
//       functionId: null,
//       discountExists: false,
//       discountId: null,
//       metafieldId: null,
//       config: DEFAULT_CONFIG,
//       products: [],
//       error: error.message
//     };
//   }
// };

// // Action - runs on form submit
// export const action = async ({ request }) => {
//   const { admin } = await authenticate.admin(request);
//   const formData = await request.formData();
  
//   const groups = JSON.parse(formData.get("groups") || "[]");
//   const excludedVariantIds = JSON.parse(formData.get("excludedVariantIds") || "[]");
//   const existingDiscountId = formData.get("discountId");
//   const functionId = formData.get("functionId");
//   const metafieldId = formData.get("metafieldId");

//   // Validate groups
//   const validGroups = groups.filter(g => g.group && g.group.trim() !== "");
//   if (validGroups.length === 0) {
//     return {
//       success: false,
//       error: "At least one valid group is required"
//     };
//   }

//   if (!functionId || functionId === "null") {
//     return {
//       success: false,
//       error: "Discount function not found. Please deploy your function extension first."
//     };
//   }

//   // Prepare config for metafield
//   const configValue = JSON.stringify({
//     groups: validGroups,
//     excludedVariantIds
//   });

//   try {
//     let response;
//     let result;

//     // Check if discount already exists
//     if (existingDiscountId && existingDiscountId !== "null" && existingDiscountId !== "") {
//       // UPDATE: Only update the metafield, don't touch title/functionId
//       const metafieldData = {
//         namespace: METAFIELD_NAMESPACE,
//         key: METAFIELD_KEY,
//         type: "json",
//         value: configValue
//       };

//       // If metafield already exists, include its ID for update
//       if (metafieldId && metafieldId !== "null" && metafieldId !== "") {
//         metafieldData.id = metafieldId;
//       }

//       const updateInput = {
//         metafields: [metafieldData]
//       };

//       response = await admin.graphql(UPDATE_AUTOMATIC_DISCOUNT, {
//         variables: {
//           id: existingDiscountId,
//           automaticAppDiscount: updateInput
//         }
//       });
//       result = await response.json();

//       const errors = result.data?.discountAutomaticAppUpdate?.userErrors;
//       if (errors && errors.length > 0) {
//         return {
//           success: false,
//           error: errors.map(e => e.message).join(", ")
//         };
//       }
      
//       return { 
//         success: true, 
//         message: "Configuration updated successfully!"
//       };
//     } else {
//       // CREATE: First time only - include all fields
//       const createInput = {
//         title: DISCOUNT_TITLE,
//         functionId: functionId,
//         startsAt: new Date().toISOString(),
//         discountClasses: ["PRODUCT"],
//         combinesWith: {
//           productDiscounts: false,
//           orderDiscounts: false,
//           shippingDiscounts: true
//         },
//         metafields: [
//           {
//             namespace: METAFIELD_NAMESPACE,
//             key: METAFIELD_KEY,
//             type: "json",
//             value: configValue
//           }
//         ]
//       };

//       response = await admin.graphql(CREATE_AUTOMATIC_DISCOUNT, {
//         variables: {
//           automaticAppDiscount: createInput
//         }
//       });
//       result = await response.json();

//       const errors = result.data?.discountAutomaticAppCreate?.userErrors;
//       if (errors && errors.length > 0) {
//         return {
//           success: false,
//           error: errors.map(e => e.message).join(", ")
//         };
//       }

//       return { 
//         success: true, 
//         message: "Discount created successfully!"
//       };
//     }
//   } catch (error) {
//     console.error("Discount save error:", error);
//     return {
//       success: false,
//       error: error.message || "An unexpected error occurred"
//     };
//   }
// };

// // Main Component
// export default function DiscountPage() {
//   // Get loader data with safe parsing
//   const rawLoaderData = useLoaderData();
  
//   // Handle both string and object responses
//   const loaderData = useMemo(() => {
//     if (!rawLoaderData) {
//       return {
//         functionId: null,
//         discountExists: false,
//         discountId: null,
//         metafieldId: null,
//         config: DEFAULT_CONFIG,
//         products: []
//       };
//     }
    
//     if (typeof rawLoaderData === 'string') {
//       try {
//         return JSON.parse(rawLoaderData);
//       } catch {
//         return {
//           functionId: null,
//           discountExists: false,
//           discountId: null,
//           metafieldId: null,
//           config: DEFAULT_CONFIG,
//           products: []
//         };
//       }
//     }
    
//     return rawLoaderData;
//   }, [rawLoaderData]);

//   const { 
//     functionId = null, 
//     discountExists = false, 
//     discountId = null,
//     metafieldId = null,
//     config = DEFAULT_CONFIG, 
//     products = [],
//     error: loaderError = null
//   } = loaderData || {};

//   // Get action data with safe parsing
//   const rawActionData = useActionData();
//   const actionData = useMemo(() => {
//     if (!rawActionData) return null;
//     if (typeof rawActionData === 'string') {
//       try {
//         return JSON.parse(rawActionData);
//       } catch {
//         return null;
//       }
//     }
//     return rawActionData;
//   }, [rawActionData]);

//   const submit = useSubmit();
//   const navigation = useNavigation();
  
//   const isSubmitting = navigation.state === "submitting";

//   // Safely get initial values
//   const initialGroups = config?.groups || DEFAULT_CONFIG.groups;
//   const initialExcluded = config?.excludedVariantIds || [];

//   // Local state
//   const [groups, setGroups] = useState(initialGroups);
//   const [excludedVariantIds, setExcludedVariantIds] = useState(initialExcluded);
//   const [showExclude, setShowExclude] = useState(false);

//   // Add new group
//   const addGroup = useCallback(() => {
//     setGroups(prev => [...prev, { group: "", discount: 0 }]);
//   }, []);

//   // Remove group by index
//   const removeGroup = useCallback((indexToRemove) => {
//     setGroups(prev => {
//       if (prev.length <= 1) return prev;
//       return prev.filter((_, index) => index !== indexToRemove);
//     });
//   }, []);

//   // Update group field
//   const updateGroup = useCallback((index, field, value) => {
//     setGroups(prev => {
//       const copy = [...prev];
//       copy[index] = { 
//         ...copy[index], 
//         [field]: field === "discount" ? Number(value) : value 
//       };
//       return copy;
//     });
//   }, []);

//   // Toggle product exclusion
//   const toggleExclude = useCallback((variantId) => {
//     setExcludedVariantIds(prev =>
//       prev.includes(variantId)
//         ? prev.filter(id => id !== variantId)
//         : [...prev, variantId]
//     );
//   }, []);

//   // Handle form submit
//   const handleSubmit = useCallback(() => {
//     const formData = new FormData();
//     formData.append("actionType", "save");
//     formData.append("groups", JSON.stringify(groups));
//     formData.append("excludedVariantIds", JSON.stringify(excludedVariantIds));
//     formData.append("discountId", discountId || "");
//     formData.append("functionId", functionId || "");
//     formData.append("metafieldId", metafieldId || "");
    
//     submit(formData, { method: "post" });
//   }, [groups, excludedVariantIds, discountId, functionId, metafieldId, submit]);

//   // Styles
//   const styles = {
//     container: {
//       padding: "24px",
//       maxWidth: "900px",
//       fontFamily: "system-ui, -apple-system, sans-serif",
//       margin: "0 auto"
//     },
//     header: {
//       marginBottom: "24px",
//       borderBottom: "1px solid #e1e3e5",
//       paddingBottom: "16px"
//     },
//     card: {
//       backgroundColor: "#ffffff",
//       border: "1px solid #e1e3e5",
//       borderRadius: "8px",
//       padding: "20px",
//       marginBottom: "20px"
//     },
//     statusBadge: (isActive) => ({
//       display: "inline-block",
//       padding: "4px 12px",
//       borderRadius: "12px",
//       fontSize: "13px",
//       fontWeight: "500",
//       backgroundColor: isActive ? "#d4edda" : "#fff3cd",
//       color: isActive ? "#155724" : "#856404"
//     }),
//     inputGroup: {
//       display: "flex",
//       gap: "12px",
//       marginBottom: "12px",
//       alignItems: "center"
//     },
//     input: {
//       padding: "10px 12px",
//       border: "1px solid #c4cdd5",
//       borderRadius: "4px",
//       fontSize: "14px"
//     },
//     button: (variant) => ({
//       padding: variant === "primary" ? "12px 24px" : "8px 16px",
//       backgroundColor: variant === "primary" ? "#008060" : 
//                        variant === "danger" ? "#d72c0d" : "#f6f6f7",
//       color: variant === "primary" || variant === "danger" ? "#ffffff" : "#202223",
//       border: "none",
//       borderRadius: "4px",
//       cursor: "pointer",
//       fontSize: "14px",
//       fontWeight: "500"
//     }),
//     excludePanel: {
//       marginTop: "16px",
//       border: "1px solid #c4cdd5",
//       borderRadius: "4px",
//       padding: "16px",
//       maxHeight: "300px",
//       overflowY: "auto",
//       backgroundColor: "#fafbfb"
//     },
//     alert: (type) => ({
//       padding: "12px 16px",
//       borderRadius: "4px",
//       marginTop: "16px",
//       backgroundColor: type === "success" ? "#d4edda" : "#f8d7da",
//       color: type === "success" ? "#155724" : "#721c24",
//       border: `1px solid ${type === "success" ? "#c3e6cb" : "#f5c6cb"}`
//     })
//   };

//   return (
//     <div style={styles.container}>
//       {/* Header */}
//       <div style={styles.header}>
//         <h1 style={{ margin: "0 0 8px 0", fontSize: "24px" }}>
//           Tier Discount Configuration
//         </h1>
//         <p style={{ margin: 0, color: "#6d7175" }}>
//           Configure customer tier discounts. Customers with matching "Discount Tier" metafield will receive these discounts.
//         </p>
//       </div>

//       {/* Loader Error */}
//       {loaderError && (
//         <div style={styles.alert("error")}>
//           ⚠️ Error loading data: {loaderError}
//         </div>
//       )}

//       {/* Status Card */}
//       <div style={styles.card}>
//         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//           <div>
//             <h3 style={{ margin: "0 0 4px 0" }}>Discount Status</h3>
//             <p style={{ margin: 0, color: "#6d7175", fontSize: "14px" }}>
//               {DISCOUNT_TITLE}
//             </p>
//           </div>
//           <span style={styles.statusBadge(discountExists)}>
//             {discountExists ? "✓ Active" : "Not Created"}
//           </span>
//         </div>
        
//         {!functionId && (
//           <div style={{ ...styles.alert("error"), marginTop: "12px" }}>
//             ⚠️ Discount function not found. Make sure your discount function extension is deployed.
//             <br />
//             <small>Run: <code>shopify app deploy</code></small>
//           </div>
//         )}

//         {functionId && (
//           <p style={{ margin: "12px 0 0 0", color: "#6d7175", fontSize: "12px" }}>
//             Function ID: {functionId}
//           </p>
//         )}
//       </div>

//       {/* Discount Groups Card */}
//       <div style={styles.card}>
//         <h3 style={{ margin: "0 0 16px 0" }}>Discount Groups</h3>
//         <p style={{ color: "#6d7175", fontSize: "14px", marginBottom: "16px" }}>
//           Define tier names and their discount percentages. Customer metafield "Discount Tier" value should match the group name.
//         </p>

//         {groups.map((item, index) => (
//           <div key={index} style={styles.inputGroup}>
//             <input
//               type="text"
//               placeholder="Group name (tier1, VIP...)"
//               value={item.group || ""}
//               onChange={(e) => updateGroup(index, "group", e.target.value)}
//               style={{ ...styles.input, width: "200px" }}
//             />
//             <input
//               type="number"
//               placeholder="Discount %"
//               value={item.discount || 0}
//               min="0"
//               max="100"
//               onChange={(e) => updateGroup(index, "discount", e.target.value)}
//               style={{ ...styles.input, width: "100px" }}
//             />
//             <span style={{ color: "#6d7175" }}>%</span>
//             {groups.length > 1 && (
//               <button
//                 onClick={() => removeGroup(index)}
//                 style={styles.button("danger")}
//                 title="Remove this group"
//                 type="button"
//               >
//                 ✕
//               </button>
//             )}
//           </div>
//         ))}

//         <button 
//           onClick={addGroup} 
//           style={{ ...styles.button(), marginTop: "8px" }}
//           type="button"
//         >
//           + Add Group
//         </button>
//       </div>

//       {/* Product Exclusions Card */}
//       <div style={styles.card}>
//         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//           <div>
//             <h3 style={{ margin: "0 0 4px 0" }}>Product Exclusions</h3>
//             <p style={{ margin: 0, color: "#6d7175", fontSize: "14px" }}>
//               {excludedVariantIds.length} product(s) excluded from discounts
//             </p>
//           </div>
//           <button 
//             onClick={() => setShowExclude(!showExclude)}
//             style={styles.button()}
//             type="button"
//           >
//             {showExclude ? "Hide List" : "Manage Exclusions"}
//           </button>
//         </div>

//         {showExclude && (
//           <div style={styles.excludePanel}>
//             {products.length === 0 ? (
//               <p style={{ color: "#6d7175" }}>No products found</p>
//             ) : (
//               products.map((p) => (
//                 <div key={p.variantId} style={{ marginBottom: "8px" }}>
//                   <label style={{ 
//                     display: "flex", 
//                     alignItems: "center", 
//                     gap: "8px",
//                     cursor: "pointer"
//                   }}>
//                     <input
//                       type="checkbox"
//                       checked={excludedVariantIds.includes(p.variantId)}
//                       onChange={() => toggleExclude(p.variantId)}
//                     />
//                     <span>{p.title}</span>
//                   </label>
//                 </div>
//               ))
//             )}
//           </div>
//         )}
//       </div>

//       {/* Action Buttons */}
//       <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
//         <button 
//           onClick={handleSubmit}
//           disabled={isSubmitting || !functionId}
//           style={{
//             ...styles.button("primary"),
//             opacity: (isSubmitting || !functionId) ? 0.6 : 1,
//             cursor: (isSubmitting || !functionId) ? "not-allowed" : "pointer"
//           }}
//           type="button"
//         >
//           {isSubmitting ? "Saving..." : discountExists ? "Update Configuration" : "Create Discount"}
//         </button>
//       </div>

//       {/* Action Result */}
//       {actionData && (
//         <div style={styles.alert(actionData.success ? "success" : "error")}>
//           {actionData.success ? (
//             <>✓ {actionData.message}</>
//           ) : (
//             <>✕ Error: {actionData.error}</>
//           )}
//         </div>
//       )}

//       {/* Debug Info (remove in production) */}
//       <details style={{ marginTop: "24px", fontSize: "12px", color: "#6d7175" }}>
//         <summary style={{ cursor: "pointer" }}>Debug Info</summary>
//         <pre style={{ 
//           backgroundColor: "#f6f6f7", 
//           padding: "12px", 
//           borderRadius: "4px",
//           overflow: "auto",
//           marginTop: "8px"
//         }}>
//           {JSON.stringify({ 
//             functionId, 
//             discountExists, 
//             discountId,
//             metafieldId,
//             groupsCount: groups.length,
//             excludedCount: excludedVariantIds.length,
//             productsCount: products.length 
//           }, null, 2)}
//         </pre>
//       </details>
//     </div>
//   );
// }


import { authenticate } from "../shopify.server";
import {
  useLoaderData,
  useSubmit,
  useActionData,
  useNavigation,
} from "react-router";
import { useState } from "react";

/* =========================
   CONSTANTS
========================= */
const DISCOUNT_TITLE = "Tier Discount Auto";
const NAMESPACE = "discount_config";
const KEY = "tier_settings";

/* =========================
   DEFAULT CONFIG
========================= */
const DEFAULT_CONFIG = {
  groups: [
    { group: "tier1", discount: 10 },
    { group: "tier2", discount: 20 },
    { group: "tier3", discount: 30 },
  ],
  excludedVariantIds: [],
};

/* =========================
   GRAPHQL
========================= */
const GET_SHOP_ID = `
  query {
    shop {
      id
    }
  }
`;

const GET_SHOP_FUNCTIONS = `
  query {
    shopifyFunctions(first: 10) {
      nodes {
        id
        title
      }
    }
  }
`;

const GET_AUTOMATIC_DISCOUNTS = `
  query {
    discountNodes(first: 50, query: "type:automatic") {
      nodes {
        discount {
          ... on DiscountAutomaticApp {
            title
            discountId
          }
        }
      }
    }
  }
`;

const GET_SHOP_CONFIG = `
  query {
    shop {
      metafield(namespace: "${NAMESPACE}", key: "${KEY}") {
        value
      }
    }
  }
`;

const SAVE_SHOP_CONFIG = `
  mutation SaveConfig($ownerId: ID!, $value: String!) {
    metafieldsSet(
      metafields: [{
        ownerId: $ownerId
        namespace: "${NAMESPACE}"
        key: "${KEY}"
        type: "json"
        value: $value
      }]
    ) {
      userErrors { message }
    }
  }
`;

const CREATE_AUTOMATIC_DISCOUNT = `
  mutation ($input: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $input) {
      userErrors { message }
    }
  }
`;

const UPDATE_AUTOMATIC_DISCOUNT = `
  mutation ($id: ID!, $input: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $input) {
      userErrors { message }
    }
  }
`;

const SEARCH_PRODUCTS = `
  query ($query: String!) {
    products(first: 10, query: $query) {
      nodes {
        title
        featuredImage { url }
        variants(first: 5) {
          nodes {
            id
            title
          }
        }
      }
    }
  }
`;

/* =========================
   LOADER
========================= */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  /* SHOP ID */
  const shopRes = await admin.graphql(GET_SHOP_ID);
  const shopData = await shopRes.json();
  const shopId = shopData.data.shop.id;

  /* FUNCTION */
  const fnRes = await admin.graphql(GET_SHOP_FUNCTIONS);
  const fnData = await fnRes.json();
  const functionId =
    fnData.data.shopifyFunctions.nodes.find(
      (f) => f.title === "discount-function"
    )?.id || null;

  /* EXISTING DISCOUNT */
  const dRes = await admin.graphql(GET_AUTOMATIC_DISCOUNTS);
  const dData = await dRes.json();
  const existing = dData.data.discountNodes.nodes.find(
    (n) => n.discount?.title === DISCOUNT_TITLE
  );

  /* SHOP CONFIG (SOURCE OF TRUTH FOR UI) */
  const cfgRes = await admin.graphql(GET_SHOP_CONFIG);
  const cfgData = await cfgRes.json();

  let config = DEFAULT_CONFIG;
  if (cfgData.data.shop.metafield?.value) {
    config = JSON.parse(cfgData.data.shop.metafield.value);
  }

  return {
    shopId,
    functionId,
    discountId: existing?.discount?.discountId || null,
    discountExists: !!existing,
    config,
  };
};

/* =========================
   ACTION
========================= */
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const groups = JSON.parse(form.get("groups"));
  const excludedVariantIds = JSON.parse(form.get("excludedVariantIds"));
  const discountId = form.get("discountId");
  const functionId = form.get("functionId");
  const shopId = form.get("shopId");

  /* 1️⃣ SAVE CONFIG TO SHOP (UI persistence) */
  await admin.graphql(SAVE_SHOP_CONFIG, {
    variables: {
      ownerId: shopId,
      value: JSON.stringify({ groups, excludedVariantIds }),
    },
  });

  /* 2️⃣ CREATE / UPDATE DISCOUNT (Function runtime) */
  const input = {
    title: DISCOUNT_TITLE,
    functionId,
    startsAt: new Date().toISOString(),
    discountClasses: ["PRODUCT"],
    metafields: [
      {
        namespace: NAMESPACE,
        key: KEY,
        type: "json",
        value: JSON.stringify({ groups, excludedVariantIds }),
      },
    ],
  };

  if (discountId) {
    await admin.graphql(UPDATE_AUTOMATIC_DISCOUNT, {
      variables: { id: discountId, input },
    });
  } else {
    await admin.graphql(CREATE_AUTOMATIC_DISCOUNT, {
      variables: { input },
    });
  }

  return { success: true };
};

/* =========================
   COMPONENT
========================= */
export default function DiscountPage() {
  const {
    shopId,
    functionId,
    discountExists,
    discountId,
    config,
  } = useLoaderData();

  const submit = useSubmit();
  const nav = useNavigation();
  const actionData = useActionData();

  const [groups, setGroups] = useState(config.groups);
  const [excludedVariantIds, setExcludedVariantIds] = useState(
    config.excludedVariantIds
  );
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);

  /* PRODUCT SEARCH */
  const searchProducts = async (value) => {
    setSearch(value);
    if (!value) return setResults([]);

    const res = await fetch("/graphql.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: SEARCH_PRODUCTS,
        variables: { query: `title:*${value}*` },
      }),
    });

    const json = await res.json();
    const items = [];

    json.data.products.nodes.forEach((p) =>
      p.variants.nodes.forEach((v) =>
        items.push({
          id: v.id,
          title: `${p.title} - ${v.title}`,
          image: p.featuredImage?.url,
        })
      )
    );

    setResults(items);
  };

  const toggleExclude = (id) => {
    setExcludedVariantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    const fd = new FormData();
    fd.append("groups", JSON.stringify(groups));
    fd.append("excludedVariantIds", JSON.stringify(excludedVariantIds));
    fd.append("discountId", discountId || "");
    fd.append("functionId", functionId);
    fd.append("shopId", shopId);
    submit(fd, { method: "post" });
  };

  return (
    <div style={{ maxWidth: 900, margin: "auto", padding: 24 }}>
      <h1>Tier Discount Configuration</h1>

      {groups.map((g, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <input
            value={g.group}
            onChange={(e) => {
              const c = [...groups];
              c[i].group = e.target.value;
              setGroups(c);
            }}
          />
          <input
            type="number"
            value={g.discount}
            onChange={(e) => {
              const c = [...groups];
              c[i].discount = Number(e.target.value);
              setGroups(c);
            }}
          />
        </div>
      ))}

      <button onClick={() => setGroups([...groups, { group: "", discount: 0 }])}>
        + Add Group
      </button>

      <h3 style={{ marginTop: 20 }}>Product Exclusions</h3>
      <input
        placeholder="Search products..."
        value={search}
        onChange={(e) => searchProducts(e.target.value)}
        style={{ width: "100%" }}
      />

      {results.map((p) => (
        <label key={p.id} style={{ display: "flex", gap: 8 }}>
          <input
            type="checkbox"
            checked={excludedVariantIds.includes(p.id)}
            onChange={() => toggleExclude(p.id)}
          />
          {p.image && <img src={p.image} width="40" />}
          {p.title}
        </label>
      ))}

      <button onClick={handleSubmit} disabled={nav.state === "submitting"}>
        {discountExists ? "Update Discount" : "Create Discount"}
      </button>

      {actionData?.success && <p>Saved successfully ✅</p>}
    </div>
  );
}
