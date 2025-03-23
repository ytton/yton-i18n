import * as vscode from 'vscode';
import { TranslationManager, TranslationStatus } from '../utils/translationManager';

/**
 * 翻译进度视图项
 */
export class TranslationProgressItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly locale?: string,
    public readonly untranslatedKey?: string,
    public readonly progress?: number
  ) {
    super(label, collapsibleState);
    
    if (locale && progress !== undefined) {
      this.description = `${progress}%`;
      this.tooltip = `${label} - 翻译进度: ${progress}%`;
      this.contextValue = 'locale';
      
      // 添加右侧图标
      this.iconPath = new vscode.ThemeIcon('globe');
    } else if (untranslatedKey) {
      this.tooltip = untranslatedKey;
      this.iconPath = new vscode.ThemeIcon('warning');
      
      // 添加编辑翻译命令
      this.command = {
        command: 'yton-i18n.editTranslation',
        title: '编辑翻译',
        arguments: [{key: untranslatedKey}]
      };
    }
  }
}

/**
 * 翻译进度视图提供器
 */
export class TranslationProgressViewProvider implements vscode.TreeDataProvider<TranslationProgressItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TranslationProgressItem | undefined | null | void> = new vscode.EventEmitter<TranslationProgressItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TranslationProgressItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TranslationProgressItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TranslationProgressItem): Promise<TranslationProgressItem[]> {
    try {
      const status = TranslationManager.getTranslationStatus();
      
      if (status.length === 0) {
        return [new TranslationProgressItem('没有找到翻译文件', vscode.TreeItemCollapsibleState.None)];
      }
      
      // 如果是根节点，显示所有语言
      if (!element) {
        return status.map(s => 
          new TranslationProgressItem(
            `${s.locale} (${s.translated}/${s.total})`, 
            s.untranslated > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            s.locale,
            undefined,
            s.progress
          )
        );
      }
      
      // 如果是语言节点，显示未翻译的键
      if (element.locale) {
        const localeStatus = status.find(s => s.locale === element.locale);
        
        if (!localeStatus || localeStatus.untranslated === 0) {
          return [new TranslationProgressItem('所有翻译已完成', vscode.TreeItemCollapsibleState.None)];
        }
        
        return localeStatus.untranslatedKeys.map(key => 
          new TranslationProgressItem(key, vscode.TreeItemCollapsibleState.None, undefined, key)
        );
      }
      
      return [];
    } catch (error) {
      return [new TranslationProgressItem(`加载失败: ${error}`, vscode.TreeItemCollapsibleState.None)];
    }
  }
} 