import type { ReadingNode } from './model.js';
export function findNode(tree: ReadingNode[], id: string): ReadingNode | undefined {
  for (const n of tree) { if (n.id === id) return n; const found = findNode(n.children, id); if (found) return found; }
}
export function allNodes(tree: ReadingNode[]): ReadingNode[] { return tree.flatMap(n => [n, ...allNodes(n.children)]); }
export function detach(tree: ReadingNode[], id: string): ReadingNode | undefined {
  const index = tree.findIndex(n => n.id === id);
  if (index >= 0) return tree.splice(index, 1)[0];
  for (const n of tree) { const removed = detach(n.children, id); if (removed) return removed; }
}
export function excludeDocument(tree: ReadingNode[], documentId: string): ReadingNode[] {
  return tree.flatMap(n => n.documentId === documentId ? excludeDocument(n.children, documentId) : [{ ...n, children: excludeDocument(n.children, documentId) }]);
}
export function moveNode(tree: ReadingNode[], id: string, parentId: string | undefined, beforeId?: string): ReadingNode[] {
  const next = structuredClone(tree), node = findNode(next, id);
  if (!node) throw new Error('Node not found');
  if (parentId === id || parentId && findNode(node.children, parentId)) throw new Error('Cannot move a section inside itself');
  if (beforeId === id) return next;
  if (parentId && !findNode(next, parentId)) throw new Error('Parent not found');
  const removed = detach(next, id)!;
  const siblings = parentId ? findNode(next, parentId)!.children : next;
  const at = beforeId ? siblings.findIndex(n => n.id === beforeId) : -1;
  siblings.splice(at < 0 ? siblings.length : at, 0, removed);
  return next;
}
export function reorder(tree: ReadingNode[], id: string, direction: -1 | 1): ReadingNode[] {
  const next = structuredClone(tree);
  function visit(nodes: ReadingNode[]): boolean {
    const index = nodes.findIndex(n => n.id === id);
    if (index >= 0) { const target = index + direction; if (target >= 0 && target < nodes.length) [nodes[index], nodes[target]] = [nodes[target], nodes[index]]; return true; }
    return nodes.some(n => visit(n.children));
  }
  visit(next); return next;
}
