import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from './config';

/**
 * 翻译状态接口
 */
export interface TranslationStatus {
  locale: string;
  total: number;
  translated: number;
  untranslated: number;
  progress: number;
  untranslatedKeys: string[];
}

/**
 * 翻译使用情况接口
 */
export interface TranslationUsage {
  key: string;
  usedBy: { filePath: string; line: number; column: number }[];
  locales: string[];
}

/**
 * 翻译管理器
 */
export class TranslationManager {
  /**
   * 获取所有翻译
   */
  static getAllTranslations(): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};
    const localeFiles = Config.getLocaleFiles();
    
    for (const file of localeFiles) {
      result[file.name] = Config.getLocaleFileContent(file.name);
    }
    
    return result;
  }

  /**
   * 获取所有翻译键
   */
  static getAllTranslationKeys(): string[] {
    const allTranslations = this.getAllTranslations();
    const allKeys: string[] = [];
    
    for (const locale in allTranslations) {
      this.extractKeys(allTranslations[locale], '', allKeys);
    }
    
    // 去重
    return [...new Set(allKeys)];
  }

  /**
   * 从对象中提取所有键
   */
  private static extractKeys(obj: any, prefix: string, keys: string[]): void {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.extractKeys(obj[key], fullKey, keys);
      } else {
        keys.push(fullKey);
      }
    }
  }

  /**
   * 获取翻译状态
   */
  static getTranslationStatus(): TranslationStatus[] {
    const allTranslations = this.getAllTranslations();
    const allKeys = this.getAllTranslationKeys();
    const result: TranslationStatus[] = [];
    
    for (const locale in allTranslations) {
      const localeTranslation = allTranslations[locale];
      const translatedKeys: string[] = [];
      const untranslatedKeys: string[] = [];
      
      // 检查每个键是否有翻译
      for (const key of allKeys) {
        const keyParts = key.split('.');
        let obj = localeTranslation;
        let found = true;
        
        for (let i = 0; i < keyParts.length; i++) {
          if (!obj || typeof obj !== 'object') {
            found = false;
            break;
          }
          
          if (i === keyParts.length - 1) {
            if (keyParts[i] in obj && obj[keyParts[i]] !== '') {
              translatedKeys.push(key);
            } else {
              untranslatedKeys.push(key);
            }
          } else {
            obj = obj[keyParts[i]];
          }
        }
        
        if (!found) {
          untranslatedKeys.push(key);
        }
      }
      
      result.push({
        locale,
        total: allKeys.length,
        translated: translatedKeys.length,
        untranslated: untranslatedKeys.length,
        progress: allKeys.length > 0 ? Math.round(translatedKeys.length / allKeys.length * 100) : 100,
        untranslatedKeys
      });
    }
    
    return result;
  }

  /**
   * 分析项目中翻译的使用情况
   */
  static async analyzeTranslationUsage(): Promise<{ used: TranslationUsage[], unused: string[] }> {
    // 获取所有翻译键
    const allKeys = this.getAllTranslationKeys();
    const usedKeys: Record<string, { file: string, line: number, column: number }[]> = {};
    const localeMap: Record<string, string[]> = {};
    
    // 获取所有语言文件
    const localeFiles = Config.getLocaleFiles();
    for (const file of localeFiles) {
      const content = Config.getLocaleFileContent(file.name);
      const keysInFile: string[] = [];
      this.extractKeys(content, '', keysInFile);
      
      for (const key of keysInFile) {
        if (!localeMap[key]) {
          localeMap[key] = [];
        }
        localeMap[key].push(file.name);
      }
    }
    
    // 获取工作区所有文件
    const workspaceRoot = Config.getWorkspaceRoot();
    if (!workspaceRoot) {
      return { used: [], unused: [] };
    }
    
    // 查找所有使用翻译的文件
    const files = await vscode.workspace.findFiles('**/*.{vue,js,ts,jsx,tsx}', '**/node_modules/**');
    
    for (const file of files) {
      const document = await vscode.workspace.openTextDocument(file);
      const content = document.getText();
      const fileName = path.relative(workspaceRoot, file.fsPath);
      
      // 匹配 $t('key') 和 t('key') 模式
      const i18nKeyRegex = /[\$]?t\(['"](.*?)['"](?:,|\))/g;
      let match;
      
      while ((match = i18nKeyRegex.exec(content)) !== null) {
        if (match[1]) {
          const key = match[1];
          
          // 只处理在翻译文件中存在的键
          if (localeMap[key] && localeMap[key].length > 0) {
            if (!usedKeys[key]) {
              usedKeys[key] = [];
            }
            
            // 计算行号和列号
            const matchPos = document.positionAt(match.index);
            const line = matchPos.line;
            const column = matchPos.character;
            
            // 检查是否已添加此位置
            const isDuplicate = usedKeys[key].some(
              usage => usage.file === fileName && usage.line === line && usage.column === column
            );
            
            if (!isDuplicate) {
              usedKeys[key].push({
                file: fileName,
                line,
                column
              });
            }
          }
        }
      }
    }
    
    // 构建使用情况
    const used: TranslationUsage[] = [];
    for (const key in usedKeys) {
      // 提取文件名列表
      const usedBy = usedKeys[key].map(usage => ({
        filePath: usage.file,
        line: usage.line,
        column: usage.column
      }));
      
      used.push({
        key,
        usedBy,
        locales: localeMap[key] || []
      });
    }
    
    // 找出未使用的键
    const unused = allKeys.filter(key => !usedKeys[key]);
    
    return { used, unused };
  }

  /**
   * 获取键的翻译信息
   */
  static getKeyTranslations(key: string): Record<string, string> {
    const result: Record<string, string> = {};
    const allTranslations = this.getAllTranslations();
    
    for (const locale in allTranslations) {
      const value = this.getNestedValue(allTranslations[locale], key.split('.'));
      if (value !== undefined && typeof value === 'string') {
        result[locale] = value;
      } else {
        result[locale] = '';
      }
    }
    
    return result;
  }
  
  /**
   * 获取嵌套对象中的值
   */
  private static getNestedValue(obj: any, keys: string[]): any {
    let current = obj;
    
    for (const key of keys) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return undefined;
      }
      
      current = current[key];
    }
    
    return current;
  }

  /**
   * 更新键的翻译
   */
  static updateKeyTranslation(key: string, locale: string, value: string): boolean {
    const localeFiles = Config.getLocaleFiles();
    const localeFile = localeFiles.find(file => file.name === locale);
    
    if (!localeFile) {
      return false;
    }
    
    const content = Config.getLocaleFileContent(locale);
    const keys = key.split('.');
    let current = content;
    
    // 创建嵌套结构
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      
      current = current[keys[i]];
    }
    
    // 设置值
    current[keys[keys.length - 1]] = value;
    
    // 保存文件
    return Config.saveLocaleFileContent(locale, content);
  }

  /**
   * 更新键（重命名）
   */
  static updateKey(oldKey: string, newKey: string): boolean {
    const localeFiles = Config.getLocaleFiles();
    let success = true;
    
    for (const file of localeFiles) {
      const content = Config.getLocaleFileContent(file.name);
      const oldValue = this.getNestedValue(content, oldKey.split('.'));
      
      if (oldValue !== undefined) {
        // 删除旧键
        this.deleteKey(content, oldKey.split('.'));
        
        // 设置新键
        const newKeyParts = newKey.split('.');
        let current = content;
        
        for (let i = 0; i < newKeyParts.length - 1; i++) {
          if (!current[newKeyParts[i]] || typeof current[newKeyParts[i]] !== 'object') {
            current[newKeyParts[i]] = {};
          }
          
          current = current[newKeyParts[i]];
        }
        
        current[newKeyParts[newKeyParts.length - 1]] = oldValue;
        
        // 保存文件
        if (!Config.saveLocaleFileContent(file.name, content)) {
          success = false;
        }
      }
    }
    
    return success;
  }

  /**
   * 删除键
   */
  static deleteTranslationKey(key: string): boolean {
    const localeFiles = Config.getLocaleFiles();
    let success = true;
    
    for (const file of localeFiles) {
      const content = Config.getLocaleFileContent(file.name);
      this.deleteKey(content, key.split('.'));
      
      if (!Config.saveLocaleFileContent(file.name, content)) {
        success = false;
      }
    }
    
    return success;
  }

  /**
   * 从对象中删除嵌套键
   */
  private static deleteKey(obj: any, keys: string[]): void {
    if (keys.length === 1) {
      delete obj[keys[0]];
      return;
    }
    
    const [first, ...rest] = keys;
    
    if (obj[first] && typeof obj[first] === 'object') {
      this.deleteKey(obj[first], rest);
      
      // 如果删除后对象为空，也删除父对象
      if (Object.keys(obj[first]).length === 0) {
        delete obj[first];
      }
    }
  }

  /**
   * 获取当前文件使用的所有翻译键
   * @param filePath 文件路径
   */
  static async getKeysUsedInFile(filePath: string): Promise<string[]> {
    try {
      // 读取文件内容
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const keys: string[] = [];
      
      // 匹配所有形式的翻译键引用
      // 1. $t('key') 或 t('key')
      // 2. i18n.t('key')
      // 3. i18n.global.t('key') 
      // 4. useTranslation().t('key')
      const patterns = [
        /[\$]?t\(['"]([\w\.\-]+)['"]\)/g,
        /i18n\.t\(['"]([\w\.\-]+)['"]\)/g,
        /i18n\.global\.t\(['"]([\w\.\-]+)['"]\)/g,
        /useTranslation\(\)[.\s]*t\(['"]([\w\.\-]+)['"]\)/g
      ];
      
      // 使用所有模式匹配
      for (const regex of patterns) {
        let match;
        while ((match = regex.exec(content)) !== null) {
          if (match[1]) {
            keys.push(match[1]);
          }
        }
      }
      
      // 如果是.vue文件，还需检查<i18n>标签中的内容
      if (filePath.endsWith('.vue')) {
        const i18nTagRegex = /<i18n[^>]*>([\s\S]*?)<\/i18n>/g;
        let i18nMatch;
        
        while ((i18nMatch = i18nTagRegex.exec(content)) !== null) {
          try {
            // 尝试解析JSON内容
            const i18nContent = i18nMatch[1].trim();
            const i18nData = JSON.parse(i18nContent);
            
            // 提取所有键
            for (const locale in i18nData) {
              this.extractKeys(i18nData[locale], '', keys);
            }
          } catch (err) {
            // 解析失败，忽略
            console.log(`解析<i18n>标签内容失败: ${err}`);
          }
        }
      }
      
      // 去重
      return [...new Set(keys)];
    } catch (error) {
      console.error(`读取文件失败: ${error}`);
      return [];
    }
  }
  
  /**
   * 获取键的所有文件引用
   * @param key 翻译键
   */
  static async getKeyReferences(key: string): Promise<string[]> {
    try {
      // 获取工作区
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        return [];
      }
      
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const files = await this.findAllSourceFiles(workspaceRoot);
      const references: string[] = [];
      
      // 检查每个文件是否使用了该键
      for (const file of files) {
        const keysInFile = await this.getKeysUsedInFile(file);
        if (keysInFile.includes(key)) {
          references.push(file);
        }
      }
      
      return references;
    } catch (error) {
      console.error(`获取键引用失败: ${error}`);
      return [];
    }
  }
  
  /**
   * 查找所有源文件
   * @param dir 目录
   * @param extensions 文件扩展名数组
   */
  private static async findAllSourceFiles(dir: string, extensions: string[] = ['.vue', '.ts', '.js', '.jsx', '.tsx']): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // 跳过node_modules和.git目录
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          const subFiles = await this.findAllSourceFiles(fullPath, extensions);
          files.push(...subFiles);
        }
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * 获取特定locale中的翻译值
   */
  static getTranslationValue(key: string, locale: string): string | undefined {
    const localeContent = Config.getLocaleFileContent(locale);
    if (!localeContent) {
      return undefined;
    }
    
    const keyParts = key.split('.');
    let current = localeContent;
    
    for (const part of keyParts) {
      if (!current || typeof current !== 'object' || !(part in current)) {
        return undefined;
      }
      current = current[part];
    }
    
    return typeof current === 'string' ? current : undefined;
  }

  /**
   * 更新文件中的键引用
   * @param oldKey 旧键名
   * @param newKey 新键名
   * @returns 成功更新的文件数量
   */
  static async updateKeyReferences(oldKey: string, newKey: string): Promise<number> {
    try {
      console.log(`开始更新键引用: ${oldKey} -> ${newKey}`);
      
      // 获取引用了该键的所有文件
      const references = await this.getKeyReferences(oldKey);
      console.log(`找到 ${references.length} 个文件引用了键 "${oldKey}"`);
      
      if (references.length === 0) {
        return 0;
      }
      
      let updatedFileCount = 0;
      
      // 构建可能的引用模式，适配不同的引用方式
      const patterns = [
        `(['"])${oldKey}(['"])`, // 'key' 或 "key"
        `\\$t\\((['"])${oldKey}(['"])\\)`, // $t('key') 或 $t("key")
        `t\\((['"])${oldKey}(['"])\\)`, // t('key') 或 t("key")
        `i18n\\.t\\((['"])${oldKey}(['"])\\)`, // i18n.t('key') 或 i18n.t("key")
        `i18n\\.global\\.t\\((['"])${oldKey}(['"])\\)`, // i18n.global.t('key') 或 i18n.global.t("key")
        `useTranslation\\(\\)\\s*\\.\\s*t\\((['"])${oldKey}(['"])\\)` // useTranslation().t('key')
      ];
      
      // 更新每个文件中的引用
      for (const filePath of references) {
        // 读取文件内容
        const document = await vscode.workspace.openTextDocument(filePath);
        const text = document.getText();
        let newText = text;
        let hasChanges = false;
        
        // 对每种模式进行替换
        for (const pattern of patterns) {
          const regex = new RegExp(pattern, 'g');
          const newRegexText = (match: string, quote1: string, quote2: string) => {
            // 保持引号的一致性
            return match.replace(`${quote1}${oldKey}${quote2}`, `${quote1}${newKey}${quote2}`);
          };
          
          const tempText = newText.replace(regex, (match, quote1, quote2) => {
            hasChanges = true;
            return newRegexText(match, quote1, quote2);
          });
          
          if (tempText !== newText) {
            newText = tempText;
          }
        }
        
        // 如果文件有变化，保存更新
        if (hasChanges) {
          const edit = new vscode.WorkspaceEdit();
          const uri = vscode.Uri.file(filePath);
          const range = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
          );
          
          edit.replace(uri, range, newText);
          await vscode.workspace.applyEdit(edit);
          
          // 如果文档已打开，保存它
          const openedDoc = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
          if (openedDoc) {
            await openedDoc.save();
          }
          
          updatedFileCount++;
          console.log(`已更新文件: ${filePath}`);
        }
      }
      
      return updatedFileCount;
    } catch (error) {
      console.error(`更新键引用失败:`, error);
      return 0;
    }
  }

  /**
   * 将所有键引用替换为指定文本内容
   * @param key 要替换的键
   * @param text 替换成的文本内容
   * @returns 成功更新的文件数量
   */
  static async replaceKeyReferences(key: string, text: string): Promise<number> {
    try {
      console.log(`开始替换键引用: ${key} -> "${text}"`);
      
      // 获取引用了该键的所有文件
      const references = await this.getKeyReferences(key);
      console.log(`找到 ${references.length} 个文件引用了键 "${key}"`);
      
      if (references.length === 0) {
        return 0;
      }
      
      let updatedFileCount = 0;
      
      // 构建可能的引用模式，适配不同的引用方式
      const patterns = [
        `\\$t\\(['"]${key}['"](?:\\s*,\\s*[^)]*)?\\)`, // $t('key') 或 $t('key', {...})
        `t\\(['"]${key}['"](?:\\s*,\\s*[^)]*)?\\)`, // t('key') 或 t('key', {...})
        `i18n\\.t\\(['"]${key}['"](?:\\s*,\\s*[^)]*)?\\)`, // i18n.t('key') 或 i18n.t('key', {...})
        `i18n\\.global\\.t\\(['"]${key}['"](?:\\s*,\\s*[^)]*)?\\)`, // i18n.global.t('key') 或 i18n.global.t('key', {...})
        `useTranslation\\(\\)\\s*\\.\\s*t\\(['"]${key}['"](?:\\s*,\\s*[^)]*)?\\)` // useTranslation().t('key') 或 useTranslation().t('key', {...})
      ];
      
      // 更新每个文件中的引用
      for (const filePath of references) {
        // 读取文件内容
        const document = await vscode.workspace.openTextDocument(filePath);
        const fileText = document.getText();
        let newText = fileText;
        let hasChanges = false;
        
        // 对每种模式进行替换
        for (const pattern of patterns) {
          const regex = new RegExp(pattern, 'g');
          
          // 根据文件类型决定应该使用什么样的替换文本
          let replacementText = text;
          const fileExt = document.fileName.split('.').pop()?.toLowerCase();
          
          // 对于Vue模板中的引用
          if (fileExt === 'vue') {
            // 检查是否在<template>中
            const templateMatch = /<template>([\s\S]*?)<\/template>/i.exec(fileText);
            if (templateMatch) {
              const templateContent = templateMatch[1];
              // 检查此模式在模板中是否有匹配
              const templateRegex = new RegExp(pattern, 'g');
              if (templateRegex.test(templateContent)) {
                // 如果在模板中，就用双大括号包裹文本
                replacementText = `{{ "${text}" }}`;
              }
            }
          } else if (['jsx', 'tsx'].includes(fileExt || '')) {
            // 对于JSX/TSX文件，使用花括号包裹
            replacementText = `{"${text}"}`;
          } else {
            // 普通JS/TS文件，使用双引号
            replacementText = `"${text}"`;
          }
          
          // 执行替换
          const tempText = newText.replace(regex, () => {
            hasChanges = true;
            return replacementText;
          });
          
          if (tempText !== newText) {
            newText = tempText;
          }
        }
        
        // 如果文件有变化，保存更新
        if (hasChanges) {
          const edit = new vscode.WorkspaceEdit();
          const uri = vscode.Uri.file(filePath);
          const range = new vscode.Range(
            document.positionAt(0),
            document.positionAt(fileText.length)
          );
          
          edit.replace(uri, range, newText);
          await vscode.workspace.applyEdit(edit);
          
          // 如果文档已打开，保存它
          const openedDoc = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
          if (openedDoc) {
            await openedDoc.save();
          }
          
          updatedFileCount++;
          console.log(`已更新文件: ${filePath}`);
        }
      }
      
      return updatedFileCount;
    } catch (error) {
      console.error(`替换键引用失败:`, error);
      return 0;
    }
  }

  /**
   * 从内容中提取翻译键
   * @param content 文件内容
   * @returns 提取到的翻译键数组
   */
  static extractKeysFromContent(content: string): string[] {
    const keys: string[] = [];
    
    // 匹配各种翻译函数调用模式：$t('key'), t('key'), i18n.t('key'), useTranslation().t('key')等
    const patterns = [
      /\$t\(['"](.+?)['"]\)/g, // $t('key')
      /\bt\(['"](.+?)['"]\)/g, // t('key')
      /i18n\.t\(['"](.+?)['"]\)/g, // i18n.t('key')
      /i18n\.global\.t\(['"](.+?)['"]\)/g, // i18n.global.t('key')
      /useTranslation\(\)\.t\(['"](.+?)['"]\)/g // useTranslation().t('key')
    ];
    
    // 对每个模式进行匹配
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !keys.includes(match[1])) {
          keys.push(match[1]);
        }
      }
    }
    
    return keys;
  }
  
  /**
   * 从内容中提取硬编码文本
   * @param content 文件内容
   * @returns 提取到的硬编码文本数组
   */
  static extractHardcodedTextsFromContent(content: string): Array<{id: string, text: string}> {
    const hardcodedTexts: Array<{id: string, text: string}> = [];
    const fileName = 'file'; // 简化处理，实际使用时应传入文件名
    
    // 从配置中获取要检查的属性列表
    const hardcodedAttributes = Config.getHardcodedAttributes();
    
    // 用于去重，避免多次添加相同的文本
    const uniqueTexts = new Set<string>();
    let index = 0;
    
    // 匹配HTML/JSX中的硬编码文本：>文本< 模式
    const htmlPattern = />([^<>{}"'\n]+)</g;
    let match;
    
    while ((match = htmlPattern.exec(content)) !== null) {
      const text = match[1].trim();
      // 跳过空文本和纯数字及已经添加的文本
      if (text && text.length > 1 && !/^\d+$/.test(text) && !uniqueTexts.has(text)) {
        uniqueTexts.add(text);
        const id = `${fileName}_${index}_text_${text.substring(0, 10).replace(/\s/g, '_')}`;
        hardcodedTexts.push({ id, text });
        index++;
      }
    }
    
    // 匹配特定属性中的硬编码文本
    for (const attrName of hardcodedAttributes) {
      // 为每个属性创建单独的正则表达式
      const attrPattern = new RegExp(`${attrName}=["']([^"'<>{}\n]+)["']`, 'g');
      
      while ((match = attrPattern.exec(content)) !== null) {
        const text = match[1].trim();
        // 跳过空文本、纯数字、特殊属性值和已经添加的文本
        if (text && text.length > 1 && !/^\d+$/.test(text) && 
            !['true', 'false'].includes(text) && !uniqueTexts.has(text)) {
          uniqueTexts.add(text);
          const id = `${fileName}_${index}_${attrName}_${text.substring(0, 10).replace(/\s/g, '_')}`;
          hardcodedTexts.push({ id, text });
          index++;
        }
      }
    }
    
    return hardcodedTexts;
  }
} 