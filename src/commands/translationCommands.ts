import * as vscode from 'vscode';
import { TranslationManager } from '../utils/translationManager';
import { Parser } from '../utils/parser';
import { Transformer } from '../utils/transformer';

/**
 * 编辑翻译
 */
export async function editTranslation(args: { key: string; from: 'file' | 'allTranslation' }): Promise<void> {
  try {
    const key = args?.key || '';
    if (!key) {
      return;
    }

    // 获取当前键的所有语言翻译
    const translations = TranslationManager.getKeyTranslations(key);
    console.log(`编辑翻译: 键=${key}, 翻译内容=`, translations);

    // 获取当前活动编辑器的文件路径
    const activeEditor = vscode.window.activeTextEditor;
    const currentFilePath = activeEditor?.document.uri.fsPath || '';
    console.log(`当前文件路径: ${currentFilePath}`);
    // 根据from参数决定打开编辑器的逻辑
    if (args.from === 'file') {
      // 从文件打开时，传递当前文件路径，编辑器将显示在右侧
      await vscode.commands.executeCommand('yton-i18n.openTranslationEditor', key, translations, currentFilePath);
    } else {
      // 从所有翻译打开时，不传递文件路径，编辑器将独占屏幕
      await vscode.commands.executeCommand('yton-i18n.openTranslationEditor', key, translations);
    }
  } catch (error) {
    console.error(`编辑翻译失败:`, error);
    vscode.window.showErrorMessage(`编辑翻译失败: ${error}`);
  }
}

/**
 * 删除未使用的键
 */
export async function deleteUnusedKey(key: string): Promise<void> {
  try {
    // 确认删除
    const confirmation = await vscode.window.showWarningMessage(
      `确定要删除未使用的键 "${key}" 吗？`,
      { modal: true },
      '是',
      '否'
    );

    if (confirmation !== '是') {
      return;
    }

    if (TranslationManager.deleteTranslationKey(key)) {
      vscode.window.showInformationMessage(`成功删除键 "${key}"`);
    } else {
      vscode.window.showErrorMessage(`删除键 "${key}" 失败`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`删除未使用的键失败: ${error}`);
  }
}

/**
 * 查看当前文件翻译
 */
export async function viewFileTranslations(): Promise<void> {
  try {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor) {
      vscode.window.showErrorMessage('没有打开的文件');
      return;
    }

    const document = activeEditor.document;
    const filePath = document.uri.fsPath;

    // 解析当前文件中使用的所有翻译键
    const fileKeys = Parser.parseTranslationKeys(document);

    if (fileKeys.length === 0) {
      vscode.window.showInformationMessage('当前文件中未找到翻译键');
      return;
    }

    console.log(`找到当前文件使用的翻译键: ${fileKeys.length}个`);

    // 获取当前文件的I18n使用情况，确保视图一致性
    const fileUsage = await Transformer.getFileI18nUsage(document);
    console.log(
      `文件使用情况: 已使用=${fileUsage.usedKeys.length}个, 未发现=${fileUsage.missingKeys.length}个, 硬编码=${fileUsage.hardcodedTexts.length}个`
    );

    // 打开翻译编辑器，不传递具体翻译key（将在编辑器中显示所有文件键）
    await vscode.commands.executeCommand('yton-i18n.openTranslationEditor', '', {}, filePath);

    // 向编辑器发送当前文件特定的键
    vscode.commands.executeCommand('yton-i18n.setFileKeys', fileUsage.usedKeys, filePath);
  } catch (error) {
    console.error(`查看当前文件翻译失败:`, error);
    vscode.window.showErrorMessage(`查看当前文件翻译失败: ${error}`);
  }
}
