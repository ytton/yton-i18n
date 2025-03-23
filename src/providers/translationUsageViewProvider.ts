import * as vscode from 'vscode';
import { TranslationManager, TranslationUsage } from '../utils/translationManager';
import * as path from 'path';
import { Config } from '../utils/config';

/**
 * 翻译使用情况视图项
 */
export class TranslationUsageItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string = '',
    public readonly key?: string,
    public readonly filePath?: string,
    public readonly localeName?: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(label, collapsibleState);
    
    // 设置图标和tooltip
    if (contextValue === 'category') {
      this.iconPath = new vscode.ThemeIcon('list-tree');
      this.tooltip = label;
    } else if (contextValue === 'category-unused') {
      this.iconPath = new vscode.ThemeIcon('warning');
      this.tooltip = `${label}\n点击右侧图标可一键删除所有未使用的键`;
    } else if (contextValue === 'usedKey' || contextValue === 'unusedKey') {
      this.tooltip = key || '';
      this.iconPath = new vscode.ThemeIcon('symbol-property');
      
      if (contextValue === 'unusedKey') {
        // 添加删除未使用键的命令
        this.contextValue = 'unusedKey';
        
        // 添加右侧删除图标
        this.command = undefined; // 不设置点击命令
      } else {
        this.contextValue = 'usedKey';
      }
    } else if (contextValue === 'file') {
      this.iconPath = new vscode.ThemeIcon('file');
      this.tooltip = `打开文件: ${filePath} (行: ${line}, 列: ${column})`;
      
      if (filePath) {
        // 添加打开文件的命令，并定位到特定位置
        this.command = {
          command: 'vscode.open',
          title: '打开文件',
          arguments: [
            vscode.Uri.file(path.join(Config.getWorkspaceRoot() || '', filePath)),
            { 
              selection: new vscode.Range(
                new vscode.Position(line || 0, column || 0),
                new vscode.Position(line || 0, (column || 0) + 20) // 估计选择约20个字符
              ) 
            }
          ]
        };
      }
    } else if (contextValue === 'locale') {
      this.iconPath = new vscode.ThemeIcon('json');
      this.tooltip = `打开翻译文件: ${localeName}`;
      
      if (localeName) {
        const localesDir = Config.getLocalesDir();
        const workspaceRoot = Config.getWorkspaceRoot() || '';
        
        // 构建json文件路径
        const jsonPath = path.join(workspaceRoot, localesDir, `${localeName}.json`);
        
        // 添加打开JSON文件的命令
        this.command = {
          command: 'vscode.open',
          title: '打开翻译文件',
          arguments: [vscode.Uri.file(jsonPath)]
        };
      }
    }
  }
}

/**
 * 翻译使用情况视图提供器
 */
export class TranslationUsageViewProvider implements vscode.TreeDataProvider<TranslationUsageItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TranslationUsageItem | undefined | null | void> = new vscode.EventEmitter<TranslationUsageItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TranslationUsageItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private usageData: { used: TranslationUsage[], unused: string[] } | null = null;
  private localeMap: Record<string, string[]> = {};

  constructor(private context: vscode.ExtensionContext) {
    // 注册删除未使用键的命令
    context.subscriptions.push(
      vscode.commands.registerCommand('yton-i18n.deleteUnusedKeyFromTree', (item: TranslationUsageItem) => {
        this.deleteUnusedKey(item.key || '');
      }),
      
      // 注册批量删除所有未使用键的命令
      vscode.commands.registerCommand('yton-i18n.deleteAllUnusedKeys', () => {
        this.deleteAllUnusedKeys();
      })
    );
  }

  refresh(): void {
    this.usageData = null;
    this.localeMap = {};
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TranslationUsageItem): vscode.TreeItem {
    return element;
  }

  /**
   * 删除未使用的键
   */
  private async deleteUnusedKey(key: string): Promise<void> {
    if (!key) {return;}
    
    // 确认是否删除
    const confirmation = await vscode.window.showWarningMessage(
      `确定要删除未使用的键 "${key}" 吗？此操作将从所有语言文件中移除该键。`,
      { modal: true },
      '是',
      '否'
    );
    
    if (confirmation !== '是') {return;}
    
    // 删除键
    if (TranslationManager.deleteTranslationKey(key)) {
      vscode.window.showInformationMessage(`成功删除键 "${key}"`);
      this.refresh(); // 刷新视图
    } else {
      vscode.window.showErrorMessage(`删除键 "${key}" 失败`);
    }
  }
  
  /**
   * 批量删除所有未使用的键
   */
  private async deleteAllUnusedKeys(): Promise<void> {
    if (!this.usageData || this.usageData.unused.length === 0) {
      vscode.window.showInformationMessage('没有可删除的未使用键');
      return;
    }
    
    // 确认是否删除所有
    const confirmation = await vscode.window.showWarningMessage(
      `确定要删除所有 ${this.usageData.unused.length} 个未使用的键吗？此操作无法撤销。`,
      { modal: true },
      '是',
      '否'
    );
    
    if (confirmation !== '是') {return;}
    
    // 显示进度
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "删除未使用的键...",
      cancellable: false
    }, async (progress) => {
      let success = 0;
      let failed = 0;
      const total = this.usageData!.unused.length;
      
      for (let i = 0; i < total; i++) {
        const key = this.usageData!.unused[i];
        progress.report({ 
          increment: 100 / total, 
          message: `正在处理: ${i+1}/${total}` 
        });
        
        if (TranslationManager.deleteTranslationKey(key)) {
          success++;
        } else {
          failed++;
        }
      }
      
      if (failed === 0) {
        vscode.window.showInformationMessage(`成功删除所有 ${success} 个未使用的键`);
      } else {
        vscode.window.showWarningMessage(`完成删除: ${success} 个成功, ${failed} 个失败`);
      }
      
      this.refresh(); // 刷新视图
    });
  }

  async getChildren(element?: TranslationUsageItem): Promise<TranslationUsageItem[]> {
    try {
      // 加载使用数据（仅在第一次访问或刷新后）
      if (!this.usageData) {
        // 显示加载中消息
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "分析翻译使用情况...",
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: "正在扫描所有文件..." });
          this.usageData = await TranslationManager.analyzeTranslationUsage();
          progress.report({ increment: 100, message: "分析完成" });
          
          // 加载未使用键的语言文件信息
          if (this.usageData) {
            const localeFiles = Config.getLocaleFiles();
            
            for (const unusedKey of this.usageData.unused) {
              this.localeMap[unusedKey] = [];
              
              for (const file of localeFiles) {
                const content = Config.getLocaleFileContent(file.name);
                const value = TranslationManager.getTranslationValue(unusedKey, file.name);
                
                if (value !== undefined) {
                  this.localeMap[unusedKey].push(file.name);
                }
              }
            }
          }
          
          // 刷新树视图
          this._onDidChangeTreeData.fire();
          return this.usageData;
        });
        
        // 初始化返回空数组，等待数据加载完成
        return [
          new TranslationUsageItem(
            "正在扫描全部文件，请稍候...", 
            vscode.TreeItemCollapsibleState.None,
            "loading"
          )
        ];
      }
      
      // 根节点：显示分类
      if (!element) {
        return [
          new TranslationUsageItem(
            `已使用的键 (${this.usageData.used.length})`, 
            vscode.TreeItemCollapsibleState.Collapsed,
            "category"
          ),
          new TranslationUsageItem(
            `未使用的键 (${this.usageData.unused.length})`, 
            vscode.TreeItemCollapsibleState.Collapsed,
            "category-unused"
          )
        ];
      }
      
      // 分类下的子项
      if (element.contextValue === 'category' || element.contextValue === 'category-unused') {
        if (element.label.startsWith('已使用的键')) {
          // 显示所有使用的键
          return this.usageData.used.map(usage => 
            new TranslationUsageItem(
              usage.key, 
              vscode.TreeItemCollapsibleState.Collapsed,
              "usedKey",
              usage.key
            )
          );
        } else if (element.label.startsWith('未使用的键')) {
          // 显示所有未使用的键
          return this.usageData.unused.map(key => {
            const item = new TranslationUsageItem(
              key, 
              vscode.TreeItemCollapsibleState.Collapsed,
              "unusedKey",
              key
            );
            
            // 移除点击键名时的删除命令，只通过垃圾桶图标触发删除
            item.command = undefined;
            
            return item;
          });
        }
      }
      
      // 键下的文件列表
      if (element.contextValue === 'usedKey') {
        const usage = this.usageData.used.find(u => u.key === element.key);
        if (usage) {
          // 显示使用该键的文件，包含行号和列号信息
          return usage.usedBy.map(location => 
            new TranslationUsageItem(
              `${location.filePath} (行: ${location.line + 1}, 列: ${location.column})`, 
              vscode.TreeItemCollapsibleState.None,
              "file",
              undefined,
              location.filePath,
              undefined,
              location.line,
              location.column
            )
          );
        }
      } else if (element.contextValue === 'unusedKey') {
        // 显示包含该键的语言文件
        const locales = this.localeMap[element.key || ''] || [];
        return locales.map(locale => 
          new TranslationUsageItem(
            locale, 
            vscode.TreeItemCollapsibleState.None,
            "locale",
            undefined,
            undefined,
            locale
          )
        );
      }
      
      return [];
    } catch (error) {
      console.error(`获取翻译使用情况失败: ${error}`);
      return [
        new TranslationUsageItem(
          `出错: ${error}`, 
          vscode.TreeItemCollapsibleState.None,
          "error"
        )
      ];
    }
  }
} 