import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HardcodedText, Parser } from './parser';
import { Config } from './config';

/**
 * 转换结果类型
 */
export interface TransformResult {
  key: string;
  text: string;
  replacement: string;
}

/**
 * 转换器工具类
 */
export class Transformer {
  /**
   * 生成国际化替换代码
   */
  private static generateReplacement(text: HardcodedText, key: string): string {
    if (text.isVueAttribute) {
      // 处理Vue属性
      return `:${text.attributeName}="$t('${key}')"`;
    } else if (text.isHtml) {
      // 处理HTML文本
      return `{{ $t('${key}') }}`;
    } else if (text.isVueScript) {
      // 处理Vue脚本内文本
      return `t('${key}')`;
    } else {
      // 处理普通JS/TS文本
      return `t('${key}')`;
    }
  }

  /**
   * 转换硬编码文本为国际化键
   */
  static async transformHardcodedTexts(hardcodedTexts: HardcodedText[]): Promise<TransformResult[]> {
    const results: TransformResult[] = [];
    
    // 获取默认语言文件
    const localeFiles = Config.getLocaleFiles();
    if (localeFiles.length === 0) {
      throw new Error('未找到翻译文件');
    }
    
    // 使用第一个语言文件作为默认语言
    const defaultLocale = localeFiles[0].name;
    const defaultLocaleContent = Config.getLocaleFileContent(defaultLocale);
    
    for (const text of hardcodedTexts) {
      // 清理文本内容
      const cleanedText = text.text.trim();
      
      // 使用原文作为key基础，仅去除英文句点
      let key = cleanedText;
      
      // TODO: 如果检测到key有html标签，则替换掉所有的html标签，同时多个空格合并成一个
      // TODO: 检测是否包含中文字符，如果有则优先使用拼音作为key
      // TODO: 添加额外的文本清理逻辑，移除特殊字符
      
      // 生成替换代码
      const replacement = this.generateReplacement(text, key);
      
      // 保存结果
      results.push({
        key,
        text: cleanedText,
        replacement
      });
      
      // 更新翻译文件
      defaultLocaleContent[key] = cleanedText;
    }
    
    // 保存更新后的翻译文件
    Config.saveLocaleFileContent(defaultLocale, defaultLocaleContent);
    
    return results;
  }

  /**
   * 获取文件使用的键
   */
  static async getFileI18nUsage(document: vscode.TextDocument): Promise<{ 
    usedKeys: string[], 
    unusedKeys: string[], 
    hardcodedTexts: HardcodedText[],
    missingKeys: string[]
  }> {
    const content = document.getText();
    const usedKeys: string[] = [];
    
    // 匹配 $t('key') 和 t('key') 模式
    const i18nKeyRegex = /[\$]?t\(['"](.*?)['"](?:,|\))/g;
    let match;
    
    while ((match = i18nKeyRegex.exec(content)) !== null) {
      if (match[1]) {
        usedKeys.push(match[1]);
      }
    }
    
    // 获取所有可用的键
    const allKeys: string[] = [];
    const localeFiles = Config.getLocaleFiles();
    
    for (const file of localeFiles) {
      const fileContent = Config.getLocaleFileContent(file.name);
      this.extractKeysFromObject(fileContent, '', allKeys);
    }
    
    // 计算未使用的键
    const unusedKeys = allKeys.filter(key => !usedKeys.includes(key));
    
    // 检测未添加翻译的键
    const missingKeys = usedKeys.filter(key => !allKeys.includes(key));
    
    // 解析硬编码文本
    const hardcodedTexts = await Parser.parseHardcodedTexts(document);
    
    return {
      usedKeys,
      unusedKeys,
      hardcodedTexts,
      missingKeys
    };
  }

  /**
   * 从嵌套对象中提取键
   */
  private static extractKeysFromObject(obj: any, prefix: string, result: string[]): void {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object') {
        this.extractKeysFromObject(obj[key], fullKey, result);
      } else {
        result.push(fullKey);
      }
    }
  }

  /**
   * 应用转换结果
   */
  static async applyTransformResults(
    document: vscode.TextDocument, 
    results: TransformResult[], 
    hardcodedTexts: HardcodedText[]
  ): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
      return;
    }
    
    // 按照原始文本的位置从后往前替换，避免位置偏移
    const sortedResults = [...results].sort((a, b) => {
      const posA = hardcodedTexts.findIndex(t => t.text === a.text);
      const posB = hardcodedTexts.findIndex(t => t.text === b.text);
      
      if (posA === -1 || posB === -1) {
        return 0;
      }
      
      const rangeA = hardcodedTexts[posA].range;
      const rangeB = hardcodedTexts[posB].range;
      
      return rangeB.start.compareTo(rangeA.start);
    });
    
    await editor.edit(editBuilder => {
      for (const result of sortedResults) {
        const textIndex = hardcodedTexts.findIndex(t => t.text === result.text);
        
        if (textIndex !== -1) {
          const hardcodedText = hardcodedTexts[textIndex];
          
          // 获取替换后的文本
          let replacementText = result.replacement;
          
          // 应用替换
          editBuilder.replace(hardcodedText.range, replacementText);
        }
      }
    });
  }
} 