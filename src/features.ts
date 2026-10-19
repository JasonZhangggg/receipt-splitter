/** Features that are built but switched off. Set one to true and deploy to bring it back; the e2e header checks read this too. */
export const features = {
  /** The coffee cup in the header that opens the maker's Venmo. */
  coffee: false,
} as const;
