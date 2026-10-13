import slidesJson from "@/content/slides.json";

export type MaterialSection = {
  /** 与 slides.json 的 section 一致，也是讲解版下载参数 */
  id: string;
  label: string;
  pages: number;
};

type SlideLite = { section?: string };

/** 自学天地的分节顺序：按课件页首次出现排列 */
export const materialSections: MaterialSection[] = (() => {
  const order: MaterialSection[] = [];
  const index = new Map<string, MaterialSection>();
  for (const slide of slidesJson as SlideLite[]) {
    const name = slide.section?.trim();
    if (!name) continue;
    const hit = index.get(name);
    if (hit) hit.pages += 1;
    else {
      const row = { id: name, label: name, pages: 1 };
      index.set(name, row);
      order.push(row);
    }
  }
  return order;
})();

export function findMaterialSection(id: string): MaterialSection | undefined {
  return materialSections.find((section) => section.id === id);
}
