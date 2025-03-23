import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 获取相对于工作区的文件路径
 * @param filePath 文件绝对路径
 * @returns 相对路径
 */
export function getRelativePath(filePath: string): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return filePath;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  return path.relative(workspaceRoot, filePath);
} 