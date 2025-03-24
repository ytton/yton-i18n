// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { extractHardcodedRange, extractWholeSelectionAsKey, extractHardcodedText, extractSelection } from './commands/extractHardcoded';
import { editTranslation, viewFileTranslations, deleteUnusedKey } from './commands/translationCommands';
import { refreshAllViews } from './commands/refreshViewsCommand';
import { CurrentFileViewProvider, goToHardcoded, locateKeyUsage } from './providers/currentFileViewProvider';
import { AllTranslationsViewProvider } from './providers/allTranslationsViewProvider';
import { TranslationProgressViewProvider } from './providers/translationProgressViewProvider';
import { TranslationUsageViewProvider } from './providers/translationUsageViewProvider';
import { TranslationEditorProvider } from './webview/translationEditorProvider';
import { Config } from './utils/config';

// 声明为模块级变量，以便在deactivate函数中访问
let translationEditorProvider: TranslationEditorProvider;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // 初始化扩展
  console.log('i18n国际化扩展已激活');

  // 初始化翻译编辑器
  translationEditorProvider = new TranslationEditorProvider(context);

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('yton-i18n.editTranslation', editTranslation),
    vscode.commands.registerCommand('yton-i18n.extractSelection', extractSelection),
    vscode.commands.registerCommand('yton-i18n.extractHardcodedRange', extractHardcodedRange),
    vscode.commands.registerCommand('yton-i18n.extractWholeSelectionAsKey', extractWholeSelectionAsKey),
    vscode.commands.registerCommand('yton-i18n.viewFileTranslations', viewFileTranslations),
    vscode.commands.registerCommand('yton-i18n.goToHardcoded', goToHardcoded),
    vscode.commands.registerCommand('yton-i18n.refreshAllViews', refreshAllViews),
    vscode.commands.registerCommand('yton-i18n.deleteUnusedKey', deleteUnusedKey),
    vscode.commands.registerCommand('yton-i18n.extractHardcodedText', extractHardcodedText),
    vscode.commands.registerCommand('yton-i18n.locateKeyUsage', locateKeyUsage),
    vscode.commands.registerCommand('yton-i18n.setFileKeys', (keys: string[], sourceFilePath: string) => {
      translationEditorProvider.setFileKeys(keys, sourceFilePath);
    })
  );

  // 注册视图提供器
  const currentFileProvider = new CurrentFileViewProvider(context);
  const translationProgressProvider = new TranslationProgressViewProvider(context);
  const allTranslationsProvider = new AllTranslationsViewProvider(context);
  const translationUsageProvider = new TranslationUsageViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('currentFile', currentFileProvider),
    vscode.window.registerTreeDataProvider('translationProgress', translationProgressProvider),
    vscode.window.registerTreeDataProvider('allTranslations', allTranslationsProvider),
    vscode.window.registerTreeDataProvider('translationUsage', translationUsageProvider)
  );

  // 注册刷新命令
  context.subscriptions.push(
    vscode.commands.registerCommand('yton-i18n.refreshCurrentFile', () => currentFileProvider.refresh()),
    vscode.commands.registerCommand('yton-i18n.refreshTranslationProgress', () => translationProgressProvider.refresh()),
    vscode.commands.registerCommand('yton-i18n.refreshAllTranslations', () => allTranslationsProvider.refresh()),
    vscode.commands.registerCommand('yton-i18n.refreshTranslationUsage', () => translationUsageProvider.refresh())
  );

  // 注册翻译编辑器
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'yton-i18n.openTranslationEditor',
      (key: string, translations?: Record<string, string>, sourceFilePath?: string) => {
        translationEditorProvider.openEditor(key, translations, sourceFilePath);
      }
    )
  );

  // 注册文件系统监听器以在JSON文件变化时刷新视图
  const localeDir = vscode.workspace.getConfiguration('yton-i18n').get<string>('localesDir', './locales');
  if (localeDir) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (workspaceRoot) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceRoot, `${localeDir}/**/*.json`)
      );
      
      const handleFileChange = () => {
        vscode.commands.executeCommand('yton-i18n.refreshAllViews');
      };
      
      watcher.onDidChange(handleFileChange, null, context.subscriptions);
      watcher.onDidCreate(handleFileChange, null, context.subscriptions);
      watcher.onDidDelete(handleFileChange, null, context.subscriptions);
      
      context.subscriptions.push(watcher);
    }
  }

  // 释放资源
  context.subscriptions.push({
    dispose: () => {
      translationEditorProvider.dispose();
    }
  });
}

// This method is called when your extension is deactivated
export function deactivate() {
  // 清理TranslationEditorProvider资源
  if (translationEditorProvider) {
    translationEditorProvider.dispose();
    console.log('已清理翻译编辑器资源');
  }
  
  console.log('正在停用 yton-i18n 扩展...');
}
