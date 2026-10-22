/** 旧Word把下标与撇号写成了 σ's / f’y；只补数学排版，不改数字、答案或原始记录。 */
export function formatLinkedText(text: string): string {
  const symbols: Record<string, string> = { "σ": "\\sigma", "ε": "\\varepsilon", f: "f", A: "A", a: "a" };
  const delimited = /(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
  return text.split(delimited).map((part, index) => index % 2 ? part
    : part.replace(/(?<![A-Za-z\\])([σεfAa])['’′]([sy])\b/g, (_match, symbol: string, subscript: string) => "$" + symbols[symbol] + "'_" + subscript + "$")).join("");
}
