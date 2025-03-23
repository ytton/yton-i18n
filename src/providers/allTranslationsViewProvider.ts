import * as vscode from 'vscode';
import { TranslationManager } from '../utils/translationManager';

/**
 * 所有翻译视图项
 */
export class AllTranslationsItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly key?: string
  ) {
    super(label, collapsibleState);

    if (key) {
      this.tooltip = key;
      this.iconPath = new vscode.ThemeIcon('symbol-property');
      this.contextValue = 'translationKey';

      // 添加编辑翻译命令
      this.command = {
        command: 'yton-i18n.editTranslation',
        title: '编辑翻译',
        arguments: [{ key }]
      };
    }
  }
}

/**
 * 所有翻译视图提供器
 */
export class AllTranslationsViewProvider implements vscode.TreeDataProvider<AllTranslationsItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<AllTranslationsItem | undefined | null | void> =
    new vscode.EventEmitter<AllTranslationsItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<AllTranslationsItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private searchQuery: string = '';

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
    this.refresh();
  }

  getTreeItem(element: AllTranslationsItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AllTranslationsItem): Promise<AllTranslationsItem[]> {
    // 如果没有元素，返回所有翻译键
    if (!element) {
      try {
        const allKeys = TranslationManager.getAllTranslationKeys();

        // 直接展示键
        return allKeys.map(key => new AllTranslationsItem(key, vscode.TreeItemCollapsibleState.None, key));
      } catch (error) {
        console.error('获取翻译键失败:', error);
        return [];
      }
    }

    // 不再展开显示子元素
    return [];
  }
}
