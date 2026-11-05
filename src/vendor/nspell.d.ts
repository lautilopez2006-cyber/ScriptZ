declare const NSpell: (aff: string, dic: string) => {
  correct(word: string): boolean;
  suggest(word: string): string[];
  add(word: string): unknown;
  personal(dic: string): unknown;
};
export default NSpell;
