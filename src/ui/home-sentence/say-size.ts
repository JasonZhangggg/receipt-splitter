import { createContext, useContext } from "react";

import { type } from "../theme";

/** The sentence's sizes: the words, a word you can press or type in, the padding that makes that word's tap area 44 px tall, its underline, and the icons beside it. */
export type SaySize = { readonly text: typeof type.say; readonly input: typeof type.sayInput; readonly pad: number; readonly rule: number; readonly icon: number };

const tapArea = 44;
const sized = (text: typeof type.say, input: typeof type.sayInput, rule: number, icon: number): SaySize => ({ text, input, pad: Math.max(0, (tapArea - input.lineHeight) / 2), rule, icon });

export const saySizes = { phone: sized(type.say, type.sayInput, 1.5, 14), wide: sized(type.sayWide, type.sayInputWide, 2, 18) } as const;

const SayContext = createContext<SaySize>(saySizes.phone);

/** Home sets the size for the width it lays out at; every part of the sentence reads it. */
export const SaySizeProvider = SayContext.Provider;
export const useSaySize = () => useContext(SayContext);
