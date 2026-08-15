/**
 * Minimal ambient types for `braintree-web-drop-in` (it ships as a browser
 * UMD bundle with no bundled .d.ts). Covers the surface this app uses:
 * dropin.create(), requestPaymentMethod(), teardown(), and the requestable
 * events. Loaded lazily via dynamic import so the ~1MB bundle stays out of
 * the initial chunk.
 */
declare module "braintree-web-drop-in" {
  export interface DropinCreateOptions {
    authorization: string;
    container: string | HTMLElement;
    paypal?: {
      flow?: "checkout" | "vault";
      amount?: string | number;
      currency?: string;
      buttonStyle?: Record<string, unknown>;
      commit?: boolean;
    };
    card?: {
      overrides?: Record<string, unknown>;
    };
    applePay?: Record<string, unknown>;
    googlePay?: Record<string, unknown>;
    threeDSecure?: boolean;
    vaultManager?: boolean;
    preselectVaultedPaymentMethod?: boolean;
    dataCollector?: { kount?: boolean; paypal?: boolean };
  }

  export interface PaymentMethodRequestablePayload {
    type: string;
    nonce: string;
    details?: Record<string, unknown>;
    paymentMethodIsSelected: boolean;
  }

  export interface RequestPaymentMethodPayload {
    nonce: string;
    type: string;
    details?: Record<string, unknown>;
  }

  export interface Dropin {
    requestPaymentMethod(): Promise<RequestPaymentMethodPayload>;
    isPaymentMethodRequestable(): boolean;
    teardown(callback?: (err?: unknown) => void): void;
    on(
      event: "paymentMethodRequestable" | "noPaymentMethodRequestable",
      handler: (payload?: PaymentMethodRequestablePayload) => void,
    ): void;
  }

  const dropin: {
    create(options: DropinCreateOptions): Promise<Dropin>;
  };

  export default dropin;
}
