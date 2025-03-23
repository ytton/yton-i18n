import * as vscode from 'vscode';
import * as path from 'path';
import { Parser, HardcodedText } from '../utils/parser';
import { Transformer } from '../utils/transformer';
import { Config } from '../utils/config';
import { TranslationManager } from '../utils/translationManager';

/**
 * 提取当前文件的硬编码
 */
export async function extractHardcoded(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('没有打开的文件');
    return;
  }

  try {
    // 解析文件中的硬编码文本
    const hardcodedTexts = await Parser.parseHardcodedTexts(editor.document);
    
    if (hardcodedTexts.length === 0) {
      vscode.window.showInformationMessage('当前文件没有检测到硬编码文本');
      return;
    }
    
    // 询问用户是否确认替换
    const confirmation = await vscode.window.showInformationMessage(
      `检测到 ${hardcodedTexts.length} 个硬编码文本，是否替换？`,
      { modal: true },
      '是',
      '否'
    );
    
    if (confirmation !== '是') {
      return;
    }
    
    // 转换硬编码为国际化键
    const results = await Transformer.transformHardcodedTexts(hardcodedTexts);
    
    // 应用转换结果
    await Transformer.applyTransformResults(editor.document, results, hardcodedTexts);
    
    vscode.window.showInformationMessage(`成功替换 ${results.length} 个硬编码文本`);
  } catch (error) {
    vscode.window.showErrorMessage(`提取硬编码失败: ${error}`);
  }
}

/**
 * 提取选中文本的硬编码
 */
export async function extractSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('没有打开的文件');
    return;
  }

  try {
    // 获取当前选择
    const selection = editor.selection;
    
    if (selection.isEmpty) {
      vscode.window.showErrorMessage('没有选中文本');
      return;
    }
    
    // 解析选中区域中的硬编码文本
    const hardcodedTexts = await Parser.parseSelectedText(editor.document, selection);
    
    if (hardcodedTexts.length === 0) {
      vscode.window.showInformationMessage('选中区域没有检测到硬编码文本');
      return;
    }
    
    // 询问用户是否确认替换
    const confirmation = await vscode.window.showInformationMessage(
      `检测到 ${hardcodedTexts.length} 个硬编码文本，是否替换？`,
      { modal: true },
      '是',
      '否'
    );
    
    if (confirmation !== '是') {
      return;
    }
    
    // 转换硬编码为国际化键
    const results = await Transformer.transformHardcodedTexts(hardcodedTexts);
    
    // 应用转换结果
    await Transformer.applyTransformResults(editor.document, results, hardcodedTexts);
    
    vscode.window.showInformationMessage(`成功替换 ${results.length} 个硬编码文本`);
  } catch (error) {
    vscode.window.showErrorMessage(`提取选中文本的硬编码失败: ${error}`);
  }
}

/**
 * 提取特定范围的硬编码文本
 * 从诊断提示中调用
 */
export async function extractHardcodedRange(
  documentUri: string, 
  startLine: number, 
  startChar: number, 
  endLine: number, 
  endChar: number
): Promise<void> {
  try {
    // 打开文档
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
    const editor = await vscode.window.showTextDocument(document);
    
    // 创建选择范围
    const range = new vscode.Range(
      new vscode.Position(startLine, startChar),
      new vscode.Position(endLine, endChar)
    );
    
    // 获取这个范围内的文本
    const text = document.getText(range);
    
    if (!text) {
      vscode.window.showErrorMessage('无法获取硬编码文本');
      return;
    }
    
    // 创建一个硬编码文本对象
    const hardcodedText = {
      text,
      range,
      isHtml: false,
      isVueAttribute: false,
      isVueScript: false
    };
    
    // 转换硬编码为国际化键
    const results = await Transformer.transformHardcodedTexts([hardcodedText]);
    
    // 应用转换结果
    await Transformer.applyTransformResults(document, results, [hardcodedText]);
    
    vscode.window.showInformationMessage(`成功替换硬编码文本: "${text}"`);
  } catch (error) {
    vscode.window.showErrorMessage(`提取硬编码失败: ${error}`);
  }
}

/**
 * 将整个选中文本作为翻译键提取
 * 纯文本则直接使用文本作为key(去除.)
 * 包含HTML则使用Text v-html
 */
export async function extractWholeSelectionAsKey(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const selection = editor.selection;
  
  if (selection.isEmpty) {
    vscode.window.showInformationMessage('请先选择要提取的文本');
    return;
  }

  // 获取选中的文本
  const selectedText = document.getText(selection);
  if (!selectedText) {
    return;
  }

  // 判断是否包含HTML标签
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(selectedText);
  
  // 清理文本用作键名
  // 移除英文句点，但保留其他特殊符号包括空格
  let keyName = selectedText
    .replace(/\./g, '') // 移除英文句点
    .trim();

  // 如果是HTML内容，生成更简洁的键名
  if (hasHtmlTags) {
    // 简单清理HTML标签获取纯文本内容作为键名的参考
    const textContent = selectedText
      .replace(/<[^>]*>/g, '') // 移除HTML标签
      .replace(/\s+/g, ' ')    // 将多个空白字符替换为单个空格
      .trim();
    
    // 为了可读性，截取适当长度
    keyName = textContent.substring(0, Math.min(50, textContent.length))
      .replace(/\./g, ''); // 移除英文句点
  }
  
  // 询问用户确认键名
  const userKey = await vscode.window.showInputBox({
    prompt: '请输入翻译键名',
    value: keyName,
    validateInput: (value) => {
      return value ? null : '键名不能为空';
    }
  });

  if (!userKey) {
    return;
  }

  // 保存到翻译文件
  try {
    // 获取默认语言文件
    const localeFiles = Config.getLocaleFiles();
    if (localeFiles.length === 0) {
      vscode.window.showErrorMessage('未找到翻译文件');
      return;
    }
    
    // 使用第一个语言文件作为默认语言
    const locale = localeFiles[0].name;

    // 检查键是否已存在
    const translations = TranslationManager.getKeyTranslations(userKey);
    if (Object.keys(translations).length > 0) {
      const overwrite = await vscode.window.showWarningMessage(
        `键 "${userKey}" 已存在，是否覆盖？`,
        '覆盖',
        '取消'
      );
      if (overwrite !== '覆盖') {
        return;
      }
    }

    // 保存翻译
    const success = TranslationManager.updateKeyTranslation(userKey, locale, selectedText);
    if (!success) {
      vscode.window.showErrorMessage(`无法保存翻译`);
      return;
    }

    // 根据文件类型生成替换代码
    const fileExt = document.fileName.split('.').pop()?.toLowerCase();
    let replacement = '';

    if (hasHtmlTags) {
      // 对于HTML内容使用v-html
      if (fileExt === 'vue') {
        replacement = `<Text v-html="$t('${userKey}')"/>`;
      } else if (['jsx', 'tsx'].includes(fileExt || '')) {
        replacement = `<Text dangerouslySetInnerHTML={{ __html: t('${userKey}') }}/>`;
      } else {
        replacement = `<div v-html="$t('${userKey}')"></div>`;
      }
    } else {
      // 纯文本替换
      if (fileExt === 'vue') {
        replacement = `{{ $t('${userKey}') }}`;
      } else if (['jsx', 'tsx'].includes(fileExt || '')) {
        replacement = `{t('${userKey}')}`;
      } else {
        replacement = `t('${userKey}')`;
      }
    }

    // 应用替换
    await editor.edit(editBuilder => {
      editBuilder.replace(selection, replacement);
    });

    // 刷新视图
    await vscode.commands.executeCommand('yton-i18n.refreshAllViews');
    vscode.window.showInformationMessage(`已成功提取键 "${userKey}"`);
  } catch (error) {
    vscode.window.showErrorMessage(`提取失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 提取特定硬编码文本（从翻译编辑器中调用）
 */
export async function extractHardcodedText(text: string, range: any): Promise<void> {
  console.log(`提取硬编码文本函数被调用:`, text, range);
  
  try {
    // 如果是从WebView调用，打开目标文件
    let document: vscode.TextDocument;
    let editor: vscode.TextEditor;
    
    if (range.file) {
      // 如果范围中包含文件路径，打开该文件
      const fileUri = vscode.Uri.file(range.file);
      document = await vscode.workspace.openTextDocument(fileUri);
      editor = await vscode.window.showTextDocument(document);
    } else {
      // 使用当前活动编辑器
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('没有打开的文件');
        return;
      }
      editor = activeEditor;
      document = editor.document;
    }
    
    // 创建范围对象
    let textRange: vscode.Range;
    if (range instanceof vscode.Range) {
      textRange = range;
    } else {
      textRange = new vscode.Range(
        new vscode.Position(range.start.line, range.start.character),
        new vscode.Position(range.end.line, range.end.character)
      );
    }
    
    // 创建硬编码文本对象
    const hardcodedText: HardcodedText = {
      text,
      range: textRange,
      isHtml: false, // 将根据文件类型设置
      isVueAttribute: false,
      isVueScript: false
    };
    
    // 自动判断文件类型
    const fileExt = document.fileName.split('.').pop()?.toLowerCase();
    if (fileExt === 'vue') {
      // 根据位置判断是否为Vue模板或脚本
      const documentText = document.getText();
      const templateMatch = /<template>([\s\S]*?)<\/template>/i.exec(documentText);
      
      if (templateMatch) {
        const templateStart = document.positionAt(templateMatch.index + '<template>'.length);
        const templateEnd = document.positionAt(templateMatch.index + templateMatch[0].length - '</template>'.length);
        
        // 检查位置是否在模板内
        if (
          (textRange.start.line > templateStart.line || 
           (textRange.start.line === templateStart.line && textRange.start.character >= templateStart.character)) &&
          (textRange.start.line < templateEnd.line || 
           (textRange.start.line === templateEnd.line && textRange.start.character <= templateEnd.character))
        ) {
          hardcodedText.isHtml = true;
        } else {
          hardcodedText.isVueScript = true;
        }
      }
    }
    
    console.log(`准备转换硬编码文本:`, hardcodedText);
    
    // 转换硬编码为国际化键
    const results = await Transformer.transformHardcodedTexts([hardcodedText]);
    
    // 应用转换结果
    await Transformer.applyTransformResults(document, results, [hardcodedText]);
    
    vscode.window.showInformationMessage(`成功提取硬编码文本: "${text}"`);
  } catch (error) {
    console.error(`提取硬编码文本失败:`, error);
    vscode.window.showErrorMessage(`提取硬编码文本失败: ${error}`);
  }
} 