import * as vscode from 'vscode';
import { Transformer } from '../utils/transformer';
import { HardcodedText } from '../utils/parser';
import { FilePathManager } from '../utils/filePathManager';

/**
 * 当前文件情况视图项
 */
export class CurrentFileItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly key?: string,
    public readonly hardcodedText?: HardcodedText,
    public readonly category?: string
  ) {
    super(label, collapsibleState);
    
    if (key) {
      this.tooltip = key;
      this.iconPath = new vscode.ThemeIcon('symbol-property');

      // 根据父级类别决定命令
      if (category === '已使用Keys') {
        // 已使用的键，打开编辑器
        this.command = {
          command: 'yton-i18n.editTranslation',
          title: '编辑翻译',
          arguments: [{ key, from: 'file' }]
        };
      } else if (category === '未定义的Keys') {
        // 未定义的键，定位到文件中使用该键的位置
        this.command = {
          command: 'yton-i18n.locateKeyUsage',
          title: '定位到使用位置',
          arguments: [key]
        };
      }
    } else if (hardcodedText) {
      this.tooltip = hardcodedText.text;
      this.iconPath = new vscode.ThemeIcon('warning');
      this.command = {
        command: 'yton-i18n.goToHardcoded',
        title: '跳转到硬编码',
        arguments: [hardcodedText.range]
      };
    } else if (label === '已使用Keys') {
      this.iconPath = new vscode.ThemeIcon('check');
      this.tooltip = '文件中使用且已添加翻译的键';
    } else if (label === '未定义的Keys') {
      this.iconPath = new vscode.ThemeIcon('warning');
      this.tooltip = '文件中使用但未添加翻译的键';
    } else if (label === '硬编码') {
      this.iconPath = new vscode.ThemeIcon('error');
      this.tooltip = '文件中的硬编码文本，需要提取为翻译键';
    }
  }
}

/**
 * 当前文件视图提供器
 */
export class CurrentFileViewProvider implements vscode.TreeDataProvider<CurrentFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CurrentFileItem | undefined | null | void> =
    new vscode.EventEmitter<CurrentFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CurrentFileItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {
    // 监听文件更改
    vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
    vscode.workspace.onDidChangeTextDocument(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CurrentFileItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CurrentFileItem): Promise<CurrentFileItem[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [new CurrentFileItem('没有打开的文件', vscode.TreeItemCollapsibleState.None)];
    }

    // 如果是根节点
    if (!element) {
      const categories = [
        new CurrentFileItem('已使用Keys', vscode.TreeItemCollapsibleState.Collapsed),
        new CurrentFileItem('未定义的Keys', vscode.TreeItemCollapsibleState.Collapsed),
        new CurrentFileItem('硬编码', vscode.TreeItemCollapsibleState.Collapsed)
      ];
      return categories;
    }

    try {
      const usage = await Transformer.getFileI18nUsage(editor.document);

      switch (element.label) {
        case '已使用Keys':
          return usage.usedKeys
            .filter(key => !usage.missingKeys.includes(key)) // 排除未发现键
            .map(key => new CurrentFileItem(key, vscode.TreeItemCollapsibleState.None, key, undefined, '已使用Keys'));
        case '未定义的Keys':
          return usage.missingKeys.map(key => 
            new CurrentFileItem(key, vscode.TreeItemCollapsibleState.None, key, undefined, '未定义的Keys')
          );
        case '硬编码':
          return usage.hardcodedTexts.map(
            text =>
              new CurrentFileItem(
                text.text.length > 30 ? `${text.text.substring(0, 30)}...` : text.text,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                text
              )
          );
        default:
          return [];
      }
    } catch (error) {
      return [new CurrentFileItem(`加载失败: ${error}`, vscode.TreeItemCollapsibleState.None)];
    }
  }
}

/**
 * 跳转到硬编码
 */
export function goToHardcoded(range: vscode.Range): void {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range);
  }
}

/**
 * 定位到键的使用位置
 */
export async function locateKeyUsage(key: string): Promise<void> {
  console.log(`开始定位键使用位置: ${key}`);
  
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    console.log(`未找到活动编辑器，无法定位键`);
    vscode.window.showInformationMessage(`请先打开文件再定位键使用位置`);
    return;
  }
  
  try {
    console.log(`正在文件 ${editor.document.uri.fsPath} 中查找键: ${key}`);
    
    const document = editor.document;
    const text = document.getText();
    
    // 构建可能的键引用模式，适配不同的引用方式
    const patterns = [
      `['"]${key}['"]`, // 'key' 或 "key"
      `\\$t\\(['"]${key}['"]\\)`, // $t('key') 或 $t("key")
      `t\\(['"]${key}['"]\\)`, // t('key') 或 t("key")
      `i18n\\.t\\(['"]${key}['"]\\)`, // i18n.t('key') 或 i18n.t("key")
      `i18n\\.global\\.t\\(['"]${key}['"]\\)`, // i18n.global.t('key') 或 i18n.global.t("key")
      `useTranslation\\(\\)\\s*\\.\\s*t\\(['"]${key}['"]\\)` // useTranslation().t('key')
    ];

    console.log(`使用的模式:`, patterns);

    // 在文档中搜索所有匹配的位置
    const matches: vscode.Range[] = [];
    
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'g');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        console.log(`找到匹配: "${match[0]}" 在位置 ${match.index}`);
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        matches.push(new vscode.Range(startPos, endPos));
      }
    }
    
    console.log(`共找到 ${matches.length} 处匹配`);
    
    if (matches.length > 0) {
      // 选择找到的第一个位置
      editor.selection = new vscode.Selection(matches[0].start, matches[0].end);
      editor.revealRange(matches[0], vscode.TextEditorRevealType.InCenter);
      
      // 聚焦到包含文件的编辑器
      vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn,
        preserveFocus: false // 确保焦点转移到编辑器
      });
      
      // 如果找到多个位置，显示信息
      if (matches.length > 1) {
        vscode.window.showInformationMessage(`找到 ${matches.length} 处使用该键的地方，已定位到第一处`);
      } else {
        vscode.window.showInformationMessage(`已定位到键 "${key}" 的使用位置`);
      }
    } else {
      vscode.window.showInformationMessage(`未找到键 "${key}" 的使用位置`);
    }
  } catch (error) {
    console.error(`定位键使用位置失败:`, error);
    vscode.window.showErrorMessage(`定位键使用位置失败: ${error}`);
  }
}
