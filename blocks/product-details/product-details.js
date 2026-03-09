import {
  InLineAlert,
  Icon,
  Button,
  provider as UI,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import * as pdpApi from '@dropins/storefront-pdp/api.js';
import { render as pdpRendered } from '@dropins/storefront-pdp/render.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';

import { WishlistToggle } from '@dropins/storefront-wishlist/containers/WishlistToggle.js';
import { WishlistAlert } from '@dropins/storefront-wishlist/containers/WishlistAlert.js';

// Containers
import ProductHeader from '@dropins/storefront-pdp/containers/ProductHeader.js';
import ProductPrice from '@dropins/storefront-pdp/containers/ProductPrice.js';
import ProductShortDescription from '@dropins/storefront-pdp/containers/ProductShortDescription.js';
import ProductOptions from '@dropins/storefront-pdp/containers/ProductOptions.js';
import ProductQuantity from '@dropins/storefront-pdp/containers/ProductQuantity.js';
import ProductDescription from '@dropins/storefront-pdp/containers/ProductDescription.js';
import ProductAttributes from '@dropins/storefront-pdp/containers/ProductAttributes.js';
import ProductGallery from '@dropins/storefront-pdp/containers/ProductGallery.js';
import ProductGiftCardOptions from '@dropins/storefront-pdp/containers/ProductGiftCardOptions.js';

// Libs
import {
  rootLink,
  setJsonLd,
  fetchPlaceholders,
  getProductLink,
} from '../../scripts/commerce.js';

// Initializers
import { IMAGES_SIZES } from '../../scripts/initializers/pdp.js';
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/wishlist.js';

/**
 * Checks if the page has prerendered product JSON-LD data
 * @returns {boolean} True if product JSON-LD exists and contains @type=Product
 */
function isProductPrerendered() {
  const jsonLdScript = document.querySelector('script[type="application/ld+json"]');

  if (!jsonLdScript?.textContent) {
    return false;
  }

  try {
    const jsonLd = JSON.parse(jsonLdScript.textContent);
    return jsonLd?.['@type'] === 'Product';
  } catch (error) {
    console.debug('Failed to parse JSON-LD:', error);
    return false;
  }
}

// Function to update the Add to Cart button text
function updateAddToCartButtonText(addToCartInstance, inCart, labels) {
  const buttonText = inCart
    ? labels.Global?.UpdateProductInCart
    : labels.Global?.AddProductToCart;
  if (addToCartInstance) {
    addToCartInstance.setProps((prev) => ({
      ...prev,
      children: buttonText,
    }));
  }
}

export default async function decorate(block) {
  const product = events.lastPayload('pdp/data') ?? null;
  const labels = await fetchPlaceholders();

  // Read itemUid from URL
  const urlParams = new URLSearchParams(window.location.search);
  const itemUidFromUrl = urlParams.get('itemUid');

  // State to track if we are in update mode
  let isUpdateMode = false;

  // Layout – Flipkart-style: gallery left, info right; Buy Now + Add to Cart; tabbed description/attributes
  const fragment = document.createRange().createContextualFragment(`
    <div class="product-details__alert"></div>
    <div class="product-details__wrapper">
      <div class="product-details__left-column">
        <div class="product-details__gallery"></div>
      </div>
      <div class="product-details__right-column">
        <div class="product-details__header"></div>
        <div class="product-details__price"></div>
        <div class="product-details__gallery"></div>
        <div class="product-details__short-description"></div>
        <div class="product-details__gift-card-options"></div>
        <div class="product-details__configuration">
          <div class="product-details__options"></div>
          <div class="product-details__quantity"></div>
          <div class="product-details__buttons">
            <div class="product-details__buttons__buy-now"></div>
            <div class="product-details__buttons__add-to-cart"></div>
            <div class="product-details__buttons__add-to-wishlist"></div>
          </div>
        </div>
        <div class="product-details__tabs" role="tablist">
          <div class="product-details__tabs-nav">
            <button type="button" role="tab" aria-selected="true" aria-controls="pdp-tab-description" id="pdp-tab-btn-description">Description</button>
            <button type="button" role="tab" aria-selected="false" aria-controls="pdp-tab-specification" id="pdp-tab-btn-specification">Specification</button>
          </div>
          <div class="product-details__tabs-panel" id="pdp-tab-description" role="tabpanel" aria-labelledby="pdp-tab-btn-description" aria-hidden="false">
            <div class="product-details__description"></div>
          </div>
          <div class="product-details__tabs-panel" id="pdp-tab-specification" role="tabpanel" aria-labelledby="pdp-tab-btn-specification" aria-hidden="true">
            <div class="product-details__attributes"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="product-details__sticky-cta" aria-hidden="true">
      <span class="product-details__sticky-cta__price"></span>
      <div class="product-details__sticky-cta__actions">
        <div class="product-details__sticky-cta__buy-now"></div>
        <div class="product-details__sticky-cta__add-to-cart"></div>
      </div>
    </div>
  `);

  const $alert = fragment.querySelector('.product-details__alert');
  const $gallery = fragment.querySelector('.product-details__left-column .product-details__gallery');
  const $header = fragment.querySelector('.product-details__header');
  const $price = fragment.querySelector('.product-details__price');
  const $galleryMobile = fragment.querySelector('.product-details__right-column .product-details__gallery');
  const $shortDescription = fragment.querySelector('.product-details__short-description');
  const $options = fragment.querySelector('.product-details__options');
  const $quantity = fragment.querySelector('.product-details__quantity');
  const $giftCardOptions = fragment.querySelector('.product-details__gift-card-options');
  const $buyNow = fragment.querySelector('.product-details__buttons__buy-now');
  const $addToCart = fragment.querySelector('.product-details__buttons__add-to-cart');
  const $wishlistToggleBtn = fragment.querySelector('.product-details__buttons__add-to-wishlist');
  const $description = fragment.querySelector('.product-details__description');
  const $attributes = fragment.querySelector('.product-details__attributes');
  const $tabsNav = fragment.querySelector('.product-details__tabs-nav');
  const $stickyCta = fragment.querySelector('.product-details__sticky-cta');
  const $stickyPrice = fragment.querySelector('.product-details__sticky-cta__price');
  const $stickyBuyNow = fragment.querySelector('.product-details__sticky-cta__buy-now');
  const $stickyAddToCart = fragment.querySelector('.product-details__sticky-cta__add-to-cart');

  block.replaceChildren(fragment);

  // Tab switching (Flipkart-style Description / Specification)
  if ($tabsNav) {
    const panels = block.querySelectorAll('.product-details__tabs-panel');
    const tabs = $tabsNav.querySelectorAll('button[role="tab"]');
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.setAttribute('aria-selected', 'false'));
        panels.forEach((p) => p.setAttribute('aria-hidden', 'true'));
        tab.setAttribute('aria-selected', 'true');
        const id = tab.getAttribute('aria-controls');
        const panel = block.querySelector(`#${id}`);
        if (panel) panel.setAttribute('aria-hidden', 'false');
      });
    });
  }

  // Sticky CTA: visibility on scroll and price sync (mobile)
  if ($stickyCta && $price) {
    const observer = new IntersectionObserver(
      ([e]) => {
        const visible = e.intersectionRatio < 1;
        $stickyCta.classList.toggle('is-visible', visible);
        $stickyCta.setAttribute('aria-hidden', (!visible).toString());
        if (visible && $stickyPrice) {
          const priceEl = $price.querySelector('.dropin-price, .pdp-price, [class*="price"]');
          $stickyPrice.textContent = priceEl ? priceEl.textContent.trim() : '';
        }
      },
      { threshold: 1, rootMargin: '-60px 0px 0px 0px' },
    );
    observer.observe($price);
  }

  const gallerySlots = {
    CarouselThumbnail: (ctx) => {
      tryRenderAemAssetsImage(ctx, {
        ...imageSlotConfig(ctx),
        wrapper: document.createElement('span'),
      });
    },

    CarouselMainImage: (ctx) => {
      tryRenderAemAssetsImage(ctx, {
        ...imageSlotConfig(ctx),
      });
    },
  };

  // Alert
  let inlineAlert = null;
  const routeToWishlist = '/wishlist';

  const [
    _galleryMobile,
    _gallery,
    _header,
    _price,
    _shortDescription,
    _options,
    _quantity,
    _giftCardOptions,
    _description,
    _attributes,
    wishlistToggleBtn,
  ] = await Promise.all([
    // Gallery (Mobile)
    pdpRendered.render(ProductGallery, {
      controls: 'dots',
      arrows: true,
      peak: false,
      gap: 'small',
      loop: false,
      imageParams: {
        ...IMAGES_SIZES,
      },

      slots: gallerySlots,
    })($galleryMobile),

    // Gallery (Desktop)
    pdpRendered.render(ProductGallery, {
      controls: 'thumbnailsColumn',
      arrows: true,
      peak: true,
      gap: 'small',
      loop: false,
      imageParams: {
        ...IMAGES_SIZES,
      },

      slots: gallerySlots,
    })($gallery),

    // Header
    pdpRendered.render(ProductHeader, {})($header),

    // Price
    pdpRendered.render(ProductPrice, {})($price),

    // Short Description
    pdpRendered.render(ProductShortDescription, {})($shortDescription),

    // Configuration - Swatches
    pdpRendered.render(ProductOptions, {
      hideSelectedValue: false,
      slots: {
        SwatchImage: (ctx) => {
          tryRenderAemAssetsImage(ctx, {
            ...imageSlotConfig(ctx),
            wrapper: document.createElement('span'),
          });
        },
      },
    })($options),

    // Configuration  Quantity
    pdpRendered.render(ProductQuantity, {})($quantity),

    // Configuration  Gift Card Options
    pdpRendered.render(ProductGiftCardOptions, {})($giftCardOptions),

    // Description
    pdpRendered.render(ProductDescription, {})($description),

    // Attributes
    pdpRendered.render(ProductAttributes, {})($attributes),

    // Wishlist button - WishlistToggle Container
    wishlistRender.render(WishlistToggle, {
      product,
    })($wishlistToggleBtn),
  ]);

  // Add to Cart handler (shared by main and sticky CTA)
  const addToCartAndMaybeRedirect = async (redirectToCart = false) => {
    const buttonActionText = isUpdateMode
      ? labels.Global?.UpdatingInCart
      : labels.Global?.AddingToCart;
    try {
      addToCart.setProps((prev) => ({
        ...prev,
        children: buttonActionText,
        disabled: true,
      }));

      const values = pdpApi.getProductConfigurationValues();
      const valid = pdpApi.isProductConfigurationValid();

      if (valid) {
        if (isUpdateMode) {
          const { updateProductsFromCart } = await import('@dropins/storefront-cart/api.js');
          await updateProductsFromCart([{ ...values, uid: itemUidFromUrl }]);
          const updatedSku = values?.sku;
          if (updatedSku) {
            const cartRedirectUrl = new URL(rootLink('/cart'), window.location.origin);
            cartRedirectUrl.searchParams.set('itemUid', itemUidFromUrl);
            window.location.href = cartRedirectUrl.toString();
          } else {
            window.location.href = rootLink('/cart');
          }
          return;
        }
        const { addProductsToCart } = await import('@dropins/storefront-cart/api.js');
        await addProductsToCart([{ ...values }]);
        if (redirectToCart) {
          window.location.href = rootLink('/cart');
          return;
        }
        inlineAlert?.remove();
      }
    } catch (error) {
      inlineAlert = await UI.render(InLineAlert, {
        heading: 'Error',
        description: error.message,
        icon: h(Icon, { source: 'Warning' }),
        'aria-live': 'assertive',
        role: 'alert',
        onDismiss: () => { inlineAlert.remove(); },
      })($alert);
      $alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      updateAddToCartButtonText(addToCart, isUpdateMode, labels);
      addToCart.setProps((prev) => ({ ...prev, disabled: false }));
    }
  };

  // Buy Now (Flipkart-style primary CTA – add to cart and go to cart)
  const buyNowLabel = labels.Global?.BuyNow ?? 'Buy Now';
  await UI.render(Button, {
    children: buyNowLabel,
    variant: 'primary',
    onClick: () => addToCartAndMaybeRedirect(true),
  })($buyNow);

  // Configuration – Button - Add to Cart
  const addToCart = await UI.render(Button, {
    children: labels.Global?.AddProductToCart,
    icon: h(Icon, { source: 'Cart' }),
    onClick: () => addToCartAndMaybeRedirect(false),
  })($addToCart);

  // Sticky CTA buttons (mobile): trigger main Buy Now / Add to Cart
  if ($stickyBuyNow) {
    UI.render(Button, {
      children: buyNowLabel,
      variant: 'primary',
      onClick: () => $buyNow?.querySelector('button')?.click(),
    })($stickyBuyNow);
  }
  if ($stickyAddToCart) {
    UI.render(Button, {
      children: labels.Global?.AddProductToCart,
      icon: h(Icon, { source: 'Cart' }),
      onClick: () => $addToCart?.querySelector('button')?.click(),
    })($stickyAddToCart);
  }

  // Lifecycle Events
  events.on('pdp/valid', (valid) => {
    // update add to cart button disabled state based on product selection validity
    addToCart.setProps((prev) => ({ ...prev, disabled: !valid }));
  }, { eager: true });

  // Handle option changes
  events.on('pdp/values', () => {
    if (wishlistToggleBtn) {
      const configValues = pdpApi.getProductConfigurationValues();

      // Check URL parameter for empty optionsUIDs
      const urlOptionsUIDs = urlParams.get('optionsUIDs');

      // If URL has empty optionsUIDs parameter, treat as base product (no options)
      const optionUIDs = urlOptionsUIDs === '' ? undefined : (configValues?.optionsUIDs || undefined);

      wishlistToggleBtn.setProps((prev) => ({
        ...prev,
        product: {
          ...product,
          optionUIDs,
        },
      }));
    }
  }, { eager: true });

  events.on('wishlist/alert', ({ action, item }) => {
    wishlistRender.render(WishlistAlert, {
      action,
      item,
      routeToWishlist,
    })($alert);

    setTimeout(() => {
      $alert.innerHTML = '';
    }, 5000);

    setTimeout(() => {
      $alert.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 0);
  });

  // --- Add new event listener for cart/data ---
  events.on(
    'cart/data',
    (cartData) => {
      let itemIsInCart = false;
      if (itemUidFromUrl && cartData?.items) {
        itemIsInCart = cartData.items.some(
          (item) => item.uid === itemUidFromUrl,
        );
      }
      // Set the update mode state
      isUpdateMode = itemIsInCart;

      // Update button text based on whether the item is in the cart
      updateAddToCartButtonText(addToCart, itemIsInCart, labels);
    },
    { eager: true },
  );

  // Set JSON-LD and Meta Tags
  events.on('aem/lcp', () => {
    const isPrerendered = isProductPrerendered();
    if (product && !isPrerendered) {
      setJsonLdProduct(product);
      setMetaTags(product);
      document.title = product.name;
    }
  }, { eager: true });

  return Promise.resolve();
}

async function setJsonLdProduct(product) {
  const {
    name,
    inStock,
    description,
    sku,
    urlKey,
    price,
    priceRange,
    images,
    attributes,
  } = product;
  const amount = priceRange?.minimum?.final?.amount || price?.final?.amount;
  const brand = attributes?.find((attr) => attr.name === 'brand');

  // get variants
  const { data } = await pdpApi.fetchGraphQl(`
    query GET_PRODUCT_VARIANTS($sku: String!) {
      variants(sku: $sku) {
        variants {
          product {
            sku
            name
            inStock
            images(roles: ["image"]) {
              url
            }
            ...on SimpleProductView {
              price {
                final { amount { currency value } }
              }
            }
          }
        }
      }
    }
  `, {
    method: 'GET',
    variables: { sku },
  });

  const variants = data?.variants?.variants || [];

  const ldJson = {
    '@context': 'http://schema.org',
    '@type': 'Product',
    name,
    description,
    image: images[0]?.url,
    offers: [],
    productID: sku,
    brand: {
      '@type': 'Brand',
      name: brand?.value,
    },
    url: new URL(getProductLink(urlKey, sku), window.location),
    sku,
    '@id': new URL(getProductLink(urlKey, sku), window.location),
  };

  if (variants.length > 1) {
    ldJson.offers.push(...variants.map((variant) => ({
      '@type': 'Offer',
      name: variant.product.name,
      image: variant.product.images[0]?.url,
      price: variant.product.price.final.amount.value,
      priceCurrency: variant.product.price.final.amount.currency,
      availability: variant.product.inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
      sku: variant.product.sku,
    })));
  } else {
    ldJson.offers.push({
      '@type': 'Offer',
      price: amount?.value,
      priceCurrency: amount?.currency,
      availability: inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
    });
  }

  setJsonLd(ldJson, 'product');
}

function createMetaTag(property, content, type) {
  if (!property || !type) {
    return;
  }
  let meta = document.head.querySelector(`meta[${type}="${property}"]`);
  if (meta) {
    if (!content) {
      meta.remove();
      return;
    }
    meta.setAttribute(type, property);
    meta.setAttribute('content', content);
    return;
  }
  if (!content) {
    return;
  }
  meta = document.createElement('meta');
  meta.setAttribute(type, property);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

function setMetaTags(product) {
  if (!product) {
    return;
  }

  const price = product.prices.final.minimumAmount ?? product.prices.final.amount;

  createMetaTag('title', product.metaTitle || product.name, 'name');
  createMetaTag('description', product.metaDescription, 'name');
  createMetaTag('keywords', product.metaKeyword, 'name');

  createMetaTag('og:type', 'product', 'property');
  createMetaTag('og:description', product.shortDescription, 'property');
  createMetaTag('og:title', product.metaTitle || product.name, 'property');
  createMetaTag('og:url', window.location.href, 'property');
  const mainImage = product?.images?.filter((image) => image.roles.includes('thumbnail'))[0];
  const metaImage = mainImage?.url || product?.images[0]?.url;
  createMetaTag('og:image', metaImage, 'property');
  createMetaTag('og:image:secure_url', metaImage, 'property');
  createMetaTag('product:price:amount', price.value, 'property');
  createMetaTag('product:price:currency', price.currency, 'property');
}

/**
 * Returns the configuration for an image slot.
 * @param ctx - The context of the slot.
 * @returns The configuration for the image slot.
 */
function imageSlotConfig(ctx) {
  const { data, defaultImageProps } = ctx;
  return {
    alias: data.sku,
    imageProps: defaultImageProps,

    params: {
      width: defaultImageProps.width,
      height: defaultImageProps.height,
    },
  };
}
