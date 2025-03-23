import * as vscode from 'vscode';

/**
 * 刷新所有视图
 */
export async function refreshAllViews(): Promise<void> {
  try {
    // 刷新当前文件视图
    await vscode.commands.executeCommand('yton-i18n.refreshCurrentFile');
    
    // 刷新翻译进度视图
    await vscode.commands.executeCommand('yton-i18n.refreshTranslationProgress');
    
    // 刷新所有翻译视图
    await vscode.commands.executeCommand('yton-i18n.refreshAllTranslations');
    
    // 刷新翻译使用情况视图
    await vscode.commands.executeCommand('yton-i18n.refreshTranslationUsage');
    
    vscode.window.showInformationMessage('已刷新所有视图');
  } catch (error) {
    vscode.window.showErrorMessage(`刷新视图失败: ${error}`);
  }
} 