import * as vscode from "vscode";

/** Minimal shape shared by PhaseTreeItem and ArchiveTreeItem. */
export interface TreeItemLike {
  label: string;
  description?: string;
  iconId?: string;
  iconColor?: string;
  contextValue?: string;
}

/** Provider that returns a flat list of tree items. */
export interface FlatTreeProvider<T extends TreeItemLike> {
  getChildren(): T[];
}

/** Tree item with an explicit id and optional collapsibility. */
export interface HierarchicalTreeItem extends TreeItemLike {
  id: string;
  collapsible?: boolean;
}

/** Provider that returns children for a given parent (or roots when undefined). */
export interface HierarchicalTreeProvider<T extends HierarchicalTreeItem> {
  getChildren(element?: string): T[];
  getParent?(element: string): string | undefined;
}

/**
 * Creates a VS Code TreeDataProvider that adapts a FlatTreeProvider,
 * plus an emitter for signalling changes.
 *
 * `extraProps` copies provider-specific fields (e.g. phaseNumber, archiveName)
 * onto the VS Code TreeItem.
 */
export function createTreeAdapter<T extends TreeItemLike>(
  provider: FlatTreeProvider<T>,
  extraProps?: (item: T, treeItem: vscode.TreeItem) => void,
): {
  dataProvider: vscode.TreeDataProvider<string>;
  emitter: vscode.EventEmitter<string | undefined>;
  resolveItem: (element: string) => T | undefined;
} {
  const emitter = new vscode.EventEmitter<string | undefined>();

  const dataProvider: vscode.TreeDataProvider<string> = {
    onDidChangeTreeData: emitter.event,
    getTreeItem(element: string): vscode.TreeItem {
      const items = provider.getChildren();
      const idx = parseInt(element, 10);
      const item = items[idx];
      if (!item) return new vscode.TreeItem("");
      const treeItem = new vscode.TreeItem(item.label);
      treeItem.description = item.description;
      if (item.iconId) {
        treeItem.iconPath = new vscode.ThemeIcon(
          item.iconId,
          item.iconColor
            ? new vscode.ThemeColor(item.iconColor)
            : undefined,
        );
      }
      if (item.contextValue) {
        treeItem.contextValue = item.contextValue;
      }
      if (extraProps) {
        extraProps(item, treeItem);
      }
      return treeItem;
    },
    getChildren(): string[] {
      return provider.getChildren().map((_, i) => String(i));
    },
  };

  function resolveItem(element: string): T | undefined {
    const idx = parseInt(element, 10);
    return provider.getChildren()[idx];
  }

  return { dataProvider, emitter, resolveItem };
}

/**
 * Creates a VS Code TreeDataProvider that adapts a HierarchicalTreeProvider,
 * supporting parent-child relationships (e.g. folder → phase items).
 */
export function createHierarchicalTreeAdapter<T extends HierarchicalTreeItem>(
  provider: HierarchicalTreeProvider<T>,
  extraProps?: (item: T, treeItem: vscode.TreeItem) => void,
): {
  dataProvider: vscode.TreeDataProvider<string>;
  emitter: vscode.EventEmitter<string | undefined>;
  resolveItem: (element: string) => T | undefined;
} {
  const emitter = new vscode.EventEmitter<string | undefined>();

  function findItem(id: string): T | undefined {
    const roots = provider.getChildren();
    for (const root of roots) {
      if (root.id === id) return root;
      if (root.collapsible) {
        const child = provider.getChildren(root.id).find((c) => c.id === id);
        if (child) return child;
      }
    }
    return undefined;
  }

  const dataProvider: vscode.TreeDataProvider<string> = {
    onDidChangeTreeData: emitter.event,
    getTreeItem(element: string): vscode.TreeItem {
      const item = findItem(element);
      if (!item) return new vscode.TreeItem("");
      const treeItem = new vscode.TreeItem(
        item.label,
        item.collapsible
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None,
      );
      treeItem.description = item.description;
      if (item.iconId) {
        treeItem.iconPath = new vscode.ThemeIcon(
          item.iconId,
          item.iconColor
            ? new vscode.ThemeColor(item.iconColor)
            : undefined,
        );
      }
      if (item.contextValue) {
        treeItem.contextValue = item.contextValue;
      }
      if (extraProps) {
        extraProps(item, treeItem);
      }
      return treeItem;
    },
    getChildren(element?: string): string[] {
      return provider.getChildren(element).map((item) => item.id);
    },
    getParent: provider.getParent
      ? (element: string) => provider.getParent!(element)
      : undefined,
  };

  function resolveItem(element: string): T | undefined {
    return findItem(element);
  }

  return { dataProvider, emitter, resolveItem };
}
