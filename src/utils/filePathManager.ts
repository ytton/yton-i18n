import * as vscode from 'vscode';

/**
 * 文件路径管理器
 */
export class FilePathManager {
  /**
   * 获取当前文件路径
   * @returns 当前打开的文件路径，如果没有则返回空字符串
   */
  static getCurrentFilePath(): string {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return '';
    }
    
    return activeEditor.document.uri.fsPath;
  }
} 