import { useCallback } from "react";
import type { AttentionItem } from "../../../../main/types";
import { AttentionRow } from "../AttentionRow";

interface AttentionListProps {
  items: AttentionItem[];
}

export function AttentionList({ items }: AttentionListProps) {
  const handleOpen = useCallback((id: string) => {
    window.flint?.openAttentionItem(id);
  }, []);

  if (items.length === 0) return null;
  return (
    <div>
      {items.map((item) => (
        <AttentionRow key={item.id} item={item} onOpen={handleOpen} />
      ))}
    </div>
  );
}
