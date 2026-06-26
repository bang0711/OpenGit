"use client";

import type { TreeNode } from "@/lib/file-tree";
import { TreeItem } from "./tree-item";

export function FileTree({
  nodes,
  sha,
  selected,
  wt,
}: {
  nodes: TreeNode[];
  sha?: string;
  selected: string | null;
  wt?: boolean;
}) {
  return (
    <div className="flex flex-col py-1 text-xs">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          sha={sha}
          selected={selected}
          wt={wt}
          depth={0}
        />
      ))}
    </div>
  );
}
