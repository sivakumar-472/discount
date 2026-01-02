

import { authenticate } from "../shopify.server";
import {
  useLoaderData,
  useSubmit,
  useActionData,
  useNavigation,
} from "react-router";
import { useState, useCallback } from "react";


const DISCOUNT_TITLE = "Tier Discount Auto";
const NAMESPACE = "discount_config";
const KEY = "tier_settings";

const DEFAULT_CONFIG = {
  groups: [
    { group: "tier1", discount: 10 },
    { group: "tier2", discount: 20 },
    { group: "tier3", discount: 30 },
  ],
  excludedVariantIds: [],
};


const CREATE_SHOP_TIER_DEF = `
mutation {
  metafieldDefinitionCreate(
    definition: {
      name: "Tier Discount Settings"
      namespace: "${NAMESPACE}"
      key: "${KEY}"
      type: "json"
      ownerType: SHOP
    }
  ) {
    userErrors { message }
  }
}
`;


const GET_SHOP_ID = `query { shop { id } }`;

const GET_SHOP_FUNCTIONS = `
query {
  shopifyFunctions(first: 10) {
    nodes { id title }
  }
}
`;

const GET_AUTOMATIC_DISCOUNTS = `
query {
  discountNodes(first: 50) {
    nodes {
      discount {
        __typename
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

const GET_PRODUCTS = `
query {
  products(first: 100) {
    nodes {
      title
      variants(first: 50) {
        nodes {
          id
          title
        }
      }
    }
  }
}
`;

const SAVE_SHOP_CONFIG = `
mutation ($ownerId: ID!, $value: String!) {
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


async function ensureShopMetafield(admin) {
  const res = await admin.graphql(CREATE_SHOP_TIER_DEF);
  const json = await res.json();

  const errors =
    json?.data?.metafieldDefinitionCreate?.userErrors || [];

  const realErrors = errors.filter(
    (e) => !e.message.includes("Key is in use")
  );

  if (realErrors.length) {
    console.error("Shop metafield error:", realErrors);
  }
}

// loader
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  
  await ensureShopMetafield(admin);

  const shopId =
    (await (await admin.graphql(GET_SHOP_ID)).json()).data.shop.id;

  const functionId =
    (await (await admin.graphql(GET_SHOP_FUNCTIONS)).json())
      .data.shopifyFunctions.nodes.find(
        (f) => f.title === "discount-function"
      )?.id || null;

  const discountNode =
    (await (await admin.graphql(GET_AUTOMATIC_DISCOUNTS)).json())
      .data.discountNodes.nodes.find(
        (n) =>
          n.discount?.__typename === "DiscountAutomaticApp" &&
          n.discount?.title === DISCOUNT_TITLE
      ) || null;

  const configValue =
    (await (await admin.graphql(GET_SHOP_CONFIG)).json())
      .data.shop.metafield?.value;

  const productsJson = await (await admin.graphql(GET_PRODUCTS)).json();

  const products = [];
  productsJson.data.products.nodes.forEach((p) => {
    p.variants.nodes.forEach((v) => {
      products.push({
        variantId: v.id,
        title: `${p.title} - ${v.title}`,
      });
    });
  });

  return {
    shopId,
    functionId,
    discountId: discountNode?.discount?.discountId || null,
    discountExists: !!discountNode,
    config: configValue ? JSON.parse(configValue) : DEFAULT_CONFIG,
    products,
  };
};

// action
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const groups = JSON.parse(form.get("groups"));
  const excludedVariantIds = JSON.parse(form.get("excludedVariantIds"));
  const discountId = form.get("discountId");
  const functionId = form.get("functionId");
  const shopId = form.get("shopId");

  //  AUTO CREATE CUSTOMER METAFIELD  
  try {
    await admin.graphql(
      `#graphql
      mutation CreateCustomerTierDefinition(
        $definition: MetafieldDefinitionInput!
      ) {
        metafieldDefinitionCreate(definition: $definition) {
          userErrors { message }
        }
      }
      `,
      {
        variables: {
          definition: {
            name: "Customer Tier Level",
            namespace: "custom",
            key: "customer_tier_level",
            type: "single_line_text_field",
            ownerType: "CUSTOMER",
          },
        },
      }
    );
  } catch {
    console.log("Customer metafield already exists");
  }

  /* SAVE SHOP CONFIG */
  await admin.graphql(SAVE_SHOP_CONFIG, {
    variables: {
      ownerId: shopId,
      value: JSON.stringify({ groups, excludedVariantIds }),
    },
  });

  /* DELETE OLD DISCOUNT */
  if (discountId) {
    await admin.graphql(
      `mutation ($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
        }
      }`,
      { variables: { id: discountId } }
    );
    await new Promise((r) => setTimeout(r, 1000));
  }

  /* CREATE NEW DISCOUNT */
  await admin.graphql(
    `mutation ($input: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $input) {
        automaticAppDiscount { discountId }
      }
    }`,
    {
      variables: {
        input: {
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
        },
      },
    }
  );

  return { success: true };
};

// component page
export default function DiscountPage() {
  const {
    shopId,
    functionId,
    discountExists,
    discountId,
    config,
    products,
  } = useLoaderData();

  const submit = useSubmit();
  const nav = useNavigation();
  const actionData = useActionData();

  const [groups, setGroups] = useState(config.groups);
  const [excludedVariantIds, setExcludedVariantIds] = useState(
    config.excludedVariantIds
  );
  const [search, setSearch] = useState("");

  const addGroup = () =>
    setGroups([...groups, { group: "", discount: 0 }]);

  const removeGroup = (i) => {
    if (groups.length <= 1) return;
    setGroups(groups.filter((_, idx) => idx !== i));
  };

  const toggleExclude = useCallback((variantId) => {
    setExcludedVariantIds((prev) =>
      prev.includes(variantId)
        ? prev.filter((id) => id !== variantId)
        : [...prev, variantId]
    );
  }, []);

  const removeExcluded = (variantId) =>
    setExcludedVariantIds((prev) =>
      prev.filter((id) => id !== variantId)
    );

  const filteredProducts = search
    ? products.filter((p) =>
        p.title.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const excludedProducts = products.filter((p) =>
    excludedVariantIds.includes(p.variantId)
  );

  const handleSubmit = () => {
    const fd = new FormData();
    fd.append("groups", JSON.stringify(groups));
    fd.append("excludedVariantIds", JSON.stringify(excludedVariantIds));
    fd.append("discountId", discountId || "");
    fd.append("functionId", functionId || "");
    fd.append("shopId", shopId);
    submit(fd, { method: "post" });
  };

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 32 }}>
      <h1>Discount</h1>

      <h3>Discount Groups</h3>
      {groups.map((g, i) => (
        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <input
            value={g.group}
            onChange={(e) => {
              const copy = [...groups];
              copy[i].group = e.target.value;
              setGroups(copy);
            }}
          />
          <input
            type="number"
            value={g.discount}
            onChange={(e) => {
              const copy = [...groups];
              copy[i].discount = Number(e.target.value);
              setGroups(copy);
            }}
          />
          <button onClick={() => removeGroup(i)}>✕</button>
        </div>
      ))}
      <button onClick={addGroup}>+ Add Group</button>

      <h3 style={{ marginTop: 30 }}>Exclude Products</h3>
      <input
        placeholder="Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filteredProducts.map((p) => (
        <div
          key={p.variantId}
          onClick={() => toggleExclude(p.variantId)}
          style={{
            padding: 8,
            marginTop: 6,
            cursor: "pointer",
            background: excludedVariantIds.includes(p.variantId)
              ? "#ffe5e5"
              : "#fff",
          }}
        >
          {p.title}
        </div>
      ))}

      {excludedProducts.length > 0 && (
        <>
          <h3 style={{ marginTop: 30 }}>Excluded Products</h3>
          {excludedProducts.map((p) => (
            <div
              key={p.variantId}
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <span>{p.title}</span>
              <button onClick={() => removeExcluded(p.variantId)}>
                Remove
              </button>
            </div>
          ))}
        </>
      )}

      <button
        onClick={handleSubmit}
        disabled={nav.state === "submitting"}
        style={{ marginTop: 30 }}
      >
        {discountExists ? "Save Discount" : "Create Discount"}
      </button>

      {actionData?.success && (
        <p style={{ color: "green" }}>Saved successfully</p>
      )}
    </div>
  );
}
